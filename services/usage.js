// services/usage.js
// Usage tracking and minutes management

import { Business } from "../models/Business.js";
import { UsageMinutes } from "../models/UsageMinutes.js";
import { calculateBillingCycle } from "./billing.js";
import {
  sendMinutesAlmostUsedNotification,
  sendMinutesFullyUsedNotification,
  sendOverageChargesNotification,
  sendAIDisabledNotification,
} from "./notifications.js";

/**
 * Check if minutes are available for a call
 * Returns: { available: boolean, reason: string, action: string, notificationSent: boolean, overageMinutes: number }
 */
export async function checkMinutesAvailable(businessId, callDurationMinutes = 0) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  // Get current billing cycle
  const billingCycle = calculateBillingCycle(business);
  const now = new Date();

  // Get usage for current billing cycle
  const usage = await getCurrentCycleUsage(businessId, billingCycle.start, billingCycle.end);
  const totalMinutesUsed = usage.totalMinutes;
  const overageMinutes = usage.overageMinutes;

  // Calculate available minutes (plan limit + bonus - used)
  const planLimit = business.usage_limit_minutes || 0;
  const bonusMinutes = business.bonus_minutes || 0;
  const totalAvailable = planLimit + bonusMinutes;
  const minutesRemaining = totalAvailable - totalMinutesUsed;

  // Check usage threshold (before checking exhaustion)
  const usagePercent = totalAvailable > 0 ? (totalMinutesUsed / totalAvailable) * 100 : 0;
  const threshold = business.usage_threshold_percent || 80;

  if (usagePercent >= threshold && business.notify_minutes_almost_used && !usage.thresholdNotificationSent) {
    // Send threshold notification
    await sendMinutesAlmostUsedNotification(
      business,
      totalMinutesUsed,
      totalAvailable,
      minutesRemaining,
      billingCycle.end
    );
    // Mark as sent (would need to track this in database)
  }

  // Check if minutes are exhausted
  if (totalMinutesUsed >= totalAvailable) {
    // Minutes exhausted
    if (business.minutes_exhausted_behavior === "disable_ai") {
      // Option A: Disable AI
      await Business.update(businessId, { ai_enabled: false });
      
      // Send mandatory notification
      await sendAIDisabledNotification(business, "minutes_exhausted", {
        minutesTotal: totalAvailable,
        resetDate: billingCycle.end,
      });

      // Send optional notification if enabled
      if (business.notify_minutes_fully_used) {
        await sendMinutesFullyUsedNotification(business, totalAvailable, billingCycle.end, true);
      }

      return {
        available: false,
        reason: "minutes_exhausted",
        action: "disable_ai",
        notificationSent: true,
        overageMinutes: 0,
      };
    } else if (business.minutes_exhausted_behavior === "allow_overage") {
      // Option B: Check overage cap
      if (business.overage_cap_minutes && overageMinutes >= business.overage_cap_minutes) {
        // Cap reached, disable AI
        await Business.update(businessId, { ai_enabled: false });
        
        await sendAIDisabledNotification(business, "overage_cap", {
          overageCap: business.overage_cap_minutes,
          resetDate: billingCycle.end,
        });

        return {
          available: false,
          reason: "overage_cap_reached",
          action: "disable_ai",
          notificationSent: true,
          overageMinutes,
        };
      }

      // Under cap, allow with overage billing
      if (business.notify_overage_charges) {
        await sendOverageChargesNotification(
          business,
          overageMinutes + callDurationMinutes,
          getOverageRate(business),
          calculateOverageCharge(business, overageMinutes + callDurationMinutes),
          business.overage_cap_minutes
        );
      }

      if (business.notify_minutes_fully_used && !usage.minutesExhaustedNotificationSent) {
        await sendMinutesFullyUsedNotification(business, totalAvailable, billingCycle.end, false);
      }

      return {
        available: true,
        reason: "overage_billing",
        action: "charge_overage",
        notificationSent: true,
        overageMinutes: overageMinutes + callDurationMinutes,
      };
    }
  }

  // Minutes available
  return {
    available: true,
    reason: "minutes_available",
    action: "proceed",
    notificationSent: false,
    overageMinutes: 0,
  };
}

/**
 * Record call usage
 */
export async function recordCallUsage(businessId, callSessionId, minutesUsed) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  const now = new Date();
  const billingCycle = calculateBillingCycle(business);

  // Determine if this is overage
  const usage = await getCurrentCycleUsage(businessId, billingCycle.start, billingCycle.end);
  const planLimit = business.usage_limit_minutes || 0;
  const bonusMinutes = business.bonus_minutes || 0;
  const totalAvailable = planLimit + bonusMinutes;
  const isOverage = usage.totalMinutes >= totalAvailable;

  // Record usage
  await UsageMinutes.create({
    business_id: businessId,
    call_session_id: callSessionId,
    minutes_used: minutesUsed,
    date: now.toISOString().split("T")[0],
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    billing_cycle_start: billingCycle.start,
    billing_cycle_end: billingCycle.end,
  });

  // If overage, calculate and record overage charges
  if (isOverage && business.overage_billing_enabled) {
    const overageRate = getOverageRate(business);
    const overageCharge = minutesUsed * overageRate;
    
    // Record overage in billing service
    // This will be handled by billing service
  }
}

/**
 * Get current billing cycle usage
 */
export async function getCurrentCycleUsage(businessId, cycleStart, cycleEnd) {
  const { data, error } = await supabaseClient
    .from("usage_minutes")
    .select("minutes_used")
    .eq("business_id", businessId)
    .gte("billing_cycle_start", cycleStart.toISOString().split("T")[0])
    .lte("billing_cycle_end", cycleEnd.toISOString().split("T")[0]);

  if (error) {
    console.error("Error getting usage:", error);
    return { totalMinutes: 0, overageMinutes: 0 };
  }

  const totalMinutes = data?.reduce((sum, row) => sum + parseFloat(row.minutes_used || 0), 0) || 0;
  
  // Calculate overage (minutes beyond plan limit)
  const business = await Business.findById(businessId);
  const planLimit = business?.usage_limit_minutes || 0;
  const bonusMinutes = business?.bonus_minutes || 0;
  const totalAvailable = planLimit + bonusMinutes;
  const overageMinutes = Math.max(0, totalMinutes - totalAvailable);

  return {
    totalMinutes,
    overageMinutes,
    thresholdNotificationSent: false, // TODO: Track in database
    minutesExhaustedNotificationSent: false, // TODO: Track in database
  };
}

/**
 * Get overage rate for business (custom or plan rate)
 */
function getOverageRate(business) {
  if (business.custom_pricing_overage) {
    return parseFloat(business.custom_pricing_overage);
  }

  // Plan-based rates
  const planRates = {
    starter: 0.30,
    core: 0.25,
    pro: 0.20,
  };

  return planRates[business.plan_tier] || 0.30;
}

/**
 * Calculate overage charge
 */
function calculateOverageCharge(business, overageMinutes) {
  const rate = getOverageRate(business);
  return overageMinutes * rate;
}

/**
 * Reset billing cycle (called on billing cycle start)
 */
export async function resetBillingCycle(businessId) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  const billingCycle = calculateBillingCycle(business);
  
  // Reset bonus minutes if needed (they don't roll over)
  // Reset notification flags
  // Re-enable AI if it was disabled due to minutes exhaustion
  if (!business.ai_enabled) {
    // Check if it was disabled due to minutes
    // If so, re-enable it
    await Business.update(businessId, { ai_enabled: true });
    
    // Send AI resumed notification
    const { sendAIResumedNotification } = await import("./notifications.js");
    await sendAIResumedNotification(
      business,
      business.usage_limit_minutes,
      billingCycle.end
    );
  }
}

import { supabaseClient } from "../config/database.js";


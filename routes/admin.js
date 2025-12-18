// routes/admin.js
// Admin API routes for Tavari staff

import express from "express";
import { authenticateAdmin } from "../middleware/adminAuth.js";
import { AdminUser } from "../models/AdminUser.js";
import { AdminActivityLog } from "../models/AdminActivityLog.js";
import { Business } from "../models/Business.js";
import { generateToken } from "../utils/auth.js";
import { hashPassword } from "../utils/auth.js";

const router = express.Router();

// Admin login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const admin = await AdminUser.findByEmail(email);
    if (!admin) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await AdminUser.verifyPassword(admin, password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    await AdminUser.updateLastLogin(admin.id);

    const token = generateToken({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
    });

    res.json({
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        first_name: admin.first_name,
        last_name: admin.last_name,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// Get current admin user
router.get("/me", authenticateAdmin, async (req, res) => {
  try {
    res.json({
      admin: {
        id: req.admin.id,
        email: req.admin.email,
        first_name: req.admin.first_name,
        last_name: req.admin.last_name,
        role: req.admin.role,
      },
    });
  } catch (error) {
    console.error("Get admin me error:", error);
    res.status(500).json({ error: "Failed to get admin info" });
  }
});

// Get all businesses (with search/filter)
router.get("/accounts", authenticateAdmin, async (req, res) => {
  try {
    const { search, plan_tier, status } = req.query;
    const { supabaseClient } = await import("../config/database.js");
    
    let query = supabaseClient.from("businesses").select("*").is("deleted_at", null);
    
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    
    if (plan_tier) {
      query = query.eq("plan_tier", plan_tier);
    }
    
    if (status === "active") {
      query = query.eq("ai_enabled", true);
    } else if (status === "inactive") {
      query = query.eq("ai_enabled", false);
    }
    
    const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
    
    if (error) throw error;
    
    res.json({ businesses: data || [] });
  } catch (error) {
    console.error("Get accounts error:", error);
    res.status(500).json({ error: "Failed to get accounts" });
  }
});

// Get business details
router.get("/accounts/:id", authenticateAdmin, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    res.json({ business });
  } catch (error) {
    console.error("Get account error:", error);
    res.status(500).json({ error: "Failed to get account" });
  }
});

// Add bonus minutes
router.post("/accounts/:id/minutes", authenticateAdmin, async (req, res) => {
  try {
    const { minutes } = req.body;
    const business = await Business.findById(req.params.id);
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    const newBonusMinutes = (business.bonus_minutes || 0) + parseInt(minutes);
    await Business.update(req.params.id, { bonus_minutes: newBonusMinutes });
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: req.params.id,
      action: "add_bonus_minutes",
      details: { minutes, total: newBonusMinutes },
    });
    
    res.json({ success: true, bonus_minutes: newBonusMinutes });
  } catch (error) {
    console.error("Add minutes error:", error);
    res.status(500).json({ error: "Failed to add minutes" });
  }
});

// Set custom pricing
router.post("/accounts/:id/pricing", authenticateAdmin, async (req, res) => {
  try {
    const { monthly, overage } = req.body;
    const business = await Business.findById(req.params.id);
    
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    await Business.update(req.params.id, {
      custom_pricing_monthly: monthly ? parseFloat(monthly) : null,
      custom_pricing_overage: overage ? parseFloat(overage) : null,
    });
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: req.params.id,
      action: "set_custom_pricing",
      details: { monthly, overage },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Set pricing error:", error);
    res.status(500).json({ error: "Failed to set pricing" });
  }
});

// Retry activation
router.post("/accounts/:id/retry-activation", authenticateAdmin, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    // Retry VAPI activation
    const { createAssistant, provisionPhoneNumber, linkAssistantToNumber } = await import("../services/vapi.js");
    const agent = await AIAgent.findByBusinessId(business.id);
    
    const assistant = await createAssistant({
      name: business.name,
      public_phone_number: business.public_phone_number || "",
      timezone: business.timezone,
      business_hours: agent?.business_hours || {},
      faqs: agent?.faqs || [],
      contact_email: business.email,
      address: business.address || "",
      allow_call_transfer: business.allow_call_transfer ?? true,
    });
    
    const phoneNumber = await provisionPhoneNumber();
    await linkAssistantToNumber(assistant.id, phoneNumber.id);
    await Business.setVapiAssistant(business.id, assistant.id, phoneNumber.phoneNumber);
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: req.params.id,
      action: "retry_activation",
      details: { assistant_id: assistant.id, phone_number: phoneNumber.phoneNumber },
    });
    
    res.json({ success: true, phone_number: phoneNumber.phoneNumber });
  } catch (error) {
    console.error("Retry activation error:", error);
    res.status(500).json({ error: "Failed to retry activation" });
  }
});

// Get usage stats for a business
router.get("/accounts/:id/usage", authenticateAdmin, async (req, res) => {
  try {
    const { UsageMinutes } = await import("../models/UsageMinutes.js");
    const { calculateBillingCycle } = await import("../services/billing.js");
    const { getCurrentCycleUsage } = await import("../services/usage.js");
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    // Initialize billing cycle if not set
    if (!business.billing_day || !business.next_billing_date) {
      const { initializeBillingCycle } = await import("../services/billing.js");
      await initializeBillingCycle(business.id, business.created_at || new Date());
      // Reload business to get updated billing info
      const updatedBusiness = await Business.findById(req.params.id);
      Object.assign(business, updatedBusiness);
    }
    
    // Get current billing cycle
    const billingCycle = calculateBillingCycle(business);
    
    // Get current billing cycle usage (same as customer side)
    const usage = await getCurrentCycleUsage(req.params.id, billingCycle.start, billingCycle.end);
    
    // Format response same as customer side
    const planLimit = business.usage_limit_minutes || 0;
    const bonusMinutes = business.bonus_minutes || 0;
    const totalAvailable = planLimit + bonusMinutes;
    const minutesRemaining = Math.max(0, totalAvailable - usage.totalMinutes);
    const usagePercent = totalAvailable > 0 ? (usage.totalMinutes / totalAvailable) * 100 : 0;
    
    const formattedUsage = {
      minutes_used: usage.totalMinutes || 0,
      minutes_total: totalAvailable,
      minutes_remaining: minutesRemaining,
      usage_percent: Math.round(usagePercent),
      overage_minutes: usage.overageMinutes || 0,
      billing_cycle_start: billingCycle.start.toISOString().split('T')[0],
      billing_cycle_end: billingCycle.end.toISOString().split('T')[0],
      next_billing_date: billingCycle.next.toISOString().split('T')[0],
    };
    
    res.json({ usage: formattedUsage });
  } catch (error) {
    console.error("Get usage error:", error);
    res.status(500).json({ error: "Failed to get usage" });
  }
});

// Get activity logs for a business
router.get("/accounts/:id/activity", authenticateAdmin, async (req, res) => {
  try {
    const logs = await AdminActivityLog.findByBusiness(req.params.id, 50);
    res.json({ logs: logs || [] });
  } catch (error) {
    console.error("Get activity error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    // Return empty array instead of error to prevent UI breaking
    res.json({ logs: [] });
  }
});

// Get all activity logs (admin)
router.get("/activity", authenticateAdmin, async (req, res) => {
  try {
    const { supabaseClient } = await import("../config/database.js");
    const { limit = 100 } = req.query;
    const { data, error } = await supabaseClient
      .from("admin_activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(parseInt(limit));
    
    if (error) throw error;
    res.json({ logs: data || [] });
  } catch (error) {
    console.error("Get all activity error:", error);
    res.status(500).json({ error: "Failed to get activity" });
  }
});

// Sync VAPI assistant (update prompt)
router.post("/accounts/:id/sync-vapi", authenticateAdmin, async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }
    
    if (!business.vapi_assistant_id) {
      return res.status(400).json({ error: "No VAPI assistant found" });
    }
    
    const { updateAssistant } = await import("../services/vapi.js");
    const { generateAssistantPrompt } = await import("../templates/vapi-assistant-template.js");
    const agent = await AIAgent.findByBusinessId(business.id);
    
    const updatedPrompt = await generateAssistantPrompt({
      name: business.name,
      public_phone_number: business.public_phone_number || "",
      timezone: business.timezone,
      business_hours: agent?.business_hours || {},
      faqs: agent?.faqs || [],
      contact_email: business.email,
      address: business.address || "",
      allow_call_transfer: business.allow_call_transfer ?? true,
      after_hours_behavior: business.after_hours_behavior || "take_message",
    });
    
    await updateAssistant(business.vapi_assistant_id, {
      systemPrompt: updatedPrompt,
    });
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: req.params.id,
      action: "sync_vapi",
      details: { assistant_id: business.vapi_assistant_id },
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Sync VAPI error:", error);
    res.status(500).json({ error: "Failed to sync VAPI" });
  }
});

// Get dashboard stats
router.get("/stats", authenticateAdmin, async (req, res) => {
  try {
    const { supabaseClient } = await import("../config/database.js");
    const { data: businesses, error: bizError } = await supabaseClient
      .from("businesses")
      .select("id, ai_enabled, plan_tier")
      .is("deleted_at", null);
    
    if (bizError) throw bizError;
    
    const stats = {
      total_accounts: businesses.length,
      active_accounts: businesses.filter(b => b.ai_enabled).length,
      inactive_accounts: businesses.filter(b => !b.ai_enabled).length,
      by_tier: {
        starter: businesses.filter(b => b.plan_tier === "starter").length,
        core: businesses.filter(b => b.plan_tier === "core").length,
        pro: businesses.filter(b => b.plan_tier === "pro").length,
      },
    };
    
    res.json({ stats });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// Test VAPI connection
router.get("/test-vapi", authenticateAdmin, async (req, res) => {
  try {
    const { createAssistant, provisionPhoneNumber } = await import("../services/vapi.js");
    
    // Test 1: Create a test assistant
    const testAssistant = await createAssistant({
      name: "Tavari Test Assistant",
      public_phone_number: "",
      timezone: "America/New_York",
      business_hours: {},
      faqs: [],
      contact_email: "test@tavari.com",
      address: "",
      allow_call_transfer: false,
      after_hours_behavior: "take_message",
    });
    
    // Test 2: Try to provision a phone number
    let phoneNumber = null;
    try {
      phoneNumber = await provisionPhoneNumber();
    } catch (error) {
      console.log("Phone number provisioning test failed (may not have available numbers):", error.message);
    }
    
    // Cleanup: Delete test assistant
    try {
      const axios = (await import("axios")).default;
      await axios.delete(`https://api.vapi.ai/assistant/${testAssistant.id}`, {
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
        },
      });
    } catch (error) {
      console.log("Failed to cleanup test assistant:", error.message);
    }
    
    res.json({
      success: true,
      tests: {
        assistant_creation: !!testAssistant.id,
        phone_provisioning: !!phoneNumber,
      },
      details: {
        test_assistant_id: testAssistant.id,
        test_phone_number: phoneNumber?.phoneNumber || null,
      },
    });
  } catch (error) {
    console.error("VAPI test error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      tests: {
        assistant_creation: false,
        phone_provisioning: false,
      },
    });
  }
});

import { AIAgent } from "../models/AIAgent.js";
import { PricingPackage } from "../models/PricingPackage.js";

// ============================================
// PACKAGE MANAGEMENT ROUTES
// ============================================

// Get all packages
router.get("/packages", authenticateAdmin, async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const packages = await PricingPackage.findAll({
      includeInactive: includeInactive === 'true',
      includePrivate: true, // Admins can see all packages
    });

    // Get business count for each package
    const packagesWithCounts = await Promise.all(
      packages.map(async (pkg) => {
        const businessCount = await PricingPackage.getBusinessCount(pkg.id);
        return {
          ...pkg,
          business_count: businessCount,
        };
      })
    );

    res.json({ packages: packagesWithCounts });
  } catch (error) {
    console.error("Get packages error:", error);
    res.status(500).json({ error: "Failed to get packages" });
  }
});

// Get single package with businesses
router.get("/packages/:id", authenticateAdmin, async (req, res) => {
  try {
    const packageId = req.params.id;
    const pkg = await PricingPackage.findById(packageId);
    
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const businesses = await PricingPackage.getBusinesses(packageId);
    const businessCount = businesses.length;

    res.json({
      package: {
        ...pkg,
        business_count: businessCount,
        businesses,
      },
    });
  } catch (error) {
    console.error("Get package error:", error);
    res.status(500).json({ error: "Failed to get package" });
  }
});

// Create new package
router.post("/packages", authenticateAdmin, async (req, res) => {
  try {
    const packageData = req.body;
    
    const pkg = await PricingPackage.create(packageData);

    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: "create_package",
      details: { package_id: pkg.id, package_name: pkg.name },
    });

    res.status(201).json({ package: pkg });
  } catch (error) {
    console.error("Create package error:", error);
    res.status(500).json({ error: "Failed to create package" });
  }
});

// Update package
router.put("/packages/:id", authenticateAdmin, async (req, res) => {
  try {
    const packageId = req.params.id;
    const packageData = req.body;

    const existingPackage = await PricingPackage.findById(packageId);
    if (!existingPackage) {
      return res.status(404).json({ error: "Package not found" });
    }

    const pkg = await PricingPackage.update(packageId, packageData);

    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: "update_package",
      details: { package_id: packageId, changes: packageData },
    });

    res.json({ package: pkg });
  } catch (error) {
    console.error("Update package error:", error);
    res.status(500).json({ error: "Failed to update package" });
  }
});

// Delete package (soft delete)
router.delete("/packages/:id", authenticateAdmin, async (req, res) => {
  try {
    const packageId = req.params.id;

    const existingPackage = await PricingPackage.findById(packageId);
    if (!existingPackage) {
      return res.status(404).json({ error: "Package not found" });
    }

    // Check if package has businesses assigned
    const businessCount = await PricingPackage.getBusinessCount(packageId);
    if (businessCount > 0) {
      return res.status(400).json({
        error: `Cannot delete package. ${businessCount} business(es) are currently assigned to this package. Please reassign them first.`,
        business_count: businessCount,
      });
    }

    await PricingPackage.delete(packageId);

    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: "delete_package",
      details: { package_id: packageId, package_name: existingPackage.name },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete package error:", error);
    res.status(500).json({ error: "Failed to delete package" });
  }
});

// Assign package to business
router.post("/packages/:packageId/assign/:businessId", authenticateAdmin, async (req, res) => {
  try {
    const { packageId, businessId } = req.params;

    const pkg = await PricingPackage.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ error: "Package not found" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Update business with new package
    await Business.update(businessId, {
      package_id: packageId,
      plan_tier: pkg.name.toLowerCase(), // Keep plan_tier for backwards compatibility
      usage_limit_minutes: pkg.minutes_included,
    });

    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: businessId,
      action: "assign_package",
      details: { package_id: packageId, package_name: pkg.name },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Assign package error:", error);
    res.status(500).json({ error: "Failed to assign package" });
  }
});

export default router;


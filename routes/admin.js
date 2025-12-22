// routes/admin.js
// Admin API routes for Tavari staff

import express from "express";
import { authenticateAdmin } from "../middleware/adminAuth.js";
import { AdminUser } from "../models/AdminUser.js";
import { AdminActivityLog } from "../models/AdminActivityLog.js";
import { Business } from "../models/Business.js";
import { generateToken } from "../utils/auth.js";
import { hashPassword } from "../utils/auth.js";
import { sendSupportTicketUpdateNotification } from "../services/notifications.js";

const router = express.Router();

// Admin login
router.post("/login", async (req, res) => {
  try {
    console.log('[Admin Login] ========== LOGIN ATTEMPT START ==========');
    console.log('[Admin Login] Email:', req.body.email);
    
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('[Admin Login] ❌ Missing email or password');
      return res.status(400).json({ error: "Email and password are required" });
    }

    console.log('[Admin Login] Looking up admin user...');
    const admin = await AdminUser.findByEmail(email);
    if (!admin) {
      console.log('[Admin Login] ❌ Admin not found for email:', email);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log('[Admin Login] ✅ Admin found, verifying password...');
    const isValid = await AdminUser.verifyPassword(admin, password);
    if (!isValid) {
      console.log('[Admin Login] ❌ Invalid password');
      return res.status(401).json({ error: "Invalid credentials" });
    }

    console.log('[Admin Login] ✅ Password valid, updating last login...');
    await AdminUser.updateLastLogin(admin.id);

    const token = generateToken({
      adminId: admin.id,
      email: admin.email,
      role: admin.role,
    });

    console.log('[Admin Login] ✅ Login successful, token generated');
    console.log('[Admin Login] ========== LOGIN ATTEMPT COMPLETE ==========');

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
    console.error("[Admin Login] ========== LOGIN ERROR ==========");
    console.error("Admin login error:", error);
    console.error("Error stack:", error.stack);
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
    
    // Get minutes from package if business has one, otherwise use business.usage_limit_minutes
    let planLimit = business.usage_limit_minutes || 0;
    
    if (business.package_id) {
      const { PricingPackage } = await import("../models/PricingPackage.js");
      const pkg = await PricingPackage.findById(business.package_id);
      
      if (pkg) {
        // Use package minutes
        planLimit = pkg.minutes_included || 0;
        
        // Sync business.usage_limit_minutes with package if they don't match
        if (business.usage_limit_minutes !== pkg.minutes_included) {
          await Business.update(business.id, {
            usage_limit_minutes: pkg.minutes_included,
          });
        }
      }
    }
    
    // Format response same as customer side
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
    
    console.log("Creating package with data:", packageData);
    
    const pkg = await PricingPackage.create(packageData);

    // Log activity (non-blocking)
    AdminActivityLog.create({
      admin_user_id: req.adminId,
      action: "create_package",
      details: { package_id: pkg.id, package_name: pkg.name },
    }).catch((logError) => {
      console.error("[Admin] Failed to log activity (non-blocking):", logError);
    });

    res.status(201).json({ package: pkg });
  } catch (error) {
    console.error("Create package error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      packageData: req.body,
    });
    res.status(500).json({ 
      error: "Failed to create package",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

// Get all support tickets (admin)
router.get("/support/tickets", authenticateAdmin, async (req, res) => {
  try {
    const { status, urgency, search } = req.query;
    const { supabaseClient } = await import("../config/database.js");
    
    let query = supabaseClient
      .from("support_tickets")
      .select(`
        *,
        businesses (
          id,
          name,
          email,
          phone
        ),
        users (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .order("created_at", { ascending: false });
    
    if (status) {
      query = query.eq("status", status);
    }
    
    if (urgency) {
      query = query.eq("urgency", urgency);
    }
    
    if (search) {
      query = query.or(`description.ilike.%${search}%,issue_type.ilike.%${search}%`);
    }
    
    const { data, error } = await query.limit(100);
    
    if (error) throw error;
    
    res.json({ tickets: data || [] });
  } catch (error) {
    console.error("Get support tickets error:", error);
    res.status(500).json({ error: "Failed to get support tickets" });
  }
});

// Get single support ticket (admin)
router.get("/support/tickets/:id", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { supabaseClient } = await import("../config/database.js");
    
    // First get the ticket
    const { data: ticket, error: ticketError } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .single();
    
    if (ticketError) throw ticketError;
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    
    // Fetch related data separately if business_id exists
    let business = null;
    let user = null;
    let resolvedByAdmin = null;
    
    if (ticket.business_id) {
      const { data: businessData, error: businessError } = await supabaseClient
        .from("businesses")
        .select("id, name, email, phone, vapi_phone_number")
        .eq("id", ticket.business_id)
        .single();
      
      if (businessError) {
        console.error("Error fetching business for ticket:", {
          ticketId: id,
          businessId: ticket.business_id,
          error: businessError,
        });
      } else if (businessData) {
        business = businessData;
        console.log("Successfully fetched business:", business.name);
      } else {
        console.warn(`Business not found for business_id: ${ticket.business_id}`);
      }
    } else {
      console.warn(`Ticket ${id} has no business_id`);
    }
    
    if (ticket.user_id) {
      const { data: userData, error: userError } = await supabaseClient
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("id", ticket.user_id)
        .single();
      
      if (!userError && userData) {
        user = userData;
      }
    }
    
    if (ticket.resolved_by) {
      const { data: adminData, error: adminError } = await supabaseClient
        .from("admin_users")
        .select("id, email, first_name, last_name")
        .eq("id", ticket.resolved_by)
        .single();
      
      if (!adminError && adminData) {
        resolvedByAdmin = adminData;
      }
    }
    
    // Combine the data
    const ticketWithRelations = {
      ...ticket,
      businesses: business,
      users: user,
      resolved_by_admin: resolvedByAdmin,
    };
    
    // Debug logging
    console.log("Ticket response:", {
      ticketId: id,
      hasBusinessId: !!ticket.business_id,
      businessId: ticket.business_id,
      hasBusiness: !!business,
      businessName: business?.name,
    });
    
    res.json({ ticket: ticketWithRelations });
  } catch (error) {
    console.error("Get support ticket error:", error);
    res.status(500).json({ error: "Failed to get support ticket" });
  }
});

// Update support ticket status (admin)
router.patch("/support/tickets/:id/status", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }
    
    const { supabaseClient } = await import("../config/database.js");
    
    const updateData = {
      status,
      updated_at: new Date().toISOString(),
    };
    
    if (status === "resolved" || status === "closed") {
      updateData.resolved_by = req.adminId;
      updateData.resolved_at = new Date().toISOString();
      if (resolution_notes) {
        updateData.resolution_notes = resolution_notes;
      }
    }
    
    const { data, error } = await supabaseClient
      .from("support_tickets")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Log activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: data.business_id,
      action: "update_ticket_status",
      details: { ticket_id: id, status, resolution_notes },
    });
    
    // Send email notification to business (non-blocking)
    if (data.business_id) {
      const business = await Business.findById(data.business_id);
      if (business) {
        sendSupportTicketUpdateNotification(
          data,
          business,
          "status",
          req.admin.first_name || req.admin.email
        ).catch((err) => {
          console.error("[Admin] Failed to send ticket status update notification (non-blocking):", err);
        });
      }
    }
    
    res.json({ ticket: data });
  } catch (error) {
    console.error("Update ticket status error:", error);
    res.status(500).json({ error: "Failed to update ticket status" });
  }
});

// Add response/note to support ticket (admin)
router.post("/support/tickets/:id/response", authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { response_text } = req.body;
    
    if (!response_text) {
      return res.status(400).json({ error: "Response text is required" });
    }
    
    const { supabaseClient } = await import("../config/database.js");
    
    // Get ticket
    const { data: ticket, error: ticketError } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .single();
    
    if (ticketError) throw ticketError;
    
    // Fetch business separately
    let business = null;
    if (ticket.business_id) {
      try {
        business = await Business.findById(ticket.business_id);
        if (!business) {
          console.warn(`[Admin] Business not found for business_id: ${ticket.business_id}`);
        }
      } catch (businessError) {
        console.error("[Admin] Error fetching business for ticket response:", businessError);
        // Continue without business - email notification will be skipped
      }
    }
    
    // Update ticket with response in resolution_notes
    const currentNotes = ticket.resolution_notes || "";
    const timestamp = new Date().toLocaleString();
    const adminName = (req.admin && (req.admin.first_name || req.admin.email)) || "Support Team";
    const newNotes = currentNotes 
      ? `${currentNotes}\n\n--- Response from ${adminName} (${timestamp}) ---\n${response_text}`
      : `--- Response from ${adminName} (${timestamp}) ---\n${response_text}`;
    
    const newStatus = ticket.status === "open" ? "in-progress" : ticket.status;
    
    const { data, error } = await supabaseClient
      .from("support_tickets")
      .update({
        resolution_notes: newNotes,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    
    // Log activity (non-blocking - don't fail if logging fails)
    AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: ticket.business_id,
      action: "respond_to_ticket",
      details: { ticket_id: id, response_text },
    }).catch((logError) => {
      console.error("[Admin] Failed to log activity (non-blocking):", logError);
    });
    
    // Send email notification to business (non-blocking)
    if (business) {
      // Use the updated ticket data, but ensure all fields are present
      const ticketForNotification = {
        ...ticket,
        ...data,
        status: newStatus,
        resolution_notes: newNotes,
      };
      
      sendSupportTicketUpdateNotification(
        ticketForNotification,
        business,
        "response",
        (req.admin && (req.admin.first_name || req.admin.email)) || "Support Team",
        response_text
      ).catch((err) => {
        console.error("[Admin] Failed to send ticket response notification (non-blocking):", err);
      });
    }
    
    res.json({ ticket: data });
  } catch (error) {
    console.error("Add ticket response error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      ticketId: id,
    });
    res.status(500).json({ 
      error: "Failed to add ticket response",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ============================================
// SMS PHONE NUMBER MANAGEMENT
// ============================================

// Get all unassigned SMS phone numbers
router.get("/phone-numbers/unassigned", authenticateAdmin, async (req, res) => {
  try {
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    if (!TELNYX_API_KEY) {
      return res.status(500).json({ error: "TELNYX_API_KEY not configured" });
    }

    const axios = (await import("axios")).default;
    const { supabaseClient } = await import("../config/database.js");
    
    // Get all phone numbers from Telnyx
    const telnyxResponse = await axios.get("https://api.telnyx.com/v2/phone_numbers", {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'page[size]': 100, // Get up to 100 numbers per page
      },
    });
    
    const allTelnyxNumbers = telnyxResponse.data?.data || [];
    console.log(`[Admin] Found ${allTelnyxNumbers.length} phone numbers in Telnyx account`);
    
    // Get all phone numbers assigned to businesses for SMS (telnyx_number field)
    // Get ALL businesses, not just those with phone numbers, to ensure we check everything
    const { data: businesses, error } = await supabaseClient
      .from('businesses')
      .select('id, name, telnyx_number, vapi_phone_number')
      .is('deleted_at', null);
    
    if (error) {
      console.error('[Admin] Error fetching assigned numbers:', error);
      return res.status(500).json({ error: "Failed to fetch assigned numbers" });
    }
    
    console.log(`[Admin] Found ${businesses?.length || 0} businesses in database`);
    
    // Debug: Log all businesses and their phone number fields
    console.log(`[Admin] All businesses phone number fields:`, (businesses || []).map(b => ({
      id: b.id,
      name: b.name,
      telnyx_number: b.telnyx_number,
      vapi_phone_number: b.vapi_phone_number,
      telnyx_type: typeof b.telnyx_number,
      telnyx_length: b.telnyx_number?.length,
    })));
    
    // Create set of assigned SMS numbers (telnyx_number field only)
    // Also store original formats for debugging
    const assignedSMSNumbers = new Set();
    const assignedSMSNumbersOriginal = [];
    
    (businesses || []).forEach(b => {
      // Check if telnyx_number exists and is not null/empty
      if (b.telnyx_number && b.telnyx_number.trim() !== '') {
        const original = b.telnyx_number;
        let normalized = original.replace(/[^0-9+]/g, '').trim();
        if (!normalized.startsWith('+')) normalized = '+' + normalized;
        assignedSMSNumbers.add(normalized);
        assignedSMSNumbersOriginal.push({ original, normalized, business: b.name, business_id: b.id });
        console.log(`[Admin] ✅ Added assigned number: ${original} -> ${normalized} for business: ${b.name}`);
      } else {
        console.log(`[Admin] ⚠️  Business ${b.name} (${b.id}) has no telnyx_number or it's empty. Value:`, b.telnyx_number);
      }
    });
    
    console.log(`[Admin] Found ${assignedSMSNumbersOriginal.length} businesses with telnyx_number assigned`);
    console.log(`[Admin] Total unique normalized numbers in set: ${assignedSMSNumbers.size}`);
    console.log(`[Admin] All assigned numbers from DB:`, assignedSMSNumbersOriginal);
    console.log(`[Admin] Normalized set (first 10):`, Array.from(assignedSMSNumbers).slice(0, 10));
    
    // Filter out numbers assigned for SMS (telnyx_number)
    // Note: A number can be used for both calls (vapi_phone_number) and SMS (telnyx_number)
    // We only filter out numbers that are specifically assigned for SMS
    const unassignedNumbers = [];
    const assignedNumbers = [];
    
    allTelnyxNumbers.forEach(telnyxNum => {
      const phoneNumber = telnyxNum.phone_number;
      // Normalize Telnyx number
      let normalizedWithPlus = phoneNumber.replace(/[^0-9+]/g, '').trim();
      if (!normalizedWithPlus.startsWith('+')) {
        normalizedWithPlus = '+' + normalizedWithPlus;
      }
      const normalizedWithoutPlus = normalizedWithPlus.replace(/^\+/, '');
      
      // Check if this number is assigned for SMS (check both formats)
      let isAssigned = assignedSMSNumbers.has(normalizedWithPlus) || assignedSMSNumbers.has(normalizedWithoutPlus);
      
      // Also check if any assigned number is a prefix/suffix match (handle incomplete numbers)
      // This handles cases where DB has +1669240773 but Telnyx has +16692407730
      if (!isAssigned && normalizedWithPlus.startsWith('+1')) {
        const last10Digits = normalizedWithPlus.slice(-10); // Last 10 digits of Telnyx number
        
        // Check if any assigned number ends with these 10 digits or vice versa
        for (const assigned of assignedSMSNumbers) {
          const assignedClean = assigned.replace(/^\+1?/, ''); // Remove +1 or + from assigned
          const telnyxClean = normalizedWithPlus.replace(/^\+1/, ''); // Remove +1 from Telnyx
          
          // Check if one is a prefix of the other (handles incomplete numbers)
          if (assignedClean.length >= 9 && telnyxClean.length >= 9) {
            // Compare last 9 digits (more lenient than 10)
            const assignedLast9 = assignedClean.slice(-9);
            const telnyxLast9 = telnyxClean.slice(-9);
            
            if (assignedLast9 === telnyxLast9) {
              isAssigned = true;
              console.log(`[Admin] ✅ Matched via partial: DB has ${assigned}, Telnyx has ${normalizedWithPlus} (last 9 digits match)`);
              break;
            }
            
            // Also check if one contains the other (handles +1669240773 vs +16692407730)
            if (assignedClean.includes(telnyxClean) || telnyxClean.includes(assignedClean)) {
              isAssigned = true;
              console.log(`[Admin] ✅ Matched via contains: DB has ${assigned}, Telnyx has ${normalizedWithPlus}`);
              break;
            }
          }
        }
      }
      
      if (isAssigned) {
        assignedNumbers.push({
          ...telnyxNum,
          normalized: normalizedWithPlus,
          phone_number: phoneNumber,
        });
        console.log(`[Admin] ✅ Found assigned number: ${phoneNumber} (normalized: ${normalizedWithPlus})`);
      } else {
        unassignedNumbers.push({
          ...telnyxNum,
          normalized: normalizedWithPlus,
          phone_number: phoneNumber,
        });
        // Log potential matches for debugging
        if (normalizedWithPlus.startsWith('+1')) {
          const last10Digits = normalizedWithPlus.slice(-10);
          const potentialMatches = Array.from(assignedSMSNumbers).filter(a => 
            a.includes(last10Digits) || last10Digits.includes(a.replace(/^\+1?/, ''))
          );
          if (potentialMatches.length > 0) {
            console.log(`[Admin] ⚠️  Potential match for ${phoneNumber}:`, potentialMatches);
          }
        }
      }
    });
    
    console.log(`[Admin] Filtered results: ${assignedNumbers.length} assigned, ${unassignedNumbers.length} unassigned`);
    if (assignedNumbers.length > 0) {
      console.log(`[Admin] All assigned numbers from Telnyx:`, assignedNumbers.map(n => `${n.phone_number} (${n.normalized})`));
    }
    if (unassignedNumbers.length > 0 && assignedSMSNumbersOriginal.length > 0) {
      console.log(`[Admin] ⚠️  WARNING: Found ${assignedSMSNumbersOriginal.length} assigned numbers in DB but ${assignedNumbers.length} matched in Telnyx`);
      console.log(`[Admin] Checking first unassigned number:`, unassignedNumbers[0]?.phone_number, `(normalized: ${unassignedNumbers[0]?.normalized})`);
      console.log(`[Admin] Does it match any assigned?`, {
        'with+': assignedSMSNumbers.has(unassignedNumbers[0]?.normalized),
        'without+': assignedSMSNumbers.has(unassignedNumbers[0]?.normalized?.replace(/^\+/, '')),
        'assignedSet': Array.from(assignedSMSNumbers).slice(0, 5),
      });
    }
    
    console.log(`[Admin] Found ${unassignedNumbers.length} unassigned phone numbers`);
    
    res.json({
      total: allTelnyxNumbers.length,
      assigned: assignedNumbers.length,
      unassigned: unassignedNumbers.length,
      numbers: unassignedNumbers.map(num => ({
        phone_number: num.phone_number,
        id: num.id,
        status: num.status,
        messaging_profile_id: num.messaging_profile_id,
        connection_id: num.connection_id,
        region_information: num.region_information,
      })),
      // Include assigned numbers for debugging
      _debug: {
        assigned_count: assignedNumbers.length,
        assigned_numbers: assignedNumbers.slice(0, 5).map(n => n.phone_number),
        assigned_sms_numbers_from_db: Array.from(assignedSMSNumbers).slice(0, 5),
      },
    });
  } catch (error) {
    console.error("Get unassigned phone numbers error:", error);
    res.status(500).json({ error: error.message || "Failed to get unassigned phone numbers" });
  }
});

// Assign SMS number to business
router.post("/phone-numbers/assign-sms/:businessId", authenticateAdmin, async (req, res) => {
  try {
    const { businessId } = req.params;
    const { phone_number } = req.body;
    
    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const business = await Business.findById(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Normalize phone number
    let phoneNumberE164 = phone_number.replace(/[^0-9+]/g, '');
    if (!phoneNumberE164.startsWith('+')) {
      phoneNumberE164 = '+' + phoneNumberE164;
    }

    // Verify number exists in Telnyx
    const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
    if (!TELNYX_API_KEY) {
      return res.status(500).json({ error: "TELNYX_API_KEY not configured" });
    }

    const axios = (await import("axios")).default;
    const telnyxResponse = await axios.get("https://api.telnyx.com/v2/phone_numbers", {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
      params: {
        'filter[phone_number]': phoneNumberE164,
      },
    });

    const telnyxNumbers = telnyxResponse.data?.data || [];
    if (telnyxNumbers.length === 0) {
      return res.status(404).json({ error: "Phone number not found in Telnyx account" });
    }

    // Check if number is already assigned to another business
    const { supabaseClient } = await import("../config/database.js");
    const { data: existingBusiness } = await supabaseClient
      .from('businesses')
      .select('id, name, telnyx_number')
      .eq('telnyx_number', phoneNumberE164)
      .is('deleted_at', null)
      .single();

    if (existingBusiness && existingBusiness.id !== businessId) {
      return res.status(409).json({ 
        error: `Phone number is already assigned to business: ${existingBusiness.name}` 
      });
    }

    // Update business with SMS number
    await Business.update(businessId, {
      telnyx_number: phoneNumberE164,
    });

    // Log admin activity
    await AdminActivityLog.create({
      admin_user_id: req.adminId,
      business_id: businessId,
      action: "assign_sms_number",
      details: { 
        phone_number: phoneNumberE164,
        business_name: business.name,
      },
    });

    res.json({
      success: true,
      phone_number: phoneNumberE164,
      business: {
        id: business.id,
        name: business.name,
      },
    });
  } catch (error) {
    console.error("Assign SMS number error:", error);
    res.status(500).json({ error: error.message || "Failed to assign SMS number" });
  }
});

export default router;


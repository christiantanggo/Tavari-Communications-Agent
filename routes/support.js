// routes/support.js
// Support ticket routes

import express from "express";
import { authenticate } from "../middleware/auth.js";
import { supabaseClient } from "../config/database.js";
import { sendSupportTicketNotification } from "../services/notifications.js";
import { Business } from "../models/Business.js";

const router = express.Router();

// Create support ticket
router.post("/tickets", authenticate, async (req, res) => {
  try {
    const { issue_type, description, urgency = "normal" } = req.body;

    if (!issue_type || !description) {
      return res.status(400).json({ error: "Issue type and description are required" });
    }

    const business = await Business.findById(req.businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    const { data: ticket, error } = await supabaseClient
      .from("support_tickets")
      .insert({
        business_id: req.businessId,
        user_id: req.user.id,
        issue_type,
        description,
        urgency,
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;

    // Send notification to Tavari support
    await sendSupportTicketNotification(ticket, business);

    res.status(201).json({ ticket });
  } catch (error) {
    console.error("Create ticket error:", error);
    res.status(500).json({ error: "Failed to create support ticket" });
  }
});

// Get support tickets for business
router.get("/tickets", authenticate, async (req, res) => {
  try {
    const { data, error } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("business_id", req.businessId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ tickets: data || [] });
  } catch (error) {
    console.error("Get tickets error:", error);
    res.status(500).json({ error: "Failed to get support tickets" });
  }
});

export default router;

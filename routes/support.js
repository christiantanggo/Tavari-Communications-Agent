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

    // Send notification to Tavari support (non-blocking)
    sendSupportTicketNotification(ticket, business).catch((err) => {
      console.error("[Support] Failed to send ticket notification (non-blocking):", err);
    });

    res.status(201).json({ ticket });
  } catch (error) {
    console.error("Create ticket error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: "Failed to create support ticket",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: "Failed to get support tickets",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get single support ticket for business
router.get("/tickets/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .eq("business_id", req.businessId)
      .single();

    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    res.json({ ticket: data });
  } catch (error) {
    console.error("Get ticket error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: "Failed to get support ticket",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Add response to support ticket (customer)
router.post("/tickets/:id/response", authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { response_text } = req.body;
    
    if (!response_text || !response_text.trim()) {
      return res.status(400).json({ error: "Response text is required" });
    }

    // First verify the ticket belongs to this business
    const { data: ticket, error: ticketError } = await supabaseClient
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .eq("business_id", req.businessId)
      .single();

    if (ticketError) throw ticketError;
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    // Update ticket with customer response in resolution_notes
    const currentNotes = ticket.resolution_notes || "";
    const timestamp = new Date().toLocaleString();
    const userName = req.user.first_name || req.user.email || "Customer";
    const newNotes = currentNotes 
      ? `${currentNotes}\n\n--- Response from ${userName} (${timestamp}) ---\n${response_text}`
      : `--- Response from ${userName} (${timestamp}) ---\n${response_text}`;
    
    // Update status to in-progress if it was resolved/closed (reopening the conversation)
    let newStatus = ticket.status;
    if (ticket.status === "resolved" || ticket.status === "closed") {
      newStatus = "in-progress";
    } else if (ticket.status === "open") {
      newStatus = "in-progress";
    }
    
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

    // TODO: Send email notification to admin about customer response
    // This could notify the support team that the customer has responded

    res.json({ ticket: data });
  } catch (error) {
    console.error("Add ticket response error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: "Failed to add ticket response",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;

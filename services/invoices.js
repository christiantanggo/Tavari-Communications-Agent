// services/invoices.js
// Invoice generation (PDF), storage, and email delivery

import PDFDocument from "pdfkit";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { supabaseClient } from "../config/database.js";
import { Business } from "../models/Business.js";
import { sendInvoiceEmail } from "./notifications.js";
import { formatPhoneNumber } from "../utils/phoneFormatter.js";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

const S3_BUCKET = process.env.AWS_S3_BUCKET;

/**
 * Generate invoice number
 */
function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `INV-${year}-${month}-${random}`;
}

/**
 * Generate PDF invoice
 */
async function generatePDFInvoice(invoice, business) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(20).text("Tavari", 50, 50);
    doc.fontSize(12).text("AI Phone Receptionist", 50, 75);
    doc.moveDown();

    // Invoice details
    doc.fontSize(16).text(`Invoice #${invoice.invoice_number}`, 50, 120);
    doc.fontSize(10).text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`, 50, 145);

    // Business info
    doc.fontSize(12).text("Bill To:", 350, 120);
    doc.fontSize(10).text(business.name, 350, 140);
    if (business.address) {
      doc.text(business.address, 350, 155);
    }
    if (business.phone) {
      doc.text(formatPhoneNumber(business.phone) || business.phone, 350, 170);
    }
    doc.text(business.email, 350, 185);

    doc.moveDown(3);

    // Invoice items
    doc.fontSize(12).text("Description", 50, 250);
    doc.text("Amount", 450, 250);
    doc.moveTo(50, 270).lineTo(550, 270).stroke();

    let y = 280;
    doc.fontSize(10).text(invoice.invoice_type, 50, y);
    doc.text(`$${invoice.amount.toFixed(2)}`, 450, y);

    if (invoice.prorated_amount) {
      y += 20;
      doc.text(`Prorated (${invoice.prorated_days} days)`, 50, y);
      doc.text(`$${invoice.prorated_amount.toFixed(2)}`, 450, y);
    }

    if (invoice.period_start && invoice.period_end) {
      y += 20;
      doc.text(`Period: ${new Date(invoice.period_start).toLocaleDateString()} - ${new Date(invoice.period_end).toLocaleDateString()}`, 50, y);
    }

    y += 30;
    doc.moveTo(50, y).lineTo(550, y).stroke();
    y += 10;

    // Total
    doc.fontSize(12).text("Total", 50, y);
    doc.fontSize(12).text(`$${invoice.amount.toFixed(2)}`, 450, y);

    // Footer
    y = 700;
    doc.fontSize(8).text("Thank you for your business!", 50, y);
    doc.text("Questions? Contact support@tavari.com", 50, y + 15);

    doc.end();
  });
}

/**
 * Store PDF in S3
 */
async function storePDFInS3(pdfBuffer, invoiceNumber) {
  if (!S3_BUCKET) {
    // Local storage fallback
    return null;
  }

  try {
    const key = `invoices/${invoiceNumber}.pdf`;
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
    });

    await s3Client.send(command);
    const url = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || "us-east-1"}.amazonaws.com/${key}`;
    return { url, path: key };
  } catch (error) {
    console.error("Error storing PDF in S3:", error);
    return null;
  }
}

/**
 * Generate and store invoice
 */
export async function generateInvoice(businessId, invoiceData) {
  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error("Business not found");
  }

  const invoiceNumber = generateInvoiceNumber();
  const invoice = {
    business_id: businessId,
    invoice_number: invoiceNumber,
    amount: parseFloat(invoiceData.amount),
    currency: "USD",
    invoice_type: invoiceData.invoice_type,
    period_start: invoiceData.period_start || null,
    period_end: invoiceData.period_end || null,
    prorated_amount: invoiceData.prorated_amount ? parseFloat(invoiceData.prorated_amount) : null,
    prorated_days: invoiceData.prorated_days || null,
    status: "paid",
    paid_at: new Date().toISOString(),
  };

  // Generate PDF
  const pdfBuffer = await generatePDFInvoice(invoice, business);

  // Store PDF
  const storageInfo = await storePDFInS3(pdfBuffer, invoiceNumber);
  if (storageInfo) {
    invoice.pdf_url = storageInfo.url;
    invoice.pdf_storage_path = storageInfo.path;
  }

  // Store invoice in database
  const { data: savedInvoice, error } = await supabaseClient
    .from("invoices")
    .insert(invoice)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save invoice: ${error.message}`);
  }

  // Send invoice email
  try {
    await sendInvoiceEmail(business, savedInvoice, pdfBuffer);
  } catch (error) {
    console.error("Error sending invoice email:", error);
    // Don't fail if email fails
  }

  return savedInvoice;
}

/**
 * Get invoice by ID
 */
export async function getInvoiceById(invoiceId) {
  const { data, error } = await supabaseClient
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (error) {
    throw new Error(`Invoice not found: ${error.message}`);
  }

  return data;
}

/**
 * Get invoices for business
 */
export async function getInvoicesByBusiness(businessId, limit = 50) {
  const { data, error } = await supabaseClient
    .from("invoices")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get invoices: ${error.message}`);
  }

  return data || [];
}

/**
 * Get PDF from S3 or generate on-demand
 */
export async function getInvoicePDF(invoiceId) {
  const invoice = await getInvoiceById(invoiceId);
  const business = await Business.findById(invoice.business_id);

  if (invoice.pdf_url) {
    // Return S3 URL or fetch PDF
    // For now, regenerate if needed
  }

  // Regenerate PDF
  const pdfBuffer = await generatePDFInvoice(invoice, business);
  return pdfBuffer;
}


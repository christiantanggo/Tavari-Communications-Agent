import { Business } from "../models/Business.js";
import { User } from "../models/User.js";
import { sendEmail } from "./notifications.js";

/**
 * Find user by login email or by business email, issue 6-digit code, send email. Same behavior as public forgot-password.
 * @returns {{ ok: true, sent: boolean }}
 */
export async function issuePasswordResetCodeAndEmail(emailRaw) {
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!email) {
    return { ok: true, sent: false };
  }

  let user = await User.findByEmail(email);

  if (!user) {
    const business = await Business.findByEmail(email);
    if (business) {
      const users = await User.findByBusinessId(business.id);
      if (users && users.length > 0) {
        user = users.find((u) => u.role === "owner") || users[0];
      }
    }
  }

  if (!user) {
    return { ok: true, sent: false };
  }

  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  const resetExpires = new Date();
  resetExpires.setMinutes(resetExpires.getMinutes() + 15);

  await User.update(user.id, {
    password_reset_token: resetCode,
    password_reset_expires: resetExpires.toISOString(),
  });

  const business = await Business.findById(user.business_id);
  const subject = "Your Password Reset Code - Tavari";
  const bodyText = `Hello,

You requested to reset your password for your Tavari account${business ? ` (${business.name})` : ""}.

Your password reset code is: ${resetCode}

Enter this code on the password reset page to continue.

This code will expire in 15 minutes.

If you didn't request this, please ignore this email and your password will remain unchanged.

Best regards,
The Tavari Team`;

  const bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Password Reset Code</h2>
          <p>Hello,</p>
          <p>You requested to reset your password for your Tavari account${business ? ` (<strong>${business.name}</strong>)` : ""}.</p>
          <div style="background-color: #f3f4f6; border: 2px solid #2563eb; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
            <p style="margin: 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Your Reset Code</p>
            <p style="margin: 10px 0 0 0; font-size: 36px; font-weight: bold; color: #2563eb; letter-spacing: 8px;">${resetCode}</p>
          </div>
          <p>Enter this code on the password reset page to continue.</p>
          <p style="color: #666; font-size: 14px;">This code will expire in 15 minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email and your password will remain unchanged.</p>
          <p>Best regards,<br>The Tavari Team</p>
        </div>
      `;

  const deliverTo = user.email || email;
  await sendEmail(deliverTo, subject, bodyText, bodyHtml, "Tavari");
  return { ok: true, sent: true };
}

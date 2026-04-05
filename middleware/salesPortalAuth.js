import { verifyToken } from "../utils/auth.js";

export function authenticateSalesPortal(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded || decoded.scope !== "sales" || !decoded.salesPartnerId) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    req.salesPartnerId = decoded.salesPartnerId;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Authentication failed" });
  }
}

import crypto from "node:crypto";
import { db, ensureSchema } from "./db.js";

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function newToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function validateUsername(username) {
  return typeof username === "string" && /^[a-zA-Z0-9_.-]{3,32}$/.test(username);
}

export function validatePassword(password) {
  return typeof password === "string" && password.length >= 4 && password.length <= 200;
}

function tokenFromRequest(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

/** Resolves the logged-in user from the request's Bearer token, or null. */
export async function getUserFromRequest(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  await ensureSchema();
  const sql = db();
  const rows = await sql`
    SELECT u.id, u.username
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token}
  `;
  return rows[0] || null;
}

/** Sends a 401 and returns null if the request isn't authenticated. */
export async function requireUser(req, res) {
  const user = await getUserFromRequest(req);
  if (!user) {
    res.status(401).json({ error: "Not logged in." });
    return null;
  }
  return user;
}

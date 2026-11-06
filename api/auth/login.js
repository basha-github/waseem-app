import { db, ensureSchema } from "../_lib/db.js";
import { verifyPassword, newToken } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
  body = body || {};
  const username = (body.username || "").trim();
  const password = body.password || "";

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    await ensureSchema();
    const sql = db();

    const rows = await sql`
      SELECT id, username, password_hash, password_salt FROM users WHERE username = ${username}
    `;
    const user = rows[0];
    if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
      return res.status(401).json({ error: "Incorrect username or password." });
    }

    // A fresh token per login — multiple devices (wall + phone) can be
    // logged in on the same account at the same time, each with its own
    // token, all reading/writing the same shared active_app row.
    const token = newToken();
    await sql`INSERT INTO sessions (token, user_id) VALUES (${token}, ${user.id})`;

    res.status(200).json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Login failed: " + (err && err.message) });
  }
}

import { db, ensureSchema } from "../_lib/db.js";
import { hashPassword, newToken, validateUsername, validatePassword } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
  body = body || {};
  const username = (body.username || "").trim();
  const password = body.password || "";

  if (!validateUsername(username)) {
    return res.status(400).json({
      error: "Username must be 3-32 characters: letters, numbers, _ . -",
    });
  }
  if (!validatePassword(password)) {
    return res.status(400).json({ error: "Password must be at least 4 characters." });
  }

  try {
    await ensureSchema();
    const sql = db();

    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length) {
      return res.status(409).json({ error: "That username is already taken." });
    }

    const { hash, salt } = hashPassword(password);
    const inserted = await sql`
      INSERT INTO users (username, password_hash, password_salt)
      VALUES (${username}, ${hash}, ${salt})
      RETURNING id, username
    `;
    const user = inserted[0];

    const token = newToken();
    await sql`INSERT INTO sessions (token, user_id) VALUES (${token}, ${user.id})`;

    res.status(200).json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Signup failed: " + (err && err.message) });
  }
}

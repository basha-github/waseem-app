import { db, ensureSchema } from "../_lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match ? match[1].trim() : null;

  if (token) {
    try {
      await ensureSchema();
      await db()`DELETE FROM sessions WHERE token = ${token}`;
    } catch {
      /* best-effort */
    }
  }
  res.status(200).json({ ok: true });
}

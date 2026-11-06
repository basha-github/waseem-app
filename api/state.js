// /api/state — "which app is active" for the logged-in user's account.
// Every device logged in with the same username/password shares this row,
// which is how a phone can switch the app on the wall: same account,
// same row in Neon, polled from both sides.

import { db, ensureSchema } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return; // requireUser already sent the 401

  try {
    await ensureSchema();
    const sql = db();

    if (req.method === "GET") {
      const rows = await sql`
        SELECT active_app AS app, active_app_ts AS ts FROM users WHERE id = ${user.id}
      `;
      const row = rows[0] || { app: "menu", ts: 0 };
      res.status(200).json({ app: row.app, ts: Number(row.ts) });
      return;
    }

    if (req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body || "{}"); } catch { body = {}; } }
      body = body || {};
      const appId = typeof body.app === "string" ? body.app : "menu";
      const ts = Date.now();

      await sql`
        UPDATE users SET active_app = ${appId}, active_app_ts = ${ts} WHERE id = ${user.id}
      `;
      res.status(200).json({ app: appId, ts });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: "Unexpected error: " + (err && err.message) });
  }
}

import { getUserFromRequest } from "../_lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await getUserFromRequest(req);
    if (!user) return res.status(401).json({ error: "Not logged in." });
    res.status(200).json({ username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Unexpected error: " + (err && err.message) });
  }
}

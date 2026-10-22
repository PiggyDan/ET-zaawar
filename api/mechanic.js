import { handleMechanic, listForMechanic } from "./_form-mail.js";
import { originOf, jsonBody } from "./_http.js";

/** Vercel serverless entry point for POST /api/mechanic: forms saved before the approval workflow. */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = jsonBody(req);
  if (payload === undefined) return res.status(400).json({ error: "Хүсэлтийн өгөгдөл буруу байна." });

  const { status, body } = payload?.action === "list"
    ? await listForMechanic(payload)
    : await handleMechanic(payload, { origin: originOf(req) });

  return res.status(status).json(body);
}

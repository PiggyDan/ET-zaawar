import { originOf, jsonBody } from "./_http.js";
import { submitTravel } from "./_workflow.js";

/** Vercel serverless entry point for POST /api/send: the travelers' form. */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = jsonBody(req);
  if (payload === undefined) return res.status(400).json({ error: "Хүсэлтийн өгөгдөл буруу байна." });

  const { status, body } = await submitTravel(payload, { origin: originOf(req) });

  return res.status(status).json(body);
}

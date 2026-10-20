import { sendFormMail } from "./_form-mail.js";

/** Vercel serverless entry point for POST /api/send. */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let payload = req.body;

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return res.status(400).json({ error: "Хүсэлтийн өгөгдөл буруу байна." });
    }
  }

  const { status, body } = await sendFormMail(payload);

  return res.status(status).json(body);
}

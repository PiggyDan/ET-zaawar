import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sendFormMail } from "./api/_form-mail.js";

const MAX_BODY_BYTES = 6 * 1024 * 1024;

/** Serves POST /api/send during `npm run dev`, mirroring the Vercel function. */
function devApi() {
  return {
    name: "dev-api-send",
    configureServer(server) {
      server.middlewares.use("/api/send", async (req, res) => {
        const reply = (status, body) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        };

        if (req.method !== "POST") {
          res.setHeader("Allow", "POST");
          return reply(405, { error: "Method not allowed" });
        }

        try {
          const chunks = [];
          let size = 0;

          for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              return reply(413, { error: "Илгээх өгөгдөл хэт том байна." });
            }
            chunks.push(chunk);
          }

          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));

          const { status, body } = await sendFormMail(payload);

          return reply(status, body);
        } catch (error) {
          server.config.logger.error(`[dev-api-send] ${error.stack || error}`);
          return reply(400, { error: "Хүсэлтийн өгөгдөл буруу байна." });
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // The API handler reads credentials from process.env, which Vite does not
  // populate on its own.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return { plugins: [react(), devApi()] };
});

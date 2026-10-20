import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { handleMechanic, listForMechanic, sendFormMail } from "./api/_form-mail.js";
import { originOf } from "./api/_http.js";

const MAX_BODY_BYTES = 6 * 1024 * 1024;

const routes = {
  "/api/send": (payload, req) => sendFormMail(payload, { origin: originOf(req) }),
  "/api/mechanic": (payload) => (payload?.action === "list" ? listForMechanic(payload) : handleMechanic(payload))
};

/** Serves the /api routes during `npm run dev`, mirroring the Vercel functions. */
function devApi() {
  return {
    name: "dev-api",
    configureServer(server) {
      Object.entries(routes).forEach(([path, handle]) => {
        server.middlewares.use(path, async (req, res) => {
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

            const { status, body } = await handle(payload, req);

            return reply(status, body);
          } catch (error) {
            server.config.logger.error(`[dev-api ${path}] ${error.stack || error}`);
            return reply(400, { error: "Хүсэлтийн өгөгдөл буруу байна." });
          }
        });
      });
    }
  };
}

/**
 * With MAIL_OUTBOX_DIR set, /outbox lists the emails written there (newest
 * first) and /outbox/<name> shows one, so the mechanic's link can be
 * clicked like in a real inbox. Dev server only.
 */
function devOutbox() {
  return {
    name: "dev-outbox",
    configureServer(server) {
      server.middlewares.use("/outbox", async (req, res) => {
        const dir = process.env.MAIL_OUTBOX_DIR;
        const send = (status, type, body) => {
          res.statusCode = status;
          res.setHeader("Content-Type", `${type}; charset=utf-8`);
          res.end(body);
        };
        if (!dir) return send(404, "text/plain", "Set MAIL_OUTBOX_DIR to use the local outbox.");

        const { readdir, readFile } = await import("fs/promises");
        const path = await import("path");
        const name = decodeURIComponent(req.url.replace(/^\/+|\?.*$/g, ""));
        const files = await readdir(dir).catch(() => []);

        if (name) {
          if (!files.includes(name) || !name.endsWith(".html")) return send(404, "text/plain", "Not found");
          return send(200, "text/html", await readFile(path.join(dir, name), "utf8"));
        }

        const esc = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
        const rows = await Promise.all(
          files.filter((file) => file.endsWith(".eml")).sort().reverse().map(async (file) => {
            // Long headers are folded onto indented continuation lines.
            const eml = (await readFile(path.join(dir, file), "utf8")).replace(/\r?\n[ \t]+/g, " ");
            const header = (key) => new RegExp(`^${key}: (.*)$`, "mi").exec(eml)?.[1] ?? "";
            // Subjects are MIME-encoded; decode the UTF-8 base64 words.
            const subject = header("Subject").replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/gi, (_, b64) => Buffer.from(b64, "base64").toString("utf8"));
            const when = new Date(Number(file.split("-")[0])).toLocaleString("mn-MN");
            const html = file.replace(/\.eml$/, ".html");
            return `<li><a href="/outbox/${encodeURIComponent(html)}"><b>${esc(header("To"))}</b><span>${esc(subject)}</span><small>${esc(when)}</small></a></li>`;
          })
        );

        send(200, "text/html", `<!doctype html><html lang="mn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Outbox</title>
<style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#f2f4f7;color:#101828}h1{font-size:20px}p{color:#667085;font-size:14px}ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}a{display:grid;gap:4px;padding:12px 14px;border-radius:12px;background:#fff;border:1px solid #e4e7ec;color:inherit;text-decoration:none}a:hover{border-color:#1f8a43}span{font-size:14px}small{color:#667085}</style></head>
<body><h1>Local outbox</h1><p>Emails the app would have sent. Nothing here was really emailed. Newest first; refresh after submitting.</p><ul>${rows.join("") || "<p>No emails yet.</p>"}</ul></body></html>`);
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // The API handler reads credentials from process.env, which Vite does not
  // populate on its own.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return { plugins: [react(), devApi(), devOutbox()] };
});

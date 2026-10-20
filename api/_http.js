/**
 * Request helpers shared by the Vercel functions and the dev middleware.
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

/**
 * The site's base URL, for links in emails. APP_URL wins; otherwise it is
 * taken from the request, which a client could spoof, so set APP_URL in
 * production.
 */
export function originOf(req) {
  if (process.env.APP_URL) return process.env.APP_URL;

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) return "";

  const proto = req.headers["x-forwarded-proto"] || (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${String(proto).split(",")[0]}://${String(host).split(",")[0]}`;
}

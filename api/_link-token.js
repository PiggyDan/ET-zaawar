/**
 * Signed, self-contained tokens for the mechanic's link.
 *
 * There is no database: the submission travels inside the link the mechanic
 * receives, compressed and signed with MECHANIC_LINK_SECRET, so the mechanic
 * page can show it and the final email can include it, and nobody can alter
 * it or forge a link without the secret.
 *
 * Files prefixed with "_" are not routed by Vercel.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { deflateRawSync, inflateRawSync } from "zlib";

/** Links stop working after this long. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const secret = () => process.env.MECHANIC_LINK_SECRET || "";

export const hasLinkSecret = () => secret().length >= 16;

const mac = (body) => createHmac("sha256", secret()).update(body).digest("base64url");

export function signToken(data) {
  const body = deflateRawSync(Buffer.from(JSON.stringify({ ...data, iat: Date.now() }), "utf8"))
    .toString("base64url");

  return `${body}.${mac(body)}`;
}

/** Returns the token's data, or null if it is malformed, forged or expired. */
export function verifyToken(token) {
  if (!hasLinkSecret() || typeof token !== "string") return null;

  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  const expected = Buffer.from(mac(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const data = JSON.parse(inflateRawSync(Buffer.from(body, "base64url")).toString("utf8"));
    if (!(Date.now() - data.iat < MAX_AGE_MS)) return null;
    return data;
  } catch {
    return null;
  }
}

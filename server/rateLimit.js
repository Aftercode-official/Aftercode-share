import { createHash } from "node:crypto";
import { env } from "node:process";

export function hashRateLimitKey(value) {
  return createHash("sha256")
    .update(`${env.SUPABASE_SERVICE_ROLE_KEY || "aftercode-rate-limit"}:${value}`)
    .digest("hex");
}

export async function checkRateLimits(client, rules) {
  const { data, error } = await client.rpc("consume_rate_limits", { p_rules: rules });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  return {
    ok: result?.allowed !== false,
    remaining: result?.remaining ?? 0,
    retryAfter: result?.retry_after ?? 0
  };
}

export async function checkRateLimit(client, key, maxRequests, windowMs) {
  return checkRateLimits(client, [{
    key,
    maxRequests,
    windowSeconds: Math.max(1, Math.ceil(windowMs / 1000))
  }]);
}

export function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  return (typeof forwardedFor === "string" ? forwardedFor.split(",")[0]?.trim() : "")
    || req.headers["x-real-ip"]
    || req.socket?.remoteAddress
    || "unknown";
}

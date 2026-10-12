export async function checkRateLimit(client, key, maxRequests, windowMs) {
  const now = Date.now();
  const resetAt = new Date(now + windowMs).toISOString();

  const { data: existing } = await client
    .from("rate_limits")
    .select("*")
    .eq("key", key)
    .maybeSingle();

  if (!existing) {
    await client.from("rate_limits").insert({
      key,
      count: 1,
      reset_at: resetAt
    });
    return { ok: true, remaining: maxRequests - 1 };
  }

  const existingReset = new Date(existing.reset_at).getTime();
  if (now > existingReset) {
    // Window đã hết → reset
    await client.from("rate_limits").update({
      count: 1,
      reset_at: resetAt
    }).eq("key", key);
    return { ok: true, remaining: maxRequests - 1 };
  }

  if (existing.count >= maxRequests) {
    return {
      ok: false,
      remaining: 0,
      retryAfter: Math.ceil((existingReset - now) / 1000)
    };
  }

  await client.from("rate_limits").update({
    count: existing.count + 1
  }).eq("key", key);

  return { ok: true, remaining: maxRequests - existing.count - 1 };
}

export function getClientIp(req) {
  return (req.headers["x-forwarded-for"]?.split(",")[0]?.trim())
    || req.headers["x-real-ip"]
    || req.socket?.remoteAddress
    || "unknown";
}
import { logApiError, readJsonBody, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient } from "../../server/supabase.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) {
    return;
  }

  const body = readJsonBody(req);
  if (!body) {
    sendJson(res, 400, { error: "A JSON object is required." });
    return;
  }

  const username = typeof body.username === "string" ? body.username.trim().replace(/^@/, "") : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    sendJson(res, 401, { error: "Invalid username or password." });
    return;
  }

  try {
    const client = createAdminClient();

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("user_id")
      .ilike("username", username)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      sendJson(res, 401, { error: "Invalid username or password." });
      return;
    }

    const { data: userData, error: userError } = await client.auth.admin.getUserById(profile.user_id);
    if (userError || !userData?.user?.email) {
      sendJson(res, 401, { error: "Invalid username or password." });
      return;
    }

    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
      email: userData.user.email,
      password
    });

    if (signInError || !signInData?.session) {
      sendJson(res, 401, { error: "Invalid username or password." });
      return;
    }

    sendJson(res, 200, {
      session: {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        expires_at: signInData.session.expires_at
      }
    });
  } catch (error) {
    logApiError("Unable to sign in.", error);
    sendJson(res, 500, { error: "Unable to sign in." });
  }
  // Trong api/auth/sign-in.js hoặc api/auth/sign-up.js
const ip = getClientIp(req);
const limit = await checkRateLimit(client, `signup:${ip}`, 2, 60 * 60_000);  // 2 acc/giờ/IP
if (!limit.ok) {
  res.setHeader("Retry-After", limit.retryAfter);
  sendJson(res, 429, { error: "Too many accounts from your network." });
  return;
}
}
import { createClient } from "@supabase/supabase-js";
import { env } from "node:process";

export function createAdminClient() {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function getAccessToken(req) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === "string"
    ? authorization.match(/^Bearer\s+(.+)$/i)
    : null;

  return match?.[1] ?? null;
}

export async function getAuthenticatedUser(client, req) {
  if (Object.hasOwn(req, "authenticatedUser")) {
    return req.authenticatedUser;
  }

  const accessToken = getAccessToken(req);
  if (!accessToken) {
    return null;
  }

  try {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data?.user) {
      return null;
    }
    return data.user;
  } catch {
    return null;
  }
}

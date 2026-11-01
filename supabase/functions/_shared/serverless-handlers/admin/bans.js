import { logApiError, readJsonBody, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";
import { isAdminUserId } from "../../shared/adminUsers.js";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin(client, req, res) {
  const user = await getAuthenticatedUser(client, req);
  if (!user) {
    sendJson(res, 401, { error: "Sign in to manage account bans." });
    return null;
  }
  if (!isAdminUserId(user.id)) {
    sendJson(res, 403, { error: "Only the Aftercode administrator can manage account bans." });
    return null;
  }
  return user;
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) return;

  try {
    const client = createAdminClient();
    const admin = await requireAdmin(client, req, res);
    if (!admin) return;

    if (req.method === "GET") {
      const query = typeof req.query?.q === "string"
        ? req.query.q.trim().replace(/[%(),.]/g, "").slice(0, 80)
        : "";
      if (query) {
        const { data: profiles, error: profileError } = await client
          .from("profiles")
          .select("user_id, username, display_name")
          .or(`username.ilike.%${query.replace(/_/g, "\\_")}%,display_name.ilike.%${query.replace(/_/g, "\\_")}%`)
          .limit(20);
        if (profileError) throw profileError;

        const authUsers = [];
        for (let page = 1; page <= 10; page += 1) {
          const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw error;
          const pageUsers = data?.users ?? [];
          authUsers.push(...pageUsers);
          if (pageUsers.length < 1000) break;
        }

        const authUserMap = new Map(authUsers.map((authUser) => [authUser.id, authUser]));
        const profileMap = new Map((profiles ?? [])
          .filter((profile) => authUserMap.has(profile.user_id))
          .map((profile) => [profile.user_id, profile]));
        const normalizedQuery = query.replace(/^@/, "").toLocaleLowerCase();
        const candidates = new Map();
        for (const profile of profileMap.values()) {
          const authUser = authUserMap.get(profile.user_id);
          const metadata = authUser.user_metadata ?? {};
          candidates.set(profile.user_id, {
            user_id: profile.user_id,
            username: profile.username || metadata.username || "",
            display_name: profile.display_name || metadata.display_name || authUser.email || "Aftercode user"
          });
        }
        for (const authUser of authUsers) {
          const metadata = authUser.user_metadata ?? {};
          const username = typeof metadata.username === "string" ? metadata.username : "";
          const displayName = typeof metadata.display_name === "string" ? metadata.display_name : "";
          const matches = [authUser.email, authUser.phone, username, displayName]
            .some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(normalizedQuery));
          if (!matches || candidates.has(authUser.id)) continue;
          candidates.set(authUser.id, {
            user_id: authUser.id,
            username,
            display_name: displayName || authUser.email || authUser.phone || "Aftercode user"
          });
        }

        const candidateUsers = [...candidates.values()].slice(0, 20);
        const ids = candidateUsers.map((candidate) => candidate.user_id);
        const { data: bans, error: bansError } = ids.length
          ? await client.from("user_bans").select("user_id").in("user_id", ids)
          : { data: [], error: null };
        if (bansError) throw bansError;
        const bannedIds = new Set((bans ?? []).map((ban) => ban.user_id));
        sendJson(res, 200, {
          users: candidateUsers.map((candidate) => ({ ...candidate, banned: bannedIds.has(candidate.user_id) }))
        });
        return;
      }

      const { data: bans, error: bansError } = await client
        .from("user_bans")
        .select("user_id, reason, banned_by, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (bansError) throw bansError;
      const ids = (bans ?? []).map((ban) => ban.user_id);
      const { data: profiles, error: profileError } = ids.length
        ? await client.from("profiles").select("user_id, username, display_name").in("user_id", ids)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      sendJson(res, 200, {
        bans: (bans ?? []).map((ban) => ({ ...ban, ...(profileMap.get(ban.user_id) ?? {}) }))
      });
      return;
    }

    const body = readJsonBody(req);
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    if (!UUID_PATTERN.test(userId) || isAdminUserId(userId)) {
      sendJson(res, 400, { error: "Choose a valid user account to ban." });
      return;
    }
    if (!reason) {
      sendJson(res, 400, { error: "Add a reason for the permanent ban." });
      return;
    }

    const { data: targetData, error: targetLookupError } = await client.auth.admin.getUserById(userId);
    if (targetLookupError) throw targetLookupError;
    if (!targetData?.user) {
      sendJson(res, 404, { error: "This profile no longer has an active account to ban. Search for a different user." });
      return;
    }

    const { error: insertError } = await client.from("user_bans").upsert({
      user_id: userId,
      reason,
      banned_by: admin.id
    }, { onConflict: "user_id" });
    if (insertError) throw insertError;

    // Keep a database-side ban as the enforcement source, and also block future sign-ins.
    const { error: authBanError } = await client.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
    if (authBanError) {
      logApiError("Account was added to the site ban list, but the Auth ban could not be applied.", authBanError);
    }

    sendJson(res, 200, { banned: true, authBanApplied: !authBanError });
  } catch (error) {
    logApiError("Unable to manage account bans.", error);
    if (error?.code === "42P01" || error?.code === "PGRST205") {
      sendJson(res, 503, { code: "BAN_TABLE_MISSING", error: "The ban database migration is not applied yet. Run 20261031160000_permanent_user_bans.sql in the Supabase SQL Editor, then try again." });
      return;
    }
    if (error?.code === "42501" || error?.code === "PGRST301") {
      sendJson(res, 503, { error: "Supabase denied access to the ban table. Check that the API is using the service-role key and that the ban migration has been applied." });
      return;
    }
    if (error?.code === "23503") {
      sendJson(res, 404, { error: "This profile no longer has an active account to ban. Search for a different user." });
      return;
    }
    sendJson(res, 500, { error: "Unable to manage account bans." });
  }
}

import { logApiError, sendJson } from "../server/http.js";
import activity from "./activity.js";
import adminBans from "./admin/bans.js";
import announcements from "./announcements.js";
import authMe from "./auth/me.js";
import signIn from "./auth/sign-in.js";
import chat from "./chat.js";
import events from "./events.js";
import follows from "./follows.js";
import notifications from "./notifications.js";
import projectInteractions from "./project-interactions.js";
import profileById from "./profiles/[id].js";
import profileLookup from "./profiles/lookup.js";
import profileMe from "./profiles/me.js";
import projectById from "./projects/[id].js";
import projectView from "./projects/view.js";
import projects from "./projects/index.js";
import { createAdminClient, getAccessToken } from "../server/supabase.js";
import { checkRateLimits, getClientIp, hashRateLimitKey } from "../server/rateLimit.js";
import { isAdminUserId } from "../shared/adminUsers.js";

function getPathSegments(req) {
  const path = req.query?.path;
  if (Array.isArray(path)) return path;
  if (typeof path === "string") return path.split("/").filter(Boolean);

  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  return pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

export default async function handler(req, res) {
  req.query ??= {};
  const [resource, identifier, ...extra] = getPathSegments(req);
  const route = [resource, identifier].filter(Boolean).join("/");
  let endpoint;

  if (!identifier && resource === "activity") endpoint = activity;
  else if (route === "admin/bans" && extra.length === 0) endpoint = adminBans;
  else if (!identifier && resource === "announcements") endpoint = announcements;
  else if (resource === "announcements" && identifier && extra.length === 0) {
    req.query.id = identifier;
    endpoint = announcements;
  }
  else if (!identifier && resource === "chat") endpoint = chat;
  else if (!identifier && resource === "events") endpoint = events;
  else if (resource === "events" && identifier && extra.length === 0) {
    req.query.id = identifier;
    endpoint = events;
  }
  else if (!identifier && resource === "follows") endpoint = follows;
  else if (!identifier && resource === "notifications") endpoint = notifications;
  else if (!identifier && resource === "project-interactions") endpoint = projectInteractions;
  else if (resource === "projects" && identifier && extra.length === 1 && extra[0] === "view") {
    req.query.id = identifier;
    endpoint = projectView;
  }
  else if (route === "auth/me" && extra.length === 0) endpoint = authMe;
  else if (route === "auth/sign-in" && extra.length === 0) endpoint = signIn;
  else if (route === "profiles/me" && extra.length === 0) endpoint = profileMe;
  else if (route === "profiles/lookup" && extra.length === 0) endpoint = profileLookup;
  else if (resource === "profiles" && identifier && extra.length === 0) {
    req.query.id = identifier;
    endpoint = profileById;
  } else if (resource === "projects" && !identifier) endpoint = projects;
  else if (resource === "projects" && identifier && extra.length === 0) {
    req.query.id = identifier;
    endpoint = projectById;
  }

  if (!endpoint) {
    sendJson(res, 404, { error: "API route not found." });
    return;
  }

  const accessToken = getAccessToken(req);
  try {
    const client = createAdminClient();
    if (accessToken) {
      const { data, error } = await client.auth.getUser(accessToken);
      req.authenticatedUser = error ? null : data?.user ?? null;
      if (req.authenticatedUser && !isAdminUserId(req.authenticatedUser.id)) {
        const { data: ban, error: banError } = await client
          .from("user_bans")
          .select("reason")
          .eq("user_id", req.authenticatedUser.id)
          .maybeSingle();
        if (banError) throw banError;
        if (ban) {
          sendJson(res, 403, {
            code: "ACCOUNT_BANNED",
            error: ban.reason ? `This account is permanently banned: ${ban.reason}` : "This account is permanently banned."
          });
          return;
        }
      }
    }

    const ip = getClientIp(req);
    const rules = [
      { key: `site-ip:${hashRateLimitKey(ip)}`, maxRequests: 600, windowSeconds: 60 }
    ];
    if (req.authenticatedUser?.id) {
      rules.push({
        key: `site-user:${hashRateLimitKey(req.authenticatedUser.id)}`,
        maxRequests: 240,
        windowSeconds: 60
      });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      rules.push({ key: `site-write-ip:${hashRateLimitKey(ip)}`, maxRequests: 90, windowSeconds: 60 });
      if (req.authenticatedUser?.id) {
        rules.push({
          key: `site-write-user:${hashRateLimitKey(req.authenticatedUser.id)}`,
          maxRequests: 30,
          windowSeconds: 60
        });
      }
    }

    const rateLimit = await checkRateLimits(client, rules);
    res.setHeader("X-RateLimit-Remaining", String(rateLimit.remaining));
    if (!rateLimit.ok) {
      res.setHeader("Retry-After", String(Math.max(1, rateLimit.retryAfter)));
      sendJson(res, 429, { error: "Too many requests. Slow down and try again shortly." });
      return;
    }
  } catch (error) {
    logApiError("Unable to apply API rate limits.", error);
    sendJson(res, 503, { error: "The API is temporarily unavailable." });
    return;
  }

  return endpoint(req, res);
}

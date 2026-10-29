import { sendJson } from "../server/http.js";
import activity from "./activity.js";
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
import projects from "./projects/index.js";

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

export default function handler(req, res) {
  req.query ??= {};
  const [resource, identifier, ...extra] = getPathSegments(req);
  const route = [resource, identifier].filter(Boolean).join("/");
  let endpoint;

  if (!identifier && resource === "activity") endpoint = activity;
  else if (!identifier && resource === "chat") endpoint = chat;
  else if (!identifier && resource === "events") endpoint = events;
  else if (!identifier && resource === "follows") endpoint = follows;
  else if (!identifier && resource === "notifications") endpoint = notifications;
  else if (!identifier && resource === "project-interactions") endpoint = projectInteractions;
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

  return endpoint(req, res);
}

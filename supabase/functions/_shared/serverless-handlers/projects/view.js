import { createHash } from "node:crypto";
import { getServerEnv } from "../../server/env.js";
import { logApiError, requireMethod, sendJson } from "../../server/http.js";
import { getClientIp } from "../../server/rateLimit.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";

function hashKey(value) {
  return createHash("sha256")
    .update(`${getServerEnv("SUPABASE_SERVICE_ROLE_KEY")}:${value}`)
    .digest("hex");
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["POST"])) return;

  const projectId = req.query.id;
  if (typeof projectId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
    sendJson(res, 400, { error: "A valid project ID is required." });
    return;
  }

  try {
    const client = createAdminClient();
    const user = await getAuthenticatedUser(client, req);
    const { data: project, error: projectError } = await client
      .from("projects")
      .select("id, user_id, is_public, view_count")
      .eq("id", projectId)
      .maybeSingle();

    if (projectError) throw projectError;
    if (!project || (!project.is_public && project.user_id !== user?.id)) {
      sendJson(res, 404, { error: "Project not found." });
      return;
    }

    if (project.user_id === user?.id) {
      sendJson(res, 200, { views: project.view_count ?? 0, counted: false });
      return;
    }

    const ip = getClientIp(req);
    const viewerIdentity = user ? `user:${user.id}` : `ip:${ip}`;
    const { data, error } = await client.rpc("record_project_view", {
      p_project_id: projectId,
      p_viewer_key: hashKey(viewerIdentity),
      p_client_key: hashKey(`ip:${ip}`)
    });

    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.rate_limited) {
      res.setHeader("Retry-After", "60");
      sendJson(res, 429, { error: "Too many project view requests. Try again shortly." });
      return;
    }

    sendJson(res, 200, {
      views: result?.view_count ?? project.view_count ?? 0,
      counted: result?.counted === true
    });
  } catch (error) {
    logApiError("Unable to record project view.", error);
    sendJson(res, 500, { error: "Unable to record project view." });
  }
}

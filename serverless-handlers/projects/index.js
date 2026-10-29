import { logApiError, readJsonBody, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";
import { checkRateLimit, getClientIp } from "../../server/rateLimit.js";

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;
const SCRATCH_PROJECT_ID = /^\d{1,20}$/;
const MAX_PROJECTS_PER_USER = 20;

function validateProject(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const scratchProjectId = typeof body.scratchProjectId === "string"
    ? body.scratchProjectId.trim()
    : null;
  const assetPath = typeof body.assetPath === "string" ? body.assetPath.trim() : null;
  const thumbnailPath = typeof body.thumbnailPath === "string" ? body.thumbnailPath.trim() : null;
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const tags = body.tags ?? [];

  if (!title || title.length > 120) {
    return { error: "Title is required and must be 120 characters or fewer." };
  }
  if ((scratchProjectId && !SCRATCH_PROJECT_ID.test(scratchProjectId))
    || Boolean(scratchProjectId) === Boolean(assetPath)) {
    return { error: "Provide either a valid Scratch project ID or an uploaded .sb3 file path." };
  }
  if (assetPath && (!assetPath.endsWith(".sb3") || assetPath.includes(".."))) {
    return { error: "The uploaded project must be a valid .sb3 file path." };
  }
  if (description.length > 2000) {
    return { error: "Description must be 2000 characters or fewer." };
  }
  if (!category || category.length > 60) {
    return { error: "Category is required and must be 60 characters or fewer." };
  }
  if (!Array.isArray(tags) || tags.length > MAX_TAGS
    || tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.trim().length > MAX_TAG_LENGTH)) {
    return { error: `Tags must contain at most ${MAX_TAGS} non-empty strings of ${MAX_TAG_LENGTH} characters or fewer.` };
  }
  if (body.isPublic !== undefined && typeof body.isPublic !== "boolean") {
    return { error: "isPublic must be a boolean." };
  }

  return {
    project: {
      title,
      scratch_project_id: scratchProjectId,
      asset_path: assetPath,
      thumbnail_url: thumbnailPath,
      description,
      category,
      tags: tags.map((tag) => tag.trim()),
      is_public: body.isPublic ?? true
    }
  };
}

function displayNameFor(user) {
  const displayName = user.user_metadata?.display_name;
  if (typeof displayName === "string" && displayName.trim()) {
    return displayName.trim().slice(0, 80);
  }
  return user.email?.split("@")[0] ?? "Aftercode user";
}

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST"])) {
    return;
  }

  try {
    const client = createAdminClient();

    // ==================== GET ====================
    if (req.method === "GET") {
      const { data, error } = await client
        .from("projects")
        .select("id, user_id, title, author, scratch_project_id, asset_path, thumbnail_url, description, category, tags, is_public, created_at, updated_at")
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      if (data.length === 0) {
        sendJson(res, 200, { projects: [] });
        return;
      }

      const { data: likes, error: likesError } = await client
        .from("project_likes")
        .select("project_id")
        .in("project_id", data.map((project) => project.id));

      if (likesError) throw likesError;

      const likeCounts = (likes ?? []).reduce((counts, like) => {
        counts[like.project_id] = (counts[like.project_id] ?? 0) + 1;
        return counts;
      }, {});

      // Lấy avatar riêng từ profiles — KHÔNG dùng FK join
      const userIds = [...new Set(data.map((p) => p.user_id))];
      const { data: profiles } = await client
        .from("profiles")
        .select("user_id, avatar_url")
        .in("user_id", userIds);

      const avatarMap = new Map((profiles ?? []).map((p) => [p.user_id, p.avatar_url]));

      sendJson(res, 200, {
        projects: data.map((project) => ({
          ...project,
          authorAvatar: avatarMap.get(project.user_id) || "",
          likes: likeCounts[project.id] ?? 0
        }))
      });
      return;
    }

    // ==================== POST ====================
    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in before creating a project." });
      return;
    }

    // Rate limit per user — 3 project / 10 phút
    const limitUser = await checkRateLimit(client, `create-project:${user.id}`, 3, 10 * 60_000);
    if (!limitUser.ok) {
      res.setHeader("Retry-After", limitUser.retryAfter);
      sendJson(res, 429, { error: "You're uploading too fast. Please wait before creating more projects." });
      return;
    }

    // Rate limit per IP — 10 project / 10 phút
    const ip = getClientIp(req);
    const limitIp = await checkRateLimit(client, `create-project-ip:${ip}`, 10, 10 * 60_000);
    if (!limitIp.ok) {
      res.setHeader("Retry-After", limitIp.retryAfter);
      sendJson(res, 429, { error: "Too many projects from your network. Please try again later." });
      return;
    }

    // Max 20 project / user
    const { count: projectCount } = await client
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if ((projectCount ?? 0) >= MAX_PROJECTS_PER_USER) {
      sendJson(res, 403, {
        error: `You've reached the maximum number of projects (${MAX_PROJECTS_PER_USER}). Delete some before uploading new ones.`
      });
      return;
    }

    const body = readJsonBody(req);
    if (!body) {
      sendJson(res, 400, { error: "A JSON object is required." });
      return;
    }

    const validation = validateProject(body);
    if (validation.error) {
      sendJson(res, 400, { error: validation.error });
      return;
    }

    if (validation.project.asset_path
      && !validation.project.asset_path.startsWith(`${user.id}/`)) {
      sendJson(res, 403, { error: "You can only publish .sb3 files uploaded to your own account." });
      return;
    }

    const { data, error } = await client
      .from("projects")
      .insert({
        ...validation.project,
        user_id: user.id,
        author: displayNameFor(user)
      })
      .select("id, user_id, title, author, scratch_project_id, asset_path, thumbnail_url, description, category, tags, is_public, created_at, updated_at")
      .single();

    if (error) throw error;

    sendJson(res, 201, { project: data });
  } catch (error) {
    logApiError("Unable to process projects request.", error);
    sendJson(res, 500, { error: "Unable to process the projects request." });
  }
}
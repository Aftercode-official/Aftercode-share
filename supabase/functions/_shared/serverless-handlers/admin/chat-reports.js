import { logApiError, readJsonBody, requireMethod, sendJson } from "../../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../../server/supabase.js";
import { isAdminUserId } from "../../shared/adminUsers.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "PATCH"])) return;

  try {
    const client = createAdminClient();
    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to manage chat reports." });
      return;
    }
    if (!isAdminUserId(user.id)) {
      sendJson(res, 403, { error: "Only Aftercode administrators can manage chat reports." });
      return;
    }

    if (req.method === "GET") {
      const { data: reports, error } = await client.from("chat_message_reports")
        .select("id, message_id, reported_user_id, reporter_id, reason, message_text, message_author, media_type, status, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const userIds = [...new Set((reports ?? []).flatMap((report) => [report.reporter_id, report.reported_user_id]).filter(Boolean))];
      const { data: profiles, error: profilesError } = userIds.length
        ? await client.from("profiles").select("user_id, username, display_name").in("user_id", userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
      sendJson(res, 200, {
        reports: (reports ?? []).map((report) => ({
          ...report,
          reporter: profileMap.get(report.reporter_id) ?? null,
          reportedUser: profileMap.get(report.reported_user_id) ?? null
        }))
      });
      return;
    }

    const body = readJsonBody(req);
    const reportId = typeof body?.reportId === "string" ? body.reportId : "";
    const action = body?.action;
    if (!UUID_RE.test(reportId) || !["dismiss", "remove_message"].includes(action)) {
      sendJson(res, 400, { error: "Choose a valid report action." });
      return;
    }

    const { data: report, error: reportError } = await client.from("chat_message_reports")
      .select("id, message_id")
      .eq("id", reportId)
      .eq("status", "open")
      .maybeSingle();
    if (reportError) throw reportError;
    if (!report) {
      sendJson(res, 404, { error: "Open report not found." });
      return;
    }

    if (action === "remove_message" && report.message_id) {
      const { data: message, error: messageError } = await client.from("chat_messages")
        .select("id, media_path")
        .eq("id", report.message_id)
        .maybeSingle();
      if (messageError) throw messageError;
      if (message) {
        const { error: deleteError } = await client.from("chat_messages").delete().eq("id", message.id);
        if (deleteError) throw deleteError;
        if (message.media_path) {
          const { error: storageError } = await client.storage.from("chat-media").remove([message.media_path]);
          if (storageError) logApiError("Unable to remove reported chat media.", storageError);
        }
      }
    }

    const { error: updateError } = await client.from("chat_message_reports")
      .update({
        status: action === "remove_message" ? "removed" : "dismissed",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", report.id);
    if (updateError) throw updateError;
    sendJson(res, 200, { updated: true });
  } catch (error) {
    logApiError("Unable to manage chat reports.", error);
    sendJson(res, 500, { error: "Unable to manage chat reports." });
  }
}

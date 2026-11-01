import { logApiError, readJsonBody, requireMethod, sendJson } from "../server/http.js";
import { createAdminClient, getAuthenticatedUser } from "../server/supabase.js";
import { isAdminUserId } from "../shared/adminUsers.js";

export default async function handler(req, res) {
  if (!requireMethod(req, res, ["GET", "POST", "PATCH"])) return;

  try {
    const client = createAdminClient();
    if (req.method === "GET") {
      const { data, error } = await client
        .from("announcements")
        .select("id, title, message, created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      const user = await getAuthenticatedUser(client, req);
      let dismissedIds = [];
      if (user && data.length) {
        const { data: dismissals, error: dismissalError } = await client
          .from("announcement_dismissals")
          .select("announcement_id")
          .eq("user_id", user.id)
          .in("announcement_id", data.map((item) => item.id));
        if (dismissalError) throw dismissalError;
        dismissedIds = dismissals.map((item) => item.announcement_id);
        res.setHeader("Cache-Control", "private, no-store");
      } else {
        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=5, stale-while-revalidate=15");
      }
      sendJson(res, 200, { announcements: data, dismissedIds });
      return;
    }

    const user = await getAuthenticatedUser(client, req);
    if (!user) {
      sendJson(res, 401, { error: "Sign in to manage announcements." });
      return;
    }

    if (req.method === "PATCH") {
      const id = req.query.id;
      if (typeof id !== "string" || !/^\d+$/.test(id)) {
        sendJson(res, 400, { error: "A valid announcement ID is required." });
        return;
      }
      const { error } = await client.from("announcement_dismissals").upsert({
        user_id: user.id,
        announcement_id: Number(id)
      }, { onConflict: "user_id,announcement_id", ignoreDuplicates: true });
      if (error) throw error;
      sendJson(res, 200, { dismissed: true });
      return;
    }

    if (!isAdminUserId(user.id)) {
      sendJson(res, 403, { error: "Only the Aftercode administrator can send announcements." });
      return;
    }

    const body = readJsonBody(req);
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!title || title.length > 120 || !message || message.length > 2000) {
      sendJson(res, 400, { error: "Provide a title and a message up to 2,000 characters." });
      return;
    }

    let { data: announcement, error } = await client
      .rpc("replace_global_announcement", {
        p_created_by: user.id,
        p_title: title,
        p_message: message
      });

    // Deployments may receive this API update before the SQL migration. Keep
    // announcement publishing available by falling back to the existing table.
    if (error) {
      const { data: insertedAnnouncement, error: insertError } = await client
        .from("announcements")
        .insert({ created_by: user.id, title, message })
        .select("id, title, message, created_at")
        .single();
      if (insertError) throw insertError;

      const { error: deleteError } = await client
        .from("announcements")
        .delete()
        .neq("id", insertedAnnouncement.id);
      if (deleteError) {
        await client.from("announcements").delete().eq("id", insertedAnnouncement.id);
        throw deleteError;
      }

      announcement = insertedAnnouncement;
      error = null;
    }

    if (error) throw error;

    sendJson(res, 201, { announcement: Array.isArray(announcement) ? announcement[0] : announcement });
  } catch (error) {
    logApiError("Unable to process announcements request.", error);
    sendJson(res, 500, { error: "Unable to process the announcement." });
  }
}

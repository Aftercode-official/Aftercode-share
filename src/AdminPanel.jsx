import { useEffect, useState } from "react";
import { apiRequest } from "./api.js";
import ProjectThumbnail from "./ProjectThumbnail.jsx";
import { supabase } from "./supabase.js";
import "./AdminPanel.css";

export default function AdminPanel({ projects, events, user, onToggleFeatured, onOpenProject, onCreateAnnouncement, onCreateEvent, onDeleteEvent, error }) {
  const featuredCount = projects.filter((project) => project.isFeatured).length;
  const [announcement, setAnnouncement] = useState({ title: "", message: "" });
  const [eventDraft, setEventDraft] = useState({ title: "", description: "", location: "", startsAt: "" });
  const [eventImage, setEventImage] = useState(null);
  const [eventImagePreview, setEventImagePreview] = useState("");
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState(null);
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [banSearch, setBanSearch] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banUsers, setBanUsers] = useState([]);
  const [bans, setBans] = useState([]);
  const [isLoadingBans, setIsLoadingBans] = useState(true);
  const [banActionUserId, setBanActionUserId] = useState("");

  useEffect(() => {
    apiRequest("/api/admin/bans", { authenticated: true })
      .then((result) => setBans(result.bans ?? []))
      .catch((loadError) => setFormError(loadError.message))
      .finally(() => setIsLoadingBans(false));
  }, []);

  useEffect(() => () => {
    if (eventImagePreview) URL.revokeObjectURL(eventImagePreview);
  }, [eventImagePreview]);

  const submitAnnouncement = async (event) => {
    event.preventDefault();
    if (isSendingAnnouncement) return;
    setIsSendingAnnouncement(true);
    setFormError("");
    setSuccessMessage("");
    try {
      const result = await onCreateAnnouncement(announcement);
      setAnnouncement({ title: "", message: "" });
      setSuccessMessage("Announcement published and replaced the previous one.");
    } catch (submitError) {
      setFormError(submitError.message);
    } finally {
      setIsSendingAnnouncement(false);
    }
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    if (isCreatingEvent) return;
    if (!eventImage) {
      setFormError("Choose an event thumbnail image.");
      return;
    }
    if (eventImage.size > 5 * 1024 * 1024) {
      setFormError("Event thumbnails must be 5 MB or smaller.");
      return;
    }

    setIsCreatingEvent(true);
    setFormError("");
    setSuccessMessage("");
    let thumbnailPath;
    try {
      const extension = (eventImage.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      thumbnailPath = `${user.id}/event-thumbnails/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("project-files").upload(thumbnailPath, eventImage, {
        contentType: eventImage.type || "image/jpeg",
        cacheControl: "31536000",
        upsert: false
      });
      if (uploadError) throw uploadError;

      const result = await onCreateEvent({ ...eventDraft, thumbnailPath });
      thumbnailPath = null;
      setEventDraft({ title: "", description: "", location: "", startsAt: "" });
      setEventImage(null);
      setEventImagePreview("");
      setSuccessMessage(`Event notification sent to ${result?.sent ?? "all"} users.`);
    } catch (submitError) {
      if (thumbnailPath) await supabase.storage.from("project-files").remove([thumbnailPath]).catch(() => {});
      setFormError(submitError.message);
    } finally {
      setIsCreatingEvent(false);
    }
  };

  const deleteEvent = async (event) => {
    if (!window.confirm(`Delete “${event.title}”? It will disappear from the site and its event notice will be removed.`)) return;
    setDeletingEventId(event.id);
    setFormError("");
    setSuccessMessage("");
    try {
      await onDeleteEvent(event);
      setSuccessMessage("Event and its notification were removed from Aftercode.");
    } catch (deleteError) {
      setFormError(deleteError.message);
    } finally {
      setDeletingEventId(null);
    }
  };

  const searchBanUsers = async (event) => {
    event.preventDefault();
    const query = banSearch.trim();
    if (!query) return;
    setFormError("");
    try {
      const result = await apiRequest(`/api/admin/bans?q=${encodeURIComponent(query)}`, { authenticated: true });
      setBanUsers(result.users ?? []);
      if (!result.users?.length) setFormError("No matching user found.");
    } catch (searchError) {
      setFormError(searchError.message);
    }
  };

  const banUser = async (target) => {
    if (!banReason.trim()) {
      setFormError("Add a reason before permanently banning this user.");
      return;
    }
    if (!window.confirm(`Permanently ban ${target.display_name || target.username || "this user"}? They will be signed out and blocked from Aftercode.`)) return;
    setBanActionUserId(target.user_id);
    setFormError("");
    setSuccessMessage("");
    try {
      const result = await apiRequest("/api/admin/bans", {
        method: "POST",
        authenticated: true,
        body: { userId: target.user_id, reason: banReason.trim() }
      });
      setBanUsers((current) => current.map((userItem) => userItem.user_id === target.user_id ? { ...userItem, banned: true } : userItem));
      setBans((current) => [{
        user_id: target.user_id,
        display_name: target.display_name,
        username: target.username,
        reason: banReason.trim(),
        created_at: new Date().toISOString()
      }, ...current.filter((ban) => ban.user_id !== target.user_id)]);
      setBanReason("");
      setSuccessMessage(result.authBanApplied
        ? `${target.display_name || target.username} was permanently banned. Their current session will be blocked on its next request.`
        : "The account is blocked from Aftercode, but Supabase could not apply its sign-in ban. Check the server logs.");
    } catch (banError) {
      setFormError(banError.message);
    } finally {
      setBanActionUserId("");
    }
  };

  return (
    <section className="admin-panel">
      <header className="admin-panel-heading">
        <div>
          <span className="welcome-eyebrow">AFTERCODE ADMIN</span>
          <h1>Admin panel</h1>
          <p>Manage featured projects and send updates to the community.</p>
        </div>
        <span className="admin-panel-count">{featuredCount} featured</span>
      </header>
      {(error || formError) && <p className="admin-panel-error" role="alert">{formError || error}</p>}
      {successMessage && <p className="admin-panel-success" role="status">{successMessage}</p>}

      <div className="admin-tools-grid">
        <form className="admin-tool-card admin-announcement-tool" onSubmit={submitAnnouncement}>
          <h2>Global announcement</h2>
          <p className="admin-tool-description">Sending a new announcement replaces the current one.</p>
          <p>Send a general site message. This is separate from event notifications.</p>
          <label>Title<input required maxLength={120} value={announcement.title} onChange={(event) => setAnnouncement((current) => ({ ...current, title: event.target.value }))} /></label>
          <label>Message<textarea required maxLength={2000} rows={4} value={announcement.message} onChange={(event) => setAnnouncement((current) => ({ ...current, message: event.target.value }))} /></label>
          <button className="admin-feature-button" type="submit" disabled={isSendingAnnouncement}>{isSendingAnnouncement ? "Sending..." : "Send global announcement"}</button>
        </form>

        <form className="admin-tool-card admin-event-tool" onSubmit={submitEvent}>
          <h2>Event notification</h2>
          <p>Create an event notice with its own date, location, and thumbnail.</p>
          <label>Title<input required maxLength={120} value={eventDraft.title} onChange={(event) => setEventDraft((current) => ({ ...current, title: event.target.value }))} /></label>
          <label>Description<textarea maxLength={2000} rows={3} value={eventDraft.description} onChange={(event) => setEventDraft((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="admin-event-fields">
            <label>Location<input maxLength={120} value={eventDraft.location} onChange={(event) => setEventDraft((current) => ({ ...current, location: event.target.value }))} /></label>
            <label>Starts at<input required type="datetime-local" value={eventDraft.startsAt} onChange={(event) => setEventDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label>
          </div>
          <label>Event thumbnail<input required type="file" accept="image/*" onChange={(event) => {
            const file = event.currentTarget.files?.[0] ?? null;
            setEventImage(file);
            setEventImagePreview(file ? URL.createObjectURL(file) : "");
          }} /></label>
          {eventImagePreview && <img className="admin-event-preview" src={eventImagePreview} alt="Event thumbnail preview" />}
          <button className="admin-feature-button" type="submit" disabled={isCreatingEvent}>{isCreatingEvent ? "Creating event..." : "Create event notification"}</button>
        </form>
      </div>

      <section className="admin-ban-management">
        <h2>Permanent account bans</h2>
        <p>Search by username or display name. Banned accounts cannot sign in again and their current API access is blocked.</p>
        <form className="admin-ban-search" onSubmit={searchBanUsers}>
          <input aria-label="Search users to ban" placeholder="Username or display name" value={banSearch} onChange={(event) => setBanSearch(event.target.value)} />
          <button className="admin-feature-button" type="submit">Search users</button>
        </form>
        {banUsers.length > 0 && (
          <div className="admin-ban-results">
            <label>Reason for ban<input maxLength={500} value={banReason} onChange={(event) => setBanReason(event.target.value)} placeholder="Required; visible to the banned user" /></label>
            {banUsers.map((target) => (
              <article className="admin-ban-row" key={target.user_id}>
                <span><strong>{target.display_name || target.username || "Aftercode user"}</strong><small>@{String(target.username || "").replace(/^@/, "")}</small></span>
                {target.banned
                  ? <strong className="admin-ban-status">Already banned</strong>
                  : <button className="admin-ban-button" type="button" disabled={Boolean(banActionUserId)} onClick={() => banUser(target)}>{banActionUserId === target.user_id ? "Banning…" : "Ban permanently"}</button>}
              </article>
            ))}
          </div>
        )}
        <h3>Currently banned</h3>
        {isLoadingBans ? <p className="admin-panel-empty">Loading ban list…</p> : bans.length
          ? <div className="admin-ban-results">{bans.map((ban) => (
            <article className="admin-ban-row" key={ban.user_id}>
              <span><strong>{ban.display_name || ban.username || ban.user_id}</strong><small>{ban.reason}</small></span>
              <time>{new Date(ban.created_at).toLocaleDateString()}</time>
            </article>
          ))}</div>
          : <p className="admin-panel-empty">No users are banned.</p>}
      </section>

      <section className="admin-event-management">
        <h2>Manage events</h2>
        {events.length ? events.map((event) => (
          <article className="admin-event-row" key={event.id}>
            {event.thumbnail_url && <img src={supabase.storage.from("project-files").getPublicUrl(event.thumbnail_url).data.publicUrl} alt="" loading="lazy" decoding="async" />}
            <div className="admin-event-row-copy">
              <strong>{event.title}</strong>
              <span>{new Date(event.starts_at).toLocaleString()}{event.location ? ` · ${event.location}` : ""}</span>
            </div>
            <button className="admin-delete-event-button" type="button" disabled={deletingEventId === event.id} onClick={() => deleteEvent(event)}>
              {deletingEventId === event.id ? "Deleting..." : "Delete event"}
            </button>
          </article>
        )) : <p className="admin-panel-empty">No upcoming events.</p>}
      </section>

      <section className="admin-featured-management">
        <h2>Featured projects</h2>
        {projects.length ? (
          <div className="admin-project-list">
            {projects.map((project) => (
              <article className="admin-project-row" key={project.databaseId}>
                <button className="admin-project-open" type="button" onClick={() => onOpenProject(project)}>
                  <ProjectThumbnail project={project} alt={project.title} />
                  <span className="admin-project-copy"><strong>{project.title}</strong><span>by {project.author} · {project.category}</span></span>
                </button>
                <button className="admin-feature-button" type="button" aria-pressed={project.isFeatured} onClick={() => onToggleFeatured(project)}>
                  {project.isFeatured ? "Remove from Featured" : "Add to Featured"}
                </button>
              </article>
            ))}
          </div>
        ) : <p className="admin-panel-empty">No public projects to manage yet.</p>}
      </section>
    </section>
  );
}

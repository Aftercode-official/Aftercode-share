import { useMemo, useState } from "react";
import "./NotificationsPage.css";
import { supabase } from "./supabase.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "project_liked", label: "Likes" },
  { id: "project_favorited", label: "Favorites" },
  { id: "project_commented", label: "Comments" },
  { id: "profile_commented", label: "Profile comments" },
  { id: "profile_comment_replied", label: "Comment replies" },
  { id: "follow", label: "Follows" },
  { id: "event", label: "Event notifications" }
];

function notificationAction(type) {
  if (type === "project_liked") return "loved your project";
  if (type === "project_favorited") return "added your project to favorites";
  if (type === "project_commented") return "commented on your project";
  if (type === "profile_commented") return "commented on your profile";
  if (type === "profile_comment_replied") return "replied to your profile comment";
  if (type === "follow") return "started following you";
  if (type === "event") return "sent an event notification";
  return "interacted with your project";
}

export default function NotificationsPage({ notifications, isLoading, onMarkAllRead, onOpenProject, onOpenUserProfile }) {
  const [filter, setFilter] = useState("all");
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const visibleNotifications = useMemo(() => notifications.filter((item) => {
    if (filter === "unread") return !item.is_read;
    return filter === "all" || item.notification_type === filter;
  }).sort((first, second) => {
    const firstIsEvent = first.notification_type === "event";
    const secondIsEvent = second.notification_type === "event";
    if (firstIsEvent !== secondIsEvent) return firstIsEvent ? -1 : 1;
    return Date.parse(second.created_at) - Date.parse(first.created_at);
  }), [filter, notifications]);

  return (
    <section className="notifications-page">
      <header className="notifications-page-header">
        <div>
          <p className="notifications-eyebrow">AFTERCODE COMMUNITY</p>
          <h1>Notifications</h1>
          <p>Stay up to date with activity on your projects.</p>
        </div>
        <button type="button" className="notifications-read-all" onClick={onMarkAllRead} disabled={!unreadCount}>
          Mark all as read{unreadCount ? ` (${unreadCount})` : ""}
        </button>
      </header>

      <nav className="notifications-filters" aria-label="Filter notifications">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className={filter === item.id ? "is-active" : ""} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="notifications-list" aria-live="polite">
        {isLoading ? <p className="notifications-empty">Loading notifications…</p> : visibleNotifications.length ? visibleNotifications.map((item) => {
          const eventScope = `event-${String(item.event_id || item.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
          return (
          <article
            className={`notification-card${item.is_read ? "" : " is-unread"}${item.notification_type === "event" ? " is-event-notification" : ""}`}
            data-event-scope={item.notification_type === "event" ? eventScope : undefined}
            key={item.id}
          >
            {item.notification_type === "event" && item.custom_css && (
              <style>{`[data-event-scope="${eventScope}"] { ${item.custom_css} }`}</style>
            )}
            {item.thumbnail_url && supabase && (
              <img
                className="notification-thumbnail"
                src={supabase.storage.from("project-files").getPublicUrl(item.thumbnail_url).data.publicUrl}
                alt=""
                loading="lazy"
                decoding="async"
              />
            )}
            {item.notification_type !== "event" && (
              <button
                type="button"
                className="notification-actor"
                onClick={() => item.actor_id && onOpenUserProfile?.(item.actor_id)}
                disabled={!item.actor_id}
                aria-label={`View ${item.actor_name || "user"}'s profile`}
              >
                {item.actor_avatar
                  ? <img className="notification-avatar" src={item.actor_avatar} alt="" loading="lazy" decoding="async" />
                  : <span className="notification-avatar notification-avatar-fallback">{(item.actor_name || "A").slice(0, 1).toUpperCase()}</span>}
              </button>
            )}
            <span className="notification-copy">
              {item.notification_type === "event" ? (
                <>
                  <span className="notification-event-label">EVENT</span>
                  <strong className="notification-event-title">{item.project_title || "Community event"}</strong>
                  {item.message && <span className="notification-message">{item.message}</span>}
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                </>
              ) : (
                <>
                  <span className="notification-action-line"><strong>{item.actor_name}</strong> {notificationAction(item.notification_type)}</span>
                  {item.project_title && (
                    <button
                      type="button"
                      className="notification-project-link"
                      onClick={() => onOpenProject?.(item)}
                      disabled={!item.project_id}
                    >
                      Project: <strong>{item.project_title}</strong>
                    </button>
                  )}
                  {["project_commented", "profile_commented", "profile_comment_replied"].includes(item.notification_type) && item.message && (
                    <span className="notification-message">“{item.message}”</span>
                  )}
                  <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                  {item.actor_id && (
                    <button type="button" className="notification-view-profile" onClick={() => onOpenUserProfile?.(item.actor_id)}>
                      View profile
                    </button>
                  )}
                </>
              )}
            </span>
            {!item.is_read && <span className="notification-unread-dot" aria-label="Unread" />}
          </article>
          );
        }) : <p className="notifications-empty">No notifications here.</p>}
      </div>
    </section>
  );
}

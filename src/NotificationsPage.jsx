import { useMemo, useState } from "react";
import "./NotificationsPage.css";
import { supabase } from "./supabase.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "project_liked", label: "Likes" },
  { id: "project_favorited", label: "Favorites" },
  { id: "project_commented", label: "Comments" },
  { id: "event", label: "Event notifications" }
];

function notificationAction(type) {
  if (type === "project_liked") return "loved your project";
  if (type === "project_favorited") return "added your project to favorites";
  if (type === "project_commented") return "commented on your project";
  if (type === "event") return "sent an event notification";
  return "interacted with your project";
}

export default function NotificationsPage({ notifications, isLoading, onMarkAllRead, onOpenProject }) {
  const [filter, setFilter] = useState("all");
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const visibleNotifications = useMemo(() => notifications.filter((item) => {
    if (filter === "unread") return !item.is_read;
    return filter === "all" || item.notification_type === filter;
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
        {isLoading ? <p className="notifications-empty">Loading notifications…</p> : visibleNotifications.length ? visibleNotifications.map((item) => (
          <button
            type="button"
            className={`notification-card${item.is_read ? "" : " is-unread"}${item.notification_type === "event" ? " is-event-notification" : ""}`}
            key={item.id}
            onClick={() => onOpenProject?.(item)}
            disabled={!item.project_id}
          >
            {item.thumbnail_url && supabase && (
              <img
                className="notification-thumbnail"
                src={supabase.storage.from("project-files").getPublicUrl(item.thumbnail_url).data.publicUrl}
                alt=""
              />
            )}
            {item.actor_avatar
              ? <img className="notification-avatar" src={item.actor_avatar} alt="" />
              : <span className="notification-avatar notification-avatar-fallback">{(item.actor_name || "A").slice(0, 1).toUpperCase()}</span>}
            <span className="notification-copy">
              <span><strong>{item.actor_name}</strong> {notificationAction(item.notification_type)} <strong>{item.project_title}</strong></span>
              {item.message && <span className="notification-message">{item.message}</span>}
              <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
            </span>
            {!item.is_read && <span className="notification-unread-dot" aria-label="Unread" />}
          </button>
        )) : <p className="notifications-empty">No notifications here.</p>}
      </div>
    </section>
  );
}

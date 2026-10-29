import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import { supabase } from "./supabase.js";
import { getProjectIdsFromText } from "./projectLinks.js";

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toProjectPreview(record) {
  const thumb = record.thumbnail_url && supabase
    ? supabase.storage.from("project-files").getPublicUrl(record.thumbnail_url).data.publicUrl
    : record.scratch_project_id
      ? `https://uploads.scratch.mit.edu/get_image/project/${record.scratch_project_id}_480x360.png`
      : null;
  return {
    id: record.id,
    databaseId: record.id,
    userId: record.user_id,
    scratchProjectId: record.scratch_project_id,
    assetPath: record.asset_path,
    projectUrl: record.asset_path
      ? supabase?.storage.from("project-files").getPublicUrl(record.asset_path).data.publicUrl ?? null
      : null,
    title: record.title,
    author: record.author,
    authorAvatar: record.authorAvatar || "",
    thumb,
    category: record.category,
    description: record.description ?? "",
    tags: record.tags ?? [],
    isPublic: record.is_public,
    likes: record.likes ?? 0,
    views: 0
  };
}

export default function ChatCenter({ user, onSignIn, onOpenProject }) {
  const [messages, setMessages] = useState([]);
  const [projectPreviews, setProjectPreviews] = useState({});
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomRef = useRef(null);
  const isAuthenticated = Boolean(user);
  const projectIdsKey = [...new Set(messages.flatMap((message) => getProjectIdsFromText(message.text)))].slice(-12).join(",");

  useEffect(() => {
    let active = true;
    const loadMessages = async () => {
      try {
        const { messages: latest } = await apiRequest("/api/chat");
        if (active) {
          setMessages(latest);
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      }
    };
    loadMessages();
    const timer = window.setInterval(loadMessages, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const ids = projectIdsKey ? projectIdsKey.split(",") : [];
    const userKey = user?.id ?? "guest";
    const missingIds = ids.filter((id) => !Object.hasOwn(projectPreviews, `${userKey}:${id}`));
    if (missingIds.length === 0) return undefined;

    let active = true;
    Promise.all(missingIds.map(async (id) => {
      const key = `${userKey}:${id}`;
      try {
        const { project } = await apiRequest(`/api/projects/${encodeURIComponent(id)}`, {
          authenticated: isAuthenticated
        });
        return [key, { project: toProjectPreview(project) }];
      } catch (previewError) {
        return [key, { error: previewError.message }];
      }
    })).then((entries) => {
      if (active) setProjectPreviews((current) => ({ ...current, ...Object.fromEntries(entries) }));
    });

    return () => { active = false; };
  }, [projectIdsKey, user?.id, isAuthenticated, projectPreviews]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isSending) return;
    setIsSending(true);
    setError("");
    try {
      const { message } = await apiRequest("/api/chat", {
        method: "POST",
        authenticated: true,
        body: { text }
      });
      setMessages((current) => [...current.filter((item) => item.id !== message.id), message].slice(-100));
      setDraft("");
    } catch (sendError) {
      setError(sendError.message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="chat-center" aria-labelledby="chat-title">
      <header className="chat-heading">
        <div>
          <span className="chat-eyebrow">AFTERCODE COMMUNITY</span>
          <h1 id="chat-title">Community chat</h1>
          <p>Meet creators and talk about what you’re building.</p>
        </div>
        <span className="chat-live"><i /> Global room</span>
      </header>

      <div className="chat-messages" aria-live="polite" aria-label="Recent chat messages">
        {error && <p className="chat-error" role="alert">{error}</p>}
        {messages.length ? messages.map((message) => (
          <article className={`chat-message${message.user_id === user?.id ? " is-own-message" : ""}`} key={message.id}>
            {message.avatar_url
              ? <img className="chat-avatar" src={message.avatar_url} alt="" />
              : <span className="chat-avatar chat-avatar-fallback" aria-hidden="true">{message.author.slice(0, 1).toUpperCase()}</span>}
            <div className="chat-message-body">
              <div className="chat-message-meta">
                <strong>{message.author}</strong>
                <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
              </div>
              <p>{message.text}</p>
              {getProjectIdsFromText(message.text).map((projectId) => {
                const preview = projectPreviews[`${user?.id ?? "guest"}:${projectId}`];
                if (!preview) {
                  return <div className="chat-project-preview chat-project-preview-loading" key={projectId}>Loading project preview…</div>;
                }
                if (preview.error) {
                  return <div className="chat-project-preview chat-project-preview-error" key={projectId}>This project is unavailable or private.</div>;
                }
                const project = preview.project;
                return (
                  <button className="chat-project-preview" type="button" key={projectId} onClick={() => onOpenProject(project)}>
                    {project.thumb
                      ? <img className="chat-project-thumb" src={project.thumb} alt="" />
                      : <span className="chat-project-thumb chat-project-thumb-empty">SB3</span>}
                    <span className="chat-project-copy">
                      <span className="chat-project-title">{project.title}</span>
                      <span className="chat-project-author">
                        {project.authorAvatar
                          ? <img src={project.authorAvatar} alt="" />
                          : <span className="chat-project-author-fallback">{project.author.slice(0, 1).toUpperCase()}</span>}
                        <span>{project.author} · {project.category} · {project.likes} likes</span>
                      </span>
                      {project.description && <span className="chat-project-description">{project.description}</span>}
                      {project.tags.length > 0 && <span className="chat-project-tags">{project.tags.slice(0, 5).map((tag) => `#${tag}`).join("  ")}</span>}
                    </span>
                    <span className="chat-project-open" aria-hidden="true">↗</span>
                  </button>
                );
              })}
            </div>
          </article>
        )) : !error && <div className="chat-empty"><strong>Start the conversation</strong><span>Say hello to the Aftercode community.</span></div>}
        <div ref={bottomRef} />
      </div>

      {user ? (
        <form className="chat-composer" onSubmit={sendMessage}>
          <label className="visually-hidden" htmlFor="chat-message">Write a message</label>
          <input
            id="chat-message"
            maxLength={1000}
            placeholder="Write a message..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <span className="chat-character-count">{draft.length}/1000</span>
          <button type="submit" disabled={!draft.trim() || isSending}>{isSending ? "Sending…" : "Send"}</button>
        </form>
      ) : (
        <div className="chat-signin-prompt">
          <span>Sign in to join the conversation.</span>
          <button type="button" onClick={onSignIn}>Sign in</button>
        </div>
      )}
    </section>
  );
}

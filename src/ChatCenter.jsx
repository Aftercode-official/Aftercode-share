import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import { supabase } from "./supabase.js";
import { getProjectIdsFromText } from "./projectLinks.js";
import ProjectThumbnail from "./ProjectThumbnail.jsx";

const EMOJI_GROUPS = [
  { label: "Smileys", items: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😋", "😛", "😜", "🤪", "😎", "🤓", "🧐", "🤔", "🫡", "🤭", "🫢", "🤫", "🤗", "🥳", "😏", "😴", "🥱", "😮", "😱", "🥺", "😢", "😭", "😤", "😡", "🤯", "😵", "🤒", "🤧", "🥶", "🥵", "😈", "👻", "💀", "🤖", "💩","👽"] },
  { label: "People", items: ["👋", "🤚", "✋", "🖖", "🫶", "🤝", "🙏", "💪", "🦾", "👏", "🙌", "👐", "🤲", "👍", "👎", "👊", "✊", "🤛", "🤜", "🤞", "✌️", "🤟", "🤘", "👌", "🤌", "👈", "👉", "👆", "👇", "☝️", "✍️", "💅", "🧑‍💻", "👨‍💻", "👩‍💻", "🧑‍🎨", "🧑‍🚀"] },
  { label: "Animals", items: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🙉", "🙊", "🐔", "🐧", "🐦", "🦄", "🐝", "🦋", "🐢", "🐬", "🐳", "🦖", "🐙", "🦀", "🦕", "🐲"] },
  { label: "Food", items: ["🍎", "🍊", "🍋", "🍉", "🍇", "🍓", "🫐", "🍒", "🍑", "🥭", "🍍", "🥝", "🍅", "🥑", "🍕", "🍔", "🍟", "🌭", "🍿", "🧋", "☕", "🍵", "🍩", "🍪", "🎂", "🍰", "🍫", "🍭", "🍦", "🥤"] },
  { label: "Activities", items: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🎱", "🏓", "🏸", "🥊", "🎮", "🕹️", "🎯", "🎲", "🎹", "🎸", "🥁", "🎤", "🎧", "🎨", "🎬", "🎼", "🏆", "🥇", "🎉", "🎊", "🎈", "🎁", "🪄", "🎃"] },
  { label: "Travel & nature", items: ["🌍", "🌎", "🌏", "🌙", "⭐", "🌟", "✨", "⚡", "🔥", "🌈", "☀️", "🌤️", "⛅", "🌧️", "❄️", "🌊", "🌸", "🌻", "🌷", "🌵", "🌴", "🍀", "🌱", "🌳", "☘️", "🏠", "🚗", "🚀", "✈️", "🚲"] },
  { label: "Objects & symbols", items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💖", "💗", "💘", "💝", "💯", "💢", "💥", "💫", "💦", "💨", "🗯️", "💬", "💭", "✅", "❌", "❓", "❗", "💡", "🔔", "🔒", "🔑", "📌", "📎", "💻", "📱", "🛠️", "🔧", "🧠", "👀"] }
];

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function mergeChatMessages(current, incoming) {
  const additions = Array.isArray(incoming) ? incoming : [incoming];
  const additionIds = new Set(additions.map((message) => message.id));
  const remaining = current.filter((message) => {
    if (additionIds.has(message.id)) return false;
    if (!message.pending) return true;

    return !additions.some((added) => {
      const sameContent = message.user_id === added.user_id
        && message.text === added.text
        && (message.media_type ?? null) === (added.media_type ?? null);
      const timeDifference = Math.abs(new Date(message.created_at).getTime() - new Date(added.created_at).getTime());
      return sameContent && timeDifference < 10000;
    });
  });

  return [...remaining, ...additions]
    .sort((left, right) => new Date(left.created_at) - new Date(right.created_at)
      || String(left.id).localeCompare(String(right.id)));
}

function toProjectPreview(record) {
  const thumb = record.thumbnail_url && supabase
    ? (record.thumbnail_url.startsWith("http")
      ? record.thumbnail_url
      : supabase.storage.from("project-files").getPublicUrl(record.thumbnail_url).data.publicUrl)
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

export default function ChatCenter({ user, onSignIn, onOpenProject, onOpenUserProfile }) {
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [projectPreviews, setProjectPreviews] = useState({});
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatMessagesRef = useRef(null);
  const hasInitiallyScrolledRef = useRef(false);
  const pendingScrollRestoreRef = useRef(null);
  const hasLoadedInitialPageRef = useRef(false);
  const fileInputRef = useRef(null);
  const isAuthenticated = Boolean(user);
  const projectIdsKey = [...new Set(messages.flatMap((message) => getProjectIdsFromText(message.text)))].slice(-12).join(",");
  const lastMessageId = messages.at(-1)?.id;

  const scrollToBottom = (smooth = true) => {
    const container = chatMessagesRef.current;
    if (!container) return;
    if (!hasInitiallyScrolledRef.current) {
      container.scrollTop = container.scrollHeight;
      hasInitiallyScrolledRef.current = true;
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    let active = true;
    let isLoading = false;
    const loadMessages = async () => {
      if (!active || isLoading || document.visibilityState === "hidden") return;
      isLoading = true;
      try {
        const { messages: latest, hasMore } = await apiRequest("/api/chat");
        if (active) {
          setMessages((current) => mergeChatMessages(current, latest));
          if (!hasLoadedInitialPageRef.current) {
            setHasOlderMessages(Boolean(hasMore));
            hasLoadedInitialPageRef.current = true;
          }
          setError("");
        }
      } catch (loadError) {
        if (active) setError(loadError.message);
      } finally {
        isLoading = false;
        if (active) setIsLoadingMessages(false);
      }
    };
    loadMessages();
    const timer = window.setInterval(loadMessages, 15000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadMessages();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    const channel = supabase
      .channel("aftercode-global-chat")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages"
      }, ({ new: message }) => {
        if (active && message?.id) {
          setMessages((current) => mergeChatMessages(current, message));
        }
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
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
    const frame = window.requestAnimationFrame(() => {
      const container = chatMessagesRef.current;
      const saved = pendingScrollRestoreRef.current;
      if (container && saved) {
        container.scrollTop = saved.scrollTop + (container.scrollHeight - saved.scrollHeight);
        pendingScrollRestoreRef.current = null;
      } else {
        scrollToBottom();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, lastMessageId, projectPreviews]);

  useEffect(() => {
    if (!attachment) return undefined;
    return () => URL.revokeObjectURL(attachment.previewUrl);
  }, [attachment]);

  const loadOlderMessages = async () => {
    if (isLoadingOlder || !hasOlderMessages || messages.length === 0) return;
    const oldest = messages[0];
    const container = chatMessagesRef.current;
    if (!container) return;
    setIsLoadingOlder(true);
    setError("");
    try {
      const query = new URLSearchParams({
        before: oldest.created_at,
        beforeId: oldest.id,
        limit: "50"
      });
      const { messages: older, hasMore } = await apiRequest(`/api/chat?${query}`);
      if (older.length) {
        pendingScrollRestoreRef.current = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight
        };
        setMessages((current) => mergeChatMessages(current, older));
      }
      setHasOlderMessages(Boolean(hasMore));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  const chooseAttachment = (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
    if (!allowed.has(file.type)) {
      setError("Choose a JPG, PNG, WebP, GIF, MP4, or WebM file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Chat media must be 25 MB or smaller.");
      return;
    }
    setError("");
    setIsEmojiPickerOpen(false);
    setAttachment({ file, previewUrl: URL.createObjectURL(file) });
  };

  const sendMessage = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !attachment) || isSending) return;
    setIsSending(true);
    setError("");
    const pendingId = `pending-${crypto.randomUUID()}`;
    const pendingMessage = {
      id: pendingId,
      user_id: user.id,
      author: user.user_metadata?.display_name || user.email?.split("@")[0] || "You",
      avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || "",
      text,
      media_path: "",
      media_type: attachment?.file.type ?? null,
      optimistic_media_url: attachment?.previewUrl ?? "",
      created_at: new Date().toISOString(),
      pending: true
    };
    setMessages((current) => mergeChatMessages(current, pendingMessage));
    let uploadedPath = "";
    try {
      if (attachment) {
        if (!supabase) throw new Error("Media upload is not configured.");
        const safeName = attachment.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
        uploadedPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("chat-media").upload(
          uploadedPath,
          attachment.file,
          { contentType: attachment.file.type, cacheControl: "31536000", upsert: false }
        );
        if (uploadError) throw uploadError;
      }
      const { message } = await apiRequest("/api/chat", {
        method: "POST",
        authenticated: true,
        body: {
          text,
          mediaPath: uploadedPath || undefined,
          mediaType: uploadedPath ? attachment.file.type : undefined
        }
      });
      setMessages((current) => mergeChatMessages(current.filter((item) => item.id !== pendingId), {
        ...message,
        avatar_url: message.avatar_url || pendingMessage.avatar_url
      }));
      setDraft("");
      setAttachment(null);
      setIsEmojiPickerOpen(false);
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message.id !== pendingId));
      if (uploadedPath && supabase) {
        await supabase.storage.from("chat-media").remove([uploadedPath]).catch(() => {});
      }
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

      <div
        ref={chatMessagesRef}
        className="chat-messages"
        aria-live="polite"
        aria-label="Recent chat messages"
      >
        {hasOlderMessages && !isLoadingMessages && (
          <button className="chat-load-older" type="button" onClick={loadOlderMessages} disabled={isLoadingOlder}>
            {isLoadingOlder ? "Loading older messages..." : "Load older messages"}
          </button>
        )}
        {!isLoadingMessages && error && <p className="chat-error" role="alert">{error}</p>}
        {isLoadingMessages ? (
          <div className="chat-loading" role="status">
            <span className="chat-loading-spinner" aria-hidden="true" />
            <span>Loading chat...</span>
          </div>
        ) : messages.length ? messages.map((message) => (
          <article className={`chat-message${message.user_id === user?.id ? " is-own-message" : ""}${message.pending ? " is-pending" : ""}`} key={message.id}>
            <button
              className="chat-avatar-link"
              type="button"
              aria-label={`View ${message.author}'s profile`}
              onClick={() => message.user_id && onOpenUserProfile?.(message.user_id)}
              disabled={!message.user_id}
            >
              {message.avatar_url
                ? <img className="chat-avatar" src={message.avatar_url} alt="" loading="lazy" decoding="async" />
                : <span className="chat-avatar chat-avatar-fallback" aria-hidden="true">{message.author.slice(0, 1).toUpperCase()}</span>}
            </button>
            <div className="chat-message-body">
              <div className="chat-message-meta">
                <button
                  className="chat-user-link"
                  type="button"
                  onClick={() => message.user_id && onOpenUserProfile?.(message.user_id)}
                  disabled={!message.user_id}
                >
                  {message.author}
                </button>
                <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
              </div>
              {message.text && <p>{message.text}</p>}
              {(message.media_path || message.optimistic_media_url) && supabase && (
                message.media_type?.startsWith("video/") ? (
                  <video
                    className="chat-shared-video"
                    src={message.optimistic_media_url || supabase.storage.from("chat-media").getPublicUrl(message.media_path).data.publicUrl}
                    onLoadedMetadata={() => scrollToBottom()}
                    controls
                    preload="metadata"
                    playsInline
                  />
                ) : (
                  <a
                    className="chat-shared-image-link"
                    href={message.optimistic_media_url || supabase.storage.from("chat-media").getPublicUrl(message.media_path).data.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      className="chat-shared-image"
                      src={message.optimistic_media_url || supabase.storage.from("chat-media").getPublicUrl(message.media_path).data.publicUrl}
                      onLoad={() => scrollToBottom()}
                      alt="Image shared in chat"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                )
              )}
              {message.pending && <span className="chat-message-pending" role="status">Sending…</span>}
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
                    <ProjectThumbnail
                      project={project}
                      className="chat-project-thumb"
                      fallbackClassName="chat-project-thumb chat-project-thumb-empty"
                    />
                    <span className="chat-project-copy">
                      <span className="chat-project-title">{project.title}</span>
                      <span className="chat-project-author">
                        {project.authorAvatar
                          ? <img src={project.authorAvatar} alt="" loading="lazy" decoding="async" />
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
        )) : <div className="chat-empty"><strong>No chat here</strong><span>Be the first to say hello to the community.</span></div>}
      </div>

      {user ? (
        <form className="chat-composer" onSubmit={sendMessage}>
          <input
            ref={fileInputRef}
            className="chat-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            onChange={chooseAttachment}
            aria-label="Choose an image or video"
          />
          <button
            className="chat-tool-button"
            type="button"
            aria-label="Choose emoji"
            aria-expanded={isEmojiPickerOpen}
            onClick={() => setIsEmojiPickerOpen((open) => !open)}
          >🙂</button>
          <button className="chat-tool-button" type="button" aria-label="Attach an image or video" onClick={() => fileInputRef.current?.click()}>＋</button>
          {isEmojiPickerOpen && (
            <div className="chat-emoji-picker" aria-label="Choose an emoji">
              {EMOJI_GROUPS.map((group) => (
                <section className="chat-emoji-group" key={group.label}>
                  <h2>{group.label}</h2>
                  <div className="chat-emoji-grid">
                    {group.items.map((emoji, index) => (
                      <button
                        type="button"
                        key={`${group.label}-${index}`}
                        aria-label={`Insert ${emoji}`}
                        onClick={() => {
                          setDraft((current) => current.length + emoji.length <= 1000 ? `${current}${emoji}` : current);
                          setIsEmojiPickerOpen(false);
                        }}
                      >{emoji}</button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          {attachment && (
            <div className="chat-attachment-preview">
              {attachment.file.type.startsWith("video/")
                ? <video src={attachment.previewUrl} muted playsInline />
                : <img src={attachment.previewUrl} alt="Attachment preview" />}
              <span>{attachment.file.name}</span>
              <button type="button" aria-label="Remove attachment" onClick={() => setAttachment(null)}>×</button>
            </div>
          )}
          <label className="visually-hidden" htmlFor="chat-message">Write a message</label>
          <input
            id="chat-message"
            maxLength={1000}
            placeholder="Write a message..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <span className="chat-character-count">{draft.length}/1000</span>
          <button type="submit" disabled={(!draft.trim() && !attachment) || isSending}>{isSending ? "Sending…" : "Send"}</button>
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

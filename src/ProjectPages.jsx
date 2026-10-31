import { useEffect, useMemo, useState } from "react";
import "./ProjectPages.css";
import { apiRequest } from "./api.js";
import { supabase } from "./supabase.js";
import { validateScratchProjectFile } from "./scratchProjectFile.js";
import { projectShareUrl } from "./projectLinks.js";
import ProjectThumbnail from "./ProjectThumbnail.jsx";

const EMOJI_GROUPS = [
  { name: "Smileys", emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋", "😎", "🤩", "🥳", "😏", "😢", "😭", "😡", "🤔", "🤯", "🥺", "😴", "🤗", "🤭", "🫡", "🫠"] },
  { name: "People", emojis: ["👋", "🤚", "✋", "🖐️", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "👍", "👎", "✊", "👏", "🙌", "👐", "🤝", "🙏", "💪", "🦾", "🧠", "👀", "👻", "🤖", "💩", "🎅"] },
  { name: "Animals", emojis: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦄", "🐝", "🦋", "🐢", "🐬", "🐳", "🦖", "🐉", "🌵", "🌲", "🌸", "🌈", "☀️", "⭐"] },
  { name: "Food", emojis: ["🍎", "🍊", "🍋", "🍉", "🍇", "🍓", "🫐", "🍒", "🍑", "🥭", "🍍", "🥑", "🍕", "🍔", "🍟", "🌭", "🍿", "🍩", "🍪", "🎂", "🍰", "🍫", "🍭", "☕", "🧋", "🍵", "🥤", "🍜", "🍣", "🌮", "🍦", "🧁"] },
  { name: "Activities", emojis: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🎱", "🏓", "🏸", "🥊", "🎮", "🕹️", "🎲", "🧩", "🎨", "🎭", "🎤", "🎧", "🎵", "🎹", "🥁", "🎸", "🚀", "🏆", "🥇", "🎯", "🎉", "🎊", "🎁", "🎈", "🎃", "🪄"] },
  { name: "Symbols", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞", "💖", "💘", "💝", "💯", "💥", "💫", "💦", "💤", "🔥", "✨", "✅", "❌", "❓", "❗", "💬", "💭", "🔔", "🔒", "♻️", "♾️"] }
];

const EMPTY_INTERACTION = { liked: false, favorited: false, comments: [] };

const normalizeSearchText = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/#/g, "")
  .toLocaleLowerCase();

export default function ProjectPages({
  view,
  projects,
  selectedProject,
  searchQuery,
  onSearchQueryChange,
  onOpenProject,
  onBack,
  interaction,
  onInteractionChange,
  user,
  onSignIn,
  onOpenUserProfile,
  onProjectDeleted,
  onProjectUpdated
}) {
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("popular");
  const [commentDraft, setCommentDraft] = useState("");
  const [emojiGroup, setEmojiGroup] = useState(EMOJI_GROUPS[0].name);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isInteractionPending, setIsInteractionPending] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [replacementFile, setReplacementFile] = useState(null);
  const [replacementThumbnail, setReplacementThumbnail] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [editDraft, setEditDraft] = useState({ title: "", description: "", category: "", tags: "", isPublic: true });

  useEffect(() => {
    if (!replacementThumbnail) {
      setThumbnailPreview(selectedProject?.thumb ?? "");
      return undefined;
    }
    const previewUrl = URL.createObjectURL(replacementThumbnail);
    setThumbnailPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [replacementThumbnail, selectedProject?.thumb]);

  const filteredProjects = useMemo(() => {
    const searchTerms = normalizeSearchText(searchQuery).split(/\s+/).filter(Boolean);
    const results = projects.filter((project) => {
      const tags = Array.isArray(project.tags) ? project.tags : [];
      const searchableContent = normalizeSearchText([
        project.title,
        project.author,
        project.category,
        project.description,
        project.id,
        ...tags,
        ...tags.map((tag) => `#${tag}`)
      ].join(" "));
      const matchesSearch = searchTerms.every((term) => searchableContent.includes(term));
      const matchesCategory = category === "All" || project.category === category;
      return matchesSearch && matchesCategory;
    });
    return [...results].sort((first, second) => (
      sort === "title"
        ? first.title.localeCompare(second.title)
        : second.views - first.views
    ));
  }, [category, projects, searchQuery, sort]);
  const categories = ["All", ...new Set(projects.map((project) => project.category))];

  if (view === "project" && selectedProject) {
    const currentInteraction = interaction ?? EMPTY_INTERACTION;

    const submitComment = async (event) => {
      event.preventDefault();
      if (!user) {
        onSignIn?.();
        return;
      }
      if (isInteractionPending) return;
      const text = commentDraft.trim();
      if (!text) return;
      setIsInteractionPending(true);
      try {
        const saved = await onInteractionChange("comment", { text });
        if (saved) setCommentDraft("");
      } finally {
        setIsInteractionPending(false);
      }
    };

    const handleLike = async () => {
      if (isInteractionPending) return;
      setIsInteractionPending(true);
      try {
        await onInteractionChange("like", { enabled: !currentInteraction.liked });
      } finally {
        setIsInteractionPending(false);
      }
    };

    const handleFavorite = async () => {
      if (isInteractionPending) return;
      setIsInteractionPending(true);
      try {
        await onInteractionChange("favorite", { enabled: !currentInteraction.favorited });
      } finally {
        setIsInteractionPending(false);
      }
    };

    const copyProjectLink = async () => {
      const shareUrl = projectShareUrl(selectedProject.databaseId);
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus("Link copied");
      } catch {
        window.prompt("Copy this project link:", shareUrl);
      }
    };

    const handleDelete = async () => {
      if (isInteractionPending) return;
      if (!confirm(`Delete "${selectedProject.title}"? This cannot be undone.`)) return;
      setIsInteractionPending(true);
      try {
        await apiRequest(`/api/projects/${selectedProject.databaseId}`, {
          method: "DELETE",
          authenticated: true
        });
        await onProjectDeleted?.();
      } catch (error) {
        alert(error.message);
      } finally {
        setIsInteractionPending(false);
      }
    };

    const openEdit = () => {
      setEditDraft({
        title: selectedProject.title,
        description: selectedProject.description ?? "",
        category: selectedProject.category,
        tags: (selectedProject.tags ?? []).join(", "),
        isPublic: selectedProject.isPublic ?? true
      });
      setEditError("");
      setReplacementFile(null);
      setReplacementThumbnail(null);
      setIsEditOpen(true);
    };

    const saveProject = async (event) => {
      event.preventDefault();
      if (isSavingEdit) return;
      setIsSavingEdit(true);
      setEditError("");
      let uploadedPath;
      let uploadedThumbnailPath;
      try {
        if (replacementFile) {
          if (!supabase || !user?.id) throw new Error("Sign in to replace this project file.");
          await validateScratchProjectFile(replacementFile);
          uploadedPath = `${user.id}/${crypto.randomUUID()}.sb3`;
          const { error: uploadError } = await supabase.storage
            .from("project-files")
            .upload(uploadedPath, replacementFile, {
              contentType: "application/octet-stream",
              upsert: false
            });
          if (uploadError) throw uploadError;
        }
        if (replacementThumbnail) {
          if (!supabase || !user?.id) throw new Error("Sign in to update this thumbnail.");
          if (!replacementThumbnail.type.startsWith("image/")) throw new Error("Choose an image for the project thumbnail.");
          if (replacementThumbnail.size > 5 * 1024 * 1024) throw new Error("Project thumbnails must be 5 MB or smaller.");
          const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[replacementThumbnail.type];
          if (!extension) throw new Error("Use a PNG, JPEG, WebP, or GIF thumbnail.");
          uploadedThumbnailPath = `${user.id}/project-thumbnails/${crypto.randomUUID()}.${extension}`;
          const { error: thumbnailUploadError } = await supabase.storage
            .from("project-files")
            .upload(uploadedThumbnailPath, replacementThumbnail, {
              contentType: replacementThumbnail.type,
              cacheControl: "31536000",
              upsert: false
            });
          if (thumbnailUploadError) throw thumbnailUploadError;
        }
        const { project } = await apiRequest(`/api/projects/${selectedProject.databaseId}`, {
          method: "PATCH",
          authenticated: true,
          body: {
            title: editDraft.title,
            description: editDraft.description,
            category: editDraft.category,
            tags: editDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
            isPublic: editDraft.isPublic,
            ...(uploadedPath ? { assetPath: uploadedPath } : {}),
            ...(uploadedThumbnailPath ? { thumbnailPath: uploadedThumbnailPath } : {})
          }
        });
        uploadedPath = null;
        uploadedThumbnailPath = null;
        setIsEditOpen(false);
        await onProjectUpdated?.(project);
      } catch (error) {
        if ((uploadedPath || uploadedThumbnailPath) && supabase) {
          let latest = null;
          let latestWasVerified = false;
          try {
            ({ project: latest } = await apiRequest(`/api/projects/${selectedProject.databaseId}`, { authenticated: true }));
            latestWasVerified = true;
          } catch (verificationError) {
            console.error("Unable to verify whether the replacement file is in use.", verificationError);
          }
          const pathsToRemove = latestWasVerified ? [
            uploadedPath && latest.asset_path !== uploadedPath ? uploadedPath : null,
            uploadedThumbnailPath && latest.thumbnail_url !== uploadedThumbnailPath ? uploadedThumbnailPath : null
          ].filter(Boolean) : [];
          if (pathsToRemove.length) {
            const { error: cleanupError } = await supabase.storage.from("project-files").remove(pathsToRemove);
            if (cleanupError) console.error("Unable to clean up the unused replacement file.", cleanupError);
          }
        }
        setEditError(error.message);
      } finally {
        setIsSavingEdit(false);
      }
    };

    return (
      <section className="project-detail-page">
        <button className="project-back-btn" type="button" onClick={onBack}>← Back to projects</button>
        <div className="project-detail-layout">
          <div className="project-detail-main">
            <div className="project-player">
              {selectedProject.projectUrl
                ? (
                  <iframe
                    title={`${selectedProject.title} interactive project`}
                    src={`https://aftercode-web-wheat.vercel.app/embed.html?project_url=${encodeURIComponent(selectedProject.projectUrl)}&project_title=${encodeURIComponent(selectedProject.title)}`}
                    allowFullScreen
                    loading="lazy"
                  />
                )
                : (
                  <iframe
                    title={`${selectedProject.title} interactive project`}
                    src={`https://aftercode-web-wheat.vercel.app/embed.html?project_url=${encodeURIComponent(selectedProject.projectUrl)}&project_title=${encodeURIComponent(selectedProject.title)}`}
                    allowFullScreen
                    loading="lazy"
                  />
                )}
            </div>
            <section className="project-detail-card">
              <div className="project-detail-heading">
                <div>
                  <span className="project-category">{selectedProject.category}</span>
                  <h1>{selectedProject.title}</h1>
                  <p>
                    Created by{" "}
                    <button
                      type="button"
                      className="project-author-link"
                      onClick={() => onOpenUserProfile?.(selectedProject.userId)}
                    >
                      {selectedProject.author}
                    </button>
                  </p>
                  {user?.id === selectedProject.userId && (
                    <button
                      className="project-action"
                      type="button"
                      disabled={isInteractionPending || isSavingEdit}
                      onClick={openEdit}
                    >
                      Edit project
                    </button>
                  )}
                  {user?.id === selectedProject.userId && (
                    <button
                      className="project-action project-delete-action"
                      type="button"
                      disabled={isInteractionPending}
                      onClick={handleDelete}
                    >
                      🗑️ Delete
                    </button>
                  )}
                </div>
                <div className="project-action-group">
                  <button
                    className={`project-action${currentInteraction.liked ? " is-active" : ""}`}
                    type="button"
                    aria-pressed={currentInteraction.liked}
                    disabled={isInteractionPending}
                    onClick={handleLike}
                  >
                    ❤️ {currentInteraction.liked ? "Loved" : "Love"} <span>{currentInteraction.likes ?? selectedProject.likes ?? 0}</span>
                  </button>
                  <button
                    className={`project-action${currentInteraction.favorited ? " is-active" : ""}`}
                    type="button"
                    aria-pressed={currentInteraction.favorited}
                    disabled={isInteractionPending}
                    onClick={handleFavorite}
                  >
                    ⭐ {currentInteraction.favorited ? "Saved" : "Favorite"} <span>{currentInteraction.favorites ?? 0}</span>
                  </button>
                </div>
              </div>
              <p className="project-description">{selectedProject.description}</p>
              <div className="project-tags">
                {selectedProject.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
              <button className="project-share-button" type="button" onClick={copyProjectLink}>
                Share project link
              </button>
              {shareStatus && <span className="project-share-status" role="status">{shareStatus}</span>}
            </section>

            <section className="project-detail-card project-comments">
              <h2>Comments <span>{currentInteraction.comments.length}</span></h2>
              <form className="project-comment-form" onSubmit={submitComment}>
                <div className="comment-input-wrap">
                  <textarea
                    aria-label="Write a comment"
                    placeholder={user ? "Share your thoughts..." : "Sign in to join the conversation..."}
                    value={commentDraft}
                    maxLength={500}
                    disabled={!user}
                    onChange={(event) => setCommentDraft(event.target.value)}
                  />
                  <button
                    className="emoji-picker-toggle"
                    type="button"
                    aria-label="Choose an emoji"
                    aria-expanded={isEmojiPickerOpen}
                    disabled={!user}
                    onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                  >
                    😀
                  </button>
                </div>
                {isEmojiPickerOpen && (
                  <div className="emoji-picker" aria-label="Emoji picker">
                    <div className="emoji-groups" role="tablist" aria-label="Emoji categories">
                      {EMOJI_GROUPS.map((group) => (
                        <button
                          key={group.name}
                          type="button"
                          role="tab"
                          aria-selected={emojiGroup === group.name}
                          onClick={() => setEmojiGroup(group.name)}
                        >
                          {group.name}
                        </button>
                      ))}
                    </div>
                    <div className="emoji-grid">
                      {EMOJI_GROUPS.find((group) => group.name === emojiGroup).emojis.map((emoji, index) => (
                        <button
                          key={`${emoji}-${index}`}
                          type="button"
                          aria-label={`Insert ${emoji}`}
                          onClick={() => setCommentDraft((current) => `${current}${emoji}`)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <p>Type any emoji directly using your device’s emoji keyboard.</p>
                  </div>
                )}
                <button
                  className="signin-btn"
                  type="submit"
                  disabled={Boolean(user) && (!commentDraft.trim() || isInteractionPending)}
                >
                  {!user ? "Sign in to comment" : isInteractionPending ? "Posting..." : "Post Comment"}
                </button>
              </form>
              <div className="project-comment-list">
                {currentInteraction.comments.map((comment) => (
                  <article className={`project-comment${comment.pending ? " is-pending" : ""}`} key={comment.id}>
                    <button
                      type="button"
                      className="project-comment-avatar-btn"
                      aria-label={`View ${comment.author}'s profile`}
                      disabled={!comment.userId}
                      onClick={() => comment.userId && onOpenUserProfile?.(comment.userId)}
                    >
                      {comment.avatarUrl
                        ? <img className="project-comment-avatar" src={comment.avatarUrl} alt="" loading="lazy" decoding="async" />
                        : <div className="avatar">{comment.author.slice(0, 1)}</div>}
                    </button>
                    <div>
                      <button
                        type="button"
                        className="project-author-link"
                        disabled={!comment.userId}
                        onClick={() => comment.userId && onOpenUserProfile?.(comment.userId)}
                      >
                        <strong>{comment.author}</strong>
                      </button>
                      <p>{comment.text}</p>
                    </div>
                  </article>
                ))}
                {currentInteraction.comments.length === 0 && <p className="project-empty-comments">Be the first to comment.</p>}
              </div>
            </section>
          </div>
          <aside className="project-detail-aside">
            <h2>Project info</h2>
            <dl>
              <div><dt>Views</dt><dd>{selectedProject.views.toLocaleString()}</dd></div>
              <div><dt>Category</dt><dd>{selectedProject.category}</dd></div>
              <div><dt>Creator</dt><dd>{selectedProject.author}</dd></div>
            </dl>
          </aside>
        </div>
        {isEditOpen && (
          <div
            className="project-edit-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isSavingEdit) setIsEditOpen(false);
            }}
          >
            <form className="project-edit-dialog" onSubmit={saveProject} aria-labelledby="project-edit-title">
              <div className="project-edit-heading">
                <div>
                  <span className="welcome-eyebrow">PROJECT SETTINGS</span>
                  <h2 id="project-edit-title">Edit project</h2>
                </div>
                <button className="project-edit-close" type="button" aria-label="Close" disabled={isSavingEdit} onClick={() => setIsEditOpen(false)}>×</button>
              </div>
              <label>
                Title
                <input required maxLength={120} value={editDraft.title} onChange={(event) => setEditDraft((draft) => ({ ...draft, title: event.target.value }))} />
              </label>
              <label>
                Description
                <textarea rows={4} maxLength={2000} value={editDraft.description} onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))} />
              </label>
              <label>
                Category
                <input required maxLength={60} value={editDraft.category} onChange={(event) => setEditDraft((draft) => ({ ...draft, category: event.target.value }))} />
              </label>
              <label>
                Tags <span className="project-edit-hint">Separate with commas, up to 10</span>
                <input maxLength={320} value={editDraft.tags} onChange={(event) => setEditDraft((draft) => ({ ...draft, tags: event.target.value }))} />
              </label>
              <label>
                Project thumbnail <span className="project-edit-hint">PNG, JPEG, WebP, or GIF; max 5 MB</span>
                {thumbnailPreview && (
                  <span className="project-edit-thumbnail-preview">
                    <img src={thumbnailPreview} alt="Project thumbnail preview" />
                    <span>{replacementThumbnail ? "New thumbnail preview" : "Current thumbnail"}</span>
                  </span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    if (file && file.size > 5 * 1024 * 1024) {
                      setEditError("Project thumbnails must be 5 MB or smaller.");
                      event.currentTarget.value = "";
                      return;
                    }
                    setReplacementThumbnail(file);
                    setEditError("");
                  }}
                />
                {replacementThumbnail && <span className="project-edit-hint">Selected: {replacementThumbnail.name}</span>}
              </label>
              <label>
                Replace Scratch project file (.sb3) <span className="project-edit-hint">Optional, max 50 MB</span>
                <input
                  type="file"
                  accept=".sb3,application/octet-stream"
                  onChange={(event) => {
                    setReplacementFile(event.currentTarget.files?.[0] ?? null);
                    setEditError("");
                  }}
                />
                {replacementFile && <span className="project-edit-hint">Selected: {replacementFile.name}</span>}
              </label>
              <label className="project-edit-visibility">
                <input type="checkbox" checked={editDraft.isPublic} onChange={(event) => setEditDraft((draft) => ({ ...draft, isPublic: event.target.checked }))} />
                Public project
              </label>
              {editError && <p className="project-edit-error" role="alert">{editError}</p>}
              <div className="project-edit-actions">
                <button className="project-action" type="button" disabled={isSavingEdit} onClick={() => setIsEditOpen(false)}>Cancel</button>
                <button className="signin-btn" type="submit" disabled={isSavingEdit}>{isSavingEdit ? "Saving…" : "Save changes"}</button>
              </div>
            </form>
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="explore-page">
      <div className="explore-heading">
        <div>
          <span className="welcome-eyebrow">FIND YOUR NEXT FAVORITE</span>
          <h1>Explore Projects</h1>
          <p>Discover games, art, animations, and experiments from the community.</p>
        </div>
        <label className="explore-search">
          <span>Search all project content</span>
          <input
            className="search-input"
            type="search"
            placeholder="Search titles, descriptions, creators, #tags..."
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </label>
      </div>
      <div className="explore-controls">
        <label>
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Sort by
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="popular">Most viewed</option>
            <option value="title">Title A–Z</option>
          </select>
        </label>
        <span className="explore-result-count">{filteredProjects.length} projects</span>
      </div>
      {filteredProjects.length > 0 ? (
        <div className="featured-grid explore-grid">
          {filteredProjects.map((project, index) => (
            <button
              className="featured-card explore-project-card"
              key={project.id}
              type="button"
              style={{ "--delay": index + 1 }}
              onClick={() => onOpenProject(project)}
            >
              <span className="featured-thumb-wrapper">
                <ProjectThumbnail
                  project={project}
                  loading={index < 4 ? "eager" : "lazy"}
                  fetchPriority={index < 4 ? "high" : "low"}
                />
                <span className="featured-badge">{project.category}</span>
              </span>
              <span className="featured-info">
                <strong>{project.title}</strong>
                <span className="project-sequence">Project #{index + 1}</span>
                <span>by {project.author} · {project.views.toLocaleString()} views</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="explore-empty">No projects match your filters. Try a different search or category.</p>
      )}
    </section>
  );
}

import { useMemo, useState } from "react";
import "./ProjectPages.css";
import { apiRequest } from "./api.js";

const EMOJI_GROUPS = [
  { name: "Smileys", emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😍", "🥰", "😘", "😋", "😎", "🤩", "🥳", "😏", "😢", "😭", "😡", "🤔", "🤯", "🥺", "😴", "🤗", "🤭", "🫡", "🫠"] },
  { name: "People", emojis: ["👋", "🤚", "✋", "🖐️", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "👍", "👎", "✊", "👏", "🙌", "👐", "🤝", "🙏", "💪", "🦾", "🧠", "👀", "👻", "🤖", "💩", "🎅"] },
  { name: "Animals", emojis: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦄", "🐝", "🦋", "🐢", "🐬", "🐳", "🦖", "🐉", "🌵", "🌲", "🌸", "🌈", "☀️", "⭐"] },
  { name: "Food", emojis: ["🍎", "🍊", "🍋", "🍉", "🍇", "🍓", "🫐", "🍒", "🍑", "🥭", "🍍", "🥑", "🍕", "🍔", "🍟", "🌭", "🍿", "🍩", "🍪", "🎂", "🍰", "🍫", "🍭", "☕", "🧋", "🍵", "🥤", "🍜", "🍣", "🌮", "🍦", "🧁"] },
  { name: "Activities", emojis: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🎱", "🏓", "🏸", "🥊", "🎮", "🕹️", "🎲", "🧩", "🎨", "🎭", "🎤", "🎧", "🎵", "🎹", "🥁", "🎸", "🚀", "🏆", "🥇", "🎯", "🎉", "🎊", "🎁", "🎈", "🎃", "🪄"] },
  { name: "Symbols", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "❣️", "💕", "💞", "💖", "💘", "💝", "💯", "💥", "💫", "💦", "💤", "🔥", "✨", "✅", "❌", "❓", "❗", "💬", "💭", "🔔", "🔒", "♻️", "♾️"] }
];

const EMPTY_INTERACTION = { liked: false, favorited: false, comments: [] };

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
  onOpenUserProfile,
  onProjectDeleted
}) {
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("popular");
  const [commentDraft, setCommentDraft] = useState("");
  const [emojiGroup, setEmojiGroup] = useState(EMOJI_GROUPS[0].name);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isInteractionPending, setIsInteractionPending] = useState(false);

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const results = projects.filter((project) => {
      const matchesSearch = !normalizedSearch
        || `${project.title} ${project.author} ${project.category} ${project.description} ${project.tags.join(" ")}`.toLowerCase().includes(normalizedSearch);
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
                    ⭐ {currentInteraction.favorited ? "Saved" : "Favorite"}
                  </button>
                </div>
              </div>
              <p className="project-description">{selectedProject.description}</p>
              <div className="project-tags">
                {selectedProject.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
              {selectedProject.projectUrl && (
                <a className="project-download-link" href={selectedProject.projectUrl} download={`${selectedProject.title}.sb3`}>
                  Download .sb3
                </a>
              )}
            </section>

            <section className="project-detail-card project-comments">
              <h2>Comments <span>{currentInteraction.comments.length}</span></h2>
              <form className="project-comment-form" onSubmit={submitComment}>
                <div className="comment-input-wrap">
                  <textarea
                    aria-label="Write a comment"
                    placeholder="Share your thoughts..."
                    value={commentDraft}
                    maxLength={500}
                    onChange={(event) => setCommentDraft(event.target.value)}
                  />
                  <button
                    className="emoji-picker-toggle"
                    type="button"
                    aria-label="Choose an emoji"
                    aria-expanded={isEmojiPickerOpen}
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
                  disabled={!commentDraft.trim() || isInteractionPending}
                >
                  {isInteractionPending ? "Posting..." : "Post Comment"}
                </button>
              </form>
              <div className="project-comment-list">
                {currentInteraction.comments.map((comment) => (
                  <article className="project-comment" key={comment.id}>
                    <button
                      type="button"
                      className="project-comment-avatar-btn"
                      onClick={() => comment.userId && onOpenUserProfile?.(comment.userId)}
                    >
                      {comment.avatarUrl
                        ? <img className="project-comment-avatar" src={comment.avatarUrl} alt="" />
                        : <div className="avatar">{comment.author.slice(0, 1)}</div>}
                    </button>
                    <div>
                      <button
                        type="button"
                        className="project-author-link"
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
            <h2>About this project</h2>
            <p>{selectedProject.description}</p>
            <dl>
              <div><dt>Views</dt><dd>{selectedProject.views.toLocaleString()}</dd></div>
              <div><dt>Category</dt><dd>{selectedProject.category}</dd></div>
              <div><dt>Creator</dt><dd>{selectedProject.author}</dd></div>
            </dl>
            <a href={`https://scratch.mit.edu/projects/${selectedProject.id}/`} target="_blank" rel="noreferrer">
              Open on Scratch ↗
            </a>
          </aside>
        </div>
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
          <span>Search projects</span>
          <input
            className="search-input"
            type="search"
            placeholder="Search by title, creator, or tag..."
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
                {project.thumb
                  ? <img src={project.thumb} alt="" className="featured-thumb" />
                  : <span className="sb3-thumbnail" aria-label="Scratch project file">SB3</span>}
                <span className="featured-badge">{project.category}</span>
              </span>
              <span className="featured-info">
                <strong>{project.title}</strong>
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
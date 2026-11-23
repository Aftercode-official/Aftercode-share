import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getCachedProfileStats, getCachedPublicProfile, loadPublicProfile, apiFollow, cacheProfileStats, loadFollowList } from "./userStorage.js";
import { supabase } from "./supabase.js";
import { apiRequest } from "./api.js";
import { getShopAvatarFrameClass, isDragonAvatarFrame } from "./avatarFrames.js";
import BearAvatarFrame from "./assets/bear-avatar-frame.png";
import ProjectThumbnail from "./ProjectThumbnail.jsx";
import "./User.css";

function toPublicProject(record) {
  return {
    id: record.id,
    databaseId: record.id,
    projectNumber: record.project_number ?? null,
    userId: record.user_id,
    scratchProjectId: record.scratch_project_id,
    title: record.title,
    author: record.author,
    category: record.category,
    description: record.description,
    tags: record.tags,
    thumb: record.thumbnail_url
      ? (record.thumbnail_url.startsWith("http")
        ? record.thumbnail_url
        : supabase?.storage.from("project-files").getPublicUrl(record.thumbnail_url).data.publicUrl ?? null)
      : (record.scratch_project_id
        ? `https://uploads.scratch.mit.edu/get_image/project/${record.scratch_project_id}_480x360.png`
        : null),
    views: record.view_count ?? record.views ?? 0
  };
}

export default function User({
  page,
  user,
  customization,
  decorations = [],
  ownedDecorationIds = [],
  hasRawFleshFrame = false,
  customizationError,
  isCustomizeOpen,
  onOpenCustomizer,
  onCloseCustomizer,
  onSaveCustomization,
  compatibilityMode,
  onCompatibilityModeChange,
  projects,
  onProjectOpen,
  selectedUserId,
  onOpenUserProfile,
  peopleListRoute,
  onPeopleListNavigate,
  onPublicProfileLoaded,
  onSignIn
}) {
  const [draft, setDraft] = useState(() => ({ ...customization }));
  const [profileTab, setProfileTab] = useState("all");
  const [uploadError, setUploadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const profileCacheUserId = page === "user" ? selectedUserId : page === "profile" ? user?.id : null;
  const viewedProfileId = page === "user" ? selectedUserId : page === "profile" ? user?.id : null;
  const [initialCachedProfile] = useState(() => profileCacheUserId ? getCachedPublicProfile(profileCacheUserId) : null);
  const [initialCachedStats] = useState(() => getCachedProfileStats(profileCacheUserId));
  const [publicProfile, setPublicProfile] = useState(() => initialCachedProfile?.profile ?? null);
  const [publicProjects, setPublicProjects] = useState(() => (initialCachedProfile?.projects ?? []).map(toPublicProject));
  const [publicFavoriteProjects, setPublicFavoriteProjects] = useState(() => (initialCachedProfile?.favoriteProjects ?? []).map(toPublicProject));
  const [ownFavoriteProjects, setOwnFavoriteProjects] = useState(() => (initialCachedProfile?.favoriteProjects ?? []).map(toPublicProject));
  const [publicProfileError, setPublicProfileError] = useState("");
  const [followersCount, setFollowersCount] = useState(initialCachedProfile?.followersCount ?? initialCachedStats?.followersCount ?? 0);
  const [followingCount, setFollowingCount] = useState(initialCachedProfile?.followingCount ?? initialCachedStats?.followingCount ?? 0);
  const [favoritesCount, setFavoritesCount] = useState(initialCachedProfile?.favoritesCount ?? initialCachedStats?.favoritesCount ?? initialCachedProfile?.favoriteProjects?.length ?? 0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [profileComments, setProfileComments] = useState([]);
  const [profileCommentDraft, setProfileCommentDraft] = useState("");
  const [replyingToProfileCommentId, setReplyingToProfileCommentId] = useState("");
  const [expandedProfileReplyIds, setExpandedProfileReplyIds] = useState(() => new Set());
  const [profileReplyDraft, setProfileReplyDraft] = useState("");
  const [profileCommentError, setProfileCommentError] = useState("");
  const [isPostingProfileComment, setIsPostingProfileComment] = useState(false);
  const [peopleModal, setPeopleModal] = useState(null);
  const [peopleList, setPeopleList] = useState([]);
  const [peopleError, setPeopleError] = useState("");
  const [isPeopleLoading, setIsPeopleLoading] = useState(false);
  const ownedDecorations = decorations.filter((item) => ownedDecorationIds.includes(item.id));
  const avatarFrameImage = (frameId) => frameId === "bear"
    ? BearAvatarFrame
    : decorations.find((item) => item.id === frameId)?.imageUrl || "";

  useEffect(() => {
    if (isCustomizeOpen) setDraft({ ...customization });
  }, [isCustomizeOpen, customization]);

  // Load profile khi xem trang người khác
  useEffect(() => {
    if (!viewedProfileId) {
      setPublicProfile(null);
      setPublicProjects([]);
      setPublicFavoriteProjects([]);
      setPublicProfileError("");
      return;
    }
    let isActive = true;
    const cached = getCachedPublicProfile(selectedUserId);
    if (cached) {
      setPublicProfile(cached.profile);
      setPublicProjects((cached.projects ?? []).map(toPublicProject));
      setPublicFavoriteProjects((cached.favoriteProjects ?? []).map(toPublicProject));
      setFollowersCount(cached.followersCount ?? initialCachedStats?.followersCount ?? 0);
      setFollowingCount(cached.followingCount ?? initialCachedStats?.followingCount ?? 0);
      setFavoritesCount(cached.favoritesCount ?? initialCachedStats?.favoritesCount ?? cached.favoriteProjects?.length ?? 0);
    }
    loadPublicProfile(selectedUserId, { authenticated: Boolean(user) })
      .then((result) => {
        if (!isActive) return;
        const { profile, projects: records } = result;
        setPublicProfile(profile);
        setPublicProjects(records.map(toPublicProject));
        setPublicFavoriteProjects((result.favoriteProjects ?? []).map(toPublicProject));
        setFollowersCount(result.followersCount ?? 0);
        setFollowingCount(result.followingCount ?? 0);
        setFavoritesCount(result.favoritesCount ?? result.favoriteProjects?.length ?? 0);
        setIsFollowing(Boolean(result.isFollowing));
        setPublicProfileError("");
      })
      .catch((error) => {
        if (isActive) setPublicProfileError(error.message);
      });
    return () => { isActive = false; };
  }, [page, selectedUserId, user?.id, initialCachedStats]);

  useEffect(() => {
    if (!viewedProfileId) {
      setProfileComments([]);
      setProfileCommentDraft("");
      setProfileCommentError("");
      return undefined;
    }
    let isActive = true;
    let isLoading = false;
    setProfileComments([]);
    setProfileCommentError("");
    const loadComments = async () => {
      if (!isActive || isLoading || document.visibilityState === "hidden") return;
      isLoading = true;
      try {
        const { comments: records } = await apiRequest(
          `/api/profile-comments?profileId=${encodeURIComponent(viewedProfileId)}`,
          { dedupe: false, cache: "no-store" }
        );
        if (isActive) {
          setProfileComments(records ?? []);
          setProfileCommentError("");
        }
      } catch (error) {
        if (isActive) setProfileCommentError(error.message);
      } finally {
        isLoading = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadComments();
    };
    loadComments();
    const timer = window.setInterval(loadComments, 5000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      isActive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [viewedProfileId]);

  useEffect(() => {
    if (page !== "profile" || !user?.id) {
      setOwnFavoriteProjects([]);
      return undefined;
    }
    let isActive = true;
    loadPublicProfile(user.id, { authenticated: true })
      .then((result) => {
        if (!isActive) return;
        setOwnFavoriteProjects((result.favoriteProjects ?? []).map(toPublicProject));
        setFollowersCount(result.followersCount ?? 0);
        setFollowingCount(result.followingCount ?? 0);
        setFavoritesCount(result.favoritesCount ?? result.favoriteProjects?.length ?? 0);
      })
      .catch(() => {
        if (isActive) setOwnFavoriteProjects([]);
      });
    return () => { isActive = false; };
  }, [page, user?.id]);

  useEffect(() => {
    if (page === "user" && publicProfile?.username) {
      onPublicProfileLoaded?.(publicProfile.username);
    }
  }, [page, publicProfile?.username]);

  useEffect(() => {
    if (!peopleListRoute) {
      setPeopleModal(null);
      return;
    }
    const targetId = selectedUserId ?? user?.id;
    if (!targetId) return;
    let isActive = true;
    setPeopleModal(peopleListRoute);
    setPeopleList([]);
    setPeopleError("");
    setIsPeopleLoading(true);
    loadFollowList(targetId, peopleListRoute)
      .then(({ users: records }) => {
        if (isActive) setPeopleList(records ?? []);
      })
      .catch((error) => {
        if (isActive) setPeopleError(error.message);
      })
      .finally(() => {
        if (isActive) setIsPeopleLoading(false);
      });
    return () => { isActive = false; };
  }, [peopleListRoute, selectedUserId, user?.id]);

  // Load follow state + count cho profile người khác
  // Load follow count cho profile của chính mình
  const openPeopleModal = (list, userId) => {
    const targetId = userId ?? selectedUserId ?? user?.id;
    if (!targetId) return;
    setPeopleModal(list);
    onPeopleListNavigate?.(list);
  };

  const openPersonProfile = (personUserId) => {
    if (!personUserId) return;
    setPeopleModal(null);
    const person = peopleList.find((entry) => entry.user_id === personUserId);
    onOpenUserProfile?.(personUserId, person?.username);
  };

  const closePeopleModal = () => {
    setPeopleModal(null);
    onPeopleListNavigate?.(null);
  };

  const toggleFollow = async () => {
    if (!user || !selectedUserId || isFollowPending) return;
    const nextFollowing = !isFollowing;
    const prevFollowing = isFollowing;
    const prevCount = followersCount;

    setIsFollowing(nextFollowing);
    setFollowersCount((count) => Math.max(0, count + (nextFollowing ? 1 : -1)));
    setIsFollowPending(true);

    try {
      const result = await apiFollow(selectedUserId, nextFollowing);
      setIsFollowing(result.isFollowing);
      setFollowersCount(result.followersCount);
      cacheProfileStats(selectedUserId, { followersCount: result.followersCount });
      const ownStats = getCachedProfileStats(user.id);
      cacheProfileStats(user.id, { followingCount: Math.max(0, (ownStats?.followingCount ?? 0) + (nextFollowing ? 1 : -1)) });
    } catch (error) {
      setIsFollowing(prevFollowing);
      setFollowersCount(prevCount);
      setPublicProfileError(error.message);
    } finally {
      setIsFollowPending(false);
    }
  };

  const postProfileComment = async (event, parentId = null) => {
    event.preventDefault();
    const text = (parentId ? profileReplyDraft : profileCommentDraft).trim();
    if (!user) {
      onSignIn?.();
      return;
    }
    if (!viewedProfileId || !text || isPostingProfileComment) return;
    setIsPostingProfileComment(true);
    setProfileCommentError("");
    try {
      const { comment } = await apiRequest("/api/profile-comments", {
        method: "POST",
        authenticated: true,
        body: { profileId: viewedProfileId, parentId, text }
      });
      setProfileComments((current) => [comment, ...current]);
      if (parentId) {
        setProfileReplyDraft("");
        setReplyingToProfileCommentId("");
      } else {
        setProfileCommentDraft("");
      }
    } catch (error) {
      setProfileCommentError(error.message);
    } finally {
      setIsPostingProfileComment(false);
    }
  };

  const renderProfileComment = (comment, isReply = false) => {
    const frameImage = avatarFrameImage(comment.avatarFrame);
    const frameClass = comment.avatarFrame === "bear"
      ? " is-bear-avatar-frame"
      : isDragonAvatarFrame(comment.avatarFrame) ? " is-dragon-avatar-frame" : getShopAvatarFrameClass(comment.avatarFrame);
    return (
      <article className={`profile-comment${isReply ? " is-reply" : ""}`}>
        <button
          className="project-comment-avatar-btn profile-wall-avatar"
          type="button"
          data-avatar-frame={comment.avatarFrame || "none"}
          aria-label={`View ${comment.author}'s profile`}
          onClick={() => onOpenUserProfile?.(comment.userId)}
        >
          {comment.avatarUrl
            ? <img className="project-comment-avatar" src={comment.avatarUrl} alt="" loading="lazy" decoding="async" />
            : <span className="avatar">{comment.author.slice(0, 1).toUpperCase()}</span>}
          {frameImage && <img className={`project-comment-avatar-frame-overlay${frameClass}`} src={frameImage} alt="" aria-hidden="true" />}
        </button>
        <div className="profile-comment-content">
          <button className="project-author-link" type="button" onClick={() => onOpenUserProfile?.(comment.userId)}>
            <strong>{comment.author}</strong>
          </button>
          <time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleString()}</time>
          <p>{comment.text}</p>
        </div>
      </article>
    );
  };

  const updateDraft = (field, value) => {
    setDraft((currentDraft) => ({ ...currentDraft, [field]: value }));
  };

  const handleImageUpload = async (field, event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setUploadError("");
    try {
      const imageData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error("Unable to read the image file."));
            return;
          }
          const image = new Image();
          image.onload = () => {
            if (file.type.toLowerCase() === "image/gif") {
              const maxDataLength = field === "avatarUrl" ? 500000 : 2000000;
              if (reader.result.length > maxDataLength) {
                reject(new Error(field === "avatarUrl"
                  ? "GIF profile pictures must be smaller than 375 KB."
                  : "GIF profile banners must be smaller than 1.5 MB."));
                return;
              }
              resolve(reader.result);
              return;
            }
            const maxDimension = field === "avatarUrl" ? 256 : 1600;
            const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext("2d");
            if (!context) {
              reject(new Error("Unable to process the image file."));
              return;
            }
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/webp", field === "avatarUrl" ? 0.76 : 0.8));
          };
          image.onerror = () => reject(new Error("Please choose a valid image file."));
          image.src = reader.result;
        };
        reader.onerror = () => reject(reader.error ?? new Error("Unable to read the image file."));
        reader.readAsDataURL(file);
      });
      updateDraft(field, imageData);
    } catch (error) {
      setUploadError(error.message);
    }
  };

  const saveCustomization = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      await onSaveCustomization(draft);
    } finally {
      setIsSaving(false);
    }
  };

  // CHỈ lấy project của chính user hiện tại — fix bug lấy project của acc khác
  const myProjects = projects.filter((project) => project.userId === user?.id);

  const profileProjects = profileTab === "recent"
    ? [...myProjects].reverse()
    : profileTab === "favorite"
      ? ownFavoriteProjects
      : myProjects;
  const publicProfileProjects = profileTab === "favorite" ? publicFavoriteProjects : publicProjects;
  const topLevelProfileComments = profileComments.filter((comment) => !comment.parentId);
  const profileCommentChildren = new Map();
  profileComments.forEach((comment) => {
    if (!comment.parentId) return;
    const children = profileCommentChildren.get(comment.parentId) ?? [];
    children.push(comment);
    profileCommentChildren.set(comment.parentId, children);
  });
  const renderProfileCommentThread = (comment, depth = 0) => {
    const replies = profileCommentChildren.get(comment.id) ?? [];
    const isExpanded = expandedProfileReplyIds.has(comment.id);
    const visibleReplies = isExpanded ? replies : replies.slice(0, 3);
    return (
      <div className="profile-comment-thread" key={comment.id} style={{ "--reply-indent": `${Math.min(depth + 1, 5) * 8}px` }}>
        {renderProfileComment(comment, depth > 0)}
        <button
          type="button"
          className="profile-comment-reply-button"
          onClick={() => {
            setReplyingToProfileCommentId((current) => current === comment.id ? "" : comment.id);
            setProfileReplyDraft("");
            setProfileCommentError("");
            if (!user) onSignIn?.();
          }}
        >
          {replyingToProfileCommentId === comment.id ? "Cancel reply" : "Reply"}
        </button>
        {replyingToProfileCommentId === comment.id && user && (
          <form className="profile-comment-form profile-reply-form" onSubmit={(event) => postProfileComment(event, comment.id)}>
            <label className="visually-hidden" htmlFor={`profile-reply-${comment.id}`}>Write a reply</label>
            <textarea
              id={`profile-reply-${comment.id}`}
              value={profileReplyDraft}
              onChange={(event) => setProfileReplyDraft(event.target.value.slice(0, 500))}
              placeholder={`Reply to ${comment.author}…`}
              maxLength={500}
              rows={2}
            />
            <div className="profile-comment-form-footer">
              <span>{profileReplyDraft.length}/500</span>
              <button className="signin-btn" type="submit" disabled={!profileReplyDraft.trim() || isPostingProfileComment}>
                {isPostingProfileComment ? "Posting…" : "Post reply"}
              </button>
            </div>
          </form>
        )}
        {replies.length > 0 && (
          <div className="profile-comment-replies">
            {visibleReplies.map((reply) => renderProfileCommentThread(reply, depth + 1))}
            {replies.length > 3 && (
              <button
                type="button"
                className="profile-comment-expand-button"
                onClick={() => setExpandedProfileReplyIds((current) => {
                  const next = new Set(current);
                  if (next.has(comment.id)) next.delete(comment.id);
                  else next.add(comment.id);
                  return next;
                })}
              >
                {isExpanded ? "Collapse replies" : `Show ${replies.length - 3} more repl${replies.length - 3 === 1 ? "y" : "ies"}`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };
  const renderProfileCommentsSection = (displayName) => (
    <section className="profile-comments" aria-labelledby="profile-comments-title">
      <h2 className="section-title" id="profile-comments-title">Comments ({profileComments.length})</h2>
      {user ? (
        <form className="profile-comment-form" onSubmit={postProfileComment}>
          <label className="visually-hidden" htmlFor="profile-comment-input">Write a comment on this profile</label>
          <textarea
            id="profile-comment-input"
            value={profileCommentDraft}
            onChange={(event) => setProfileCommentDraft(event.target.value.slice(0, 500))}
            placeholder={`Write a comment for ${displayName || "this user"}…`}
            maxLength={500}
            rows={3}
          />
          <div className="profile-comment-form-footer">
            <span>{profileCommentDraft.length}/500</span>
            <button className="signin-btn" type="submit" disabled={!profileCommentDraft.trim() || isPostingProfileComment}>
              {isPostingProfileComment ? "Posting…" : "Post comment"}
            </button>
          </div>
        </form>
      ) : (
        <button className="signin-btn profile-comment-signin" type="button" onClick={() => onSignIn?.()}>
          Sign in to comment
        </button>
      )}
      {profileCommentError && <p className="profile-comment-error" role="alert">{profileCommentError}</p>}
      <div className="profile-comment-list" aria-live="polite">
        {topLevelProfileComments.map((comment) => renderProfileCommentThread(comment))}
        {!topLevelProfileComments.length && !profileCommentError && <p className="profile-comment-empty">No comments yet. Start the conversation.</p>}
      </div>
    </section>
  );

  return (
    <>
      {page === "profile" && (
        <>
          <section className={`profile-hero${customization.avatarFrame === "gold" ? " gold-frame-card" : ""}`}>
            <div
              className="profile-banner"
              style={{ backgroundColor: customization.profileBackground }}
            >
              {customization.bannerUrl && <img src={customization.bannerUrl} alt="" decoding="async" fetchPriority="high" />}
            </div>
            <div className="profile-identity">
              <div className="profile-avatar" data-avatar-frame={customization.avatarFrame}>
                {customization.avatarUrl
                  ? <img src={customization.avatarUrl} alt={`${customization.displayName} avatar`} decoding="async" fetchPriority="high" />
                  : customization.displayName.slice(0, 1)}
                {avatarFrameImage(customization.avatarFrame) && (
                  <img className={`avatar-frame-overlay${customization.avatarFrame === "bear" ? " is-bear-avatar-frame" : isDragonAvatarFrame(customization.avatarFrame) ? " is-dragon-avatar-frame" : getShopAvatarFrameClass(customization.avatarFrame)}`} src={avatarFrameImage(customization.avatarFrame)} alt="" aria-hidden="true" />
                )}
              </div>
              <div className="profile-identity-main">
                <div className="profile-title-row">
                  <div>
                    <h1>{customization.displayName}</h1>
                    <p>{customization.username}</p>
                  </div>
                  <button className="signin-btn" type="button" onClick={onOpenCustomizer}>
                    Edit Profile
                  </button>
                </div>
                <div className="profile-stats">
                  <button type="button" onClick={() => openPeopleModal("following")}>
                    <strong>{followingCount}</strong> Following
                  </button>
                  <button type="button" onClick={() => openPeopleModal("followers")}>
                    <strong>{followersCount}</strong> Followers
                  </button>
                </div>
              </div>
            </div>
          </section>

          {customization.showProfileBio && (
            <section className="profile-bio">
              <h2 className="section-title">About</h2>
              <p>{customization.bio || "No bio yet."}</p>
            </section>
          )}

          {customization.showProfileProjects && (
            <section className="profile-projects">
              <h2 className="section-title">{profileTab === "favorite" ? "Favorite Projects" : "Projects"} ({profileProjects.length})</h2>
              <div className="profile-project-tabs" role="tablist" aria-label="Profile projects">
                <button type="button" role="tab" aria-selected={profileTab === "all"} onClick={() => setProfileTab("all")}>
                  All Projects
                </button>
                <button type="button" role="tab" aria-selected={profileTab === "favorite"} onClick={() => setProfileTab("favorite")}>
                  Favorites ({favoritesCount})
                </button>
                <button type="button" role="tab" aria-selected={profileTab === "recent"} onClick={() => setProfileTab("recent")}>
                  Recent
                </button>
              </div>
              <div className="featured-grid">
                {profileProjects.map((project, index) => (
                  <button
                    className={`featured-card profile-project-card${customization.avatarFrame === "gold" ? " gold-frame-card" : ""}`}
                    type="button"
                    key={project.id}
                    style={{ "--delay": index + 1 }}
                    onClick={() => onProjectOpen(project)}
                  >
                    <div className="featured-thumb-wrapper">
                      <ProjectThumbnail project={project} alt={project.title} />
                      <span className="featured-badge">FEATURED</span>
                    </div>
                    <div className="featured-info">
                      <h3>{project.title}</h3>
                      <p>by {project.author}</p>
                    </div>
                  </button>
                ))}
                {profileProjects.length === 0 && (
                  <p className="featured-empty">{profileTab === "favorite" ? "No favorite projects yet." : "No projects to show yet."}</p>
                )}
              </div>
            </section>
          )}
          {renderProfileCommentsSection(customization.displayName)}
        </>
      )}

      {page === "user" && (
        <>
          {publicProfileError && <p className="customize-error" role="alert">{publicProfileError}</p>}
          {!publicProfile && !publicProfileError && <p className="feed-empty">Loading profile...</p>}
          {publicProfile && (
            <>
              <section className={`profile-hero${publicProfile.avatar_frame === "gold" ? " gold-frame-card" : ""}`}>
                <div
                  className="profile-banner"
                  style={{ backgroundColor: publicProfile.profile_background || "#171513" }}
                >
                  {publicProfile.banner_url && <img src={publicProfile.banner_url} alt="" decoding="async" fetchPriority="high" />}
                </div>
                <div className="profile-identity">
                  <div className="profile-avatar" data-avatar-frame={publicProfile.avatar_frame || "none"}>
                    {publicProfile.avatar_url
                      ? <img src={publicProfile.avatar_url} alt="" decoding="async" fetchPriority="high" />
                      : (publicProfile.display_name || "?").slice(0, 1)}
                    {avatarFrameImage(publicProfile.avatar_frame) && (
                      <img className={`avatar-frame-overlay${publicProfile.avatar_frame === "bear" ? " is-bear-avatar-frame" : isDragonAvatarFrame(publicProfile.avatar_frame) ? " is-dragon-avatar-frame" : getShopAvatarFrameClass(publicProfile.avatar_frame)}`} src={avatarFrameImage(publicProfile.avatar_frame)} alt="" aria-hidden="true" />
                    )}
                  </div>
                  <div className="profile-identity-main">
                    <div className="profile-title-row">
                      <div>
                        <h1>{publicProfile.display_name || "Aftercode user"}</h1>
                        {publicProfile.username && <p>@{publicProfile.username.replace(/^@/, "")}</p>}
                      </div>
                      {user?.id !== publicProfile.user_id && (
                        <button
                          className="signin-btn"
                          type="button"
                          disabled={isFollowPending}
                          onClick={toggleFollow}
                        >
                          {isFollowing ? "Unfollow" : "Follow"}
                        </button>
                      )}
                      {user?.id === publicProfile.user_id && (
                        <button className="signin-btn" type="button" onClick={onOpenCustomizer}>
                          Edit Profile
                        </button>
                      )}
                    </div>
                    <div className="profile-stats">
                      <button type="button" onClick={() => openPeopleModal("following", publicProfile.user_id)}>
                        <strong>{followingCount}</strong> Following
                      </button>
                      <button type="button" onClick={() => openPeopleModal("followers", publicProfile.user_id)}>
                        <strong>{followersCount}</strong> Followers
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {publicProfile.bio && (
                <section className="profile-bio">
                  <h2 className="section-title">About</h2>
                  <p>{publicProfile.bio}</p>
                </section>
              )}

              <section className="profile-projects">
                <h2 className="section-title">{profileTab === "favorite" ? "Favorite Projects" : "Projects"} ({publicProfileProjects.length})</h2>
                <div className="profile-project-tabs" role="tablist" aria-label="Profile projects">
                  <button type="button" role="tab" aria-selected={profileTab !== "favorite"} onClick={() => setProfileTab("all")}>
                    All Projects ({publicProjects.length})
                  </button>
                  <button type="button" role="tab" aria-selected={profileTab === "favorite"} onClick={() => setProfileTab("favorite")}>
                    Favorites ({favoritesCount})
                  </button>
                </div>
                <div className="featured-grid">
                  {publicProfileProjects.map((project, index) => (
                    <button
                      className={`featured-card profile-project-card${publicProfile.avatar_frame === "gold" ? " gold-frame-card" : ""}`}
                      type="button"
                      key={project.id}
                      style={{ "--delay": index + 1 }}
                      onClick={() => onProjectOpen(project)}
                    >
                      <div className="featured-thumb-wrapper">
                        <ProjectThumbnail project={project} alt={project.title} />
                        <span className="featured-badge">{project.category}</span>
                      </div>
                      <div className="featured-info">
                        <h3>{project.title}</h3>
                        <p>by {project.author}</p>
                      </div>
                    </button>
                  ))}
                  {publicProfileProjects.length === 0 && (
                    <p className="featured-empty">{profileTab === "favorite" ? "This user has no public favorite projects yet." : "This user has no public projects yet."}</p>
                  )}
                </div>
              </section>

              {renderProfileCommentsSection(publicProfile.display_name)}
            </>
          )}
        </>
      )}

      {isCustomizeOpen && createPortal((
        <div
          className="customize-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCloseCustomizer();
          }}
        >
          <form
            className="customize-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customize-title"
            onSubmit={saveCustomization}
          >
            <div className="customize-heading">
              <div>
                <span className="welcome-eyebrow">CUSTOMIZE YOUR PAGES</span>
                <h2 id="customize-title">Home &amp; Profile</h2>
              </div>
              <button className="customize-close" type="button" aria-label="Close" onClick={onCloseCustomizer}>×</button>
            </div>

            <fieldset className="customize-section">
              <legend>Profile Information</legend>
              <label>
                Display Name
                <input required value={draft.displayName} maxLength={40} onChange={(event) => updateDraft("displayName", event.target.value)} />
              </label>
              <label>
                Username
                <input required value={draft.username} maxLength={40} onChange={(event) => updateDraft("username", event.target.value)} />
              </label>
              <label>
                Bio
                <textarea value={draft.bio} maxLength={300} rows={3} onChange={(event) => updateDraft("bio", event.target.value)} />
              </label>
              <p className="customize-image-note">
                GIFs uploaded before animation support were saved as still images. Re-upload the original GIF to restore animation.
              </p>
              <label>
                Profile Picture
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("avatarUrl", event)} />
                {draft.avatarUrl && <img className="customize-image-preview" src={draft.avatarUrl} alt="Profile picture preview" />}
              </label>
              <label>
                Avatar Frame
                <select value={draft.avatarFrame || "none"} onChange={(event) => updateDraft("avatarFrame", event.target.value)}>
                  <option value="none">None</option>
                  <option value="gold">Gold</option>
                  <option value="neon">Neon</option>
                  <option value="pixel">Pixel</option>
                  <option value="bear">Bear</option>
                  {hasRawFleshFrame && <option value="raw-flesh-666">Raw Flesh 666</option>}
                  {ownedDecorations.length > 0 && (
                    <optgroup label="Purchased frames">
                      {ownedDecorations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                    </optgroup>
                  )}
                </select>
                <div className="profile-avatar customize-avatar-frame-preview" data-avatar-frame={draft.avatarFrame || "none"}>
                  {draft.avatarUrl
                    ? <img src={draft.avatarUrl} alt="" />
                    : draft.displayName.slice(0, 1).toUpperCase()}
                  {avatarFrameImage(draft.avatarFrame) && (
                    <img className={`avatar-frame-overlay${draft.avatarFrame === "bear" ? " is-bear-avatar-frame" : isDragonAvatarFrame(draft.avatarFrame) ? " is-dragon-avatar-frame" : getShopAvatarFrameClass(draft.avatarFrame)}`} src={avatarFrameImage(draft.avatarFrame)} alt="" aria-hidden="true" />
                  )}
                </div>
              </label>
              <label>
                Profile Banner
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("bannerUrl", event)} />
                {draft.bannerUrl && <img className="customize-image-preview customize-banner-preview" src={draft.bannerUrl} alt="Profile banner preview" />}
              </label>
            </fieldset>

            {(uploadError || customizationError) && (
              <p className="customize-error" role="alert">{uploadError || customizationError}</p>
            )}

            <fieldset className="customize-section customize-colors">
              <legend>Colors</legend>
              <label>
                Accent Color
                <input type="color" value={draft.accentColor} onChange={(event) => updateDraft("accentColor", event.target.value)} />
                <small>Applies to the Brutalist theme.</small>
              </label>
              <label>
                Home Page Background
                <input type="color" value={draft.homeBackground} onChange={(event) => updateDraft("homeBackground", event.target.value)} />
              </label>
              <label>
                Profile Banner Background
                <input type="color" value={draft.profileBackground} onChange={(event) => updateDraft("profileBackground", event.target.value)} />
              </label>
            </fieldset>

            <fieldset className="customize-section customize-visibility">
              <legend>Visible Sections</legend>
              {[
                ["showWelcome", "Home Page Introduction"],
                ["showFeed", "Home Page Activity Feed"],
                ["showFeatured", "Home Page Featured Projects"],
                ["showProfileBio", "Profile Information"],
                ["showProfileProjects", "Profile Projects"],
                ["showProfileStats", "Profile Follower Stats"]
              ].map(([field, label]) => (
                <label key={field}>
                  <input type="checkbox" checked={draft[field]} onChange={(event) => updateDraft(field, event.target.checked)} />
                  {label}
                </label>
              ))}
            </fieldset>

            <fieldset className="customize-section customize-preferences">
              <legend>User Settings</legend>
              <label className="customize-preference-toggle">
                <input
                  type="checkbox"
                  checked={compatibilityMode}
                  onChange={(event) => onCompatibilityModeChange(event.target.checked)}
                />
                <span>
                  <strong>Compatibility mode</strong>
                  <small>Use simpler effects and solid surfaces for older browsers.</small>
                </span>
              </label>
            </fieldset>

            <div className="customize-actions">
              <button className="nav-btn" type="button" onClick={onCloseCustomizer}>Cancel</button>
              <button className="signin-btn" type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      ), document.body)}

      {peopleModal && (
        <div
          className="customize-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePeopleModal();
          }}
        >
          <section className="people-modal" role="dialog" aria-modal="true">
            <div className="customize-heading">
              <h2>{peopleModal === "followers" ? "Followers" : "Following"}</h2>
              <button className="customize-close" type="button" aria-label="Close" onClick={closePeopleModal}>×</button>
            </div>
            <div className="people-list">
              {isPeopleLoading && <p className="feed-empty">Loading...</p>}
              {peopleError && <p className="customize-error" role="alert">{peopleError}</p>}
              {!isPeopleLoading && !peopleError && peopleList.length === 0 && (
                <p className="feed-empty">
                  {peopleModal === "followers" ? "No followers yet." : "No following yet."}
                </p>
              )}
              {peopleList.map((person) => (
                <button
                  type="button"
                  className="feed-item people-modal-item"
                  key={person.user_id}
                  onClick={() => openPersonProfile(person.user_id)}
                >
                  {person.avatar_url
                    ? <img className="project-comment-avatar" src={person.avatar_url} alt="" />
                    : <div className="avatar">{(person.display_name || "?").slice(0, 1).toUpperCase()}</div>}
                  <div>
                    <strong>{person.display_name}</strong>
                    {person.username && <p className="feed-time">@{person.username.replace(/^@/, "")}</p>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

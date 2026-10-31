import { useEffect, useState } from "react";
import { getCachedProfileStats, getCachedPublicProfile, loadPublicProfile, apiFollow, cacheProfileStats, loadFollowList } from "./userStorage.js";
import { supabase } from "./supabase.js";
import ProjectThumbnail from "./ProjectThumbnail.jsx";
import "./User.css";

function toPublicProject(record) {
  return {
    id: record.id,
    databaseId: record.id,
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
  customizationError,
  isCustomizeOpen,
  onOpenCustomizer,
  onCloseCustomizer,
  onSaveCustomization,
  projects,
  onProjectOpen,
  selectedUserId,
  onOpenUserProfile,
  peopleListRoute,
  onPeopleListNavigate,
  onPublicProfileLoaded
}) {
  const [draft, setDraft] = useState(() => ({ ...customization }));
  const [profileTab, setProfileTab] = useState("all");
  const [uploadError, setUploadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const profileCacheUserId = page === "user" ? selectedUserId : page === "profile" ? user?.id : null;
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
  const [peopleModal, setPeopleModal] = useState(null);
  const [peopleList, setPeopleList] = useState([]);
  const [peopleError, setPeopleError] = useState("");
  const [isPeopleLoading, setIsPeopleLoading] = useState(false);

  // Load profile khi xem trang người khác
  useEffect(() => {
    if (page !== "user" || !selectedUserId) {
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

  return (
    <>
      {page === "profile" && (
        <>
          <section className="profile-hero">
            <div
              className="profile-banner"
              style={{ backgroundColor: customization.profileBackground }}
            >
              {customization.bannerUrl && <img src={customization.bannerUrl} alt="" decoding="async" fetchPriority="high" />}
            </div>
            <div className="profile-identity">
              <div className="profile-avatar">
                {customization.avatarUrl
                  ? <img src={customization.avatarUrl} alt={`${customization.displayName} avatar`} decoding="async" fetchPriority="high" />
                  : customization.displayName.slice(0, 1)}
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
                  <span><strong>{favoritesCount}</strong> Favorites</span>
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
                    className="featured-card profile-project-card"
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
        </>
      )}

      {page === "user" && (
        <>
          {publicProfileError && <p className="customize-error" role="alert">{publicProfileError}</p>}
          {!publicProfile && !publicProfileError && <p className="feed-empty">Loading profile...</p>}
          {publicProfile && (
            <>
              <section className="profile-hero">
                <div
                  className="profile-banner"
                  style={{ backgroundColor: publicProfile.profile_background || "#171513" }}
                >
                  {publicProfile.banner_url && <img src={publicProfile.banner_url} alt="" decoding="async" fetchPriority="high" />}
                </div>
                <div className="profile-identity">
                  <div className="profile-avatar">
                    {publicProfile.avatar_url
                      ? <img src={publicProfile.avatar_url} alt="" decoding="async" fetchPriority="high" />
                      : (publicProfile.display_name || "?").slice(0, 1)}
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
                      <span><strong>{favoritesCount}</strong> Favorites</span>
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
                      className="featured-card profile-project-card"
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
            </>
          )}
        </>
      )}

      {isCustomizeOpen && (
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
              <label>
                Profile Picture
                <input type="file" accept="image/*" onChange={(event) => handleImageUpload("avatarUrl", event)} />
                {draft.avatarUrl && <img className="customize-image-preview" src={draft.avatarUrl} alt="Profile picture preview" />}
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

            <div className="customize-actions">
              <button className="nav-btn" type="button" onClick={onCloseCustomizer}>Cancel</button>
              <button className="signin-btn" type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

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
          </section>
        </div>
      )}
    </>
  );
}

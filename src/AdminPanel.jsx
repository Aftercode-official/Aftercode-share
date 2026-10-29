import ProjectThumbnail from "./ProjectThumbnail.jsx";
import "./AdminPanel.css";

export default function AdminPanel({ projects, onToggleFeatured, onOpenProject, error }) {
  const featuredCount = projects.filter((project) => project.isFeatured).length;

  return (
    <section className="admin-panel">
      <header className="admin-panel-heading">
        <div>
          <span className="welcome-eyebrow">AFTERCODE ADMIN</span>
          <h1>Admin panel</h1>
          <p>Manage which public projects appear in Featured Projects.</p>
        </div>
        <span className="admin-panel-count">{featuredCount} featured</span>
      </header>
      {error && <p className="admin-panel-error" role="alert">{error}</p>}
      {projects.length ? (
        <div className="admin-project-list">
          {projects.map((project) => (
            <article className="admin-project-row" key={project.databaseId}>
              <button className="admin-project-open" type="button" onClick={() => onOpenProject(project)}>
                <ProjectThumbnail project={project} alt={project.title} />
                <span className="admin-project-copy">
                  <strong>{project.title}</strong>
                  <span>by {project.author} · {project.category}</span>
                </span>
              </button>
              <button
                className="admin-feature-button"
                type="button"
                aria-pressed={project.isFeatured}
                onClick={() => onToggleFeatured(project)}
              >
                {project.isFeatured ? "Remove from Featured" : "Add to Featured"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="admin-panel-empty">No public projects to manage yet.</p>
      )}
    </section>
  );
}

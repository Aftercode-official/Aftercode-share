import { useState } from "react";
import JSZip from "jszip";
import { apiRequest } from "./api.js";
import { supabase } from "./supabase.js";
import "./UploadProjectModal.css";

const MAX_PROJECT_SIZE = 50 * 1024 * 1024;

export default function UploadProjectModal({ user, onClose, onPublished }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Games");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  const chooseFile = (event) => {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    setError("");

    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".sb3")) {
      setError("Choose a Scratch project file ending in .sb3.");
      return;
    }
    if (nextFile.size === 0 || nextFile.size > MAX_PROJECT_SIZE) {
      setError("The .sb3 file must be between 1 byte and 50 MB.");
      return;
    }
    setFile(nextFile);
    if (!title) setTitle(nextFile.name.replace(/\.sb3$/i, ""));
  };

  const publishProject = async (event) => {
    event.preventDefault();
    setError("");
    if (!file || !supabase) {
      setError("Choose an .sb3 file and make sure Supabase is configured.");
      return;
    }

    setIsPublishing(true);
    let uploadedPath;
    try {
      const archiveHeader = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (archiveHeader[0] !== 0x50 || archiveHeader[1] !== 0x4b) {
        throw new Error("This file does not look like a valid Scratch .sb3 archive.");
      }
      const archive = await JSZip.loadAsync(file);
      const projectFile = archive.file("project.json");
      if (!projectFile) {
        throw new Error("This .sb3 archive does not contain a Scratch project.json file.");
      }
      let projectData;
      try {
        projectData = JSON.parse(await projectFile.async("string"));
      } catch {
        throw new Error("The project.json file in this .sb3 archive is invalid.");
      }
      if (!Array.isArray(projectData.targets) || projectData.targets.length === 0) {
        throw new Error("This file does not contain any Scratch sprites or stage.");
      }

      uploadedPath = `${user.id}/${crypto.randomUUID()}.sb3`;
      const { error: uploadError } = await supabase.storage
        .from("project-files")
        .upload(uploadedPath, file, {
          contentType: "application/octet-stream",
          upsert: false
        });
      if (uploadError) throw uploadError;

      await apiRequest("/api/projects", {
        method: "POST",
        authenticated: true,
        body: {
          title: title.trim(),
          description: description.trim(),
          category,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          assetPath: uploadedPath,
          isPublic: true
        }
      });

      uploadedPath = null;
      await onPublished();
      onClose();
    } catch (publishError) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from("project-files")
          .remove([uploadedPath]);
        if (cleanupError) {
          console.error("Unable to clean up an unpublished project upload.", cleanupError);
        }
      }
      setError(publishError.message || "Unable to publish this project.");
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div
      className="upload-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isPublishing) onClose();
      }}
    >
      <section
        className="upload-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
      >
        <div className="upload-heading">
          <div>
            <span className="welcome-eyebrow">SHARE WITH THE COMMUNITY</span>
            <h2 id="upload-title">Upload a project</h2>
          </div>
          <button
            className="customize-close"
            type="button"
            aria-label="Close"
            disabled={isPublishing}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form className="upload-form" onSubmit={publishProject}>
          <label className="upload-file-picker">
            Scratch project file (.sb3)
            <input type="file" accept=".sb3,application/octet-stream" required onChange={chooseFile} />
            <span>{file ? `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB` : "Choose an .sb3 file (max 50 MB)"}</span>
          </label>
          <label>
            Project title
            <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option>Games</option>
              <option>Animations</option>
              <option>Art</option>
              <option>Music</option>
              <option>Experiments</option>
              <option>Other</option>
            </select>
          </label>
          <label>
            Description
            <textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label>
            Tags <span className="upload-label-hint">comma separated, up to 10</span>
            <input maxLength={320} placeholder="platformer, art, music" value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="signin-btn upload-submit" type="submit" disabled={isPublishing || !file}>
            {isPublishing ? "Uploading..." : "Publish project"}
          </button>
        </form>
      </section>
    </div>
  );
}

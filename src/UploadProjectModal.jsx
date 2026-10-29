import { useState } from "react";
import { apiRequest } from "./api.js";
import { supabase } from "./supabase.js";
import { MAX_SCRATCH_PROJECT_SIZE, validateScratchProjectFile } from "./scratchProjectFile.js";
import "./UploadProjectModal.css";

const MAX_THUMB_SIZE = 2 * 1024 * 1024;

export default function UploadProjectModal({ user, onClose, onPublished }) {
  const [file, setFile] = useState(null);
  const [thumbnail, setThumbnail] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Games");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState("");

  const chooseFile = (event) => {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    setError("");

    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".sb3")) {
      setError("Choose a Scratch project file ending in .sb3.");
      return;
    }
    if (nextFile.size === 0 || nextFile.size > MAX_SCRATCH_PROJECT_SIZE) {
      setError("The .sb3 file must be between 1 byte and 50 MB.");
      return;
    }
    setFile(nextFile);
    if (!title) setTitle(nextFile.name.replace(/\.sb3$/i, ""));
  };

  const chooseThumbnail = (event) => {
    const nextFile = event.currentTarget.files?.[0] ?? null;
    setError("");
    if (!nextFile) return;
    if (!nextFile.type.startsWith("image/")) {
      setError("Thumbnail must be an image file.");
      return;
    }
    if (nextFile.size > MAX_THUMB_SIZE) {
      setError("Thumbnail must be under 2 MB.");
      return;
    }
    setThumbnail(nextFile);
    const reader = new FileReader();
    reader.onload = () => setThumbnailPreview(reader.result);
    reader.readAsDataURL(nextFile);
  };

  // Upload file với progress tracking dùng XHR
  const uploadWithProgress = (path, fileToUpload, contentType, onProgress) => {
    return new Promise(async (resolve, reject) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        reject(new Error("Sign in to upload."));
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const url = `${supabaseUrl}/storage/v1/object/project-files/${path}`;

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let message = `Upload failed (${xhr.status})`;
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed.message) message = parsed.message;
          } catch {}
          reject(new Error(message));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload.")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled.")));

      xhr.open("POST", url);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.send(fileToUpload);
    });
  };

  const publishProject = async (event) => {
    event.preventDefault();
    setError("");
    if (!file || !supabase) {
      setError("Choose an .sb3 file and make sure Supabase is configured.");
      return;
    }

    setIsPublishing(true);
    setUploadProgress(0);
    setUploadStage("Validating archive...");

    let uploadedPath;
    let uploadedThumbPath;

    try {
      await validateScratchProjectFile(file);

      // 1. Upload .sb3 với progress
      setUploadStage("Uploading project file...");
      setUploadProgress(0);
      uploadedPath = `${user.id}/${crypto.randomUUID()}.sb3`;
      await uploadWithProgress(
        uploadedPath,
        file,
        "application/octet-stream",
        (percent) => setUploadProgress(percent)
      );

      // 2. Upload thumbnail
      if (thumbnail) {
        setUploadStage("Uploading thumbnail...");
        setUploadProgress(0);
        const ext = (thumbnail.name.split(".").pop() || "png").toLowerCase();
        uploadedThumbPath = `${user.id}/thumb-${crypto.randomUUID()}.${ext}`;
        await uploadWithProgress(
          uploadedThumbPath,
          thumbnail,
          thumbnail.type || "image/png",
          (percent) => setUploadProgress(percent)
        );
      }

      // 3. Gửi API
      setUploadStage("Saving project info...");
      setUploadProgress(100);
      await apiRequest("/api/projects", {
        method: "POST",
        authenticated: true,
        body: {
          title: title.trim(),
          description: description.trim(),
          category,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          assetPath: uploadedPath,
          thumbnailPath: uploadedThumbPath,
          isPublic: true
        }
      });

      uploadedPath = null;
      uploadedThumbPath = null;
      await onPublished();
      onClose();
    } catch (publishError) {
      // Cleanup
      if (uploadedPath) {
        await supabase.storage.from("project-files").remove([uploadedPath]);
      }
      if (uploadedThumbPath) {
        await supabase.storage.from("project-files").remove([uploadedThumbPath]);
      }
      setError(publishError.message || "Unable to publish this project.");
    } finally {
      setIsPublishing(false);
      setUploadProgress(0);
      setUploadStage("");
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
            Thumbnail (optional)
            <input type="file" accept="image/*" onChange={chooseThumbnail} />
            {thumbnailPreview && (
              <img
                className="customize-image-preview customize-banner-preview"
                src={thumbnailPreview}
                alt="Thumbnail preview"
              />
            )}
            <span className="upload-label-hint">PNG/JPG, max 2 MB.</span>
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

          {isPublishing && (
            <div className="upload-progress">
              <div className="upload-progress-info">
                <span>{uploadStage}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="upload-progress-track">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button className="signin-btn upload-submit" type="submit" disabled={isPublishing || !file}>
            {isPublishing ? `Uploading... ${uploadProgress}%` : "Publish project"}
          </button>
        </form>
      </section>
    </div>
  );
}

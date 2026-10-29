import { useEffect, useState } from "react";

export default function ProjectThumbnail({
  project,
  alt = "",
  className = "featured-thumb",
  fallbackClassName = "sb3-thumbnail"
}) {
  const sources = [...new Set([
    project.thumb,
    project.scratchProjectId
      ? `https://uploads.scratch.mit.edu/get_image/project/${project.scratchProjectId}_480x360.png`
      : null
  ].filter(Boolean))];
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [project.thumb, project.scratchProjectId]);

  const source = sources[sourceIndex];
  if (!source) {
    return <span className={fallbackClassName} aria-label="No project thumbnail available">SB3</span>;
  }

  return (
    <img
      src={source}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setSourceIndex((index) => index + 1)}
    />
  );
}

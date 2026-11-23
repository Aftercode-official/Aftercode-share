import { createPortal } from "react-dom";
import LogoIcon from "./assets/Logo.png";
import ErrLogo from "./assets/err.png";
import "./NotFoundPage.css";

export default function NotFoundPage({
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  fleshBackground = null,
  glitch666 = false
}) {
  const glitchLayer = glitch666 ? (
    <div className="not-found-glitch-layer" aria-hidden="true">
      <div className="not-found-black-flash" />
    </div>
  ) : null;

  return (
    <div
      className={`not-found-page${fleshBackground ? " is-flesh-background" : ""}${glitch666 ? " is-glitch-666" : ""}`}
      style={fleshBackground ? { backgroundImage: `url("${fleshBackground}")` } : undefined}
    >
      <div className="not-found-content">
        <img className="not-found-logo" src={fleshBackground ? ErrLogo : LogoIcon} alt="Aftercode" width="180" height="59" draggable={false} />
        <div className="not-found-search-wrap">
          <input
            type="text"
            className="not-found-search"
            placeholder={glitch666 ? "666" : "Search..."}
            value={glitch666 ? "666" : searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearchSubmit();
            }}
          />
        </div>
        <h1 className="not-found-title">{glitch666 ? "666" : "Page not found"}</h1>
        <p className="not-found-description">
          {glitch666 ? (
            <>
              666<br />
              666
            </>
          ) : (
            <>
              Looks like the page you are looking for doesn't exsits,<br />
              how about search something else?
            </>
          )}
        </p>
      </div>
      {glitchLayer && createPortal(glitchLayer, document.body)}
    </div>
  );
}

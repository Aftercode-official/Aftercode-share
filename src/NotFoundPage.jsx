import LogoIcon from "./assets/Logo.png";
import "./NotFoundPage.css";

export default function NotFoundPage({
  searchQuery,
  onSearchQueryChange,
  onSearchSubmit,
  fleshBackground = null,
  warpScale = 0
}) {
  const reduceMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const warped = Boolean(fleshBackground);

  return (
    <div className={`not-found-page${warped ? " is-flesh-warped" : ""}`}>
      {warped && (
        <>
          <svg className="not-found-warp-defs" aria-hidden="true">
            <filter id="not-found-flesh-warp" x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
              <feTurbulence type="turbulence" baseFrequency="0.012 0.02" numOctaves="3" seed="4" result="noise">
                {!reduceMotion && (
                  <animate
                    attributeName="baseFrequency"
                    dur="7s"
                    values="0.008 0.014;0.022 0.036;0.011 0.02;0.008 0.014"
                    repeatCount="indefinite"
                  />
                )}
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale={warpScale} xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </svg>
          <img className="not-found-flesh-bg" src={fleshBackground} alt="" draggable={false} />
        </>
      )}
      <div className="not-found-content">
        <img className="not-found-logo" src={LogoIcon} alt="Aftercode" width="180" height="59" draggable={false} />
        <div className="not-found-search-wrap">
          <input
            type="text"
            className="not-found-search"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearchSubmit();
            }}
          />
        </div>
        <h1 className="not-found-title">Page not found</h1>
        <p className="not-found-description">
          Looks like the page you are looking for doesn't exsits,<br />
          how about search something else?
        </p>
      </div>
    </div>
  );
}

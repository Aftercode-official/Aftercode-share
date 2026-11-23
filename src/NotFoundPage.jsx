import { createPortal } from "react-dom";
import LogoIcon from "./assets/Logo.png";
import ErrLogo from "./assets/err.png";
import "./NotFoundPage.css";

const GLITCH_MARKS = [
  { top: "6%", left: "-8%", size: "7rem", duration: "1.15s", delay: "0s", dx: "78vw", dy: "18vh", dx2: "110vw", dy2: "-12vh", rot: "18deg" },
  { top: "18%", left: "70%", size: "3.2rem", duration: "0.7s", delay: "0.15s", dx: "-62vw", dy: "40vh", dx2: "-90vw", dy2: "8vh", rot: "-24deg" },
  { top: "72%", left: "8%", size: "5.4rem", duration: "0.9s", delay: "0.4s", dx: "55vw", dy: "-48vh", dx2: "20vw", dy2: "-70vh", rot: "32deg" },
  { top: "40%", left: "30%", size: "11rem", duration: "1.4s", delay: "0.05s", dx: "28vw", dy: "22vh", dx2: "-36vw", dy2: "46vh", rot: "-12deg" },
  { top: "84%", left: "48%", size: "2.4rem", duration: "0.55s", delay: "0.2s", dx: "30vw", dy: "-30vh", dx2: "-40vw", dy2: "-80vh", rot: "40deg" },
  { top: "2%", left: "42%", size: "4.6rem", duration: "0.8s", delay: "0.55s", dx: "-20vw", dy: "60vh", dx2: "24vw", dy2: "90vh", rot: "8deg" },
  { top: "55%", left: "78%", size: "8rem", duration: "1.25s", delay: "0.3s", dx: "-70vw", dy: "-20vh", dx2: "-110vw", dy2: "24vh", rot: "-30deg" },
  { top: "28%", left: "12%", size: "1.8rem", duration: "0.45s", delay: "0.1s", dx: "80vw", dy: "10vh", dx2: "40vw", dy2: "-36vh", rot: "50deg" },
  { top: "63%", left: "-12%", size: "6rem", duration: "1s", delay: "0.7s", dx: "90vw", dy: "-8vh", dx2: "120vw", dy2: "20vh", rot: "-16deg" },
  { top: "12%", left: "88%", size: "2rem", duration: "0.6s", delay: "0.25s", dx: "-30vw", dy: "70vh", dx2: "-80vw", dy2: "20vh", rot: "22deg" },
  { top: "90%", left: "20%", size: "9rem", duration: "1.6s", delay: "0.45s", dx: "40vw", dy: "-80vh", dx2: "10vw", dy2: "-110vh", rot: "-36deg" },
  { top: "34%", left: "55%", size: "3.6rem", duration: "0.5s", delay: "0s", dx: "-18vw", dy: "-24vh", dx2: "22vw", dy2: "30vh", rot: "14deg" },
  { top: "48%", left: "-6%", size: "2.8rem", duration: "0.85s", delay: "0.6s", dx: "100vw", dy: "12vh", dx2: "70vw", dy2: "-40vh", rot: "-8deg" },
  { top: "8%", left: "18%", size: "1.4rem", duration: "0.4s", delay: "0.35s", dx: "20vw", dy: "24vh", dx2: "60vw", dy2: "50vh", rot: "28deg" },
  { top: "76%", left: "62%", size: "4rem", duration: "1.05s", delay: "0.12s", dx: "-24vw", dy: "-55vh", dx2: "16vw", dy2: "-20vh", rot: "44deg" }
];

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
      {GLITCH_MARKS.map((mark) => (
        <span
          key={`${mark.top}-${mark.left}-${mark.delay}`}
          className="not-found-glitch-666"
          style={{
            top: mark.top,
            left: mark.left,
            fontSize: mark.size,
            animationDuration: mark.duration,
            animationDelay: mark.delay,
            "--dx": mark.dx,
            "--dy": mark.dy,
            "--dx2": mark.dx2,
            "--dy2": mark.dy2,
            "--rot": mark.rot
          }}
        >
          666
        </span>
      ))}
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

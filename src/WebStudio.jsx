import { useEffect, useRef, useState } from "react";
import "./WebStudio.css";

const STORAGE_KEY = "aftercode-share-web-studio-v1";
const DEFAULT_HTML = `<main class="page">
  <span class="eyebrow">AFTERCODE / STUDIO</span>
  <h1>Build your next idea.</h1>
  <p>Edit the HTML and CSS on the left to shape this page.</p>
  <button>Start creating</button>
</main>`;
const DEFAULT_CSS = `:root { color-scheme: dark; font-family: Inter, system-ui, sans-serif; }
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: grid; place-items: center;
  color: #f8f8f2; background: #111318;
}
.page { width: min(680px, 88vw); padding: 48px; border: 1px solid #343943; background: #191c22; }
.eyebrow { color: #ffd21f; font: 700 12px/1 monospace; letter-spacing: .16em; }
h1 { margin: 18px 0 10px; font-size: clamp(2rem, 5vw, 4.5rem); line-height: .95; }
p { color: #aeb5c2; }
button { margin-top: 20px; padding: 12px 18px; border: 0; background: #ffd21f; color: #151515; font-weight: 800; }`;

function makeWindow(index = 1) {
  return { id: `win-${Date.now()}-${index}`, title: `Window ${index}`, url: "", x: 42 + index * 24, y: 42 + index * 20, width: 460, height: 300 };
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      html: saved?.html || DEFAULT_HTML,
      css: saved?.css || DEFAULT_CSS,
      background: saved?.background || "",
      windows: Array.isArray(saved?.windows) ? saved.windows : [makeWindow(1)]
    };
  } catch {
    return { html: DEFAULT_HTML, css: DEFAULT_CSS, background: "", windows: [makeWindow(1)] };
  }
}

function previewDocument(html, css, background) {
  const safeBackground = background ? `body { background-image: url(${JSON.stringify(background)}); background-size: cover; background-position: center; }` : "";
  return `<!doctype html><html><head><meta charset="UTF-8"><style>${css}${safeBackground}</style></head><body>${html}</body></html>`;
}

export default function WebStudio({ isOpen, onClose }) {
  const [initial] = useState(() => readSaved());
  const [html, setHtml] = useState(initial.html);
  const [css, setCss] = useState(initial.css);
  const [background, setBackground] = useState(initial.background);
  const [windows, setWindows] = useState(initial.windows);
  const [activeId, setActiveId] = useState(initial.windows[0]?.id || "");
  const dragRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ html, css, background, windows }));
  }, [html, css, background, windows]);

  useEffect(() => {
    const move = (event) => {
      if (!dragRef.current) return;
      const { id, startX, startY, originX, originY } = dragRef.current;
      setWindows((current) => current.map((item) => item.id === id
        ? { ...item, x: Math.max(0, originX + event.clientX - startX), y: Math.max(0, originY + event.clientY - startY) }
        : item));
    };
    const stop = () => { dragRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, []);

  if (!isOpen) return null;

  const uploadBackground = (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setBackground(String(reader.result || ""));
    reader.readAsDataURL(file);
  };

  const addWindow = () => {
    const next = makeWindow(windows.length + 1);
    setWindows((current) => [...current, next]);
    setActiveId(next.id);
  };

  const updateWindow = (id, updates) => setWindows((current) => current.map((item) => item.id === id ? { ...item, ...updates } : item));
  const removeWindow = (id) => {
    setWindows((current) => current.filter((item) => item.id !== id));
    if (activeId === id) setActiveId(windows.find((item) => item.id !== id)?.id || "");
  };

  return (
    <div className="studio-overlay" role="dialog" aria-modal="true" aria-label="Aftercode Web Studio">
      <section className="studio-shell">
        <header className="studio-header">
          <div><span className="studio-kicker">AFTERCODE</span><h2>Web Studio</h2></div>
          <div className="studio-actions"><button type="button" onClick={addWindow}>+ New window</button><button className="studio-close" type="button" onClick={onClose}>Close</button></div>
        </header>
        <div className="studio-body">
          <aside className="studio-editor">
            <label>HTML <textarea value={html} onChange={(event) => setHtml(event.target.value)} spellCheck="false" /></label>
            <label>CSS <textarea value={css} onChange={(event) => setCss(event.target.value)} spellCheck="false" /></label>
            <div className="studio-upload">
              <label className="studio-file-label">Upload page background<input type="file" accept="image/*" onChange={uploadBackground} /></label>
              {background && <button type="button" className="studio-clear" onClick={() => setBackground("")}>Remove background</button>}
            </div>
          </aside>
          <section className="studio-preview-area">
            <div className="studio-preview-label">LIVE PREVIEW</div>
            <iframe className="studio-live-preview" title="HTML and CSS live preview" srcDoc={previewDocument(html, css, background)} sandbox="allow-scripts" />
            <div className="studio-window-stage">
              <div className="studio-preview-label">WINDOW MANAGER · {windows.length} WINDOWS</div>
              {windows.map((item) => (
                <article
                  className={`studio-window${activeId === item.id ? " is-active" : ""}`}
                  key={item.id}
                  style={{ left: item.x, top: item.y, width: item.width, height: item.height }}
                  onPointerDown={() => setActiveId(item.id)}
                >
                  <header
                    className="studio-window-bar"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      dragRef.current = { id: item.id, startX: event.clientX, startY: event.clientY, originX: item.x, originY: item.y };
                    }}
                  >
                    <span className="studio-window-dots"><i /><i /><i /></span><strong>{item.title}</strong><button type="button" onClick={() => removeWindow(item.id)}>×</button>
                  </header>
                  <div className="studio-window-tools"><input aria-label="Window URL" value={item.url} placeholder="https://example.com" onChange={(event) => updateWindow(item.id, { url: event.target.value })} /><input aria-label="Window title" value={item.title} onChange={(event) => updateWindow(item.id, { title: event.target.value })} /></div>
                  {item.url ? <iframe title={item.title} src={item.url} /> : <div className="studio-window-empty">Paste a URL above to load a web page</div>}
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

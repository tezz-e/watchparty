import { useState } from "react";
import { isMixedContent, mediaProvider, streamingPlatform, validMediaUrl } from "../data/catalog.js";
import { catalog, searchCatalog } from "../data/localCatalog.js";
import { Icon } from "./Primitives.jsx";

export function ChangeMediaModal({ isOpen, onClose, currentSource = "", currentTitle = "", onUpdate, theme = "green" }) {
  const [tab, setTab] = useState("link");
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");

  if (!isOpen) return null;

  const validSource = validMediaUrl(source);
  const provider = mediaProvider(source);
  const platform = streamingPlatform(source);
  const mixedContent = isMixedContent(source, typeof window !== "undefined" ? window.location.protocol : "http:");
  const canSubmit = validSource && !mixedContent;

  const handleSubmitLink = event => {
    event.preventDefault();
    if (!canSubmit) return;
    const finalTitle = title.trim() || (provider === "youtube" ? "YouTube Video" : provider === "instagram" ? "Instagram Reel" : platform?.name ? `${platform.name} Watch Party` : "Shared Video");
    onUpdate({ title: finalTitle, source: source.trim() });
    onClose();
  };

  const handleSelectCatalog = item => {
    const finalSource = item.source || (item.trailerKey ? `https://www.youtube.com/watch?v=${item.trailerKey}` : "");
    if (!finalSource) return;
    onUpdate({ title: item.title, source: finalSource });
    onClose();
  };

  const catalogPicks = searchCatalog(catalog, { query }).slice(0, 12);

  return (
    <div className="modal-backdrop" data-theme={theme} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="setup-modal setup-modal-wide change-media-modal">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
          <Icon name="close" />
        </button>
        <div className="setup-head">
          <span className="eyebrow"><span />SWITCH ROOM MEDIA</span>
          <h2>Change what you're watching</h2>
          <p>Instantly switch the synchronized video for everyone in the room without leaving.</p>
        </div>

        <div className="change-media-tabs">
          <button
            type="button"
            className={tab === "link" ? "active" : ""}
            onClick={() => setTab("link")}
          >
            <Icon name="link" size={14} /> Paste Link
          </button>
          <button
            type="button"
            className={tab === "catalog" ? "active" : ""}
            onClick={() => setTab("catalog")}
          >
            <Icon name="film" size={14} /> Pick from Catalog
          </button>
        </div>

        {tab === "link" && (
          <form onSubmit={handleSubmitLink} className="change-media-form">
            <label className="field-label">
              NEW VIDEO URL
              <input
                autoFocus
                value={source}
                onChange={e => setSource(e.target.value)}
                placeholder="Paste YouTube, Instagram Reel, direct MP4/HLS, or streaming link"
                aria-invalid={Boolean(source) && !validSource}
              />
            </label>

            <label className="field-label">
              TITLE (OPTIONAL)
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. My Favorite Movie or Clip"
                maxLength={80}
              />
            </label>

            <div className="quick-source-pills">
              <span>Quick suggestions:</span>
              <button
                type="button"
                onClick={() => {
                  setTitle("Blender Nature Short");
                  setSource("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
                }}
              >
                YouTube Trailer
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle("Instagram Reel");
                  setSource("https://www.instagram.com/reel/BsOGulcndj-/");
                }}
              >
                Instagram Reel
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitle("Big Buck Bunny");
                  setSource("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4");
                }}
              >
                Direct MP4
              </button>
            </div>

            {source && !validSource && (
              <p className="source-error">Use a valid YouTube link, Instagram Reel link, direct .mp4/.webm/.m3u8, or streaming link.</p>
            )}
            {mixedContent && (
              <p className="source-error">This HTTPS page cannot play insecure HTTP video. Use an HTTPS media URL.</p>
            )}

            {provider === "youtube" && (
              <div className="provider-detected-badge">
                <Icon name="play" size={13} />
                <span>Detected: YouTube Video · Embedded player with full room synchronization</span>
              </div>
            )}
            {provider === "instagram" && (
              <div className="provider-detected-badge">
                <Icon name="device" size={13} />
                <span>Detected: Instagram Reel · Reels player with synchronized countdown and clock</span>
              </div>
            )}
            {provider === "external" && (
              <div className="provider-detected-badge">
                <Icon name="external" size={13} />
                <span>Detected: {platform?.name || "Streaming"} · Synchronized companion clock &amp; ready check</span>
              </div>
            )}
            {(provider === "url" || provider === "hls") && validSource && (
              <div className="provider-detected-badge">
                <Icon name="film" size={13} />
                <span>Detected: Direct Video Stream · Full hardware acceleration &amp; sync</span>
              </div>
            )}

            <button type="submit" className="primary-action" disabled={!canSubmit}>
              Update Video for Everyone <Icon name="arrow" />
            </button>
          </form>
        )}

        {tab === "catalog" && (
          <div className="change-media-catalog">
            <div className="catalog-search-bar">
              <Icon name="search" size={14} />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search movies, trailers, and open media..."
              />
            </div>
            <div className="catalog-mini-grid">
              {catalogPicks.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="catalog-mini-card"
                  onClick={() => handleSelectCatalog(item)}
                >
                  <img src={item.poster || "/catalog/posters/big-buck-bunny.svg"} alt="" />
                  <div className="mini-card-info">
                    <strong>{item.title}</strong>
                    <span>{item.category} {item.year ? `· ${item.year}` : ""}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

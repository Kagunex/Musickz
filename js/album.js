import { browse } from './api.js';
import { lazyImg, PlayerState } from './app.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function load() {
  const id = new URLSearchParams(location.search).get('id');
  const root = document.getElementById('detail-root');
  if (!id || !root) return;

  root.innerHTML = `<div class="skeleton" style="width:200px;height:200px;margin:0 auto 1rem;border-radius:16px"></div>
    <div class="skeleton" style="height:28px;width:60%;margin:0 auto 8px"></div>
    <div class="skeleton" style="height:18px;width:40%;margin:0 auto 24px"></div>`;

  try {
    const data = await browse(id);
    const header = data.header || {};
    const tracks = data.sections?.find((s) => s.type === 'tracks' || s.items?.[0]?.type === 'song')?.items || [];
    const songTracks = tracks.filter((t) => t.videoId);

    root.innerHTML = `
      <div class="detail-header fade-in">
        <div class="art">${lazyImg(header.artwork, header.title)}</div>
        <h1>${escapeHtml(header.title || 'Album')}</h1>
        <p class="sub">${escapeHtml(header.subtitle || '')}</p>
        <p class="meta">${escapeHtml(header.description || '')}</p>
      </div>
      <div class="detail-actions">
        <button class="btn btn-primary" id="btn-play-all">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Play
        </button>
        <button class="btn btn-ghost" id="btn-shuffle">Shuffle</button>
      </div>
      <div class="track-list">
        ${songTracks
          .map(
            (t, i) => `
          <div class="track-item" data-idx="${i}">
            <span class="num">${i + 1}</span>
            <div class="art">${lazyImg(t.artwork, t.title)}</div>
            <div class="info">
              <div class="song-title">${escapeHtml(t.title)}</div>
              <div class="meta-text">${escapeHtml(t.artist)}</div>
            </div>
            <span class="dur">${escapeHtml(t.duration || '')}</span>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    document.getElementById('btn-play-all')?.addEventListener('click', () => {
      if (songTracks[0]) PlayerState.playSong(songTracks[0], songTracks);
    });
    document.getElementById('btn-shuffle')?.addEventListener('click', () => {
      const shuffled = [...songTracks].sort(() => Math.random() - 0.5);
      if (shuffled[0]) PlayerState.playSong(shuffled[0], shuffled);
    });
    root.querySelectorAll('.track-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        PlayerState.playSong(songTracks[idx], songTracks);
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="state-block"><h3>Could not load album</h3><p>${escapeHtml(err.message)}</p>
      <button class="btn btn-primary" style="margin-top:1rem" onclick="location.reload()">Retry</button></div>`;
  }
}

document.addEventListener('DOMContentLoaded', load);

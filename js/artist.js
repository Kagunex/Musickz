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

  root.innerHTML = `<div class="skeleton" style="width:160px;height:160px;margin:0 auto 1rem;border-radius:50%"></div>
    <div class="skeleton" style="height:28px;width:50%;margin:0 auto 24px"></div>`;

  try {
    const data = await browse(id);
    const header = data.header || {};
    const popular = data.sections?.find((s) => s.items?.[0]?.type === 'song')?.items?.filter((t) => t.videoId) || [];
    const albums = data.sections?.flatMap((s) => s.items?.filter((i) => i.type === 'album') || []) || [];

    root.innerHTML = `
      <div class="detail-header fade-in">
        <div class="art" style="border-radius:50%">${lazyImg(header.artwork, header.title)}</div>
        <h1>${escapeHtml(header.title || 'Artist')}</h1>
        <p class="sub">${escapeHtml(header.subtitle || '')}</p>
      </div>
      <div class="detail-actions">
        <button class="btn btn-primary" id="btn-play-all">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Play
        </button>
      </div>
      ${
        popular.length
          ? `<section class="section"><h2 class="section-title">Popular</h2>
        <div class="track-list">
          ${popular
            .slice(0, 10)
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
        </div></section>`
          : ''
      }
      ${
        albums.length
          ? `<section class="section"><h2 class="section-title">Albums</h2>
        <div class="carousel">
          ${albums
            .slice(0, 12)
            .map(
              (a) => `
            <a href="/album?id=${a.id || a.browseId}" class="media-card">
              <div class="art">${lazyImg(a.artwork, a.title)}</div>
              <div class="title">${escapeHtml(a.title)}</div>
              <div class="sub">${escapeHtml(a.artist || '')}</div>
            </a>
          `
            )
            .join('')}
        </div></section>`
          : ''
      }
    `;

    document.getElementById('btn-play-all')?.addEventListener('click', () => {
      if (popular[0]) PlayerState.playSong(popular[0], popular);
    });
    root.querySelectorAll('.track-item').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        PlayerState.playSong(popular[idx], popular);
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="state-block"><h3>Could not load artist</h3><p>${escapeHtml(err.message)}</p>
      <button class="btn btn-primary" style="margin-top:1rem" onclick="location.reload()">Retry</button></div>`;
  }
}

document.addEventListener('DOMContentLoaded', load);

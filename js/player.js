import { player, next } from './api.js';
import { lazyImg, showToast, PlayerState } from './app.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function loadPlayer() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) {
    document.getElementById('player-root').innerHTML = `<div class="state-block"><h3>No track selected</h3></div>`;
    return;
  }

  const root = document.getElementById('player-root');

  try {
    const [data, nextData] = await Promise.all([
      player(id).catch(() => null),
      next(id).catch(() => ({ queue: [] })),
    ]);

    const song = data || {
      videoId: id,
      title: 'Unknown',
      artist: 'Unknown Artist',
      artwork: null,
      durationSeconds: 0,
      available: false,
    };

    root.innerHTML = `
      <div class="player-top">
        <button class="btn-icon" id="player-back" aria-label="Back">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <span class="label">Now Playing</span>
        <button class="btn-icon" aria-label="More">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>
      </div>

      <div class="player-artwork-wrap">
        <div class="player-artwork">${lazyImg(song.artwork, song.title)}</div>
      </div>

      <div class="player-meta">
        <h1>${escapeHtml(song.title)}</h1>
        <p>${escapeHtml(song.artist)}</p>
      </div>

      <div class="player-progress">
        <div class="progress-bar" id="progress-bar">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
        <div class="progress-times">
          <span id="time-current">0:00</span>
          <span id="time-duration">${formatTime(song.durationSeconds)}</span>
        </div>
      </div>

      <div class="player-controls">
        <button class="ctrl-btn" id="btn-shuffle" aria-label="Shuffle">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h12"/></svg>
        </button>
        <button class="ctrl-btn" id="btn-prev" aria-label="Previous">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 20 9 12l10-8v16z"/><rect x="5" y="4" width="2" height="16"/></svg>
        </button>
        <button class="ctrl-btn play" data-play-icon id="btn-play" aria-label="Play">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="ctrl-btn" id="btn-next" aria-label="Next">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="m5 4 10 8-10 8V4z"/><rect x="17" y="4" width="2" height="16"/></svg>
        </button>
        <button class="ctrl-btn" id="btn-repeat" aria-label="Repeat">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
        </button>
      </div>

      <div class="queue-section">
        <h3>Up Next</h3>
        <div id="queue-list"></div>
      </div>
    `;

    const queue = nextData.queue?.length ? nextData.queue : [song];
    const queueEl = document.getElementById('queue-list');
    if (queueEl) {
      queueEl.innerHTML = queue
        .slice(0, 15)
        .map(
          (s) => `
        <div class="queue-item" data-play='${JSON.stringify(s).replace(/'/g, '&#39;')}'>
          <div class="art">${lazyImg(s.artwork, s.title)}</div>
          <div class="info">
            <div class="song-title">${escapeHtml(s.title)}</div>
            <div class="meta-text">${escapeHtml(s.artist)}</div>
          </div>
        </div>
      `
        )
        .join('');
      queueEl.querySelectorAll('[data-play]').forEach((el) => {
        el.addEventListener('click', () => {
          try {
            PlayerState.playSong(JSON.parse(el.getAttribute('data-play')), queue);
          } catch {}
        });
      });
    }

    document.getElementById('player-back')?.addEventListener('click', () => history.back());
    document.getElementById('btn-play')?.addEventListener('click', () => PlayerState.toggle());
    document.getElementById('btn-next')?.addEventListener('click', () => PlayerState.next());
    document.getElementById('btn-prev')?.addEventListener('click', () => PlayerState.prev());

    // Seek
    const bar = document.getElementById('progress-bar');
    bar?.addEventListener('click', (e) => {
      if (!PlayerState.audio?.duration) return;
      const rect = bar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      PlayerState.audio.currentTime = pct * PlayerState.audio.duration;
    });

    // Start playback
    await PlayerState.playSong(song, queue);
  } catch (err) {
    root.innerHTML = `
      <div class="state-block">
        <h3>Playback unavailable</h3>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="history.back()">Go back</button>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', loadPlayer);

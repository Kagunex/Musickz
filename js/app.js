/**
 * Shared app utilities, player state, library (localStorage)
 */

const STORAGE_KEY = 'musickx_library';
const RECENT_KEY = 'musickx_recent';

export function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function showToast(msg, ms = 2800) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), ms);
}

export function artFallback(img) {
  img.onerror = () => {
    img.style.display = 'none';
    const parent = img.parentElement;
    if (parent && !parent.querySelector('.art-fallback')) {
      const fb = document.createElement('div');
      fb.className = 'art-fallback';
      fb.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      parent.appendChild(fb);
    }
  };
}

export function lazyImg(src, alt = '') {
  if (!src) return `<div class="art-fallback"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
  return `<img src="${src}" alt="${alt}" loading="lazy" decoding="async" onerror="this.style.display='none';this.parentElement.innerHTML='<div class=\\'art-fallback\\'><svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'24\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><path d=\\'M9 18V5l12-2v13\\'/><circle cx=\\'6\\' cy=\\'18\\' r=\\'3\\'/><circle cx=\\'18\\' cy=\\'16\\' r=\\'3\\'/></svg></div>'">`;
}

/* ---------- Library (localStorage) ---------- */

export function getLibrary() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"songs":[],"albums":[],"artists":[],"playlists":[]}');
  } catch {
    return { songs: [], albums: [], artists: [], playlists: [] };
  }
}

export function saveLibrary(lib) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
}

export function addToLibrary(type, item) {
  const lib = getLibrary();
  const key = type + 's';
  if (!lib[key]) lib[key] = [];
  const id = item.videoId || item.id || item.browseId;
  if (!lib[key].some((x) => (x.videoId || x.id || x.browseId) === id)) {
    lib[key].unshift(item);
    saveLibrary(lib);
    showToast('Added to Library');
  }
}

/* ---------- Recently played ---------- */

export function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function pushRecent(song) {
  if (!song?.videoId) return;
  let list = getRecent().filter((s) => s.videoId !== song.videoId);
  list.unshift({
    videoId: song.videoId,
    title: song.title,
    artist: song.artist,
    artwork: song.artwork,
  });
  list = list.slice(0, 30);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

/* ---------- Global player state (simple) ---------- */

export const PlayerState = {
  current: null,
  queue: [],
  audio: null,
  playing: false,

  init() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('error', () => {
      showToast('Playback error');
      this.playing = false;
      this.updateUI();
    });
  },

  async playSong(song, queue = []) {
    this.init();
    this.current = song;
    this.queue = queue.length ? queue : [song];
    pushRecent(song);
    this.updateMiniPlayer();
    this.updateUI();

    try {
      const { player } = await import('./api.js');
      const data = await player(song.videoId);
      if (!data.streamUrl) {
        showToast(data.reason || 'Stream unavailable in this prototype');
        return;
      }
      this.audio.src = data.streamUrl;
      await this.audio.play();
      this.playing = true;
      this.updateUI();
    } catch (err) {
      showToast(err.message || 'Could not play track');
      this.playing = false;
      this.updateUI();
    }
  },

  toggle() {
    if (!this.audio || !this.current) return;
    if (this.playing) {
      this.audio.pause();
      this.playing = false;
    } else {
      this.audio.play().catch(() => showToast('Playback failed'));
      this.playing = true;
    }
    this.updateUI();
  },

  next() {
    if (!this.current || !this.queue.length) return;
    const idx = this.queue.findIndex((s) => s.videoId === this.current.videoId);
    const next = this.queue[idx + 1] || this.queue[0];
    if (next) this.playSong(next, this.queue);
  },

  prev() {
    if (!this.audio) return;
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }
    const idx = this.queue.findIndex((s) => s.videoId === this.current?.videoId);
    const prev = this.queue[idx - 1];
    if (prev) this.playSong(prev, this.queue);
  },

  onTimeUpdate() {
    const pct = this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0;
    document.querySelectorAll('.mini-progress, .progress-fill').forEach((el) => {
      el.style.width = `${pct}%`;
    });
    const cur = document.getElementById('time-current');
    const dur = document.getElementById('time-duration');
    if (cur) cur.textContent = formatTime(this.audio.currentTime);
    if (dur) dur.textContent = formatTime(this.audio.duration);
  },

  onEnded() {
    this.next();
  },

  updateMiniPlayer() {
    const mini = document.getElementById('mini-player');
    if (!mini || !this.current) return;
    mini.classList.remove('hidden');
    const art = mini.querySelector('.mini-art');
    const title = mini.querySelector('.song-title');
    const artist = mini.querySelector('.meta-text');
    if (art) art.innerHTML = lazyImg(this.current.artwork, this.current.title);
    if (title) title.textContent = this.current.title;
    if (artist) artist.textContent = this.current.artist;
  },

  updateUI() {
    document.querySelectorAll('[data-play-icon]').forEach((btn) => {
      const isPlay = !this.playing;
      btn.innerHTML = isPlay
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    });
  },
};

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/* Wire mini-player & nav on every page */
document.addEventListener('DOMContentLoaded', () => {
  PlayerState.init();
  PlayerState.updateMiniPlayer();

  const mini = document.getElementById('mini-player');
  if (mini) {
    mini.addEventListener('click', (e) => {
      if (e.target.closest('[data-mini-play]')) {
        e.stopPropagation();
        PlayerState.toggle();
        return;
      }
      if (e.target.closest('[data-mini-next]')) {
        e.stopPropagation();
        PlayerState.next();
        return;
      }
      if (PlayerState.current) {
        window.location.href = `/player?id=${PlayerState.current.videoId}`;
      }
    });
  }
});

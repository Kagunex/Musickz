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

/* ---------- Error message mapping ---------- */

function friendlyPlaybackError(err) {
  const code = err?.code || '';
  const map = {
    LOGIN_REQUIRED: 'Playback requires sign-in for this track.',
    NO_AUDIO_STREAM: 'No playable audio stream is available.',
    STREAM_REQUIRES_ADDITIONAL_PROCESSING:
      'This track cannot be played by the current web player.',
    PLAYBACK_UNAVAILABLE: 'Playback is currently unavailable for this track.',
    UPSTREAM_ERROR: 'Music service temporarily unavailable. Try again.',
    NETWORK_ERROR: 'Network error. Check your connection and try again.',
    MEDIA_ERROR: 'Media playback failed. Try another track.',
    STREAM_EXPIRED: 'Stream expired. Retrying…',
    AUTOPLAY_BLOCKED: 'Tap Play to start playback',
    INVALID_ID: 'Invalid track ID.',
  };
  if (map[code]) return map[code];
  return err?.message || 'Could not play track';
}

function isValidStreamUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/* ---------- Global player state (simple) ---------- */

export const PlayerState = {
  current: null,
  queue: [],
  audio: null,
  playing: false,
  _retryCount: 0,
  _maxRetries: 1,
  _lastError: null,

  init() {
    if (this.audio) return;
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    this.audio.addEventListener('timeupdate', () => this.onTimeUpdate());
    this.audio.addEventListener('ended', () => this.onEnded());
    this.audio.addEventListener('error', () => this.onAudioError());
    this.audio.addEventListener('stalled', () => {
      // soft signal – do not treat as hard failure immediately
    });
    this.audio.addEventListener('waiting', () => {
      // buffering
    });
    this.audio.addEventListener('canplay', () => {
      // ready
    });
    this.audio.addEventListener('loadedmetadata', () => {
      this.onTimeUpdate();
    });
  },

  /**
   * Play a song.
   * @param {object} song - track metadata
   * @param {array} queue - optional queue
   * @param {object|null} playbackData - optional pre-fetched /api/player response
   */
  async playSong(song, queue = [], playbackData = null) {
    this.init();
    this.current = song;
    this.queue = queue.length ? queue : [song];
    this._retryCount = 0;
    this._lastError = null;
    this.updateMiniPlayer();
    this.updateUI();

    try {
      let data = playbackData;

      // Use pre-fetched data only if it has a usable stream
      if (!data || !isValidStreamUrl(data.streamUrl)) {
        const { player } = await import('./api.js');
        data = await player(song.videoId);
      }

      if (!data || !isValidStreamUrl(data.streamUrl)) {
        const reason =
          data?.reason ||
          (data?.errorCode ? friendlyPlaybackError({ code: data.errorCode }) : null) ||
          'Stream unavailable';
        showToast(reason);
        this.playing = false;
        this.updateUI();
        return;
      }

      // Enrich current song with metadata from player response
      if (data.title) this.current.title = data.title;
      if (data.artist) this.current.artist = data.artist;
      if (data.artwork) this.current.artwork = data.artwork;
      if (data.durationSeconds) this.current.durationSeconds = data.durationSeconds;
      this.updateMiniPlayer();

      // Assign stream and load before play – never mark playing until play() resolves
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.src = data.streamUrl;
      this.audio.load();
      try {
        await this.audio.play();
        this.playing = true;
        pushRecent(this.current);
        this.updateUI();
      } catch (playErr) {
        if (playErr?.name === 'NotAllowedError') {
          // Stream is loaded; user must tap Play (browser autoplay policy)
          this.playing = false;
          this._lastError = { code: 'AUTOPLAY_BLOCKED' };
          showToast('Tap Play to start playback');
          this.updateUI();
          return;
        }
        throw playErr;
      }
    } catch (err) {
      this._lastError = err;
      showToast(friendlyPlaybackError(err));
      this.playing = false;
      this.updateUI();
    }
  },

  onAudioError() {
    const mediaErr = this.audio?.error;
    let code = 'UNKNOWN_PLAYBACK_ERROR';
    if (mediaErr) {
      // MEDIA_ERR_NETWORK = 2, MEDIA_ERR_SRC_NOT_SUPPORTED = 4, etc.
      if (mediaErr.code === 2) code = 'NETWORK_ERROR';
      else if (mediaErr.code === 4 || mediaErr.code === 3) code = 'MEDIA_ERROR';
      else if (mediaErr.code === 1) code = 'MEDIA_ERROR';
    }

    // One retry for possible expired stream
    if (this._retryCount < this._maxRetries && this.current?.videoId) {
      this._retryCount += 1;
      const song = this.current;
      const queue = this.queue;
      // Force fresh request (no playbackData)
      this.playSong(song, queue, null);
      return;
    }

    this.playing = false;
    this.updateUI();
    showToast(friendlyPlaybackError({ code }));
  },

  toggle() {
    if (!this.audio || !this.current) return;
    if (this.playing) {
      this.audio.pause();
      this.playing = false;
    } else {
      this.audio
        .play()
        .then(() => {
          this.playing = true;
          this.updateUI();
        })
        .catch((err) => {
          if (err?.name === 'NotAllowedError') {
            showToast('Tap Play to start playback');
          } else if (!this.audio.src) {
            // No src yet – try full playSong again
            this.playSong(this.current, this.queue);
            return;
          } else {
            showToast(friendlyPlaybackError(err));
          }
          this.playing = false;
          this.updateUI();
        });
      return;
    }
    this.updateUI();
  },

  next() {
    if (!this.current || !this.queue.length) return;
    const idx = this.queue.findIndex((s) => s.videoId === this.current.videoId);
    const next = this.queue[idx + 1] || this.queue[0];
    if (next && next.videoId !== this.current.videoId) {
      this.playSong(next, this.queue);
    } else if (next) {
      // single-item queue – restart
      this.playSong(next, this.queue);
    }
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
    if (dur && this.audio.duration) dur.textContent = formatTime(this.audio.duration);
    const dpCur = document.getElementById('dp-time-cur');
    const dpDur = document.getElementById('dp-time-dur');
    if (dpCur) dpCur.textContent = formatTime(this.audio.currentTime);
    if (dpDur && this.audio.duration) dpDur.textContent = formatTime(this.audio.duration);
  },

  onEnded() {
    this.next();
  },

  updateMiniPlayer() {
    const mini = document.getElementById('mini-player');
    if (mini && this.current) {
      mini.classList.remove('hidden');
      const art = mini.querySelector('.mini-art');
      const title = mini.querySelector('.song-title');
      const artist = mini.querySelector('.meta-text');
      if (art) art.innerHTML = lazyImg(this.current.artwork, this.current.title);
      if (title) title.textContent = this.current.title;
      if (artist) artist.textContent = this.current.artist;
    }

    // Desktop player bar
    const dp = document.getElementById('desktop-player');
    if (dp && this.current) {
      const art = dp.querySelector('.dp-art');
      const title = dp.querySelector('.dp-info .song-title');
      const artist = dp.querySelector('.dp-info .meta-text');
      if (art) art.innerHTML = lazyImg(this.current.artwork, this.current.title);
      if (title) title.textContent = this.current.title;
      if (artist) artist.textContent = this.current.artist;
    }
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

  // Desktop player controls
  document.querySelectorAll('[data-dp-prev]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      PlayerState.prev();
    });
  });

  const dpBar = document.getElementById('dp-progress-bar');
  if (dpBar) {
    dpBar.addEventListener('click', (e) => {
      if (!PlayerState.audio?.duration) return;
      const rect = dpBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      PlayerState.audio.currentTime = pct * PlayerState.audio.duration;
    });
  }

  // Click on desktop track info opens full player
  const dp = document.getElementById('desktop-player');
  if (dp) {
    dp.querySelector('.dp-left')?.addEventListener('click', () => {
      if (PlayerState.current) {
        window.location.href = `/player?id=${PlayerState.current.videoId}`;
      }
    });
  }
});

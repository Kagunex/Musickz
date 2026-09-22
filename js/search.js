import { search, suggestions } from './api.js';
import { lazyImg, showToast, PlayerState } from './app.js';

let debounceTimer = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSuggestions(list) {
  const el = document.getElementById('suggestions');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = list
    .map(
      (s) => `
    <button class="suggestion-item" data-q="${escapeHtml(s)}">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      ${escapeHtml(s)}
    </button>
  `
    )
    .join('');

  el.querySelectorAll('[data-q]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-q');
      document.getElementById('search-input').value = q;
      doSearch(q);
    });
  });
}

function songRow(s) {
  return `
    <div class="list-row" data-play='${JSON.stringify(s).replace(/'/g, '&#39;')}'>
      <div class="art">${lazyImg(s.artwork, s.title)}</div>
      <div class="info">
        <div class="song-title">${escapeHtml(s.title)}</div>
        <div class="meta-text">${escapeHtml(s.artist)}</div>
      </div>
    </div>
  `;
}

function artistRow(a) {
  return `
    <a href="/artist?id=${a.id || a.browseId}" class="list-row">
      <div class="art" style="border-radius:50%">${lazyImg(a.artwork, a.name)}</div>
      <div class="info">
        <div class="song-title">${escapeHtml(a.name)}</div>
        <div class="meta-text">${escapeHtml(a.subtitle || 'Artist')}</div>
      </div>
    </a>
  `;
}

function albumCard(a) {
  return `
    <a href="/album?id=${a.id || a.browseId}" class="music-card">
      <div class="art-wrap">${lazyImg(a.artwork, a.title)}</div>
      <div class="title">${escapeHtml(a.title)}</div>
      <div class="sub">${escapeHtml(a.artist || '')}</div>
    </a>
  `;
}

function playlistCard(p) {
  return `
    <a href="/playlist?id=${p.id || p.browseId}" class="music-card">
      <div class="art-wrap">${lazyImg(p.artwork, p.title)}</div>
      <div class="title">${escapeHtml(p.title)}</div>
      <div class="sub">${escapeHtml(p.description || 'Playlist')}</div>
    </a>
  `;
}

async function doSearch(q) {
  const results = document.getElementById('results');
  const sug = document.getElementById('suggestions');
  if (sug) sug.innerHTML = '';
  if (!q.trim()) {
    results.innerHTML = '';
    return;
  }

  results.innerHTML = `
    <div class="skeleton" style="height:24px;width:80px;margin-bottom:12px"></div>
    ${[1, 2, 3, 4].map(() => `<div class="skeleton" style="height:56px;margin-bottom:8px;border-radius:8px"></div>`).join('')}
  `;

  try {
    const data = await search(q);
    let html = '';

    if (data.songs?.length) {
      html += `<section class="result-section fade-in"><h2>Songs</h2>${data.songs.slice(0, 20).map(songRow).join('')}</section>`;
    }
    if (data.artists?.length) {
      html += `<section class="result-section fade-in"><h2>Artists</h2><div class="artist-list">${data.artists.slice(0, 10).map(artistRow).join('')}</div></section>`;
    }
    if (data.albums?.length) {
      html += `<section class="result-section fade-in"><h2>Albums</h2><div class="carousel">${data.albums.slice(0, 12).map(albumCard).join('')}</div></section>`;
    }
    if (data.playlists?.length) {
      html += `<section class="result-section fade-in"><h2>Playlists</h2><div class="carousel">${data.playlists.slice(0, 12).map(playlistCard).join('')}</div></section>`;
    }

    if (!html) {
      html = `<div class="state-block"><h3>No results</h3><p>Try a different search term.</p></div>`;
    }

    results.innerHTML = html;

    results.querySelectorAll('[data-play]').forEach((el) => {
      el.addEventListener('click', () => {
        try {
          const song = JSON.parse(el.getAttribute('data-play'));
          PlayerState.playSong(song, data.songs || []);
        } catch {}
      });
    });
  } catch (err) {
    results.innerHTML = `
      <div class="state-block">
        <h3>Search failed</h3>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn btn-primary" style="margin-top:1rem" id="retry-search">Retry</button>
      </div>
    `;
    document.getElementById('retry-search')?.addEventListener('click', () => doSearch(q));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('search-input');
  if (!input) return;

  input.focus();

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 2) {
      document.getElementById('suggestions').innerHTML = '';
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const list = await suggestions(q);
        renderSuggestions(list);
      } catch {
        renderSuggestions([]);
      }
    }, 280);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      doSearch(input.value.trim());
    }
  });

  // Pre-fill from URL
  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  if (q) {
    input.value = q;
    doSearch(q);
  }
});

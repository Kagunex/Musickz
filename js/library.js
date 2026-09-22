import { getLibrary, getRecent, lazyImg, PlayerState } from './app.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function render() {
  const lib = getLibrary();
  const tab = document.querySelector('.lib-tab.active')?.dataset.tab || 'songs';
  const content = document.getElementById('lib-content');
  if (!content) return;

  // Merge recently played into songs view as extra section
  const recent = getRecent();
  const items = lib[tab] || [];

  if (!items.length && !(tab === 'songs' && recent.length)) {
    content.innerHTML = `
      <div class="state-block">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
        <h3>Your Library is empty</h3>
        <p>Songs, albums and playlists you save will appear here.</p>
        <a href="/search" class="btn btn-primary" style="margin-top:1rem">Explore Music</a>
      </div>
    `;
    return;
  }

  if (tab === 'songs') {
    let html = '';
    if (recent.length) {
      html += `<div class="section-header"><h2 class="section-title" style="font-size:1rem">Recently Played</h2></div>`;
      html += recent
        .slice(0, 10)
        .map(
          (s) => `
        <div class="list-row" data-play='${JSON.stringify(s).replace(/'/g, '&#39;')}'>
          <div class="art">${lazyImg(s.artwork, s.title)}</div>
          <div class="info">
            <div class="song-title">${escapeHtml(s.title)}</div>
            <div class="meta-text">${escapeHtml(s.artist)}</div>
          </div>
        </div>`
        )
        .join('');
    }
    if (items.length) {
      html += `<div class="section-header" style="margin-top:1.5rem"><h2 class="section-title" style="font-size:1rem">Liked Songs</h2></div>`;
      html += items
        .map(
          (s) => `
        <div class="list-row" data-play='${JSON.stringify(s).replace(/'/g, '&#39;')}'>
          <div class="art">${lazyImg(s.artwork, s.title)}</div>
          <div class="info">
            <div class="song-title">${escapeHtml(s.title)}</div>
            <div class="meta-text">${escapeHtml(s.artist)}</div>
          </div>
        </div>`
        )
        .join('');
    }
    content.innerHTML = html;
    content.querySelectorAll('[data-play]').forEach((el) => {
      el.addEventListener('click', () => {
        try {
          PlayerState.playSong(JSON.parse(el.getAttribute('data-play')), items.length ? items : recent);
        } catch {}
      });
    });
  } else if (tab === 'artists') {
    content.innerHTML = items
      .map(
        (a) => `
      <a href="/artist?id=${a.id || a.browseId}" class="list-row">
        <div class="art" style="border-radius:50%">${lazyImg(a.artwork, a.name)}</div>
        <div class="info"><div class="song-title">${escapeHtml(a.name)}</div><div class="meta-text">Artist</div></div>
      </a>`
      )
      .join('');
  } else {
    content.innerHTML = `<div class="carousel" style="flex-wrap:wrap;overflow:visible">${items
      .map(
        (a) => `
      <a href="/${tab === 'albums' ? 'album' : 'playlist'}?id=${a.id || a.browseId}" class="music-card">
        <div class="art-wrap">${lazyImg(a.artwork, a.title)}</div>
        <div class="title">${escapeHtml(a.title)}</div>
        <div class="sub">${escapeHtml(a.artist || a.description || '')}</div>
      </a>`
      )
      .join('')}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.lib-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lib-tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      render();
    });
  });
  render();
});

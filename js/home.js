import { getHome } from './api.js';
import { getGreeting, getRecent, lazyImg, showToast, PlayerState, getLibrary } from './app.js';

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

function renderSkeleton(container) {
  container.innerHTML = `
    <div class="section">
      <div class="skeleton" style="height:28px;width:160px;margin-bottom:16px"></div>
      <div class="quick-grid">
        ${[1, 2, 3, 4, 5, 6].map(() => `<div class="skeleton" style="height:64px;border-radius:4px"></div>`).join('')}
      </div>
    </div>
    <div class="section">
      <div class="skeleton" style="height:28px;width:140px;margin-bottom:16px"></div>
      <div class="carousel">
        ${[1, 2, 3, 4, 5].map(() => `<div class="skeleton" style="width:160px;height:220px;border-radius:12px;flex-shrink:0"></div>`).join('')}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function songCard(s) {
  return `
    <div class="quick-card" data-play='${JSON.stringify(s).replace(/'/g, '&#39;')}'>
      <div class="art">${lazyImg(s.artwork, s.title)}</div>
      <div class="info">
        <div class="song-title">${escapeHtml(s.title)}</div>
        <div class="meta-text">${escapeHtml(s.artist)}</div>
      </div>
      <button class="play-btn" aria-label="Play ${escapeHtml(s.title)}">${PLAY_SVG}</button>
    </div>
  `;
}

function recentItem(s) {
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

function musicCard(item) {
  const isSong = item.type === 'song' && item.videoId;
  const link =
    item.type === 'artist'
      ? `/artist?id=${item.id || item.browseId}`
      : item.type === 'album'
        ? `/album?id=${item.id || item.browseId}`
        : item.type === 'playlist'
          ? `/playlist?id=${item.id || item.browseId}`
          : isSong
            ? `/player?id=${item.videoId}`
            : '#';

  const playAttr = isSong
    ? `data-play='${JSON.stringify(item).replace(/'/g, '&#39;')}'`
    : '';

  return `
    <div class="music-card" ${playAttr} ${!isSong ? `onclick="location.href='${link}'"` : ''}>
      <div class="art-wrap">
        ${lazyImg(item.artwork, item.title || item.name)}
        ${isSong ? `<button class="play-btn" aria-label="Play">${PLAY_SVG}</button>` : ''}
      </div>
      <div class="title">${escapeHtml(item.title || item.name)}</div>
      <div class="sub">${escapeHtml(item.artist || item.subtitle || item.description || '')}</div>
    </div>
  `;
}

function artistCard(a) {
  return `
    <a href="/artist?id=${a.id || a.browseId}" class="artist-card">
      <div class="avatar">${lazyImg(a.artwork, a.name)}</div>
      <div class="name">${escapeHtml(a.name)}</div>
      <div class="role">Artist</div>
    </a>
  `;
}

function mediaCard(item) {
  return musicCard(item);
}

function artistCircle(a) {
  return artistCard(a);
}

function sectionHtml(title, body, seeAllHref) {
  return `
    <section class="section fade-in">
      <div class="section-header">
        <h2 class="section-title">${escapeHtml(title)}</h2>
        ${seeAllHref ? `<a href="${seeAllHref}" class="see-all">Show all</a>` : ''}
      </div>
      ${body}
    </section>
  `;
}

function bindPlayHandlers(root) {
  root.querySelectorAll('[data-play]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const song = JSON.parse(el.getAttribute('data-play'));
        PlayerState.playSong(song);
      } catch {}
    });
  });
}

async function loadHome() {
  const content = document.getElementById('home-content');
  if (!content) return;

  document.getElementById('greeting').textContent = getGreeting();

  // Sidebar playlists from library
  try {
    const lib = getLibrary();
    const plEl = document.getElementById('sidebar-playlists');
    if (plEl && lib.playlists?.length) {
      plEl.innerHTML = lib.playlists
        .slice(0, 20)
        .map(
          (p) =>
            `<a href="/playlist?id=${p.id || p.browseId}">${escapeHtml(p.title || p.name || 'Playlist')}</a>`
        )
        .join('');
    }
  } catch {}

  // Recent from localStorage
  const recent = getRecent();
  if (recent.length) {
    const recentEl = document.getElementById('recent-section');
    if (recentEl) {
      recentEl.style.display = 'block';
      recentEl.querySelector('.recent-list').innerHTML = recent
        .slice(0, 6)
        .map(recentItem)
        .join('');
      bindPlayHandlers(recentEl);
    }
  }

  renderSkeleton(content);

  try {
    const data = await getHome();
    let html = '';
    let songBucket = [];
    let artistBucket = [];
    let albumBucket = [];
    let playlistBucket = [];

    if (data.sections?.length) {
      for (const sec of data.sections) {
        if (!sec.items?.length) continue;
        const songs = sec.items.filter((i) => i.type === 'song' && i.videoId);
        const artists = sec.items.filter((i) => i.type === 'artist');
        const albums = sec.items.filter((i) => i.type === 'album');
        const playlists = sec.items.filter((i) => i.type === 'playlist');
        const media = sec.items.filter((i) => i.type === 'album' || i.type === 'playlist');

        songBucket.push(...songs);
        artistBucket.push(...artists);
        albumBucket.push(...albums);
        playlistBucket.push(...playlists);

        if (songs.length && sec.type !== 'tracks') {
          html += sectionHtml(
            sec.title || 'Quick Picks',
            `<div class="quick-grid">${songs.slice(0, 6).map(songCard).join('')}</div>`
          );
        } else if (artists.length) {
          html += sectionHtml(
            sec.title || 'Popular Artists',
            `<div class="carousel">${artists.slice(0, 12).map(artistCard).join('')}</div>`
          );
        } else if (media.length) {
          html += sectionHtml(
            sec.title || 'Albums & Playlists',
            `<div class="carousel">${media.slice(0, 12).map(musicCard).join('')}</div>`
          );
        } else if (songs.length) {
          html += sectionHtml(
            sec.title || 'Songs',
            `<div class="recent-list">${songs.slice(0, 10).map(recentItem).join('')}</div>`
          );
        }
      }
    }

    // Extra derived sections if sparse
    if (!html && songBucket.length) {
      html += sectionHtml(
        'Popular Songs',
        `<div class="quick-grid">${songBucket.slice(0, 6).map(songCard).join('')}</div>`
      );
    }

    if (!html) {
      html = `
        <div class="state-block">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <h3>No recommendations yet</h3>
          <p>Search for songs, artists or albums to get started.</p>
          <a href="/search" class="btn btn-primary" style="margin-top:1rem">Explore Music</a>
        </div>
      `;
    }

    content.innerHTML = html;
    bindPlayHandlers(content);
  } catch (err) {
    content.innerHTML = `
      <div class="state-block">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h3>Something went wrong</h3>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', loadHome);

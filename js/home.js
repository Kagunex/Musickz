import { getHome } from './api.js';
import { getGreeting, getRecent, lazyImg, showToast, PlayerState } from './app.js';

function renderSkeleton(container) {
  container.innerHTML = `
    <div class="section">
      <div class="skeleton" style="height:28px;width:140px;margin-bottom:12px"></div>
      <div class="quick-grid">
        ${[1,2,3,4].map(() => `<div class="skeleton" style="aspect-ratio:1;border-radius:12px"></div>`).join('')}
      </div>
    </div>
    <div class="section">
      <div class="skeleton" style="height:24px;width:160px;margin-bottom:12px"></div>
      ${[1,2,3].map(() => `<div class="skeleton" style="height:56px;margin-bottom:8px;border-radius:8px"></div>`).join('')}
    </div>
  `;
}

function songCard(s) {
  return `
    <div class="quick-card" data-play='${JSON.stringify(s).replace(/'/g, '&#39;')}'>
      <div class="art">${lazyImg(s.artwork, s.title)}</div>
      <div class="info">
        <div class="song-title">${escapeHtml(s.title)}</div>
        <div class="meta-text">${escapeHtml(s.artist)}</div>
      </div>
    </div>
  `;
}

function recentItem(s) {
  return `
    <div class="recent-item" data-play='${JSON.stringify(s).replace(/'/g, '&#39;')}'>
      <div class="art">${lazyImg(s.artwork, s.title)}</div>
      <div class="info">
        <div class="song-title">${escapeHtml(s.title)}</div>
        <div class="meta-text">${escapeHtml(s.artist)}</div>
      </div>
    </div>
  `;
}

function mediaCard(item) {
  const link =
    item.type === 'artist'
      ? `/artist?id=${item.id || item.browseId}`
      : item.type === 'album'
        ? `/album?id=${item.id || item.browseId}`
        : item.type === 'playlist'
          ? `/playlist?id=${item.id || item.browseId}`
          : '#';
  return `
    <a href="${link}" class="media-card">
      <div class="art">${lazyImg(item.artwork, item.title || item.name)}</div>
      <div class="title">${escapeHtml(item.title || item.name)}</div>
      <div class="sub">${escapeHtml(item.artist || item.subtitle || item.description || '')}</div>
    </a>
  `;
}

function artistCircle(a) {
  return `
    <a href="/artist?id=${a.id || a.browseId}" class="artist-circle">
      <div class="avatar">${lazyImg(a.artwork, a.name)}</div>
      <span>${escapeHtml(a.name)}</span>
    </a>
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

async function loadHome() {
  const content = document.getElementById('home-content');
  if (!content) return;

  document.getElementById('greeting').textContent = getGreeting();

  // Recent from localStorage
  const recent = getRecent();
  if (recent.length) {
    const recentEl = document.getElementById('recent-section');
    if (recentEl) {
      recentEl.style.display = 'block';
      recentEl.querySelector('.recent-list').innerHTML = recent.slice(0, 8).map(recentItem).join('');
    }
  }

  renderSkeleton(content);

  try {
    const data = await getHome();
    let html = '';

    if (data.sections?.length) {
      for (const sec of data.sections) {
        if (!sec.items?.length) continue;
        const songs = sec.items.filter((i) => i.type === 'song' && i.videoId);
        const artists = sec.items.filter((i) => i.type === 'artist');
        const media = sec.items.filter((i) => i.type === 'album' || i.type === 'playlist');

        if (songs.length && sec.type !== 'tracks') {
          html += `
            <section class="section fade-in">
              <h2 class="section-title">${escapeHtml(sec.title)}</h2>
              <div class="quick-grid">${songs.slice(0, 6).map(songCard).join('')}</div>
            </section>
          `;
        } else if (artists.length) {
          html += `
            <section class="section fade-in">
              <h2 class="section-title">${escapeHtml(sec.title || 'Popular Artists')}</h2>
              <div class="artist-row">${artists.slice(0, 12).map(artistCircle).join('')}</div>
            </section>
          `;
        } else if (media.length) {
          html += `
            <section class="section fade-in">
              <h2 class="section-title">${escapeHtml(sec.title)}</h2>
              <div class="carousel">${media.slice(0, 12).map(mediaCard).join('')}</div>
            </section>
          `;
        } else if (songs.length) {
          html += `
            <section class="section fade-in">
              <h2 class="section-title">${escapeHtml(sec.title)}</h2>
              <div class="recent-list">${songs.slice(0, 10).map(recentItem).join('')}</div>
            </section>
          `;
        }
      }
    }

    if (!html) {
      html = `
        <div class="state-block">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <h3>No recommendations yet</h3>
          <p>Search for songs, artists or albums to get started.</p>
          <a href="/search" class="btn btn-primary" style="margin-top:1rem">Search</a>
        </div>
      `;
    }

    content.innerHTML = html;

    // Bind play handlers
    content.querySelectorAll('[data-play]').forEach((el) => {
      el.addEventListener('click', () => {
        try {
          const song = JSON.parse(el.getAttribute('data-play'));
          PlayerState.playSong(song);
        } catch {}
      });
    });

    document.getElementById('recent-section')?.querySelectorAll('[data-play]').forEach((el) => {
      el.addEventListener('click', () => {
        try {
          const song = JSON.parse(el.getAttribute('data-play'));
          PlayerState.playSong(song);
        } catch {}
      });
    });
  } catch (err) {
    content.innerHTML = `
      <div class="state-block">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h3>Could not load home</h3>
        <p>${escapeHtml(err.message)}</p>
        <button class="btn btn-primary" style="margin-top:1rem" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', loadHome);

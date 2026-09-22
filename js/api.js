/**
 * MusicKx frontend API client
 * All requests go through /api/* – never directly to music.youtube.com
 */

const API_BASE = '/api';

async function apiFetch(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, v);
  });

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const json = await res.json().catch(() => ({
    success: false,
    error: { code: 'PARSE_ERROR', message: 'Invalid response' },
  }));

  if (!json.success) {
    const err = new Error(json.error?.message || 'API error');
    err.code = json.error?.code || 'API_ERROR';
    err.status = res.status;
    throw err;
  }

  return json.data;
}

export function search(q) {
  return apiFetch(`${API_BASE}/search`, { q });
}

export function browse(id) {
  return apiFetch(`${API_BASE}/browse`, { id });
}

export function player(id) {
  return apiFetch(`${API_BASE}/player`, { id });
}

export function next(id) {
  return apiFetch(`${API_BASE}/next`, { id });
}

export function suggestions(q) {
  return apiFetch(`${API_BASE}/suggestions`, { q });
}

export function getHome() {
  // YouTube Music home browse id
  return browse('FEmusic_home');
}

/**
 * InnerTube-compatible client for YouTube Music
 * Inspired by Metrolist + InnerTubeX automatic client fallback.
 * Frontend must NEVER call music.youtube.com directly.
 */

const {
  API_BASE,
  API_KEY,
  FALLBACK_ORDER,
  buildContext,
  buildHeaders,
  CLIENTS,
} = require('./clients');

const DEFAULT_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Core POST to youtubei/v1/{endpoint}
 * Tries clients in FALLBACK_ORDER until one succeeds with usable data.
 */
async function innertubeRequest(endpoint, bodyExtra = {}, preferredClient = null) {
  const order = preferredClient
    ? [preferredClient, ...FALLBACK_ORDER.filter((c) => c !== preferredClient)]
    : FALLBACK_ORDER;

  let lastError = null;

  for (const clientId of order) {
    try {
      const context = buildContext(clientId);
      const headers = buildHeaders(clientId);
      const body = {
        context,
        ...bodyExtra,
      };

      const url = `${API_BASE}/${endpoint}?prettyPrint=false&key=${API_KEY}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${clientId}`);
        continue;
      }

      const data = await res.json();

      // Basic validity check
      if (data.error) {
        lastError = new Error(data.error.message || `API error from ${clientId}`);
        continue;
      }

      // Attach which client succeeded for debugging
      data.__client = clientId;
      return data;
    } catch (err) {
      lastError = err;
      // try next client
    }
  }

  throw lastError || new Error('All InnerTube clients failed');
}

async function search(query, params = null) {
  const body = { query };
  if (params) body.params = params;
  return innertubeRequest('search', body);
}

async function browse(browseId, params = null) {
  const body = { browseId };
  if (params) body.params = params;
  return innertubeRequest('browse', body);
}

async function player(videoId, playlistId = null) {
  const body = {
    videoId,
    contentCheckOk: true,
    racyCheckOk: true,
  };
  if (playlistId) body.playlistId = playlistId;
  // Prefer ANDROID_MUSIC / ANDROID_VR for better stream availability in some regions
  return innertubeRequest('player', body, 'ANDROID_MUSIC');
}

async function next(videoId, playlistId = null, params = null) {
  const body = {
    videoId,
    enablePersistentPlaylistPanel: true,
    isAudioOnly: true,
  };
  if (playlistId) body.playlistId = playlistId;
  if (params) body.params = params;
  return innertubeRequest('next', body);
}

async function getSearchSuggestions(query) {
  return innertubeRequest('music/get_search_suggestions', { input: query });
}

module.exports = {
  search,
  browse,
  player,
  next,
  getSearchSuggestions,
  innertubeRequest,
};

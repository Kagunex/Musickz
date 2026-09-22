/**
 * InnerTube-compatible client for YouTube Music
 * Inspired by Metrolist + InnerTubeX automatic client fallback.
 * Frontend must NEVER call music.youtube.com directly.
 */

const {
  API_KEY,
  FALLBACK_ORDER,
  PLAYER_FALLBACK_ORDER,
  buildContext,
  buildHeaders,
  getApiBase,
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
 * Check whether a player response is actually usable for browser audio playback.
 * HTTP 200 alone is NOT enough – playabilityStatus and streamingData matter.
 */
function isPlayablePlayerResponse(data) {
  if (!data || data.error) return false;

  const status = data.playabilityStatus?.status;
  if (status && status !== 'OK') return false;

  const formats = [
    ...(data.streamingData?.adaptiveFormats || []),
    ...(data.streamingData?.formats || []),
  ];

  const hasDirectAudio = formats.some(
    (f) =>
      f.mimeType &&
      f.mimeType.includes('audio') &&
      typeof f.url === 'string' &&
      f.url.startsWith('http')
  );

  return hasDirectAudio;
}

function getPlayabilitySummary(data) {
  if (!data) return { status: 'NO_DATA' };
  const ps = data.playabilityStatus || {};
  const formats = [
    ...(data.streamingData?.adaptiveFormats || []),
    ...(data.streamingData?.formats || []),
  ];
  const audioFormats = formats.filter((f) => f.mimeType?.includes('audio'));
  const withUrl = audioFormats.filter((f) => f.url).length;
  const withCipher = audioFormats.filter((f) => !f.url && f.signatureCipher).length;

  return {
    status: ps.status || 'UNKNOWN',
    reason: ps.reason || null,
    audioFormats: audioFormats.length,
    withUrl,
    withCipher,
  };
}

/**
 * Core POST to youtubei/v1/{endpoint}
 * For "player": only accepts playability OK + direct-URL audio.
 * Uses per-client API origin (ANDROID_VR → www.youtube.com).
 */
async function innertubeRequest(endpoint, bodyExtra = {}, preferredClient = null, options = {}) {
  const orderList = options.playerOrder ? PLAYER_FALLBACK_ORDER : FALLBACK_ORDER;
  const order = preferredClient
    ? [preferredClient, ...orderList.filter((c) => c !== preferredClient)]
    : orderList;

  const isPlayer = endpoint === 'player';
  let lastError = null;
  let bestUnplayable = null;

  for (const clientId of order) {
    if (!CLIENTS[clientId]) continue;
    try {
      const context = buildContext(clientId);
      const headers = buildHeaders(clientId);
      const body = {
        context,
        ...bodyExtra,
      };

      const apiBase = getApiBase(clientId);
      const url = `${apiBase}/${endpoint}?prettyPrint=false&key=${API_KEY}`;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${clientId}`);
        console.log(`[innertube] ${endpoint} client=${clientId} HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();

      if (data.error) {
        lastError = new Error(data.error.message || `API error from ${clientId}`);
        console.log(`[innertube] ${endpoint} client=${clientId} API error: ${lastError.message}`);
        continue;
      }

      data.__client = clientId;

      if (isPlayer) {
        const summary = getPlayabilitySummary(data);
        data.__playabilityStatus = summary.status;
        console.log(
          `[player] videoId=${bodyExtra.videoId || '?'} client=${clientId} origin=${apiBase} playability=${summary.status} audioFormats=${summary.audioFormats} withUrl=${summary.withUrl} withCipher=${summary.withCipher}`
        );

        if (isPlayablePlayerResponse(data)) {
          return data;
        }

        if (!bestUnplayable) {
          bestUnplayable = data;
        }
        lastError = new Error(
          summary.reason || summary.status || `Unplayable from ${clientId}`
        );
        continue;
      }

      return data;
    } catch (err) {
      lastError = err;
      console.log(`[innertube] ${endpoint} client=${clientId} exception: ${err.message}`);
    }
  }

  if (isPlayer && bestUnplayable) {
    return bestUnplayable;
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
  // Prefer ANDROID_VR (youtube.com) for direct stream URLs; walk full player order.
  return innertubeRequest('player', body, 'ANDROID_VR', { playerOrder: true });
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
  isPlayablePlayerResponse,
  getPlayabilitySummary,
};

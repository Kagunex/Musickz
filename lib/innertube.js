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

  // Need at least one audio format with a direct URL (no cipher-only)
  const hasDirectAudio = formats.some(
    (f) =>
      f.mimeType &&
      f.mimeType.includes('audio') &&
      typeof f.url === 'string' &&
      f.url.startsWith('http')
  );

  return hasDirectAudio;
}

/**
 * Extract playability summary for logging / internal use.
 */
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
 * Tries clients in FALLBACK_ORDER until one succeeds with usable data.
 *
 * For the "player" endpoint, a response is only accepted when it has
 * playabilityStatus === "OK" AND usable (direct-URL) audio streamingData.
 * Other endpoints still accept the first non-error HTTP 200.
 */
async function innertubeRequest(endpoint, bodyExtra = {}, preferredClient = null) {
  const order = preferredClient
    ? [preferredClient, ...FALLBACK_ORDER.filter((c) => c !== preferredClient)]
    : FALLBACK_ORDER;

  const isPlayer = endpoint === 'player';
  let lastError = null;
  let bestUnplayable = null; // keep first non-OK player response for error reporting

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
          `[player] videoId=${bodyExtra.videoId || '?'} client=${clientId} playability=${summary.status} audioFormats=${summary.audioFormats} withUrl=${summary.withUrl} withCipher=${summary.withCipher}`
        );

        if (isPlayablePlayerResponse(data)) {
          return data;
        }

        // Not usable – remember for final error, try next client
        if (!bestUnplayable) {
          bestUnplayable = data;
        }
        lastError = new Error(
          summary.reason || summary.status || `Unplayable from ${clientId}`
        );
        continue;
      }

      // Non-player endpoints: first valid HTTP 200 is fine
      return data;
    } catch (err) {
      lastError = err;
      console.log(`[innertube] ${endpoint} client=${clientId} exception: ${err.message}`);
    }
  }

  // For player: if we have any response, return the best unplayable one
  // so parsePlayer can produce a structured error (LOGIN_REQUIRED etc.)
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
  // Prefer ANDROID_MUSIC for better stream availability in some regions,
  // but evaluation still walks the full fallback list until a usable response is found.
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
  isPlayablePlayerResponse,
  getPlayabilitySummary,
};

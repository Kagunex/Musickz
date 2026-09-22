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
 * Classify playability into more precise categories.
 * LOGIN_REQUIRED is NOT always account auth – often bot/client check.
 */
function classifyPlayability(playability) {
  if (!playability || !playability.status) {
    return { category: 'UNKNOWN', status: 'UNKNOWN', reason: null };
  }

  const status = playability.status;
  const reason =
    playability.reason ||
    playability.errorScreen?.playerErrorMessageRenderer?.reason?.simpleText ||
    playability.errorScreen?.playerErrorMessageRenderer?.subreason?.simpleText ||
    null;

  const reasonLower = (reason || '').toLowerCase();

  if (status === 'OK') {
    return { category: 'OK', status, reason };
  }

  // Bot / anti-abuse checks commonly surface as LOGIN_REQUIRED
  if (
    status === 'LOGIN_REQUIRED' &&
    (reasonLower.includes('bot') ||
      reasonLower.includes('not a bot') ||
      reasonLower.includes('confirm you') ||
      reasonLower.includes("you're not a bot") ||
      reasonLower.includes('you’re not a bot'))
  ) {
    return { category: 'BOT_CHECK', status, reason };
  }

  // Generic "Please sign in" without bot wording – still often client-level, not true account gate
  if (status === 'LOGIN_REQUIRED') {
    // Prefer treating as client rejection for anonymous playback attempts;
    // true account-only content is rare for standard music tracks.
    return { category: 'CLIENT_REJECTED', status, reason };
  }

  if (status === 'UNPLAYABLE') {
    if (reasonLower.includes('age') || reasonLower.includes('restricted')) {
      return { category: 'AGE_RESTRICTED', status, reason };
    }
    if (reasonLower.includes('available in your country') || reasonLower.includes('geo')) {
      return { category: 'GEO_RESTRICTED', status, reason };
    }
    return { category: 'UNPLAYABLE', status, reason };
  }

  if (status === 'ERROR') {
    return { category: 'ERROR', status, reason };
  }

  if (status === 'AGE_CHECK_REQUIRED' || status === 'CONTENT_CHECK_REQUIRED') {
    return { category: 'AGE_RESTRICTED', status, reason };
  }

  if (status === 'LIVE_STREAM_OFFLINE') {
    return { category: 'CONTENT_UNAVAILABLE', status, reason };
  }

  return { category: 'UNKNOWN', status, reason };
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
  if (!data) return { status: 'NO_DATA', category: 'NO_DATA' };
  const ps = data.playabilityStatus || {};
  const classification = classifyPlayability(ps);
  const formats = [
    ...(data.streamingData?.adaptiveFormats || []),
    ...(data.streamingData?.formats || []),
  ];
  const audioFormats = formats.filter((f) => f.mimeType?.includes('audio'));
  const withUrl = audioFormats.filter((f) => f.url).length;
  const withCipher = audioFormats.filter((f) => !f.url && f.signatureCipher).length;

  return {
    status: classification.status || ps.status || 'UNKNOWN',
    category: classification.category,
    reason: classification.reason || null,
    audioFormats: audioFormats.length,
    withUrl,
    withCipher,
  };
}

/**
 * Core POST to youtubei/v1/{endpoint}
 * For "player": only accepts playability OK + direct-URL audio.
 * Uses per-client API origin (ANDROID_VR → www.youtube.com).
 * Walks fallback clients; does not treat BOT_CHECK / CLIENT_REJECTED as permanent auth failure.
 */
async function innertubeRequest(endpoint, bodyExtra = {}, preferredClient = null, options = {}) {
  const orderList = options.playerOrder ? PLAYER_FALLBACK_ORDER : FALLBACK_ORDER;
  const order = preferredClient
    ? [preferredClient, ...orderList.filter((c) => c !== preferredClient)]
    : orderList;

  const isPlayer = endpoint === 'player';
  let lastError = null;
  let bestUnplayable = null;
  const tried = [];

  for (const clientId of order) {
    if (!CLIENTS[clientId]) continue;
    tried.push(clientId);
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
      data.__clientsTried = [...tried];

      if (isPlayer) {
        const summary = getPlayabilitySummary(data);
        data.__playabilityStatus = summary.status;
        data.__playabilityCategory = summary.category;
        console.log(
          `[Playback] Track=${bodyExtra.videoId || '?'} Client=${clientId} Attempt=${tried.length} Playability=${summary.status} Category=${summary.category} Reason=${summary.reason || '-'} AudioFormats=${summary.audioFormats} withUrl=${summary.withUrl} withCipher=${summary.withCipher}`
        );

        if (isPlayablePlayerResponse(data)) {
          console.log(
            `[Playback] Track=${bodyExtra.videoId || '?'} Client=${clientId} Result=OK`
          );
          return data;
        }

        // Keep first (or prefer non-bot) unplayable for final error reporting
        if (
          !bestUnplayable ||
          (bestUnplayable.__playabilityCategory === 'BOT_CHECK' &&
            summary.category !== 'BOT_CHECK')
        ) {
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
    bestUnplayable.__clientsTried = tried;
    console.log(
      `[Playback] Track=${bodyExtra.videoId || '?'} Result=ALL_FAILED ClientsTried=${tried.join(',')} Category=${bestUnplayable.__playabilityCategory || '?'}`
    );
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
  // Use full player order (IOS first). No forced preferred client so order is respected.
  return innertubeRequest('player', body, null, { playerOrder: true });
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
  classifyPlayability,
};

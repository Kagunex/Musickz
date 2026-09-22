/**
 * MusicKx playback resolver.
 *
 * Uses youtubei.js for the playback-specific part because it tracks YouTube's
 * current player script and handles signature/n deciphering. This keeps the
 * existing /api/player contract while avoiding hard-coded, stale client
 * versions in the old hand-written resolver.
 *
 * This resolver does not manufacture stream URLs and does not bypass account,
 * age, region, or private-content restrictions returned by YouTube.
 */

let innertubePromise = null;

function getStatus(info) {
  return (
    info?.playability_status?.status ||
    info?.playabilityStatus?.status ||
    info?.page?.playabilityStatus?.status ||
    null
  );
}

function getReason(info) {
  return (
    info?.playability_status?.reason ||
    info?.playabilityStatus?.reason ||
    info?.page?.playabilityStatus?.reason ||
    null
  );
}

function getBasicInfo(info) {
  const b = info?.basic_info || info?.video_details || info?.videoDetails || {};
  return {
    videoId: b.id || b.video_id || b.videoId || null,
    title: b.title || null,
    artist: b.author || b.author_name || b.owner_channel_name || null,
    durationSeconds: Number(b.duration || b.length_seconds || b.lengthSeconds || 0) || 0,
    artwork:
      b.thumbnail?.[0]?.url ||
      b.thumbnail?.thumbnails?.[0]?.url ||
      b.thumbnails?.[0]?.url ||
      null,
    isLive: Boolean(b.is_live || b.isLiveContent || b.is_live_content),
  };
}

async function getInnertube() {
  if (!innertubePromise) {
    innertubePromise = (async () => {
      const mod = await import('youtubei.js');
      const Innertube = mod.Innertube || mod.default;
      if (!Innertube?.create) {
        throw new Error('youtubei.js Innertube.create() is unavailable');
      }

      // Keep the session in memory for warm Vercel invocations. No user
      // cookies or account credentials are stored by MusicKx.
      return Innertube.create({
        generate_session_locally: true,
      });
    })().catch((err) => {
      innertubePromise = null;
      throw err;
    });
  }
  return innertubePromise;
}

function classifyFailure(status, reason) {
  const s = String(status || '').toUpperCase();
  const r = String(reason || '').toLowerCase();

  if (s === 'LOGIN_REQUIRED') {
    return {
      errorCode: 'LOGIN_REQUIRED',
      reason: reason || 'YouTube requires sign-in for this track.',
    };
  }

  if (s === 'AGE_CHECK_REQUIRED' || s === 'CONTENT_CHECK_REQUIRED') {
    return {
      errorCode: 'PLAYBACK_UNAVAILABLE',
      reason: 'This track requires additional content verification.',
    };
  }

  if (s === 'UNPLAYABLE') {
    if (r.includes('country') || r.includes('region')) {
      return {
        errorCode: 'PLAYBACK_UNAVAILABLE',
        reason: 'This track is not available in this region.',
      };
    }
    return {
      errorCode: 'PLAYBACK_UNAVAILABLE',
      reason: reason || 'This track is currently unavailable.',
    };
  }

  return {
    errorCode: 'PLAYBACK_UNAVAILABLE',
    reason: reason || 'Playback is currently unavailable.',
  };
}

async function resolveAudio(videoId) {
  const yt = await getInnertube();
  const info = await yt.getBasicInfo(videoId, { client: 'YTMUSIC' });
  const meta = getBasicInfo(info);
  const status = getStatus(info);
  const reason = getReason(info);

  if (status && status !== 'OK') {
    return {
      available: false,
      ...meta,
      streamUrl: null,
      mimeType: null,
      bitrate: null,
      hasCipher: false,
      ...classifyFailure(status, reason),
      resolver: 'youtubei.js',
    };
  }

  let format;
  try {
    format = info.chooseFormat({
      type: 'audio',
      quality: 'best',
    });
  } catch (err) {
    return {
      available: false,
      ...meta,
      streamUrl: null,
      mimeType: null,
      bitrate: null,
      hasCipher: Boolean(info?.streaming_data?.adaptive_formats?.some((f) => f.signature_cipher || f.cipher)),
      errorCode: 'NO_AUDIO_STREAM',
      reason: 'No playable audio stream was returned for this track.',
      resolver: 'youtubei.js',
      detail: err?.message || null,
    };
  }

  if (!format) {
    return {
      available: false,
      ...meta,
      streamUrl: null,
      mimeType: null,
      bitrate: null,
      hasCipher: false,
      errorCode: 'NO_AUDIO_STREAM',
      reason: 'No playable audio stream was returned for this track.',
      resolver: 'youtubei.js',
    };
  }

  let streamUrl = format.url || null;
  try {
    // youtubei.js resolves both signatureCipher and the current n parameter.
    streamUrl = await format.decipher(yt.session.player);
  } catch (err) {
    return {
      available: false,
      ...meta,
      streamUrl: null,
      mimeType: format.mime_type || format.mimeType || null,
      bitrate: format.bitrate || format.average_bitrate || null,
      hasCipher: Boolean(format.signature_cipher || format.cipher),
      errorCode: 'STREAM_RESOLUTION_FAILED',
      reason: 'The music stream could not be resolved right now. Please retry.',
      resolver: 'youtubei.js',
      detail: err?.message || null,
    };
  }

  if (!streamUrl || !/^https?:\/\//i.test(streamUrl)) {
    return {
      available: false,
      ...meta,
      streamUrl: null,
      mimeType: format.mime_type || format.mimeType || null,
      bitrate: format.bitrate || format.average_bitrate || null,
      hasCipher: Boolean(format.signature_cipher || format.cipher),
      errorCode: 'NO_AUDIO_STREAM',
      reason: 'No playable audio stream was returned for this track.',
      resolver: 'youtubei.js',
    };
  }

  return {
    available: true,
    ...meta,
    streamUrl,
    mimeType: format.mime_type || format.mimeType || null,
    bitrate: format.bitrate || format.average_bitrate || null,
    hasCipher: false,
    reason: null,
    errorCode: null,
    resolver: 'youtubei.js',
  };
}

module.exports = {
  resolveAudio,
  getInnertube,
};

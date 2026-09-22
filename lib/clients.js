/**
 * YouTube Music InnerTube client configurations
 * Compatible with Metrolist / InnerTubeX approach.
 *
 * Player streams: IOS and ANDROID_VR often return direct (non-cipher)
 * audio URLs without login for many videos.
 * Search/browse stay on music.youtube.com.
 */

const MUSIC_ORIGIN = 'https://music.youtube.com';
const YT_ORIGIN = 'https://www.youtube.com';
const API_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';

const CLIENTS = {
  ANDROID_VR: {
    id: 'ANDROID_VR',
    clientName: 'ANDROID_VR',
    // Align closer to Metrolist / NewPipe ANDROID_VR versions that return direct URLs
    clientVersion: '1.65.10',
    clientId: '28',
    userAgent:
      'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    osName: 'Android',
    osVersion: '12L',
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    androidSdkVersion: 32,
    platform: 'MOBILE',
    hl: 'en',
    gl: 'US',
    // Critical: player requests for this client work better on www.youtube.com
    apiOrigin: YT_ORIGIN,
  },
  ANDROID_MUSIC: {
    id: 'ANDROID_MUSIC',
    clientName: 'ANDROID_MUSIC',
    clientVersion: '7.27.52',
    clientId: '21',
    userAgent:
      'com.google.android.apps.youtube.music/7.27.52 (Linux; U; Android 14; en_US) gzip',
    osName: 'Android',
    osVersion: '14',
    platform: 'MOBILE',
    androidSdkVersion: 34,
    hl: 'en',
    gl: 'US',
    apiOrigin: MUSIC_ORIGIN,
  },
  WEB_REMIX: {
    id: 'WEB_REMIX',
    clientName: 'WEB_REMIX',
    clientVersion: '1.20251110.03.00',
    clientId: '67',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    osName: 'Windows',
    osVersion: '10.0',
    platform: 'DESKTOP',
    hl: 'en',
    gl: 'US',
    apiOrigin: MUSIC_ORIGIN,
  },
  IOS: {
    id: 'IOS',
    clientName: 'IOS',
    // Recent iOS client; frequently returns direct audio URLs anonymously
    clientVersion: '20.11.1',
    clientId: '5',
    userAgent:
      'com.google.ios.youtube/20.11.1 (iPhone16,2; U; CPU iOS 18_0 like Mac OS X;)',
    osName: 'iOS',
    osVersion: '18.0',
    deviceModel: 'iPhone16,2',
    platform: 'MOBILE',
    hl: 'en',
    gl: 'US',
    apiOrigin: MUSIC_ORIGIN,
  },
};

/**
 * Player fallback order:
 * IOS first – most reliable for anonymous direct audio URLs in current conditions.
 * ANDROID_VR next – often good when not bot-checked.
 * Then ANDROID_MUSIC / WEB_REMIX.
 */
const PLAYER_FALLBACK_ORDER = ['VISIONOS', 'WEB_REMIX', 'YTMUSIC', 'IOS'];
const FALLBACK_ORDER = ['WEB_REMIX', 'ANDROID_MUSIC', 'IOS', 'ANDROID_VR'];

function buildContext(client, visitorData = null) {
  const c = CLIENTS[client] || CLIENTS.WEB_REMIX;
  const ctx = {
    client: {
      clientName: c.clientName,
      clientVersion: c.clientVersion,
      hl: c.hl,
      gl: c.gl,
      userAgent: c.userAgent,
      platform: c.platform,
      utcOffsetMinutes: 0,
    },
    request: {
      useSsl: true,
      internalExperimentFlags: [],
    },
    user: {
      lockedSafetyMode: false,
    },
  };

  if (c.osName) ctx.client.osName = c.osName;
  if (c.osVersion) ctx.client.osVersion = c.osVersion;
  if (c.androidSdkVersion) ctx.client.androidSdkVersion = c.androidSdkVersion;
  if (c.deviceMake) ctx.client.deviceMake = c.deviceMake;
  if (c.deviceModel) ctx.client.deviceModel = c.deviceModel;
  if (visitorData) ctx.client.visitorData = visitorData;

  return ctx;
}

function buildHeaders(client) {
  const c = CLIENTS[client] || CLIENTS.WEB_REMIX;
  const origin = c.apiOrigin || MUSIC_ORIGIN;
  return {
    'Content-Type': 'application/json',
    'User-Agent': c.userAgent,
    'X-YouTube-Client-Name': c.clientId,
    'X-YouTube-Client-Version': c.clientVersion,
    'X-Goog-Api-Format-Version': '1',
    Origin: origin,
    Referer: `${origin}/`,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
  };
}

function getApiBase(client) {
  const c = CLIENTS[client] || CLIENTS.WEB_REMIX;
  return `${c.apiOrigin || MUSIC_ORIGIN}/youtubei/v1`;
}

module.exports = {
  ORIGIN: MUSIC_ORIGIN,
  MUSIC_ORIGIN,
  YT_ORIGIN,
  API_BASE: `${MUSIC_ORIGIN}/youtubei/v1`,
  API_KEY,
  CLIENTS,
  FALLBACK_ORDER,
  PLAYER_FALLBACK_ORDER,
  buildContext,
  buildHeaders,
  getApiBase,
};

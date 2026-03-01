/**
 * CDN video URLs for card rendering.
 * All cards that have a videoUrl render as a looping muted video
 * instead of text/emoji. Change URLs here only.
 */

export const BOMB_VIDEO_URL = 'https://pub-4a4885e8e4e64fb483dce40965673cff.r2.dev/bomb.mp4';

export const SAFE_VIDEO_URLS = [
  'https://pub-4a4885e8e4e64fb483dce40965673cff.r2.dev/safe_1.mp4',
  'https://pub-4a4885e8e4e64fb483dce40965673cff.r2.dev/safe_2.mp4',
  'https://pub-4a4885e8e4e64fb483dce40965673cff.r2.dev/safe_3.mp4',
  'https://pub-4a4885e8e4e64fb483dce40965673cff.r2.dev/safe_4.mp4',
] as const;

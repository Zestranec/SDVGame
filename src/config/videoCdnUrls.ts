/**
 * CDN video URL pools for card rendering.
 * Single source of truth — all video URLs live here.
 *
 * Outcome → pool mapping (selection happens in ReelEngine via seeded RNG):
 *   bomb        → BOMB_VIDEO_URLS   (5 clips, uniform)
 *   safe        → SAFE_VIDEO_URLS   (15 clips, uniform)
 *   viral_boost → BUFF_VIDEO_URLS   (4 clips, uniform)
 */

const CDN = 'https://pub-4a4885e8e4e64fb483dce40965673cff.r2.dev/';

export const BOMB_VIDEO_URLS = [
  CDN + 'bomb.mp4',
  CDN + 'bomb_2.mp4',
  CDN + 'bomb_3.mp4',
  CDN + 'bomb_4.mp4',
  CDN + 'bomb_5.mp4',
] as const;

export const SAFE_VIDEO_URLS = [
  CDN + 'safe_1.mp4',
  CDN + 'safe_2.mp4',
  CDN + 'safe_3.mp4',
  CDN + 'safe_4.mp4',
  CDN + 'safe_5.mp4',
  CDN + 'safe_6.mp4',
  CDN + 'safe_7.mp4',
  CDN + 'safe_8.mp4',
  CDN + 'safe_10.mp4',
  CDN + 'safe_11.mp4',
  CDN + 'safe_12.mp4',
  CDN + 'safe_13.mp4',
  CDN + 'safe_14.mp4',
  CDN + 'safe_15.mp4',
  CDN + 'safe_16.mp4',
] as const;

export const BUFF_VIDEO_URLS = [
  CDN + 'buff.mp4',
  CDN + 'buff_2.mp4',
  CDN + 'buff_3.mp4',
  CDN + 'buff_4.mp4',
] as const;

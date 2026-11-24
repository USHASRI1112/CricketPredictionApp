import { TestIds } from 'react-native-google-mobile-ads';

// Production ad unit IDs from the AdMob console (Apps → Ad units).
// Leave a unit empty to disable that format in release builds.
const PRODUCTION_UNITS = {
  interstitial: 'ca-app-pub-1800123243044416/3183690432',
  rewarded:     'ca-app-pub-1800123243044416/8847080652',
  native:       'ca-app-pub-1800123243044416/2509407596',
  banner:       'ca-app-pub-1800123243044416/4716972106', // TODO: create a Banner unit in AdMob and paste its ID here
  appOpen:      'ca-app-pub-1800123243044416/2707428422', // TODO: create an App Open unit in AdMob and paste its ID here
};

// Debug builds always use Google's test units so we never load (or click) live ads.
export const AD_UNITS = __DEV__
  ? {
      interstitial: TestIds.INTERSTITIAL,
      rewarded:     TestIds.REWARDED,
      native:       TestIds.NATIVE,
      banner:       TestIds.ADAPTIVE_BANNER,
      appOpen:      TestIds.APP_OPEN,
    }
  : PRODUCTION_UNITS;

// ─── Frequency caps ───────────────────────────────────────────────────────
// Too many full-screen ads hurt ratings and AdMob may limit ad serving.
const INTERSTITIAL_MIN_GAP_MS = 2 * 60 * 1000;
const FULLSCREEN_MIN_GAP_MS   = 60 * 1000; // between any two full-screen ads

let lastInterstitialAt = 0;
let lastFullscreenAt   = 0;
let appOpenShownThisSession = false;
let interstitialsSuppressedUntil = 0;

export function canShowInterstitial(): boolean {
  const now = Date.now();
  return now >= interstitialsSuppressedUntil
    && now - lastInterstitialAt >= INTERSTITIAL_MIN_GAP_MS
    && now - lastFullscreenAt >= FULLSCREEN_MIN_GAP_MS;
}

// e.g. after a notification tap: the user came for the match, not an ad.
export function suppressInterstitials(ms: number): void {
  interstitialsSuppressedUntil = Math.max(interstitialsSuppressedUntil, Date.now() + ms);
}

export function markInterstitialShown(): void {
  lastInterstitialAt = lastFullscreenAt = Date.now();
}

// Rewarded ads are user-initiated, so they only count toward the shared gap.
export function markRewardedShown(): void {
  lastFullscreenAt = Date.now();
}

export function canShowAppOpen(): boolean {
  return !appOpenShownThisSession;
}

export function markAppOpenShown(): void {
  appOpenShownThisSession = true;
  lastFullscreenAt = Date.now();
}

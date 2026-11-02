import { AdsConsent, MobileAds } from 'react-native-google-mobile-ads';

let readyPromise: Promise<boolean> | null = null;

// Shows Google's UMP consent form where required (EEA/UK etc.), then starts the SDK.
// Resolves to whether ads may be requested. Safe to call many times.
export function initializeAds(): Promise<boolean> {
  if (!readyPromise) {
    readyPromise = (async () => {
      let canRequestAds = true;
      try {
        const info = await AdsConsent.gatherConsent();
        canRequestAds = info.canRequestAds;
      } catch (e) {
        // Consent form failed (offline, misconfigured); fall back to any consent stored earlier.
        console.warn('[Ads] Consent gathering failed', e);
        try {
          canRequestAds = (await AdsConsent.getConsentInfo()).canRequestAds;
        } catch {}
      }
      if (canRequestAds) {
        await MobileAds().initialize();
      }
      return canRequestAds;
    })();
  }
  return readyPromise;
}

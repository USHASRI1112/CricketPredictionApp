import {
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import { InterstitialAd, AdEventType,BannerAd, BannerAdSize,NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
  NativeMediaView,AppOpenAd,RewardedAd, RewardedAdEventType, 
   } from 'react-native-google-mobile-ads';
import {View,Text, StyleSheet} from 'react-native';
// Google Test Ad Unit IDs - Replace with production IDs before release
export const adUnitId = 'ca-app-pub-3940256099942544/1033173712'; // Interstitial

const bannerAdUnit = 'ca-app-pub-3940256099942544/6300978111'; // Banner

const nativeAdUnit = 'ca-app-pub-3940256099942544/2247696110'; // Native

const appOpenUnitId = 'ca-app-pub-3940256099942544/5575463023'; // App Open

const rewardedAdUnit = 'ca-app-pub-3940256099942544/5224354917'; // Rewarded

const appOpenAd = AppOpenAd.createForAdRequest(appOpenUnitId, {
  requestNonPersonalizedAdsOnly: true,
});

export function AppOpenAdManager() {
  const hasShownRef = useRef(false);

  useEffect(() => {
    const loadedListener = appOpenAd.addAdEventListener(
      AdEventType.LOADED,
      () => {
        if (hasShownRef.current) return; // already shown once, don't show again
        hasShownRef.current = true;
        // console.log("App Open Ad Loaded");
        appOpenAd.show();
      }
    );

    const closedListener = appOpenAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        // console.log("App Open Ad Closed");
        // don't reload — we only want it once per app open
      }
    );

    appOpenAd.load();

    return () => {
      loadedListener();
      closedListener();
    };
  }, []);

  return null;
}

export function HeaderBanner({ mode }: { mode: 'header' | 'footer' }) {
  return (
    <View style={{ 
      paddingTop:    mode === 'header' ? 24 : 0,
      paddingBottom: mode === 'footer' ? 24 : 0,
    }}>
      <BannerAd
        unitId={bannerAdUnit}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => {/* console.log("Banner loaded") */}}
        onAdFailedToLoad={(e) => {/* console.log("Banner failed", e) */}}
      />
    </View>
  );
}

function RewardAdd(_: any, ref: any) {
  const rewardedRef = useRef<RewardedAd | null>(null);
  const loadedRef = useRef(false);
  const callbacksRef = useRef<Array<() => void>>([]);

  if (!rewardedRef.current) {
    rewardedRef.current = RewardedAd.createForAdRequest(rewardedAdUnit, {
      requestNonPersonalizedAdsOnly: true,
    });
  }

  useImperativeHandle(ref, () => ({
    showAd(cb?: () => void) {
      if (cb) callbacksRef.current.push(cb);
      if (loadedRef.current) {
        rewardedRef.current?.show();
      } else {
        // not loaded — unlock anyway as fallback
        const cbs = callbacksRef.current.splice(0);
        cbs.forEach(fn => fn());
      }
    },
  }));

  useEffect(() => {
    const ad = rewardedRef.current!;

    const unsubscribeLoaded = ad.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        loadedRef.current = true;
        // console.log('✅ Rewarded Ad Loaded');
      },
    );

    const unsubscribeEarned = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      (reward) => {
        // console.log('🎁 Reward earned:', reward);
        // fire callbacks when reward is earned
        const cbs = callbacksRef.current.splice(0);
        cbs.forEach(fn => fn());
      },
    );

    const unsubscribeClosed = ad.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        loadedRef.current = false;
        // console.log('Rewarded Ad Closed');
        ad.load(); // preload next
      },
    );

    const unsubscribeError = ad.addAdEventListener(
      AdEventType.ERROR,
      (error) => {
        // console.log('❌ Rewarded Ad Error:', error);
        // fire callbacks on error so user isn't stuck
        const cbs = callbacksRef.current.splice(0);
        cbs.forEach(fn => fn());
      },
    );

    ad.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeEarned();
      unsubscribeClosed();
      unsubscribeError();
    };
  }, []);

  return null;
}
export function NativeAdCard() {
  const [nativeAd, setNativeAd] = useState<NativeAd | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAd = async () => {
      try {
        const ad = await NativeAd.createForAdRequest(nativeAdUnit);
        if (isMounted) {
          setNativeAd(ad);
          setError(false);
        }
      } catch (err) {
        // console.error('Native ad failed to load:', err);
        if (isMounted) {
          setError(true);
          setNativeAd(null);
        }
      }
    };

    loadAd();

    return () => {
      isMounted = false;
    };
  }, []);

  // Don't render anything if ad failed to load
  if (error || !nativeAd) {
    return null;
  }

  return (
    <View style={styles.nativeContainer}>
      <NativeAdView nativeAd={nativeAd}>
        <NativeMediaView style={styles.media} />
        <View style={styles.textContent}>
          <Text style={styles.adLabel}>SPONSORED</Text>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.title} />
          </NativeAsset>
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={styles.body} />
          </NativeAsset>
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Text style={styles.cta} />
          </NativeAsset>
        </View>
      </NativeAdView>
    </View>
  );
}



function Add(_: any, ref: any) {
  const interstitialRef = useRef<InterstitialAd | null>(null);
  const loadedRef = useRef(false);
  const callbacksRef = useRef<Array<() => void>>([]);

  if (!interstitialRef.current) {
    interstitialRef.current = InterstitialAd.createForAdRequest(adUnitId);
  }

  useImperativeHandle(ref, () => ({
    showAd(cb?: () => void) {
      if (cb) callbacksRef.current.push(cb);
      if (loadedRef.current) {
        interstitialRef.current?.show();
      } else {
        const cbs = callbacksRef.current.splice(0);
        cbs.forEach(fn => fn());
      }
    },
  }));

  useEffect(() => {
    const ad = interstitialRef.current!;

    const unsubscribeLoaded = ad.addAdEventListener(
      AdEventType.LOADED,
      () => {
        loadedRef.current = true;
        // console.log('✅ Ad Loaded');
      },
    );

    const unsubscribeError = ad.addAdEventListener(
      AdEventType.ERROR,
      (error) => {
        // console.log('❌ Ad Error:', error);
      },
    );

    const unsubscribeClosed = ad.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        loadedRef.current = false;
        const cbs = callbacksRef.current.splice(0);
        cbs.forEach(fn => fn());
        ad.load();
      },
    );

    // Delay ad loading to prevent blocking navigation
    const loadAdTimeout = setTimeout(() => {
      ad.load();
    }, 400); // Load ad 2 seconds after component mounts

    return () => {
      clearTimeout(loadAdTimeout);
      unsubscribeLoaded();
      unsubscribeError();
      unsubscribeClosed();
    };
  }, []);

  return null;
}

export const RewardAdd_ = forwardRef(RewardAdd);


export default forwardRef(Add);


const styles = StyleSheet.create({
  nativeContainer: {
    width: '100%',
    marginVertical: 10,
    marginHorizontal: 4,
    backgroundColor: "#1a1a1a", // Dark background to match app theme
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },

  media: {
    height: 160,
    width: "100%",
  },

  textContent: {
    padding: 12,
  },

  adLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#888",
    letterSpacing: 1.5,
    marginBottom: 6,
    textTransform: "uppercase",
  },

  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff", // White text for dark theme
    lineHeight: 22,
  },

  body: {
    fontSize: 13,
    color: "#ccc", // Light gray for body
    marginTop: 4,
    lineHeight: 18,
  },

  cta: {
    marginTop: 12,
    backgroundColor: "#2563eb",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    overflow: "hidden",
  },

  adPlaceholder: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: "rgba(255,255,255,0.05)",
  },

  placeholderText: {
    color: "#666",
    fontSize: 13,
  },
});
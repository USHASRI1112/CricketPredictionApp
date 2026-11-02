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
import {
  AD_UNITS,
  canShowAppOpen,
  canShowInterstitial,
  markAppOpenShown,
  markInterstitialShown,
  markRewardedShown,
} from '../ads/AdConfig';
import { initializeAds } from '../ads/AdsInit';

// True once consent is resolved and the SDK may request ads.
function useAdsReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let isMounted = true;
    initializeAds().then(ok => { if (isMounted) setReady(ok); });
    return () => { isMounted = false; };
  }, []);
  return ready;
}

export function AppOpenAdManager() {
  const ready = useAdsReady();

  useEffect(() => {
    if (!ready || !AD_UNITS.appOpen || !canShowAppOpen()) return;
    const appOpenAd = AppOpenAd.createForAdRequest(AD_UNITS.appOpen);

    const loadedListener = appOpenAd.addAdEventListener(
      AdEventType.LOADED,
      () => {
        if (!canShowAppOpen()) return; // only once per app session
        markAppOpenShown();
        appOpenAd.show();
      }
    );

    appOpenAd.load();

    return () => {
      loadedListener();
    };
  }, [ready]);

  return null;
}

export function HeaderBanner({ mode }: { mode: 'header' | 'footer' }) {
  const ready = useAdsReady();
  if (!ready || !AD_UNITS.banner) return null;
  return (
    <View style={{ 
      paddingTop:    mode === 'header' ? 24 : 0,
      paddingBottom: mode === 'footer' ? 24 : 0,
    }}>
      <BannerAd
        unitId={AD_UNITS.banner}
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
  const pendingShowRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFallbackTimer = () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  const drainCallbacks = () => {
    const cbs = callbacksRef.current.splice(0);
    cbs.forEach(fn => fn());
  };

  const readyRef = useRef(false);

  if (!rewardedRef.current) {
    rewardedRef.current = RewardedAd.createForAdRequest(AD_UNITS.rewarded);
  }

  useImperativeHandle(ref, () => ({
    isLoaded() {
      return loadedRef.current;
    },
    showAd(cb?: () => void) {
      if (cb) callbacksRef.current.push(cb);

      const ad = rewardedRef.current;
      if (!ad || !readyRef.current) {
        pendingShowRef.current = false;
        clearFallbackTimer();
        drainCallbacks();
        return;
      }

      if (loadedRef.current) {
        pendingShowRef.current = false;
        clearFallbackTimer();
        markRewardedShown();
        try {
          void ad.show().catch(() => {
            loadedRef.current = false;
            drainCallbacks();
          });
        } catch {
          drainCallbacks();
        }
      } else {
        pendingShowRef.current = true;
        ad.load();

        clearFallbackTimer();
        fallbackTimerRef.current = setTimeout(() => {
          pendingShowRef.current = false;
          drainCallbacks();
        }, 2500);
      }
    },
  }));

  useEffect(() => {
    const ad = rewardedRef.current!;

    const unsubscribeLoaded = ad.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        loadedRef.current = true;
        if (pendingShowRef.current && callbacksRef.current.length > 0) {
          pendingShowRef.current = false;
          clearFallbackTimer();
          markRewardedShown();
          try {
            void ad.show().catch(() => {
            loadedRef.current = false;
            drainCallbacks();
          });
          } catch {
            drainCallbacks();
          }
        }
        // console.log('✅ Rewarded Ad Loaded');
      },
    );

    const unsubscribeEarned = ad.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      (reward) => {
        // console.log('🎁 Reward earned:', reward);
        // fire callbacks when reward is earned
        drainCallbacks();
      },
    );

    const unsubscribeClosed = ad.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        loadedRef.current = false;
        pendingShowRef.current = false;
        clearFallbackTimer();
        drainCallbacks();
        // console.log('Rewarded Ad Closed');
        ad.load(); // preload next
      },
    );

    const unsubscribeError = ad.addAdEventListener(
      AdEventType.ERROR,
      (error) => {
        loadedRef.current = false;
        pendingShowRef.current = false;
        clearFallbackTimer();
        // console.log('❌ Rewarded Ad Error:', error);
        // fire callbacks on error so user isn't stuck
        drainCallbacks();
        ad.load();
      },
    );

    let isMounted = true;
    initializeAds().then(ok => {
      if (!isMounted || !ok) return;
      readyRef.current = true;
      ad.load();
    });

    return () => {
      isMounted = false;
      clearFallbackTimer();
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
        if (!AD_UNITS.native || !(await initializeAds())) {
          if (isMounted) setError(true);
          return;
        }
        const ad = await NativeAd.createForAdRequest(AD_UNITS.native);
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
  const pendingShowRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFallbackTimer = () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  const drainCallbacks = () => {
    const cbs = callbacksRef.current.splice(0);
    cbs.forEach(fn => fn());
  };

  const readyRef = useRef(false);

  if (!interstitialRef.current) {
    interstitialRef.current = InterstitialAd.createForAdRequest(AD_UNITS.interstitial);
  }

  useImperativeHandle(ref, () => ({
    showAd(cb?: () => void) {
      if (cb) callbacksRef.current.push(cb);

      const ad = interstitialRef.current;
      // Frequency cap: skip the ad and continue straight to the action.
      if (!ad || !readyRef.current || !canShowInterstitial()) {
        pendingShowRef.current = false;
        clearFallbackTimer();
        drainCallbacks();
        return;
      }

      if (loadedRef.current) {
        pendingShowRef.current = false;
        clearFallbackTimer();
        markInterstitialShown();
        try {
          void ad.show().catch(() => {
            loadedRef.current = false;
            drainCallbacks();
          });
        } catch {
          drainCallbacks();
        }
      } else {
        pendingShowRef.current = true;
        ad.load();

        clearFallbackTimer();
        fallbackTimerRef.current = setTimeout(() => {
          pendingShowRef.current = false;
          drainCallbacks();
        }, 2500);
      }
    },
  }));

  useEffect(() => {
    const ad = interstitialRef.current!;

    const unsubscribeLoaded = ad.addAdEventListener(
      AdEventType.LOADED,
      () => {
        loadedRef.current = true;
        if (pendingShowRef.current && callbacksRef.current.length > 0) {
          pendingShowRef.current = false;
          clearFallbackTimer();
          markInterstitialShown();
          try {
            void ad.show().catch(() => {
            loadedRef.current = false;
            drainCallbacks();
          });
          } catch {
            drainCallbacks();
          }
        }
        // console.log('✅ Ad Loaded');
      },
    );

    const unsubscribeError = ad.addAdEventListener(
      AdEventType.ERROR,
      () => {
        loadedRef.current = false;
        pendingShowRef.current = false;
        clearFallbackTimer();
        drainCallbacks();
        ad.load();
        // console.log('❌ Ad Error:', error);
      },
    );

    const unsubscribeClosed = ad.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        loadedRef.current = false;
        pendingShowRef.current = false;
        clearFallbackTimer();
        drainCallbacks();
        ad.load();
      },
    );

    // Delay ad loading to prevent blocking navigation
    let isMounted = true;
    const loadAdTimeout = setTimeout(() => {
      initializeAds().then(ok => {
        if (!isMounted || !ok) return;
        readyRef.current = true;
        ad.load();
      });
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(loadAdTimeout);
      clearFallbackTimer();
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
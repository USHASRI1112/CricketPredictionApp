import {
  useEffect,
  useState,
  forwardRef,
  useImperativeHandle,
  useRef,
} from 'react';
import { InterstitialAd, AdEventType } from 'react-native-google-mobile-ads';

const adUnitId = 'ca-app-pub-3940256099942544/1033173712';
//   : "YOUR_REAL_INTERSTITIAL_ID";

const interstitial = InterstitialAd.createForAdRequest(adUnitId);

function Add(_: any, ref: any) {
  const [loaded, setLoaded] = useState(false);
  const callbacksRef = useRef<Array<() => void>>([]);

  useImperativeHandle(ref, () => ({
    showAd(cb?: () => void) {
      if (cb) callbacksRef.current.push(cb);
      if (loaded) {
        interstitial.show();
      } else {
        // if ad not ready, invoke callbacks immediately
        const cbs = callbacksRef.current.splice(0);
        cbs.forEach(fn => fn());
      }
    },
  }));

  useEffect(() => {
    const unsubscribeLoaded = interstitial.addAdEventListener(
      AdEventType.LOADED,
      () => {
        setLoaded(true);
        console.log('Ad Loaded');
      },
    );

    const unsubscribeClosed = interstitial.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        setLoaded(false);
        // call any pending callbacks after ad closed
        const cbs = callbacksRef.current.splice(0);
        cbs.forEach(fn => fn());
        interstitial.load(); // Preload next ad
      },
    );

    interstitial.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeClosed();
    };
  }, [loaded]);

  // This component only handles ad logic, no UI needed
  return null;
}

export default forwardRef(Add);

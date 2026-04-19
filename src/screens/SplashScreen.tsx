import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
  AccessibilityInfo,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const { width: W, height: H } = Dimensions.get('window');

// ─── Colour tokens (synced with HomeScreen) ──────────────────────────────────
const C = {
  bg:         '#03080F',
  surface:    '#0A1628',
  surfaceAlt: '#0D1F35',
  cyan:       '#00E5FF',
  cyanDim:    'rgba(0,229,255,0.12)',
  cyanMid:    'rgba(0,229,255,0.35)',
  gold:       '#F5C542',
  white:      '#FFFFFF',
  whiteHalf:  'rgba(255,255,255,0.5)',
  whiteLow:   'rgba(255,255,255,0.08)',
  green:      '#00E096',
  red:        '#FF4560',
  orange:     '#FF8C00',
};

// ─── Animated Bail SVG-style wicket component ─────────────────────────────────
function Wicket({ style }: { style?: object }) {
  return (
    <View style={[wicketStyles.root, style]}>
      {/* Three stumps */}
      <View style={wicketStyles.stumpsRow}>
        <View style={wicketStyles.stump} />
        <View style={wicketStyles.stump} />
        <View style={wicketStyles.stump} />
      </View>
      {/* Two bails */}
      <View style={wicketStyles.bailsRow}>
        <View style={wicketStyles.bail} />
        <View style={[wicketStyles.bail, { marginLeft: 2 }]} />
      </View>
    </View>
  );
}

const wicketStyles = StyleSheet.create({
  root: { alignItems: 'center' },
  stumpsRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-end' },
  stump: {
    width: 5,
    height: 54,
    borderRadius: 3,
    backgroundColor: C.gold,
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 8,
  },
  bailsRow: {
    flexDirection: 'row',
    position: 'absolute',
    top: -7,
    left: -1,
    alignItems: 'center',
  },
  bail: {
    width: 11,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.gold,
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
});

// ─── Flying bail particle ─────────────────────────────────────────────────────
function FlyingBail({ delay, startX, endX, endY, rotation }: any) {
  const translateX = useRef(new Animated.Value(startX)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate     = useRef(new Animated.Value(0)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1,   duration: 100, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: endX, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: endY, duration: 900, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
        Animated.timing(rotate,     { toValue: rotation, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);
    anim.start();
  }, [delay, endX, endY, opacity, rotate, rotation, translateX, translateY]);

  const rotateDeg = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '720deg'] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        transform: [{ translateX }, { translateY }, { rotate: rotateDeg }],
        opacity,
      }}
    >
      <View style={{ width: 16, height: 6, borderRadius: 3, backgroundColor: C.gold, shadowColor: C.gold, shadowOpacity: 0.9, shadowRadius: 6 }} />
    </Animated.View>
  );
}

// ─── Orbiting dot ─────────────────────────────────────────────────────────────
function OrbitDot({ radius, duration, delay, color, size = 5 }: any) {
  const angle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(angle, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
      ])
    ).start();
  }, [angle, delay, duration]);

  const translateX = angle.interpolate({ inputRange: [0, 1], outputRange: [radius, radius] });
  // Use sin/cos approximation via interpolation across full circle
  const tx = angle.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, radius, 0, -radius, 0],
  });
  const ty = angle.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [-radius, 0, radius, 0, -radius],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        transform: [{ translateX: tx }, { translateY: ty }],
        shadowColor: color,
        shadowOpacity: 0.8,
        shadowRadius: 6,
      }}
    />
  );
}

// ─── Scan line ────────────────────────────────────────────────────────────────
function ScanLine({ triggerAt }: { triggerAt: boolean }) {
  const pos = useRef(new Animated.Value(-H * 0.15)).current;
  const op  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!triggerAt) return;
    Animated.sequence([
      Animated.timing(op,  { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(pos, { toValue: H * 0.15, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(op,  { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [triggerAt, op, pos]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: 0, right: 0, height: 2,
        transform: [{ translateY: pos }],
        opacity: op,
      }}
    >
      <LinearGradient
        colors={['transparent', C.cyan, C.cyan, 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ flex: 1, height: 2 }}
      />
    </Animated.View>
  );
}

// ─── Main SplashScreen ────────────────────────────────────────────────────────
interface SplashScreenProps {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: SplashScreenProps) {
  // ── Phase state ──────────────────────────────────────────────────────────
  const [showBails, setShowBails] = useState(false);
  const [showScan,  setShowScan]  = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then(enabled => {
        if (mounted) {
          setReduceMotionEnabled(enabled);
        }
      })
      .catch(() => {
        setReduceMotionEnabled(false);
      });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // ── Animated values ──────────────────────────────────────────────────────

  // Background orbs
  const orb1 = useRef(new Animated.Value(0)).current;
  const orb2 = useRef(new Animated.Value(0)).current;

  // Wicket entrance
  const wicketScale   = useRef(new Animated.Value(0.2)).current;
  const wicketOp      = useRef(new Animated.Value(0)).current;
  const wicketShake   = useRef(new Animated.Value(0)).current;

  // Logo group
  const logoOp        = useRef(new Animated.Value(0)).current;
  const logoY         = useRef(new Animated.Value(30)).current;
  const logoScale     = useRef(new Animated.Value(0.92)).current;

  // Tagline
  const tagOp         = useRef(new Animated.Value(0)).current;
  const tagY          = useRef(new Animated.Value(16)).current;

  // Badges row
  const badgesOp      = useRef(new Animated.Value(0)).current;
  const badgesY       = useRef(new Animated.Value(12)).current;

  // Loading bar
  const loadProgress  = useRef(new Animated.Value(0)).current;
  const loadOp        = useRef(new Animated.Value(0)).current;

  // Page exit
  const pageOp        = useRef(new Animated.Value(1)).current;
  const pageScale     = useRef(new Animated.Value(1)).current;

  // Glowing ring around wicket
  const ringScale     = useRef(new Animated.Value(0.5)).current;
  const ringOp        = useRef(new Animated.Value(0)).current;

  // ── Sequence ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    if (reduceMotionEnabled) {
      const finishId = setTimeout(() => onFinish(), 450);
      return () => clearTimeout(finishId);
    }

    // Orb ambient animation (continuous)
    const orb1Loop = Animated.loop(Animated.sequence([
      Animated.timing(orb1, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(orb1, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    orb1Loop.start();

    const orb2Loop = Animated.loop(Animated.sequence([
      Animated.delay(2000),
      Animated.timing(orb2, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(orb2, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    orb2Loop.start();

    const schedule = (fn: () => void, delay: number) => {
      const id = setTimeout(fn, delay);
      timeouts.push(id);
    };

    // PHASE 1 — wicket drops in (0ms)
    Animated.parallel([
      Animated.spring(wicketScale, { toValue: 1, speed: 14, bounciness: 12, useNativeDriver: true }),
      Animated.timing(wicketOp,   { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // PHASE 2 — ring burst + shake + bails fly (600ms)
    schedule(() => {
      setShowBails(true);
      setShowScan(true);

      // Ring burst
      Animated.parallel([
        Animated.timing(ringScale, { toValue: 2.2, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ringOp,   { toValue: 0,   duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start(() => { ringScale.setValue(0.5); ringOp.setValue(0); });

      // Wicket shake
      Animated.sequence([
        Animated.timing(wicketShake, { toValue: 6,  duration: 50,  useNativeDriver: true }),
        Animated.timing(wicketShake, { toValue: -6, duration: 50,  useNativeDriver: true }),
        Animated.timing(wicketShake, { toValue: 4,  duration: 50,  useNativeDriver: true }),
        Animated.timing(wicketShake, { toValue: -4, duration: 50,  useNativeDriver: true }),
        Animated.timing(wicketShake, { toValue: 0,  duration: 50,  useNativeDriver: true }),
      ]).start();
    }, 600);

    // PHASE 3 — logo reveals (1100ms)
    schedule(() => {
      Animated.parallel([
        Animated.timing(logoOp,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(logoY,   { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, speed: 14, bounciness: 6, useNativeDriver: true }),
      ]).start();
    }, 1100);

    // Tagline
    schedule(() => {
      Animated.parallel([
        Animated.timing(tagOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(tagY,  { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 1300);

    // Badges
    schedule(() => {
      Animated.parallel([
        Animated.timing(badgesOp, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(badgesY,  { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }, 1500);

    // Loading bar
    schedule(() => {
      Animated.timing(loadOp, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Animated.timing(loadProgress, { toValue: 1, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, 1600);

    // PHASE 4 — exit (3200ms)
    schedule(() => {
      Animated.parallel([
        Animated.timing(pageOp,    { toValue: 0, duration: 500, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(pageScale, { toValue: 1.06, duration: 500, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => onFinish());
    }, 3200);

    return () => {
      timeouts.forEach(clearTimeout);
      orb1Loop.stop();
      orb2Loop.stop();
    };
  }, [
    badgesOp,
    badgesY,
    loadOp,
    loadProgress,
    logoOp,
    logoScale,
    logoY,
    onFinish,
    orb1,
    orb2,
    pageOp,
    pageScale,
    reduceMotionEnabled,
    ringOp,
    ringScale,
    tagOp,
    tagY,
    wicketOp,
    wicketScale,
    wicketShake,
  ]);

  const orb1Y = orb1.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const orb2Y = orb2.interpolate({ inputRange: [0, 1], outputRange: [0,  16] });

  const loadWidth = loadProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const gridLines = [...Array(10)].map((_, i) => i);

  return (
    <Animated.View style={[styles.root, { opacity: pageOp, transform: [{ scale: pageScale }] }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Deep space gradient bg */}
      <LinearGradient
        colors={['#020710', '#04101E', '#030B18', '#020710']}
        start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Grid lines */}
      <View style={styles.gridOverlay} pointerEvents="none">
        {gridLines.map(i => (
          <View key={i} style={[styles.gridLine, { top: (H / 10) * i }]} />
        ))}
      </View>

      {/* Vertical grid */}
      <View style={styles.gridOverlay} pointerEvents="none">
        {gridLines.map(i => (
          <View key={i} style={[styles.gridLineV, { left: (W / 10) * i }]} />
        ))}
      </View>

      {/* Ambient orbs */}
      <Animated.View style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }] }]} pointerEvents="none">
        <LinearGradient colors={['rgba(0,229,255,0.22)', 'transparent']} style={{ flex: 1, borderRadius: 300 }} />
      </Animated.View>
      <Animated.View style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }] }]} pointerEvents="none">
        <LinearGradient colors={['rgba(245,197,66,0.15)', 'transparent']} style={{ flex: 1, borderRadius: 300 }} />
      </Animated.View>
      <View style={[styles.orb, styles.orb3]} pointerEvents="none">
        <LinearGradient colors={['rgba(0,224,150,0.1)', 'transparent']} style={{ flex: 1, borderRadius: 300 }} />
      </View>

      {/* Corner accents */}
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR, { transform: [{ rotate: '90deg' }] }]} />
      <View style={[styles.corner, styles.cornerBL, { transform: [{ rotate: '-90deg' }] }]} />
      <View style={[styles.corner, styles.cornerBR, { transform: [{ rotate: '180deg' }] }]} />

      {/* Main content */}
      <View style={styles.center}>

        {/* ── Wicket zone ── */}
        <View style={styles.wicketZone}>

          {/* Glow ring burst */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glowRing,
              { transform: [{ scale: ringScale }], opacity: ringOp },
            ]}
          >
            <LinearGradient
              colors={[C.gold + 'aa', C.cyan + '44', 'transparent']}
              style={{ flex: 1, borderRadius: 100 }}
            />
          </Animated.View>

          {/* Orbiting dots */}
          <View style={styles.orbitCenter}>
            <OrbitDot radius={68} duration={3000} delay={0}    color={C.cyan + 'cc'} size={6} />
            <OrbitDot radius={68} duration={3000} delay={1500} color={C.gold + 'cc'} size={4} />
            <OrbitDot radius={90} duration={5000} delay={500}  color={C.green + '99'} size={5} />
          </View>

          {/* Wicket */}
          <Animated.View
            style={{
              transform: [
                { scale: wicketScale },
                { translateX: wicketShake },
              ],
              opacity: wicketOp,
            }}
          >
            <View style={styles.wicketGlowWrap}>
              <View style={styles.wicketGlow} />
              <Wicket />
            </View>
          </Animated.View>

          {/* Flying bails */}
          {showBails && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <FlyingBail delay={0}   startX={0}   endX={-70}  endY={-80}  rotation={1} />
              <FlyingBail delay={60}  startX={0}   endX={85}   endY={-90}  rotation={1} />
              <FlyingBail delay={100} startX={0}   endX={-45}  endY={-110} rotation={0.8} />
              <FlyingBail delay={140} startX={0}   endX={60}   endY={-70}  rotation={1.2} />
            </View>
          )}
        </View>

        {/* ── Logo ── */}
        <Animated.View
          style={[
            styles.logoBlock,
            {
              opacity: logoOp,
              transform: [{ translateY: logoY }, { scale: logoScale }],
            },
          ]}
        >
          {/* App name */}
          <View style={styles.titleRow}>
            <Text style={styles.titleToday}>TODAY </Text>
            <Text style={styles.titleCricket}>CRICKET</Text>
          </View>
          <View style={styles.titleBottomRow}>
            <Text style={styles.titlePrediction}>PREDICTION</Text>
          </View>

          {/* Accent underline */}
          <View style={styles.underlineRow}>
            <LinearGradient
              colors={[C.cyan, C.gold, C.green]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.underline}
            />
          </View>

          {/* Scan line effect */}
          <ScanLine triggerAt={showScan} />
        </Animated.View>

        {/* ── Tagline ── */}
        <Animated.View style={{ opacity: tagOp, transform: [{ translateY: tagY }] }}>
          <Text style={styles.tagline}>AI-Powered Cricket Intelligence</Text>
        </Animated.View>

        {/* ── Trust badges ── */}
        <Animated.View style={[styles.badgesRow, { opacity: badgesOp, transform: [{ translateY: badgesY }] }]}>
          {['🤖 ML-Powered', '⚡ Real-time', '🌍 All Leagues'].map((b, i) => (
            <View key={i} style={styles.badge}>
              <Text style={styles.badgeText}>{b}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ── Loading bar ── */}
        <Animated.View style={[styles.loadWrap, { opacity: loadOp }]}>
          <View style={styles.loadTrack}>
            <Animated.View style={[styles.loadBar, { width: loadWidth }]}>
              <LinearGradient
                colors={[C.cyan, C.gold, C.cyan]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              {/* Shimmer */}
              <View style={styles.loadShimmer} />
            </Animated.View>
          </View>
          <Text style={styles.loadText}>Loading predictions…</Text>
        </Animated.View>
      </View>

      {/* ── Bottom accent ── */}
      <View style={styles.bottomAccent} pointerEvents="none">
        <LinearGradient
          colors={[C.cyan + '00', C.cyan + '22', C.cyan + '00']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ height: 1, width: '100%' }}
        />
        <Text style={styles.versionText}>v2.0  ·  AI EDITION</Text>
      </View>

    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#03080F',
  },

  // Grid
  gridOverlay: { ...StyleSheet.absoluteFillObject },
  gridLine: {
    position: 'absolute', left: 0, right: 0,
    height: 1, backgroundColor: 'rgba(0,229,255,0.04)',
  },
  gridLineV: {
    position: 'absolute', top: 0, bottom: 0,
    width: 1, backgroundColor: 'rgba(0,229,255,0.03)',
  },

  // Orbs
  orb:  { position: 'absolute', borderRadius: 300 },
  orb1: { width: 360, height: 360, top: -80, right: -100 },
  orb2: { width: 300, height: 300, bottom: 100, left: -100 },
  orb3: { width: 200, height: 200, bottom: -40, right: -40 },

  // Corner brackets
  corner: {
    position: 'absolute',
    width: 28, height: 28,
    borderTopWidth: 1.5, borderLeftWidth: 1.5,
    borderColor: 'rgba(0,229,255,0.3)',
  },
  cornerTL: { top: 44,  left: 22 },
  cornerTR: { top: 44,  right: 22 },
  cornerBL: { bottom: 44, left: 22 },
  cornerBR: { bottom: 44, right: 22 },

  // Center layout
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // Wicket zone
  wicketZone: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
    width: 200,
    height: 160,
  },
  orbitCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 130, height: 130,
    borderRadius: 65,
    overflow: 'hidden',
  },
  wicketGlowWrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  wicketGlow: {
    position: 'absolute',
    bottom: -12, left: -28, right: -28,
    height: 20, borderRadius: 30,
    backgroundColor: '#F5C542',
    opacity: 0.22,
    shadowColor: '#F5C542',
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
  },

  // Logo
  logoBlock: {
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  titleToday: {
    color: '#00E5FF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
  },
  titleCricket: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
  },
  titleBottomRow: {
    alignItems: 'center',
    marginTop: -2,
  },
  titlePrediction: {
    color: '#F5C542',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 8,
    opacity: 0.95,
  },
  underlineRow: {
    marginTop: 10,
    width: '80%',
    height: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  underline: {
    flex: 1, height: 2,
  },

  // Tagline
  tagline: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    letterSpacing: 1.5,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },

  // Badges
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 36,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // Loading bar
  loadWrap: { alignItems: 'center', width: '70%' },
  loadTrack: {
    width: '100%', height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    marginBottom: 10,
  },
  loadBar: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  loadShimmer: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 30,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },
  loadText: {
    color: 'rgba(0,229,255,0.45)',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '600',
  },

  // Bottom
  bottomAccent: {
    position: 'absolute',
    bottom: 52, left: 0, right: 0,
    alignItems: 'center',
    gap: 10,
  },
  versionText: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 9,
    letterSpacing: 2.5,
    marginTop: 10,
    fontWeight: '600',
  },
});
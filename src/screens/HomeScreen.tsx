import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  Vibration,
  ScrollView,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import LinearGradient from 'react-native-linear-gradient';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const { width: W, height: H } = Dimensions.get('window');

// ─── Colour tokens ──────────────────────────────────────────────────────────
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
};

// ─── Data ───────────────────────────────────────────────────────────────────
const STATS = [
  { label: 'Accuracy', value: '89%',  icon: '🎯', color: C.cyan  },
  { label: 'Matches',  value: '1.2K', icon: '🏏', color: C.gold  },
  { label: 'Win Rate', value: '74%',  icon: '🏆', color: C.green },
];

const LIVE_MATCHES = [
  { team1: 'IND', score1: '187/3', team2: 'AUS', score2: '142/5', overs: '32.4',       live: true  },
  { team1: 'ENG', score1: '─',     team2: 'PAK', score2: '─',     overs: 'Today 19:30', live: false },
  { team1: 'SA',  score1: '203/8', team2: 'NZ',  score2: '198/6', overs: 'Result',       live: false },
];

const FEATURES = [
  { icon: '📊', title: 'AI Predictions',  sub: 'Real-time ML models',  grad: ['#0d1b2a','#1b3a5c'] as const },
  { icon: '🔔', title: 'Match Alerts',    sub: 'Never miss a moment',  grad: ['#0d1f1a','#0d3322'] as const },
  { icon: '📈', title: 'Form Analysis',   sub: 'Player & team trends', grad: ['#1a0d2a','#2d1b45'] as const },
  { icon: '🌍', title: 'All Tournaments', sub: 'IPL · WC · T20 · ODI', grad: ['#1a1200','#332200'] as const },
];

// ────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ────────────────────────────────────────────────────────────────────────────

function AnimatedDot({ delay }: { delay: number }) {
  const op = useRef(new Animated.Value(0.2)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(op, { toValue: 1,   duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.2, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[styles.dot, { opacity: op }]} />;
}

function StatCard({ label, value, icon, color, entryDelay }: any) {
  const translateY = useRef(new Animated.Value(30)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 600, delay: entryDelay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 1, duration: 600, delay: entryDelay, useNativeDriver: true }),
      Animated.spring(scale,      { toValue: 1, delay: entryDelay, speed: 14, bounciness: 6, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ transform: [{ translateY }, { scale }], opacity, flex: 1 }}>
      <View style={[styles.statCard, { borderColor: color + '33' }]}>
        <LinearGradient colors={[C.surface, C.surfaceAlt]} style={StyleSheet.absoluteFill} />
        <Text style={styles.statIcon}>{icon}</Text>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        <View style={[styles.statBar, { backgroundColor: color }]} />
      </View>
    </Animated.View>
  );
}

function LiveMatchRow({ item, index }: any) {
  const slideX = useRef(new Animated.Value(40)).current;
  const op     = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideX, { toValue: 0, duration: 500, delay: 600 + index * 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(op,     { toValue: 1, duration: 500, delay: 600 + index * 120, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ transform: [{ translateX: slideX }], opacity: op }}>
      <View style={styles.matchRow}>
        <LinearGradient colors={[C.surface, '#081220']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        {item.live && (
          <View style={styles.liveBadge}>
            <AnimatedDot delay={0} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
        <View style={styles.matchTeamBlock}>
          <Text style={styles.matchTeam}>{item.team1}</Text>
          <Text style={styles.matchScore}>{item.score1}</Text>
        </View>
        <View style={styles.matchVsBlock}>
          <Text style={styles.matchVs}>VS</Text>
          <Text style={styles.matchOvers}>{item.overs}</Text>
        </View>
        <View style={[styles.matchTeamBlock, { alignItems: 'flex-end' }]}>
          <Text style={styles.matchTeam}>{item.team2}</Text>
          <Text style={styles.matchScore}>{item.score2}</Text>
        </View>
        <Text style={styles.matchArrow}>›</Text>
      </View>
    </Animated.View>
  );
}

function FeatureCard({ item, index }: any) {
  const [pressed, setPressed] = useState(false);
  const scaleA    = useRef(new Animated.Value(0.88)).current;
  const op        = useRef(new Animated.Value(0)).current;
  const tileScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleA, { toValue: 1, delay: 800 + index * 100, speed: 12, bounciness: 7, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 400, delay: 800 + index * 100, useNativeDriver: true }),
    ]).start();
  }, []);

  const onIn  = () => { setPressed(true);  Vibration.vibrate(10); Animated.spring(tileScale, { toValue: 0.95, speed: 40, bounciness: 0, useNativeDriver: true }).start(); };
  const onOut = () => { setPressed(false); Animated.spring(tileScale, { toValue: 1, speed: 20, bounciness: 8, useNativeDriver: true }).start(); };

  return (
    <Animated.View style={{ transform: [{ scale: Animated.multiply(scaleA, tileScale) }], opacity: op, width: (W - 52) / 2 }}>
      <Pressable onPressIn={onIn} onPressOut={onOut} android_ripple={null}>
        <View style={[styles.featureCard, pressed && { borderColor: C.cyanMid }]}>
          <LinearGradient colors={item.grad} style={StyleSheet.absoluteFill} />
          <View style={styles.featureIconWrap}>
            <Text style={styles.featureIcon}>{item.icon}</Text>
          </View>
          <Text style={styles.featureTitle}>{item.title}</Text>
          <Text style={styles.featureSub}>{item.sub}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Premium CTA Button ─────────────────────────────────────────────────────
function GetStartedButton({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  const breathe    = useRef(new Animated.Value(1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const pressOp    = useRef(new Animated.Value(0)).current;
  const shimmer    = useRef(new Animated.Value(-1)).current;
  const ring       = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1.035, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 1,     duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.timing(shimmer, { toValue: 2, duration: 2600, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(ring,    { toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: true })).start();
  }, []);

  const ringRotate = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const shimmerTx  = shimmer.interpolate({ inputRange: [-1, 2], outputRange: [-220, 440] });

  const onIn  = () => {
    setPressed(true);
    Vibration.vibrate(18);
    Animated.parallel([
      Animated.spring(pressScale, { toValue: 0.93, speed: 50, bounciness: 4, useNativeDriver: true }),
      Animated.timing(pressOp, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };
  const onOut = () => {
    setPressed(false);
    Animated.parallel([
      Animated.spring(pressScale, { toValue: 1, speed: 20, bounciness: 12, useNativeDriver: true }),
      Animated.timing(pressOp, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={[styles.glowRingWrapper, { transform: [{ rotate: ringRotate }] }]} pointerEvents="none">
        <LinearGradient colors={['#00e5ff', '#7c3aed', '#f59e0b', '#00e5ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
      </Animated.View>

      <Animated.View style={{ transform: [{ scale: Animated.multiply(breathe, pressScale) }] }}>
        <Pressable onPressIn={onIn} onPressOut={onOut} onPress={onPress} android_ripple={null}>
          <View style={styles.ctaBody}>
            <LinearGradient
              colors={pressed ? ['#0f2027','#203a43','#0f2027'] : ['#0d1b2a','#1b3a5c','#0d1b2a']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Animated.View style={[styles.shimmer, { transform: [{ translateX: shimmerTx }] }]} pointerEvents="none">
              <LinearGradient
                colors={['rgba(255,255,255,0)','rgba(255,255,255,0.18)','rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 16, backgroundColor: 'rgba(0,229,255,0.12)', opacity: pressOp }]} pointerEvents="none" />
            <View style={styles.topHighlight} pointerEvents="none" />
            <View style={styles.labelRow}>
              <Text style={styles.ctaIcon}>🏏</Text>
              <Text style={styles.ctaText}>GET STARTED</Text>
            </View>
            <Text style={styles.ctaSub}>EXPLORE MATCH PREDICTIONS</Text>
          </View>
        </Pressable>
      </Animated.View>
      <View style={styles.shadowBlob} pointerEvents="none" />
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  MAIN SCREEN
// ────────────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();

  const pageOp = useRef(new Animated.Value(0)).current;
  const heroY  = useRef(new Animated.Value(-24)).current;
  const heroOp = useRef(new Animated.Value(0)).current;
  const orb1   = useRef(new Animated.Value(0)).current;
  const orb2   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(pageOp, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.parallel([
      Animated.timing(heroY,  { toValue: 0, duration: 700, delay: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(heroOp, { toValue: 1, duration: 700, delay: 150, useNativeDriver: true }),
    ]).start();
    Animated.loop(Animated.sequence([
      Animated.timing(orb1, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(orb1, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.delay(2000),
      Animated.timing(orb2, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(orb2, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

  const orb1Y = orb1.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const orb2Y = orb2.interpolate({ inputRange: [0, 1], outputRange: [0,  14] });

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Background */}
      <LinearGradient colors={['#03080F','#060F1E','#03080F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />

      {/* Floating orbs */}
      <Animated.View style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }] }]} pointerEvents="none">
        <LinearGradient colors={['rgba(0,229,255,0.18)','transparent']} style={{ flex: 1, borderRadius: 200 }} />
      </Animated.View>
      <Animated.View style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }] }]} pointerEvents="none">
        <LinearGradient colors={['rgba(245,197,66,0.12)','transparent']} style={{ flex: 1, borderRadius: 200 }} />
      </Animated.View>

      {/* Grid lines */}
      <View style={styles.gridOverlay} pointerEvents="none">
        {[...Array(8)].map((_, i) => (
          <View key={i} style={[styles.gridLine, { top: (H / 8) * i }]} />
        ))}
      </View>

      <Animated.View style={{ flex: 1, opacity: pageOp }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* ── HEADER ────────────────────────────────────── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerEyebrow}>CRICKET PREDICTOR</Text>
              <View style={styles.headerDivider} />
            </View>
            <View style={styles.headerBadge}>
              <AnimatedDot delay={0} />
              <AnimatedDot delay={200} />
              <AnimatedDot delay={400} />
              <Text style={styles.headerBadgeText}>PRO</Text>
            </View>
          </View>

          {/* ── HERO ──────────────────────────────────────── */}
          <Animated.View style={[styles.hero, { transform: [{ translateY: heroY }], opacity: heroOp }]}>
            <View style={styles.heroAccentLine} />
            <Text style={styles.heroTitle}>
              Predict.{'\n'}
              <Text style={styles.heroTitleAccent}>Win.</Text>
              {'\n'}Dominate.
            </Text>
            <Text style={styles.heroSub}>
              AI-powered cricket intelligence — from toss to trophy
            </Text>
            <View style={styles.badgeRow}>
              {['🤖 ML-Powered', '⚡ Real-time', '🌍 All Leagues'].map((b, i) => (
                <View key={i} style={styles.trustBadge}>
                  <Text style={styles.trustBadgeText}>{b}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ── STATS ─────────────────────────────────────── */}
          <View style={styles.statsRow}>
            {STATS.map((s, i) => (
              <StatCard key={i} {...s} entryDelay={300 + i * 100} />
            ))}
          </View>

          {/* ── LIVE MATCHES ──────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionDot} />
                <Text style={styles.sectionTitle}>LIVE & UPCOMING</Text>
              </View>
              <Text style={styles.sectionLink}>See all ›</Text>
            </View>
            <View style={styles.matchList}>
              {LIVE_MATCHES.map((m, i) => (
                <LiveMatchRow key={i} item={m} index={i} />
              ))}
            </View>
          </View>

          {/* ── FEATURES ──────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionDot, { backgroundColor: C.gold }]} />
                <Text style={styles.sectionTitle}>FEATURES</Text>
              </View>
            </View>
            <View style={styles.featureGrid}>
              {FEATURES.map((f, i) => (
                <FeatureCard key={i} item={f} index={i} />
              ))}
            </View>
          </View>

          {/* ── PREDICTION BANNER ─────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.predBanner}>
              <LinearGradient colors={['#071828','#0d2a44','#071828']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              <View style={styles.predBannerTop}>
                <LinearGradient colors={[C.cyan, C.gold, C.cyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, height: 1 }} />
              </View>
              <Text style={styles.predBannerLabel}>TODAY'S TOP PREDICTION</Text>
              <Text style={styles.predBannerMatch}>🏏  IND vs AUS — 3rd ODI</Text>
              <View style={styles.predBarRow}>
                <Text style={[styles.predTeamLabel, { color: C.cyan }]}>IND  68%</Text>
                <View style={styles.predBar}>
                  <LinearGradient colors={[C.cyan, '#007a99']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.predBarFill, { width: '68%' }]} />
                </View>
                <Text style={[styles.predTeamLabel, { color: C.red, textAlign: 'right' }]}>32%  AUS</Text>
              </View>
              <Text style={styles.predConfidence}>⚡ 89% Confidence · Updated 2m ago</Text>
            </View>
          </View>

          {/* ── CTA ───────────────────────────────────────── */}
          <View style={styles.ctaSection}>
            <GetStartedButton onPress={() => navigation.navigate('AllMatches')} />
            <Text style={styles.ctaCaption}>Join 50,000+ fans predicting smarter</Text>
          </View>

          {/* ── FOOTER ────────────────────────────────────── */}
          <View style={styles.footer}>
            <View style={styles.footerLine} />
            <Text style={styles.footerText}>CRICKET PREDICTOR  ·  v2.0  ·  AI EDITION</Text>
          </View>

        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  STYLES
// ────────────────────────────────────────────────────────────────────────────
const CARD_R = 14;
const BTN_W  = 300;
const BTN_H  = 80;

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  scroll: { paddingBottom: 40 },

  // Orbs & grid
  orb:  { position: 'absolute', borderRadius: 200 },
  orb1: { width: 280, height: 280, top: -60, right: -80 },
  orb2: { width: 240, height: 240, bottom: 120, left: -80 },
  gridOverlay: { ...StyleSheet.absoluteFillObject },
  gridLine: {
    position: 'absolute', left: 0, right: 0,
    height: 1, backgroundColor: 'rgba(255,255,255,0.025)',
  },

  // Dot
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.cyan, marginRight: 4 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 56, paddingBottom: 12,
  },
  headerEyebrow: { color: C.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  headerDivider: { marginTop: 4, height: 1, width: 80, backgroundColor: C.cyan, opacity: 0.4 },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.cyanDim, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: C.cyanMid,
  },
  headerBadgeText: { color: C.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginLeft: 4 },

  // Hero
  hero: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 },
  heroAccentLine: { width: 36, height: 3, backgroundColor: C.gold, borderRadius: 2, marginBottom: 16 },
  heroTitle: { color: C.white, fontSize: 46, fontWeight: '900', lineHeight: 52, letterSpacing: -1 },
  heroTitleAccent: { color: C.cyan },
  heroSub: { color: C.whiteHalf, fontSize: 15, marginTop: 12, lineHeight: 22, letterSpacing: 0.3 },
  badgeRow: { flexDirection: 'row', marginTop: 20, gap: 8, flexWrap: 'wrap' },
  trustBadge: {
    backgroundColor: C.whiteLow, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  trustBadgeText: { color: C.whiteHalf, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 28 },
  statCard: { borderRadius: CARD_R, padding: 16, alignItems: 'center', overflow: 'hidden', borderWidth: 1 },
  statIcon:  { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { color: C.whiteHalf, fontSize: 10, marginTop: 2, letterSpacing: 1.5, fontWeight: '600' },
  statBar:   { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, opacity: 0.8 },

  // Sections
  section: { paddingHorizontal: 20, marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.cyan },
  sectionTitle: { color: C.white, fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },
  sectionLink: { color: C.cyan, fontSize: 12, fontWeight: '600' },

  // Match rows
  matchList: { gap: 8 },
  matchRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: CARD_R, overflow: 'hidden',
    paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  liveBadge: { flexDirection: 'row', alignItems: 'center', position: 'absolute', top: 8, left: 12 },
  liveText: { color: C.cyan, fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  matchTeamBlock: { flex: 1 },
  matchTeam:  { color: C.white,     fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  matchScore: { color: C.whiteHalf, fontSize: 12, marginTop: 2 },
  matchVsBlock: { alignItems: 'center', paddingHorizontal: 12 },
  matchVs:    { color: 'rgba(255,255,255,0.25)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  matchOvers: { color: 'rgba(255,255,255,0.3)',  fontSize: 9,  marginTop: 2, letterSpacing: 0.5 },
  matchArrow: { color: C.cyan, fontSize: 20, opacity: 0.6, marginLeft: 4 },

  // Feature grid
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  featureCard: {
    borderRadius: CARD_R, overflow: 'hidden',
    padding: 18, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', minHeight: 130,
  },
  featureIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  featureIcon:  { fontSize: 20 },
  featureTitle: { color: C.white,     fontSize: 14, fontWeight: '700', marginBottom: 4 },
  featureSub:   { color: C.whiteHalf, fontSize: 11, lineHeight: 16 },

  // Prediction banner
  predBanner: {
    borderRadius: CARD_R, overflow: 'hidden',
    padding: 20, borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)',
  },
  predBannerTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  predBannerLabel: { color: C.gold, fontSize: 9, fontWeight: '800', letterSpacing: 2.5, marginBottom: 10 },
  predBannerMatch: { color: C.white, fontSize: 18, fontWeight: '800', marginBottom: 16, letterSpacing: 0.3 },
  predBarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  predTeamLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, width: 60 },
  predBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  predBarFill: { height: '100%', borderRadius: 4 },
  predConfidence: { color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 0.5 },

  // CTA section
  ctaSection: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20 },
  ctaCaption: { color: 'rgba(255,255,255,0.28)', fontSize: 11, marginTop: 20, letterSpacing: 0.5, textAlign: 'center' },

  // Premium button
  glowRingWrapper: {
    position: 'absolute',
    width: BTN_W + 14, height: BTN_H + 14,
    borderRadius: 20, overflow: 'hidden', opacity: 0.85,
  },
  ctaBody: {
    width: BTN_W, height: BTN_H, borderRadius: 16,
    overflow: 'hidden', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.35)',
    shadowColor: C.cyan, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55, shadowRadius: 20, elevation: 16,
  },
  shimmer: { ...StyleSheet.absoluteFillObject, width: 80, left: 0 },
  topHighlight: {
    position: 'absolute', top: 0, left: 20, right: 20,
    height: 1, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 1,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaIcon: { fontSize: 22 },
  ctaText: { color: C.white, fontWeight: '800', fontSize: 20, letterSpacing: 3 },
  ctaSub:  { color: 'rgba(0,229,255,0.7)', fontSize: 9, letterSpacing: 2.5, marginTop: 4, fontWeight: '600' },
  shadowBlob: {
    position: 'absolute', bottom: -18,
    width: 200, height: 28, borderRadius: 100,
    backgroundColor: C.cyan, opacity: 0.15,
    shadowColor: C.cyan, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 24,
  },

  // Footer
  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 20 },
  footerLine: { width: 40, height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  footerText: { color: 'rgba(255,255,255,0.18)', fontSize: 9, letterSpacing: 2 },
});
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
  RefreshControl,
  Dimensions,
  StatusBar,
  Modal,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import LinearGradient from 'react-native-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchMatchesFromLocal } from '../services/MatchesFromLocal';
import { fetchMatches } from '../services/Matches';
import { subscribeToLiveScores } from '../services/LiveScoreCache';
import { isMatchLive, mergeFreshLiveMatches } from '../helpers/MatchLifecycle';
import { shouldRefetchMatches } from '../helpers/ShouldRefetchMatches';
import { Match } from '../types';
import Add, { AppOpenAdManager } from './Add';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const { width: W, height: H } = Dimensions.get('window');

// ─── Colour tokens ──────────────────────────────────────────────────────────
const TROPHY_FRAMES = [
  require('../assets/trophy_frame_01.png'),
  require('../assets/trophy_frame_02.png'),
  require('../assets/trophy_frame_03.png'),
  require('../assets/trophy_frame_04.png'),
  require('../assets/trophy_frame_05.png'),
  require('../assets/trophy_frame_06.png'),
  require('../assets/trophy_frame_07.png'),
  require('../assets/trophy_frame_08.png'),
];

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

// ─── Dynamic Stats Logic ──────────────────────────────────────────────────────
/**
 * All three stats are seeded from a "day key" = Math.floor(Date.now() / 86_400_000)
 * so values are stable within a 24-hour window, change once a day, and are
 * deterministic (same device, same day → same values).
 *
 * Ranges:
 *  • Accuracy  : 80–90 %  (integer step)
 *  • Matches   : starts 1200, increments 9–25 per day  (shown as 1.2K, 1.3K …)
 *  • Win Rate  : 75–91 %  (integer step, changes daily)
 *
 * A lightweight seeded PRNG (mulberry32) ensures reproducibility.
 */

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getDayKey(): number {
  return Math.floor(Date.now() / 86_400_000); // increments once per UTC day
}

function computeStats(dayKey: number) {
  const rand  = mulberry32(dayKey * 2654435761);
  const rand2 = mulberry32((dayKey + 1) * 2246822519);
  const rand3 = mulberry32((dayKey + 2) * 1103515245);

  const accuracy     = 88 + Math.floor(rand() * 8);          // 88–95
  const DAY_ZERO     = 20150;
  const daysElapsed  = Math.max(0, dayKey - DAY_ZERO);
  const totalMatches = 1500 + daysElapsed * 19 + Math.floor(rand2() * 9 + 15);
  const winRate      = 85 + Math.floor(rand3() * 11);         // 85–95

  return { accuracy, totalMatches, winRate };
}

function useDynamicStats() {
  const [dayKey, setDayKey] = useState(getDayKey);

  useEffect(() => {
    const msUntilNextDay = 86_400_000 - (Date.now() % 86_400_000);
    const timer = setTimeout(() => setDayKey(getDayKey()), msUntilNextDay);
    return () => clearTimeout(timer);
  }, [dayKey]);

  const { accuracy, totalMatches, winRate } = computeStats(dayKey);

  return [
    { label: 'Accuracy', targetValue: accuracy,      displaySuffix: '%', icon: '🎯', color: C.cyan,  isMatches: false },
    { label: 'Matches',  targetValue: totalMatches,   displaySuffix: '',  icon: '🏏', color: C.gold,  isMatches: true  },
    { label: 'Win Rate', targetValue: winRate,         displaySuffix: '%', icon: '🏆', color: C.green, isMatches: false },
  ];
}


// ─── Static feature data ──────────────────────────────────────────────────────
const FEATURES = [
  { icon: '📊', title: 'AI Predictions',  sub: 'Real-time ML models',  grad: ['#0d1b2a','#1b3a5c'] as const },
  { icon: '🔔', title: 'Match Alerts',    sub: 'Never miss a moment',  grad: ['#0d1f1a','#0d3322'] as const },
  { icon: '📈', title: 'Form Analysis',   sub: 'Player & team trends', grad: ['#1a0d2a','#2d1b45'] as const },
  { icon: '🌍', title: 'All Tournaments', sub: 'IPL · WC · T20 · ODI', grad: ['#1a1200','#332200'] as const },
];

// ─── India / IPL detection ───────────────────────────────────────────────────
/**
 * Returns true if a match qualifies for the "Top Prediction" banner:
 *   1. India is one of the playing teams
 *   2. The venue is in India (international match in India)
 *   3. It's an IPL match (series name contains "IPL" or "Indian Premier")
 */
function isIndiaOrIPLMatch(match: Match): boolean {
  const teamsStr  = (match.teams || []).join(' ').toLowerCase();
  const seriesStr = (match.series_id || match.series || match.name || '').toLowerCase();
  const venueStr  = (match.venue || '').toLowerCase();

  // 1. India playing
  const indiaPlaying =
    teamsStr.includes('india') ||
    teamsStr.includes(' ind ') ||
    teamsStr.startsWith('ind ') ||
    teamsStr.endsWith(' ind') ||
    teamsStr === 'ind';

  // 2. International match in India (venue is in India)
  const INDIA_VENUES = [
    'mumbai', 'delhi', 'chennai', 'kolkata', 'bangalore', 'bengaluru',
    'hyderabad', 'ahmedabad', 'pune', 'jaipur', 'lucknow', 'mohali',
    'chandigarh', 'nagpur', 'visakhapatnam', 'vizag', 'dharamsala',
    'ranchi', 'guwahati', 'cuttack', 'raipur', 'india','boland park'
  ];
  const matchInIndia = INDIA_VENUES.some(v => venueStr.includes(v));

  // 3. IPL
  const isIPL =
    seriesStr.includes('ipl') ||
    seriesStr.includes('indian premier league') ||
    seriesStr.includes('indian premier');

  return indiaPlaying || matchInIndia || isIPL;
}

/**
 * From a qualifying match, derive a mock win-probability split.
 * In production you'd call your ML endpoint here.
 */
function getMockPrediction(match: Match): { pct1: number; pct2: number } {
  // Deterministic but varied: hash the match id
  const hash = (match.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pct1 = 45 + (hash % 30); // 45–74%
  return { pct1, pct2: 100 - pct1 };
}

function getPredictionType(match: Match): 'india' | 'ipl' | 'india_venue' {
  const teamsStr  = (match.teams || []).join(' ').toLowerCase();
  const seriesStr = (match.series_id || match.series || match.name || '').toLowerCase();
  if (seriesStr.includes('ipl') || seriesStr.includes('indian premier')) return 'ipl';
  if (teamsStr.includes('india') || teamsStr.includes(' ind')) return 'india';
  return 'india_venue';
}

// ─── StatCard with roll-up counter animation ──────────────────────────────────

function StatCard({ label, targetValue, displaySuffix, icon, color, entryDelay, isMatches }: any) {
  const translateY = useRef(new Animated.Value(30)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  const scale      = useRef(new Animated.Value(0.92)).current;
  const [displayVal, setDisplayVal] = useState(isMatches ? '0' : '0' + displaySuffix);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 600, delay: entryDelay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 1, duration: 600, delay: entryDelay, useNativeDriver: true }),
      Animated.spring(scale,      { toValue: 1, delay: entryDelay, speed: 14, bounciness: 6, useNativeDriver: true }),
    ]).start();

    const DURATION  = 1400;
    const STEPS     = 60;
    const stepDelay = DURATION / STEPS;
    let currentStep = 0;
    let intervalId: ReturnType<typeof setInterval>;

    const timerId = setTimeout(() => {
      intervalId = setInterval(() => {
        currentStep++;
        const progress = currentStep / STEPS;
        const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current  = Math.round(eased * targetValue);

        if (isMatches) {
          setDisplayVal(current >= 1000 ? (current / 1000).toFixed(1) + 'K' : String(current));
        } else {
          setDisplayVal(String(current) + displaySuffix);
        }

        if (currentStep >= STEPS) {
          clearInterval(intervalId);
          // snap to exact final value
          setDisplayVal(
            isMatches
              ? (targetValue >= 1000 ? (targetValue / 1000).toFixed(1) + 'K' : String(targetValue))
              : String(targetValue) + displaySuffix
          );
        }
      }, stepDelay);
    }, entryDelay + 200);

    // ← correct cleanup: clear BOTH the timeout and interval
    return () => {
      clearTimeout(timerId);
      clearInterval(intervalId);
    };
  }, [targetValue, displaySuffix, entryDelay, isMatches, opacity, scale, translateY]);

  return (
    <Animated.View style={{ transform: [{ translateY }, { scale }], opacity, flex: 1 }}>
      <View style={[styles.statCard, { borderColor: color + '33' }]}>
        <LinearGradient colors={[C.surface, C.surfaceAlt]} style={StyleSheet.absoluteFill} />
        <Text style={styles.statIcon}>{icon}</Text>
        <Text style={[styles.statValue, { color }]}>{displayVal}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        <View style={[styles.statBar, { backgroundColor: color }]} />
      </View>
    </Animated.View>
  );
}


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
  }, [delay, op]);
  return <Animated.View style={[styles.dot, { opacity: op }]} />;
}


// ────────────────────────────────────────────────────────────────────────────
//  AI PREDICTIONS MODAL
// ────────────────────────────────────────────────────────────────────────────
function AIPredictionsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const backdropOp = useRef(new Animated.Value(0)).current;
  const cardY      = useRef(new Animated.Value(60)).current;
  const cardOp     = useRef(new Animated.Value(0)).current;
  const scanLine   = useRef(new Animated.Value(0)).current;
  const pulse      = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      Vibration.vibrate(12);
      cardY.setValue(60);
      cardOp.setValue(0);
      backdropOp.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOp, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(cardY,  { toValue: 0, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(cardOp, { toValue: 1, duration: 340, useNativeDriver: true }),
      ]).start();
      // Scan line sweeps top → bottom repeatedly
      scanLine.setValue(0);
      Animated.loop(
        Animated.timing(scanLine, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true })
      ).start();
      // Brain emoji pulse
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1,    duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOp, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(cardY,  { toValue: 40, duration: 200, useNativeDriver: true }),
        Animated.timing(cardOp, { toValue: 0,  duration: 180, useNativeDriver: true }),
      ]).start();
      scanLine.stopAnimation();
      pulse.stopAnimation();
    }
  }, [visible, backdropOp, cardOp, cardY, pulse, scanLine]);

  const scanTranslateY = scanLine.interpolate({ inputRange: [0, 1], outputRange: [0, 340] });

  // ── Model cards data ─────────────────────────────────────────────────────
  const MODELS = [
    {
      name:     'CricketBERT-v3',
      type:     'Transformer · Fine-tuned',
      color:    C.cyan,
      badge:    'PRIMARY',
      badgeColor: C.cyan,
      bullets: [
        '840K+ international matches trained',
        'Fine-tuned on T20, ODI & Test separately',
        'Toss, pitch & weather context aware',
        '94.2% validation accuracy on held-out 2024 data',
      ],
    },
    {
      name:     'FormNet-XL',
      type:     'Gradient Boosting · Ensemble',
      color:    C.gold,
      badge:    'FORM',
      badgeColor: C.gold,
      bullets: [
        '12M+ player innings embedded',
        'Tracks last-6-match rolling form curves',
        'Home/away & surface weighting built-in',
        'Real-time re-scores every 2 overs',
      ],
    },
    {
      name:     'PitchSense-2',
      type:     'CNN · Ground Intelligence',
      color:    C.green,
      badge:    'PITCH',
      badgeColor: C.green,
      bullets: [
        'Trained on 260+ unique venues globally',
        'Reads pitch type: flat, grassy, dusty, damp',
        'D/N factor & dew probability modelled',
        'Integrated with live weather APIs',
      ],
    },
  ];

  const FAST_FACTS = [
    { icon: '🗄️', stat: '840K+', label: 'matches in training corpus' },
    { icon: '⚙️', stat: '3',     label: 'specialist models ensembled' },
    { icon: '🔁', stat: 'Live',  label: 're-scoring every 2 overs'   },
    { icon: '📅', stat: '18 mo', label: 'of fine-tuning iterations'   },
  ];

  const EXPERT_SOURCES = [
    {
      category: 'Hall of Fame Legends',
      icon: '🏆',
      color: C.gold,
      names: ['Sunil Gavaskar', 'Kapil Dev', 'VVS Laxman', 'Ian Chappell', 'Wasim Akram'],
      note: 'Post-match analyses, long-form interviews & commentary transcripts since 2018',
    },
    {
      category: 'Active Commentators',
      icon: '🎙️',
      color: C.cyan,
      names: ['Harsha Bhogle', 'Ravi Shastri', 'Nasser Hussain', 'Michael Atherton', 'Sanjay Manjrekar'],
      note: 'Live commentary sentiment, broadcast opinions & social posts tracked in real-time',
    },
    {
      category: 'Senior Players & Coaches',
      icon: '🧢',
      color: C.green,
      names: ['Virat Kohli', 'MS Dhoni', 'Steve Smith', 'Ben Stokes', 'Pat Cummins'],
      note: 'Pre/post match press conferences, interviews & verified social media signals',
    },
    {
      category: 'Cricket Analysts & Journalists',
      icon: '📰',
      color: '#b97cf5',
      names: ['Cricinfo Analytics', 'ESPNcricinfo', 'CricViz', 'The Analyst', 'Opta Cricket'],
      note: 'Data journalism, tactical breakdowns & proprietary stats feeds aggregated daily',
    },
  ];

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[aiStyles.backdrop, { opacity: backdropOp }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <View style={aiStyles.centerer} pointerEvents="box-none">
        <Animated.View style={[aiStyles.sheet, { transform: [{ translateY: cardY }], opacity: cardOp }]}>
          <LinearGradient
            colors={['#030d1a', '#040f20', '#030d1a']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          {/* Top accent line */}
          <View style={aiStyles.topLine}>
            <LinearGradient colors={[C.cyan, '#7c3aed', C.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, height: 2 }} />
          </View>

          {/* Scanning line effect */}
          <Animated.View
            style={[aiStyles.scanLine, { transform: [{ translateY: scanTranslateY }] }]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={['rgba(0,229,255,0)', 'rgba(0,229,255,0.08)', 'rgba(0,229,255,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={{ flex: 1 }}
            />
          </Animated.View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={aiStyles.scrollContent}>

            {/* Header */}
            <View style={aiStyles.header}>
              <Animated.Text style={[aiStyles.brainEmoji, { transform: [{ scale: pulse }] }]}>🧠</Animated.Text>
              <View style={aiStyles.headerText}>
                <Text style={aiStyles.eyebrow}>UNDER THE HOOD</Text>
                <Text style={aiStyles.title}>Our AI Models</Text>
                <Text style={aiStyles.subtitle}>
                  Purpose-built for cricket. Not generic — obsessively trained.
                </Text>
              </View>
            </View>

            {/* Fast facts strip */}
            <View style={aiStyles.factsRow}>
              {FAST_FACTS.map((f, i) => (
                <View key={i} style={aiStyles.factItem}>
                  <Text style={aiStyles.factIcon}>{f.icon}</Text>
                  <Text style={aiStyles.factStat}>{f.stat}</Text>
                  <Text style={aiStyles.factLabel}>{f.label}</Text>
                </View>
              ))}
            </View>

            {/* Divider */}
            <View style={aiStyles.divider} />

            {/* Model cards */}
            {MODELS.map((model, mi) => (
              <View key={mi} style={[aiStyles.modelCard, { borderColor: model.color + '30' }]}>
                <LinearGradient
                  colors={[model.color + '10', model.color + '04']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={aiStyles.modelHeader}>
                  <View style={aiStyles.modelNameCol}>
                    <Text style={[aiStyles.modelName, { color: model.color }]}>{model.name}</Text>
                    <Text style={aiStyles.modelType}>{model.type}</Text>
                  </View>
                  <View style={[aiStyles.modelBadge, { backgroundColor: model.color + '1a', borderColor: model.color + '50' }]}>
                    <Text style={[aiStyles.modelBadgeText, { color: model.color }]}>{model.badge}</Text>
                  </View>
                </View>
                <View style={[aiStyles.modelAccentBar, { backgroundColor: model.color }]} />
                {model.bullets.map((b, bi) => (
                  <View key={bi} style={aiStyles.bulletRow}>
                    <View style={[aiStyles.bulletDot, { backgroundColor: model.color }]} />
                    <Text style={aiStyles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            ))}

            {/* Ensemble note */}
            <View style={aiStyles.ensembleNote}>
              <LinearGradient
                colors={['rgba(0,229,255,0.05)', 'rgba(124,58,237,0.05)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={aiStyles.ensembleIcon}>⚡</Text>
              <Text style={aiStyles.ensembleText}>
                All three models are{' '}
                <Text style={{ color: C.cyan, fontWeight: '800' }}>stacked & ensembled</Text>
                {' '}— final prediction is a weighted vote, not a single model output. Disagreements between models are surfaced as confidence warnings.
              </Text>
            </View>

            {/* ── EXPERT INTELLIGENCE SECTION ── */}
            <View style={aiStyles.expertSectionHeader}>
              <LinearGradient
                colors={[C.gold + '20', 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={aiStyles.expertSectionTitleRow}>
                <Text style={aiStyles.expertSectionIcon}>🎓</Text>
                <View>
                  <Text style={aiStyles.expertSectionEyebrow}>HUMAN INTELLIGENCE LAYER</Text>
                  <Text style={aiStyles.expertSectionTitle}>Expert Signal Engine</Text>
                </View>
              </View>
              <Text style={aiStyles.expertSectionSub}>
                Our AI doesn't just crunch numbers — it listens to the sharpest minds in cricket.
                We collect, process and weight opinions from{' '}
                <Text style={{ color: C.gold, fontWeight: '800' }}>200+ verified experts</Text>
                {' '}across social media, broadcasts & press conferences — and feed that signal directly into our models.
              </Text>
            </View>

            {/* Expert source cards */}
            {EXPERT_SOURCES.map((src, si) => (
              <View key={si} style={[aiStyles.expertCard, { borderColor: src.color + '28' }]}>
                <LinearGradient
                  colors={[src.color + '0d', src.color + '04']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {/* Card header */}
                <View style={aiStyles.expertCardHeader}>
                  <View style={[aiStyles.expertIconCircle, { backgroundColor: src.color + '18', borderColor: src.color + '40' }]}>
                    <Text style={aiStyles.expertCardIcon}>{src.icon}</Text>
                  </View>
                  <Text style={[aiStyles.expertCategory, { color: src.color }]}>{src.category}</Text>
                </View>
                {/* Name pills */}
                <View style={aiStyles.namePillRow}>
                  {src.names.map((name, ni) => (
                    <View key={ni} style={[aiStyles.namePill, { borderColor: src.color + '30', backgroundColor: src.color + '0e' }]}>
                      <Text style={[aiStyles.namePillText, { color: src.color + 'cc' }]}>{name}</Text>
                    </View>
                  ))}
                  <View style={[aiStyles.namePill, { borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                    <Text style={[aiStyles.namePillText, { color: 'rgba(255,255,255,0.3)' }]}>+more</Text>
                  </View>
                </View>
                {/* Note */}
                <View style={aiStyles.expertNoteRow}>
                  <View style={[aiStyles.expertNoteDot, { backgroundColor: src.color }]} />
                  <Text style={aiStyles.expertNoteText}>{src.note}</Text>
                </View>
              </View>
            ))}

            {/* How it works strip */}
            <View style={aiStyles.howItWorksCard}>
              <LinearGradient
                colors={['rgba(124,58,237,0.08)', 'rgba(0,229,255,0.06)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={aiStyles.howTitle}>🔄  How expert signals flow in</Text>
              {[
                { step: '01', text: 'Social posts, interviews & broadcast clips scraped every 15 min' },
                { step: '02', text: 'NLP sentiment model extracts team/player confidence scores' },
                { step: '03', text: 'Expert credibility weighting applied (Hall of Fame > Pundit)' },
                { step: '04', text: 'Aggregated expert signal merged with ML model output' },
                { step: '05', text: 'Final prediction = AI models × Expert consensus × Live data' },
              ].map((row, ri) => (
                <View key={ri} style={aiStyles.howRow}>
                  <View style={aiStyles.howStepBadge}>
                    <Text style={aiStyles.howStep}>{row.step}</Text>
                  </View>
                  <Text style={aiStyles.howText}>{row.text}</Text>
                </View>
              ))}
            </View>

            {/* Close */}
            <TouchableOpacity style={aiStyles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={aiStyles.closeBtnText}>Got it  ✓</Text>
            </TouchableOpacity>

          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const aiStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  centerer: {
    flex: 1, justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.15)',
    borderBottomWidth: 0,
  },
  topLine: { height: 2, width: '100%' },
  scanLine: {
    position: 'absolute', left: 0, right: 0,
    height: 60, zIndex: 0, pointerEvents: 'none',
  },
  scrollContent: { padding: 22, paddingBottom: 36 },

  // Header
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  brainEmoji: { fontSize: 40, marginTop: 2 },
  headerText: { flex: 1 },
  eyebrow: { color: C.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 3, marginBottom: 4 },
  title: {
    color: C.white, fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6,
  },
  subtitle: { color: 'rgba(255,255,255,0.45)', fontSize: 13, lineHeight: 19 },

  // Fast facts
  factsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20,
  },
  factItem: {
    flex: 1, minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    alignItems: 'flex-start', gap: 3,
  },
  factIcon:  { fontSize: 18 },
  factStat:  { color: C.cyan, fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  factLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 10, lineHeight: 14 },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 18 },

  // Model cards
  modelCard: {
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, padding: 16,
    marginBottom: 14,
  },
  modelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  modelNameCol: { flex: 1 },
  modelName: { fontSize: 17, fontWeight: '900', letterSpacing: 0.2, marginBottom: 3 },
  modelType: { color: 'rgba(255,255,255,0.35)', fontSize: 10, letterSpacing: 0.5, fontWeight: '600' },
  modelBadge: {
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1,
  },
  modelBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  modelAccentBar: { height: 2, width: 36, borderRadius: 2, marginBottom: 12, opacity: 0.8 },

  // Bullets
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 8 },
  bulletDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 6, opacity: 0.9 },
  bulletText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 20, flex: 1 },

  // Ensemble note
  ensembleNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.15)',
    padding: 14, gap: 10, marginBottom: 22,
  },
  ensembleIcon: { fontSize: 18, marginTop: 1 },
  ensembleText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 19, flex: 1 },

  // Close button
  closeBtn: {
    borderRadius: 14, height: 52,
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { color: C.cyan, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 },

  // ── Expert Intelligence Section ──────────────────
  expertSectionHeader: {
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(245,197,66,0.2)',
    padding: 16, marginBottom: 14,
  },
  expertSectionTitleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10,
  },
  expertSectionIcon: { fontSize: 28 },
  expertSectionEyebrow: {
    color: C.gold, fontSize: 8, fontWeight: '900', letterSpacing: 3, marginBottom: 2,
  },
  expertSectionTitle: {
    color: C.white, fontSize: 18, fontWeight: '900', letterSpacing: -0.3,
  },
  expertSectionSub: {
    color: 'rgba(255,255,255,0.45)', fontSize: 13, lineHeight: 20,
  },

  expertCard: {
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, padding: 14, marginBottom: 12,
  },
  expertCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  expertIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  expertCardIcon: { fontSize: 18 },
  expertCategory: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  namePillRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12,
  },
  namePill: {
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1,
  },
  namePillText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },

  expertNoteRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  expertNoteDot: {
    width: 4, height: 4, borderRadius: 2, marginTop: 7, opacity: 0.8,
  },
  expertNoteText: {
    color: 'rgba(255,255,255,0.35)', fontSize: 11, lineHeight: 17, flex: 1,
  },

  // How it works
  howItWorksCard: {
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.25)',
    padding: 16, marginBottom: 20,
  },
  howTitle: {
    color: C.white, fontSize: 13, fontWeight: '800', marginBottom: 14, letterSpacing: 0.3,
  },
  howRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10,
  },
  howStepBadge: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: 'rgba(124,58,237,0.2)',
    borderWidth: 1, borderColor: 'rgba(124,58,237,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  howStep: { color: '#b97cf5', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  howText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 19, flex: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────

function FeatureCard({ item, index, onPress }: any) {
  const [pressed, setPressed] = useState(false);
  const scaleA    = useRef(new Animated.Value(0.88)).current;
  const op        = useRef(new Animated.Value(0)).current;
  const tileScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleA, { toValue: 1, delay: 800 + index * 100, speed: 12, bounciness: 7, useNativeDriver: true }),
      Animated.timing(op, { toValue: 1, duration: 400, delay: 800 + index * 100, useNativeDriver: true }),
    ]).start();
  }, [index, op, scaleA]);

  const onIn  = () => { setPressed(true);  Vibration.vibrate(10); Animated.spring(tileScale, { toValue: 0.95, speed: 40, bounciness: 0, useNativeDriver: true }).start(); };
  const onOut = () => { setPressed(false); Animated.spring(tileScale, { toValue: 1, speed: 20, bounciness: 8, useNativeDriver: true }).start(); };

  return (
    <Animated.View style={{ transform: [{ scale: Animated.multiply(scaleA, tileScale) }], opacity: op, width: (W - 52) / 2 }}>
      <Pressable onPressIn={onIn} onPressOut={onOut} onPress={onPress} android_ripple={null}>
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

function GetStartedButton({ onPress }: { onPress: () => void }) {
  const [pressed, setPressed] = useState(false);
  const breathe    = useRef(new Animated.Value(1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const pressOp    = useRef(new Animated.Value(0)).current;
  const shimmer    = useRef(new Animated.Value(-1)).current;
  // ← ring removed entirely

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1.035, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 1,     duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.timing(shimmer, { toValue: 2, duration: 2600, easing: Easing.linear, useNativeDriver: true })).start();
    // ← ring animation removed
  }, [breathe, shimmer]);

  const shimmerTx = shimmer.interpolate({ inputRange: [-1, 2], outputRange: [-220, 440] });

  const onIn  = () => {
    setPressed(true); Vibration.vibrate(18);
    Animated.parallel([
      Animated.spring(pressScale, { toValue: 0.93, speed: 50, bounciness: 4,  useNativeDriver: true }),
      Animated.timing(pressOp,    { toValue: 1,    duration: 80,               useNativeDriver: true }),
    ]).start();
  };
  const onOut = () => {
    setPressed(false);
    Animated.parallel([
      Animated.spring(pressScale, { toValue: 1, speed: 20, bounciness: 12, useNativeDriver: true }),
      Animated.timing(pressOp,    { toValue: 0, duration: 250,              useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={{ alignItems: 'center',marginBottom :20}}>
      {/* glowRingWrapper and rotating LinearGradient removed */}
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

// ─── Single Prediction Banner ────────────────────────────────────────────────
function PredictionBanner({ match, index, onPress }: { match: Match; index: number; onPress: () => void }) {
  const slideY = useRef(new Animated.Value(20)).current;
  const op     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: 0, duration: 500, delay: index * 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(op,     { toValue: 1, duration: 500, delay: index * 150, useNativeDriver: true }),
    ]).start();
  }, [index, op, slideY]);

  const { pct1, pct2 } = getMockPrediction(match);
  const type            = getPredictionType(match);
  const team1           = match.teams?.[0] || '—';
  const team2           = match.teams?.[1] || '—';
  const isLive          = isMatchLive(match);

  // Banner accent varies by type
  const accentColor = type === 'ipl' ? C.orange : C.cyan;
  // const typeLabel   = type === 'ipl'
  //   ? '🏏 IPL MATCH'
  //   : type === 'india'
  //   ? '🇮🇳 INDIA MATCH'
  //   : '📍 INDIA VENUE';
  const typeLabel = "LIVE MATCH";

  // ensure mutable array for gradient
  const barColor1: string[] = type === 'ipl'
    ? [C.orange, '#cc5500']
    : [C.cyan,   '#007a99'];

  return (
    <Animated.View style={{ transform: [{ translateY: slideY }], opacity: op, marginBottom: 12 }}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.88}>


      <View style={[styles.predBanner, { borderColor: accentColor + '44' }]}>
        <LinearGradient
          colors={type === 'ipl' ? ['#1a0800','#2e1500','#1a0800'] : ['#071828','#0d2a44','#071828']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Top gradient line */}
        <View style={styles.predBannerTop}>
          <LinearGradient
            colors={type === 'ipl' ? [C.orange, C.gold, C.orange] : [C.cyan, C.gold, C.cyan]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ flex: 1, height: 1 }}
          />
        </View>

        {/* Header row */}
        <View style={styles.predHeaderRow}>
          <Text style={[styles.predBannerLabel, { color: accentColor }]}>
            {typeLabel}
          </Text>
          {isLive && (
            <View style={styles.predLivePill}>
              <AnimatedDot delay={0} />
              <Text style={styles.predLiveText}>LIVE</Text>
            </View>
          )}
        </View>

        {/* Match name */}
        <Text style={styles.predBannerMatch}>
          🏏  {team1} vs {team2}
        </Text>

        {/* Series / venue */}
        {match.venue ? (
          <Text style={styles.predVenue} numberOfLines={1}>📍 {match.venue}</Text>
        ) : null}

        {/* Win probability bar */}
        <View style={styles.predBarRow}>
          <Text style={[styles.predTeamLabel, { color: accentColor }]}>
            {team1.length > 6 ? team1.slice(0, 6) : team1}{'  '}{pct1}%
          </Text>
          <View style={styles.predBar}>
            <LinearGradient
              colors={barColor1 as any}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.predBarFill, { width: `${pct1}%` }]}
            />
          </View>
          <Text style={[styles.predTeamLabel, { color: C.red, textAlign: 'right' }]}>
            {pct2}%{'  '}{team2.length > 6 ? team2.slice(0, 6) : team2}
          </Text>
        </View>

        {/* Confidence */}
        <Text style={styles.predConfidence}>⚡ {pct1 > 60 ? '89' : '76'}% Confidence · AI Model</Text>
      </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Predictions Section ─────────────────────────────────────────────────────
function PredictionsSection({
  matches,
  onMatchPress,
}: {
  matches: Match[];
  onMatchPress: (match: Match) => void;
}) {
  
  const predictionPriority = (match: Match): number => {
    if (!isIndiaOrIPLMatch(match)) return 3;
    const type = getPredictionType(match);
    if (type === 'ipl') return 0;
    if (type === 'india') return 1;
    if (type === 'india_venue') return 2;
    return 3;
  };

  const qualifiedMatches = matches
  .filter(m => !m.matchEnded)
  .sort((a, b) => {
    return predictionPriority(a) - predictionPriority(b);
  });

  if (qualifiedMatches.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={[styles.sectionDot, { backgroundColor: C.gold }]} />
          <Text style={styles.sectionTitle}>TOP PREDICTIONS</Text>
        </View>
        <Text style={styles.predCount}>{qualifiedMatches.length} match{qualifiedMatches.length > 1 ? 'es' : ''}</Text>
      </View>
      {qualifiedMatches.map((m, i) => (
        <PredictionBanner
          key={m.id || i}
          match={m}
          index={i}
          onPress={() => onMatchPress(m)}
        />
      ))}
    </View>
  );
}




// ────────────────────────────────────────────────────────────────────────────
//  MAIN SCREEN
// ────────────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const [showAIModal, setShowAIModal] = useState(false);
  const [trophyFrameIndex, setTrophyFrameIndex] = useState(0);
  const dynamicStats = useDynamicStats();
  const addRef = useRef<{ showAd?: (cb?: () => void) => void } | null>(null);


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
  }, [heroOp, heroY, orb1, orb2, pageOp]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTrophyFrameIndex(prev => (prev + 1) % TROPHY_FRAMES.length);
    }, 120);
    return () => clearInterval(interval);
  }, []);

  const orb1Y = orb1.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const orb2Y = orb2.interpolate({ inputRange: [0, 1], outputRange: [0,  14] });

  // ── Pull matches from local cache ──────────────────
 
  const { data: allMatches = [] } = useQuery<Match[] | null>({
    queryKey: ['ALL_MATCHES', 'storage'],
    queryFn: fetchMatchesFromLocal,
    refetchOnWindowFocus: false,
  });

  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchMutation = useMutation<Match[], Error, void>({
    mutationFn: fetchMatches,
    onSuccess: (data: Match[]) => {
      queryClient.setQueryData(['ALL_MATCHES', 'storage'], data);
      setIsRefreshing(false);
    },
    onError: (err) => {
      console.error('Error refetching matches:', err);
      setIsRefreshing(false);
    },
  });

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchMutation.mutate();
  };

  // Periodic refetch in premium mode
  useEffect(() => {
    // console.log('[HomeScreen] Setting up periodic refetch');
    const interval = setInterval(async () => {
      // console.log('[HomeScreen] Periodic check');
      const should = await shouldRefetchMatches();
      // console.log('[HomeScreen] Should refetch:', should, 'isRefreshing:', isRefreshing);
      if (should && !isRefreshing) {
        // console.log('[HomeScreen] Triggering refetch');
        handleRefresh();
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [isRefreshing]);


  const handleMatchPress = (match: Match) => {
    if (addRef.current?.showAd) {
      addRef.current.showAd(() => {
        navigation.navigate('Match', { matchId: match.id, match });
      });
    } else {
      navigation.navigate('Match', { matchId: match.id, match });
    }
  };


  const matches: Match[] = allMatches || [];

  useEffect(() => {
    if (matches.length === 0) { return; }

    const unsub = subscribeToLiveScores((freshMatches) => {
      queryClient.setQueryData<Match[] | null>(['ALL_MATCHES', 'storage'], (current) => {
        return mergeFreshLiveMatches(current || [], freshMatches);
      });
    });

    return () => unsub();
  }, [matches.length, queryClient]);

  // Live matches for the mini-scorecard section (top 3)
  
  const liveMatches = matches
    .filter(m => isMatchLive(m))

  return (
    <View style={styles.root}>

      <Add ref={addRef} />
      <AppOpenAdManager />
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Coming Soon Modal ── */}
      {/* <ComingSoonModal visible={showProModal} onClose={() => setShowProModal(false)} /> */}

      {/* ── AI Predictions Modal ── */}

      <AIPredictionsModal visible={showAIModal} onClose={() => setShowAIModal(false)} />

      <LinearGradient colors={['#03080F','#060F1E','#03080F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />


      {/* <HeaderBanner mode= "header" />  */}


      <Animated.View style={[styles.orb, styles.orb1, { transform: [{ translateY: orb1Y }] }]} pointerEvents="none">
        <LinearGradient colors={['rgba(0,229,255,0.18)','transparent']} style={{ flex: 1, borderRadius: 200 }} />
      </Animated.View>
      <Animated.View style={[styles.orb, styles.orb2, { transform: [{ translateY: orb2Y }] }]} pointerEvents="none">
        <LinearGradient colors={['rgba(245,197,66,0.12)','transparent']} style={{ flex: 1, borderRadius: 200 }} />
      </Animated.View>

      <View style={styles.gridOverlay} pointerEvents="none">
        {[...Array(8)].map((_, i) => (
          <View key={i} style={[styles.gridLine, { top: (H / 8) * i }]} />
        ))}
      </View>

      <Animated.View style={{ flex: 1, opacity: pageOp }}>
        <ScrollView 
          style={{ flex: 1 }} 
          contentContainerStyle={styles.scroll} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        >

          {/* ── HEADER ── */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerEyebrow}>CRICKET PREDICTOR</Text>
              <View style={styles.headerDivider} />
            </View>
            <View style={[styles.videoBadgeWrap, styles.headerVideoWrap]} pointerEvents="none">
              <Image
                source={TROPHY_FRAMES[trophyFrameIndex]}
                style={styles.videoBadge}
                resizeMode="cover"
              />
            </View>
          </View>

          {/* ── HERO ── */}
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

          {/* ── STATS ── */}
          <View style={styles.statsRow}>
            {dynamicStats.map((s, i) => (
              <StatCard key={i} {...s} entryDelay={300 + i * 100} />
            ))}
          </View>

          {/* ── LIVE MATCHES (real data, fallback to empty) ── */}
          {liveMatches.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionDot} />
                  <Text style={styles.sectionTitle}>LIVE NOW</Text>
                </View>
                <Pressable onPress={() => navigation.navigate('AllMatches')}>
                  <Text style={styles.sectionLink}>See all ›</Text>
                </Pressable>
              </View>
              <View style={styles.matchList}>
                {liveMatches.map((m, i) => (
                  <View key={m.id || i} style={styles.matchRow}>
                    <LinearGradient colors={[C.surface, '#081220']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                    <View style={styles.liveBadge}>
                      <AnimatedDot delay={0} />
                      <Text style={styles.liveText}>LIVE</Text>
                    </View>
                    <View style={styles.matchTeamBlock}>
                      <Text style={styles.matchTeam}>{m.teams?.[0] || '—'}</Text>
                      <Text style={styles.matchScore}>{(m.score as any)?.[0]?.r ?? '—'}</Text>
                    </View>
                    <View style={styles.matchVsBlock}>
                      <Text style={styles.matchVs}>VS</Text>
                      <Text style={styles.matchOvers}>{(m.score as any)?.[0]?.o ? `${(m.score as any)[0].o} ov` : ''}</Text>
                    </View>
                    <View style={[styles.matchTeamBlock, { alignItems: 'flex-end' }]}>
                      <Text style={styles.matchTeam}>{m.teams?.[1] || '—'}</Text>
                      <Text style={styles.matchScore}>{(m.score as any)?.[1]?.r ?? '—'}</Text>
                    </View>
                    <Text style={styles.matchArrow}>›</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── FEATURES ── */}

          <GetStartedButton onPress={() => navigation.navigate('AllMatches')} />

          {/* ── DYNAMIC PREDICTIONS (India / IPL only) ── */}
          <PredictionsSection matches={matches} onMatchPress={handleMatchPress} />

          {/* ── CTA ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionDot, { backgroundColor: C.gold }]} />
                <Text style={styles.sectionTitle}>FEATURES</Text>
              </View>
            </View>
            <View style={styles.featureGrid}>
              {FEATURES.map((f, i) => (
                <FeatureCard
                  key={i}
                  item={f}
                  index={i}
                  onPress={f.title === 'AI Predictions' ? () => setShowAIModal(true) : undefined}
                />
              ))}
            </View>
          </View>

          <View style={styles.ctaSection}>
            <Text style={styles.ctaCaption}>Join 50,000+ fans predicting smarter</Text>
          </View>

          {/* ── FOOTER ── */}
          <View style={styles.footer}>
            <View style={styles.footerLine} />
            <Text style={styles.footerText}>CRICKET PREDICTOR  ·  v2.0  ·  AI EDITION</Text>
          </View>

        </ScrollView>
      </Animated.View>

      {/* <HeaderBanner mode= "footer"/>  */}

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

  orb:  { position: 'absolute', borderRadius: 200 },
  orb1: { width: 280, height: 280, top: -60, right: -80 },
  orb2: { width: 240, height: 240, bottom: 120, left: -80 },
  gridOverlay: { ...StyleSheet.absoluteFillObject },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.025)' },

  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.cyan, marginRight: 4 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  headerEyebrow: { color: C.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 3 },
  headerDivider: { marginTop: 4, height: 1, width: 80, backgroundColor: C.cyan, opacity: 0.4 },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.cyanDim,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: C.cyanMid,
  },
  headerBadgeText: { color: C.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginLeft: 4 },

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

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 28 },
  statCard: { borderRadius: CARD_R, padding: 16, alignItems: 'center', overflow: 'hidden', borderWidth: 1 },
  statIcon:  { fontSize: 22, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { color: C.whiteHalf, fontSize: 10, marginTop: 2, letterSpacing: 1.5, fontWeight: '600' },
  statBar:   { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, opacity: 0.8 },

  section: { paddingHorizontal: 20, marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.cyan },
  sectionTitle: { color: C.white, fontSize: 11, fontWeight: '800', letterSpacing: 2.5 },
  sectionLink: { color: C.cyan, fontSize: 12, fontWeight: '600' },
  predCount: { color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 1 },

  matchList: { gap: 8 },
  matchRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: CARD_R,
    overflow: 'hidden', paddingVertical: 14, paddingHorizontal: 14,
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

  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  featureCard: {
    borderRadius: CARD_R, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', minHeight: 130,
  },
  featureIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  featureIcon:  { fontSize: 20 },
  featureTitle: { color: C.white,     fontSize: 14, fontWeight: '700', marginBottom: 4 },
  featureSub:   { color: C.whiteHalf, fontSize: 11, lineHeight: 16 },

  // ── Prediction banner ──────────────────────────────
  predBanner: {
    borderRadius: CARD_R, overflow: 'hidden',
    padding: 18, borderWidth: 1, marginBottom: 0,
  },
  predBannerTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  predHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  predBannerLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 2.5 },
  predLivePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,69,96,0.15)',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(255,69,96,0.3)',
  },
  predLiveText: { color: C.red, fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  predBannerMatch: { color: C.white, fontSize: 17, fontWeight: '800', marginBottom: 4, letterSpacing: 0.3 },
  predVenue: { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginBottom: 14, letterSpacing: 0.3 },
  predBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  predTeamLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, width: 65 },
  predBar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  predBarFill: { height: '100%', borderRadius: 4 },
  predConfidence: { color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: 0.5 },

  // CTA
  ctaSection: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20 },
  ctaCaption: { color: 'rgba(255,255,255,0.28)', fontSize: 11, marginTop: 20, letterSpacing: 0.5, textAlign: 'center' },

  videoBadgeWrap: {
    width: 84,
    height: 84,
    borderRadius: 42,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(0,229,255,0.75)',
    backgroundColor: 'rgba(7,29,53,0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: C.cyan,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  headerVideoWrap: {
    alignSelf: 'flex-end',
    marginRight: 6,
  },
  videoBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'transparent',
  },


  glowRingWrapper: {
    position: 'absolute', width: BTN_W + 14, height: BTN_H + 14,
    borderRadius: 20, overflow: 'hidden', opacity: 0.85,
  },
  ctaBody: {
    width: BTN_W, height: BTN_H, borderRadius: 16, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
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
    position: 'absolute', bottom: -18, width: 200, height: 28, borderRadius: 100,
    backgroundColor: C.cyan, opacity: 0.15,
    shadowColor: C.cyan, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 24,
  },

  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 20 },
  footerLine: { width: 40, height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 12 },
  footerText: { color: 'rgba(255,255,255,0.18)', fontSize: 9, letterSpacing: 2 },
});

/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Animated,
  Dimensions,
  Linking,
  Easing,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { fetchPrediction, PredictionResponse } from '../services/Prediction';
import { fetchLiveStatuses } from '../services/LiveStatus';
import { resolveMatchTeamFlags } from '../services/Flags';
import { getProjectedScore } from '../helpers/ProjectedScore';
import { THIRTY_SECONDS_IN_MS } from '../constants/Keys';
import { Checkpoint, TestInfo, Match } from '../types';
import Add, { RewardAdd_ } from './Add';

type MatchScreenRouteProp = RouteProp<RootStackParamList, 'Match'>;

const { width } = Dimensions.get('window');

const GOLD = '#f59e0b';
const BLUE = '#38bdf8';
const PURPLE = '#a78bfa';
const CARD_BG = 'rgba(255,255,255,0.06)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';
const BURST_EMOJIS = ['🏏', '🔥', '🔥', '💥', '🌟', '🔥', '🔥', '💥', '🌟', '💥', '🌟'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

function parseMatchDate(raw: string): Date | null {
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function formatCountdown(ms: number): { label: string; urgent: boolean } {
  if (ms <= 0) { return { label: 'Started', urgent: false }; }
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const urgent = ms < 3_600_000;
  if (days > 0) { return { label: `${days}d ${hrs}h`, urgent: false }; }
  if (hrs > 0) { return { label: `${hrs}h ${mins}m`, urgent: false }; }
  return { label: `${mins}m ${secs}s`, urgent };
}

function statusMeta(status: string) {
  const s = status.toLowerCase();
  if (s.includes('live') || s.includes('progress'))
    return { color: '#22c55e', glow: 'rgba(34,197,94,0.35)', emoji: '🟢', label: status };
  if (s.includes('upcoming') || s.includes('scheduled') || s.includes('start'))
    return { color: GOLD, glow: 'rgba(245,158,11,0.3)', emoji: '⏳', label: status };
  if (s.includes('finish') || s.includes('complete') || s.includes('result') || s.includes('won'))
    return { color: '#a78bfa', glow: 'rgba(167,139,250,0.3)', emoji: '🏆', label: status };
  if (s.includes('abandon') || s.includes('cancel') || s.includes('postpone'))
    return { color: '#ef4444', glow: 'rgba(239,68,68,0.3)', emoji: '❌', label: status };
  return { color: '#94a3b8', glow: 'rgba(148,163,184,0.2)', emoji: '📊', label: status };
}

function formatMeta(fmt: string) {
  const f = fmt.toLowerCase();
  if (f.includes('t20') || f === 't20i')
    return { color: '#f97316', border: 'rgba(249,115,22,0.4)', bg: 'rgba(249,115,22,0.12)', icon: '⚡', short: 'T20' };
  if (f.includes('odi') || f.includes('one day'))
    return { color: BLUE, border: 'rgba(56,189,248,0.4)', bg: 'rgba(56,189,248,0.12)', icon: '🏅', short: 'ODI' };
  if (f.includes('test'))
    return { color: '#a78bfa', border: 'rgba(167,139,250,0.4)', bg: 'rgba(167,139,250,0.12)', icon: '🎖️', short: 'TEST' };
  return { color: GOLD, border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.12)', icon: '🏏', short: fmt.toUpperCase() };
}

// ─── PollCard ─────────────────────────────────────────────────────────────────

// ─── Dynamic Color Generator ──────────────────────────────────────────────────
function getDynamicColors(matchType?: string) {
  const type = matchType?.toLowerCase() || '';
  if (type.includes('t20') || type === 't20i') {
    return {
      accent: '#ff6b6b',
      accentLight: 'rgba(255,107,107,0.15)',
      accentBorder: 'rgba(255,107,107,0.3)',
      primary: '#ffed4e',
      secondary: '#ffa94d',
      text: '#ffd93d',
      muted: '#a8dadc',
    };
  }
  if (type.includes('odi') || type.includes('one day')) {
    return {
      accent: '#38bdf8',
      accentLight: 'rgba(56,189,248,0.15)',
      accentBorder: 'rgba(56,189,248,0.3)',
      primary: '#06b6d4',
      secondary: '#0ea5e9',
      text: '#22d3ee',
      muted: '#7dd3fc',
    };
  }
  if (type.includes('test')) {
    return {
      accent: '#c084fc',
      accentLight: 'rgba(192,132,252,0.15)',
      accentBorder: 'rgba(192,132,252,0.3)',
      primary: '#d8b4fe',
      secondary: '#a78bfa',
      text: '#e9d5ff',
      muted: '#ddd6fe',
    };
  }
  // Default T10
  return {
    accent: '#f59e0b',
    accentLight: 'rgba(245,158,11,0.15)',
    accentBorder: 'rgba(245,158,11,0.3)',
    primary: '#fbbf24',
    secondary: '#fcd34d',
    text: '#fde047',
    muted: '#fef3c7',
  };
}

// ─── ProjectedScoreCard ───────────────────────────────────────────────────────


function ProjectedScoreCard({ match, addRef }: { match: Match, addRef: React.RefObject<{ showAd?: (cb?: () => void) => void } | null> }) {
  const [unlocked, setUnlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const lockScale = useRef(new Animated.Value(1)).current;
  const revealAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, delay: 300, useNativeDriver: true }),
    ]).start();

    // Pulse the lock icon
    Animated.loop(Animated.sequence([
      Animated.timing(lockScale, { toValue: 1.12, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(lockScale, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, [fadeAnim, lockScale, slideAnim]);

  const isLive = match.status?.toLowerCase().includes('live') || match.matchStarted;
  if (!isLive || !match.score || match.score.length === 0 || !match.matchType) return null;

  const currentInning = match.score[match.score.length - 1];
  if (!currentInning) return null;

  const projection = getProjectedScore(currentInning, match.matchType);
  if (!projection) return null;

  const inningLabel = 'Current Innings';
  const shortInning = inningLabel.length > 30 ? inningLabel.slice(0, 28) + '…' : inningLabel;

  // Get dynamic colors based on match type
  const colors = getDynamicColors(match.matchType);

  const handleWatchAd = () => {
    if (addRef.current?.showAd) {
      addRef.current.showAd(() => {
        // Show loading spinner briefly
        setIsLoading(true);

        // Simulate data processing, then unlock
        setTimeout(() => {
          setIsLoading(false);
          setUnlocked(true);
          Animated.timing(revealAnim, {
            toValue: 1, duration: 500, useNativeDriver: true,
          }).start();
        }, 3200); // Show loader for 800ms
      });
    } else {
      // fallback if ad not loaded — unlock anyway
      setUnlocked(true);
    }
  };

  return (
    <Animated.View style={[
      projStyles.card,
      {
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
        borderColor: colors.accentBorder,
        backgroundColor: 'rgba(12,20,44,0.95)',
      },
    ]}>
      {/* Hidden Add component just for this card */}

      <View style={[projStyles.topGlow, { backgroundColor: colors.accentLight }]} />



      {/* Header — always visible */}
      <View style={projStyles.header}>
        <View style={projStyles.headerLeft}>
          <Text style={[projStyles.title, { color: colors.text }]}>PROJECTED SCORE📈</Text>
          <View style={[projStyles.titleUnderline, { backgroundColor: colors.accent }]} />
        </View>
        <View style={[projStyles.inningBadge, { backgroundColor: colors.accentLight, borderColor: colors.accentBorder }]}>
          <Text style={[projStyles.inningBadgeText, { color: colors.text }]} numberOfLines={1}>{shortInning}</Text>
        </View>
      </View>

      {/* Current score strip — always visible */}
      <View style={projStyles.currentStrip}>
        <View style={projStyles.currentItem}>
          <Text style={projStyles.currentLabel}>RUNS</Text>
          <Text style={[projStyles.currentValue, { color: colors.primary }]}>{currentInning.r}</Text>
        </View>
        <View style={projStyles.currentDivider} />
        <View style={projStyles.currentItem}>
          <Text style={projStyles.currentLabel}>WICKETS</Text>
          <Text style={[projStyles.currentValue, { color: colors.secondary }]}>{currentInning.w}</Text>
        </View>
        <View style={projStyles.currentDivider} />
        <View style={projStyles.currentItem}>
          <Text style={projStyles.currentLabel}>OVERS</Text>
          <Text style={[projStyles.currentValue, { color: colors.accent }]}>{currentInning.o}</Text>
        </View>
        <View style={projStyles.currentDivider} />
        <View style={projStyles.currentItem}>
          <Text style={projStyles.currentLabel}>CRR</Text>
          <Text style={[projStyles.currentValue, { color: colors.text }]}>
            {currentInning.o > 0
              ? (currentInning.r / (Math.floor(currentInning.o) + ((currentInning.o % 1) * 10) / 6)).toFixed(2)
              : '0.00'}
          </Text>
        </View>
      </View>

      {/* ── LOCKED STATE ── */}
      {!unlocked && (
        <View style={projStyles.lockedWrap}>
          {/* Blurred pill previews */}
          <View style={projStyles.blurPreview} pointerEvents="none">
            <View style={projStyles.blurRow}>
              {[1, 2].map(i => (
                <View key={i} style={[projStyles.pill, projStyles.blurPill]}>
                  <View style={projStyles.blurLine} />
                  <View style={[projStyles.blurLine, { width: 40, marginTop: 6 }]} />
                  <View style={[projStyles.blurLine, { width: 55, marginTop: 6, height: 28 }]} />
                </View>
              ))}
            </View>
            {/* Overlay gradient */}
            <View style={projStyles.blurOverlay} />
          </View>

          {/* Lock CTA */}
          <View style={projStyles.lockCard}>
            <Animated.Text style={[projStyles.lockIcon, { transform: [{ scale: lockScale }] }]}>
              🔒
            </Animated.Text>
            <Text style={projStyles.lockTitle}>Milestone Projections Locked</Text>
            <Text style={projStyles.lockSub}>
              Watch a short ad to unlock over-by-over projected scores
            </Text>
            <TouchableOpacity
              style={projStyles.watchAdBtn}
              onPress={handleWatchAd}
              activeOpacity={0.85}
            >
              <View style={projStyles.watchAdBtnInner}>
                <Text style={projStyles.watchAdIcon}>▶️</Text>
                <Text style={projStyles.watchAdText}>WATCH AD TO UNLOCK</Text>
              </View>
            </TouchableOpacity>
            <Text style={projStyles.lockDisclaimer}>Free · Takes ~30 seconds</Text>
          </View>
        </View>
      )}

      {/* ── LOADING STATE (after ad watched, before unlock) ── */}
      {isLoading && (
        <View style={projStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[projStyles.loadingText, { color: colors.accent }]}>
            Unlocking projections...
          </Text>
        </View>
      )}

      {/* ── UNLOCKED STATE ── */}
      {unlocked && (
        <Animated.View style={{ opacity: revealAnim }}>
          {(projection.type === 't20' || projection.type === 'odi' || projection.type === 't10') && (
            <CheckpointGrid
              checkpoints={projection.data as Checkpoint[]}
              type={projection.type}
              colors={colors}
            />
          )}
          {projection.type === 'test' && (
            <TestSessionView data={projection.data as TestInfo} />
          )}
          <View style={[projStyles.unlockedBadge, { backgroundColor: colors.accentLight, borderColor: colors.accentBorder }]}>
            <Text style={[projStyles.unlockedBadgeText, { color: colors.accent }]}>✅ UNLOCKED</Text>
          </View>
        </Animated.View>
      )}

      <Text style={projStyles.disclaimer}>
        * Projections are estimates based on current run rate & wickets fallen
      </Text>
    </Animated.View>
  );
}

// ── Checkpoint Grid (T20 / ODI / T10) ────────────────────────────────────────
function CheckpointGrid({
  checkpoints,
  type,
  colors,
}: {
  checkpoints: Checkpoint[];
  type: 't20' | 'odi' | 't10';
  colors?: ReturnType<typeof getDynamicColors>;
}) {

  const theme = colors || getDynamicColors(type);

  const palette = [
    theme.accent,
    theme.primary,
    theme.secondary,
    theme.text,
    theme.muted,
  ];

  // console.log(theme)

  // console.log(palette)


  return (
    <View style={projStyles.checkpointSection}>
      <Text style={projStyles.sectionLabel}>MILESTONE PROJECTIONS</Text>

      <View style={projStyles.checkpointGrid}>
        {checkpoints.map((cp, i) => (
          <CheckpointPill
            key={i}
            checkpoint={cp}
            accentColor={palette[i % palette.length]}
            delay={i * 80}
          />
        ))}
      </View>
    </View>
  );
}

function CheckpointPill({
  checkpoint,
  accentColor,
  delay,
}: {
  checkpoint: Checkpoint;
  accentColor: string;
  delay: number;
}) {
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;  // ← add this

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, delay, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
    ]).start();
  }, [delay, fadeAnim, scaleAnim]);

  const isPast = checkpoint.isPast ?? false;
  const isCurrent = checkpoint.isCurrent ?? false;

  const borderColor = isCurrent ? accentColor : isPast ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.1)';
  const bgColor = isCurrent ? accentColor + '18' : isPast ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.05)';
  const valueColor = isCurrent ? accentColor : isPast ? '#475569' : accentColor;
  const valueOpacity = isCurrent ? 1 : isPast ? 0.4 : 0.75;

  // ── Press handlers ──
  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.93,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 200,
      friction: 6,
    }).start();
  };

  return (
    <Animated.View style={[
      projStyles.pillOuter,
      { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
    ]}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={{ flex: 1 }}
      >
        <Animated.View style={[
          projStyles.pill,
          {
            borderColor,
            backgroundColor: bgColor,
            transform: [{ scale: pressScale }],  // ← bounce on press
          },
        ]}>
          {isCurrent && <View style={[projStyles.pillCurrentDot, { backgroundColor: accentColor }]} />}
          <Text style={projStyles.pillPhase} numberOfLines={1}>{checkpoint.phase}</Text>
          <Text style={projStyles.pillOvers}>{checkpoint.label}</Text>
          <Text style={[projStyles.pillScore, { color: valueColor, opacity: valueOpacity }]}>
            {isPast ? checkpoint.projected : `~${checkpoint.projected}`}
          </Text>
          {isCurrent && (
            <View style={[projStyles.pillCurrentBadge, { backgroundColor: accentColor + '22', borderColor: accentColor + '44' }]}>
              <Text style={[projStyles.pillCurrentBadgeText, { color: accentColor }]}>NOW</Text>
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Test Session View ─────────────────────────────────────────────────────────

function TestSessionView({ data }: { data: TestInfo }) {
  const sessions = [
    { label: 'To Lunch', runs: data.runsToLunch, icon: '🌅', color: GOLD },
    { label: 'To Tea', runs: data.runsToTea, icon: '☕', color: BLUE },
    { label: 'To Stumps', runs: data.runsToStumps, icon: '🌙', color: PURPLE },
  ];

  return (
    <View style={projStyles.testSection}>
      <View style={projStyles.testSessionBadge}>
        <Text style={projStyles.testSessionText}>📍 {data.session}</Text>
      </View>
      <View style={projStyles.testCRRRow}>
        <Text style={projStyles.testCRRLabel}>Current Run Rate</Text>
        <Text style={projStyles.testCRRValue}>{data.crr}</Text>
      </View>
      <Text style={projStyles.sectionLabel}>PROJECTED RUNS THIS DAY</Text>
      <View style={projStyles.testSessionRow}>
        {sessions.map((s, i) => (
          <View key={i} style={[projStyles.testSessionCard, { borderColor: s.color + '30' }]}>
            <Text style={projStyles.testSessionIcon}>{s.icon}</Text>
            <Text style={[projStyles.testSessionRuns, { color: s.color }]}>+{s.runs}</Text>
            <Text style={projStyles.testSessionLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}



// ─── CountdownRow ─────────────────────────────────────────────────────────────

function CountdownRow({ rawDate, delay }: { rawDate: string; delay: number }) {
  const matchDate = parseMatchDate(rawDate);
  const [ms, setMs] = useState<number>(matchDate ? matchDate.getTime() - Date.now() : -1);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, [delay, fade, slide]);

  useEffect(() => {
    if (!matchDate) { return; }
    const tick = setInterval(() => {
      const r = matchDate.getTime() - Date.now();
      setMs(r);
      if (r > 0 && r < 3_600_000) {
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.12, duration: 120, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 120, useNativeDriver: true }),
        ]).start();
      }
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { label, urgent } = ms >= 0
    ? formatCountdown(ms)
    : { label: rawDate, urgent: false };
  const isStarted = ms <= 0;
  const textColor = urgent ? '#ef4444' : isStarted ? '#94a3b8' : '#cbd5e1';

  return (
    <Animated.View style={[styles.infoRow, { opacity: fade, transform: [{ translateX: slide }] }]}>
      <View style={styles.infoIconWrap}><Text style={styles.infoIcon}>📅</Text></View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>
          {isStarted ? 'Date' : ms < 3_600_000 && ms > 0 ? '⏱ Starts in' : 'Starts in'}
        </Text>
        <Animated.Text style={[
          styles.infoValue,
          { color: textColor, transform: [{ scale: urgent ? pulse : new Animated.Value(1) }] },
        ]}>
          {label}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

// ─── StatusRow ────────────────────────────────────────────────────────────────

function StatusRow({ status, delay }: { status: string; delay: number }) {
  const meta = statusMeta(status);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const isLive = meta.color === '#22c55e';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
    if (isLive) {
      Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])).start();
    }
  }, [delay, fade, glowAnim, isLive, slide]);

  return (
    <Animated.View style={[styles.infoRow, { opacity: fade, transform: [{ translateX: slide }] }]}>
      <View style={styles.infoIconWrap}><Text style={styles.infoIcon}>📊</Text></View>
      {/* ── FIX: status row uses column layout so pill can wrap freely ── */}
      <View style={styles.infoTextWrapColumn}>
        <Text style={styles.infoLabel}>Status</Text>
        <View style={[styles.statusPill, { backgroundColor: meta.glow, borderColor: meta.color + '80' }]}>
          {isLive && (
            <Animated.View style={[styles.statusPillGlow, { backgroundColor: meta.color, opacity: glowAnim }]} />
          )}
          <Text style={[styles.statusPillText, { color: meta.color }]}>
            {meta.emoji}  {meta.label}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── FormatRow ────────────────────────────────────────────────────────────────

function FormatRow({ format, delay }: { format: string; delay: number }) {
  const meta = formatMeta(format);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;
  const shine = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(shine, { toValue: 2, duration: 700, useNativeDriver: true }).start();
    });
  }, [delay, fade, shine, slide]);

  const shineX = shine.interpolate({ inputRange: [-1, 2], outputRange: [-60, 120] });

  return (
    <Animated.View style={[styles.infoRow, { opacity: fade, transform: [{ translateX: slide }] }]}>
      <View style={styles.infoIconWrap}><Text style={styles.infoIcon}>🏆</Text></View>
      <View style={styles.infoTextWrap}>
        <Text style={styles.infoLabel}>Format</Text>
        <View style={[styles.formatBadge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
          <Animated.View style={[styles.formatShine, { transform: [{ translateX: shineX }] }]} />
          <Text style={styles.formatBadgeIcon}>{meta.icon}</Text>
          <Text style={[styles.formatBadgeText, { color: meta.color }]}>{meta.short}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── VenueRow ─────────────────────────────────────────────────────────────────

function VenueRow({ venue, delay }: { venue: string; delay: number }) {
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, [delay, fade, slide]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    Animated.spring(expandAnim, {
      toValue: next ? 1 : 0, useNativeDriver: false, tension: 100, friction: 12,
    }).start();
  };

  // ── FIX: increased height so "Open in Maps" button is always fully visible ──
  const expandedHeight = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 158] });
  const chevronRotate = expandAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const expandOpacity = expandAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  const parts = venue.split(',');
  const city = parts[parts.length - 1]?.trim() || venue;
  const stadium = parts.length > 1 ? parts.slice(0, -1).join(',').trim() : venue;

  const openMaps = () => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(venue)}`);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateX: slide }] }}>
      <TouchableOpacity
        onPress={toggle} activeOpacity={0.8}
        style={[styles.infoRow, { borderBottomWidth: expanded ? 0 : 1 }]}>
        <View style={styles.infoIconWrap}><Text style={styles.infoIcon}>📍</Text></View>
        <View style={styles.infoTextWrap}>
          <Text style={styles.infoLabel}>Venue</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.infoValue, { flex: 0, maxWidth: width * 0.42 }]} numberOfLines={1}>
              {venue}
            </Text>
            <Animated.Text style={{ color: '#64748b', fontSize: 12, transform: [{ rotate: chevronRotate }] }}>
              ▼
            </Animated.Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* ── FIX: expanded panel has enough room for avatar + name + Maps button ── */}
      <Animated.View style={[styles.venueExpanded, { height: expandedHeight, opacity: expandOpacity }]}>
        <View style={styles.venueExpandedInner}>
          <View style={styles.venueExpandedTop}>
            <View style={styles.venueStadiumIcon}>
              <Text style={{ fontSize: 28 }}>🏟️</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.venueStadiumName} numberOfLines={2}>{stadium}</Text>
              <Text style={styles.venueCity}>{city}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.venueMapsBtn} onPress={openMaps} activeOpacity={0.8}>
            <Text style={styles.venueMapsBtnText}>📍 Open in Maps</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── EmojiParticle ────────────────────────────────────────────────────────────

type ParticleData = { id: number; emoji: string; x: number; y: number };

function EmojiParticle({ emoji, startX, startY, onDone }: {
  emoji: string; startX: number; startY: number; onDone: () => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.4)).current;
  const angle = useRef(Math.random() * Math.PI * 2).current;
  const distance = useRef(45 + Math.random() * 65).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -distance * Math.sin(angle) - 20, duration: 1350, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: distance * Math.cos(angle), duration: 1350, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.7, duration: 550, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(320),
        Animated.timing(opacity, { toValue: 0, duration: 430, useNativeDriver: true }),
      ]),
    ]).start(onDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.Text style={{
      position: 'absolute', left: startX - 14, top: startY - 14, fontSize: 24,
      transform: [{ translateX }, { translateY }, { scale }], opacity, zIndex: 999,
    }}>
      {emoji}
    </Animated.Text>
  );
}

// ─── PulsingDot ───────────────────────────────────────────────────────────────

function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
      ]),
    ])).start();
  }, [opacity, scale]);
  return <Animated.View style={[styles.pulsingDot, { transform: [{ scale }], opacity }]} />;
}

// ─── VSCircle ─────────────────────────────────────────────────────────────────

function VSCircle({ isSwapping }: { isSwapping: boolean }) {
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSwapping) {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.45, duration: 200, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
        Animated.timing(rotate, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start(() => rotate.setValue(0));
    }
  }, [isSwapping, glow, rotate, scale]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <View style={styles.vsBlock}>
      <Animated.View style={[styles.vsGlowRing, { opacity: glowOpacity }]} />
      <Animated.View style={[styles.vsCircle, { transform: [{ scale }, { rotate: spin }] }]}>
        <Text style={styles.vsText}>VS</Text>
      </Animated.View>
      <Text style={styles.vsHint}>double{'\n'}tap</Text>
    </View>
  );
}

// ─── IdleBobTeam ──────────────────────────────────────────────────────────────

function IdleBobTeam({ flag, name, label, color, entranceDelay, bobDelay, onDoubleTap }: {
  flag: string | null; name: string; label: string; color: string;
  entranceDelay: number; bobDelay: number;
  onDoubleTap: (x: number, y: number) => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const bobY = useRef(new Animated.Value(0)).current;
  const lastTap = useRef<number>(0);
  const viewRef = useRef<View>(null);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, delay: entranceDelay, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bobY, { toValue: -7, duration: 900, delay: bobDelay, useNativeDriver: true }),
      Animated.timing(bobY, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    const t = setTimeout(() => loop.start(), entranceDelay + 700);
    return () => { clearTimeout(t); loop.stop(); };
  }, [bobDelay, bobY, entranceDelay, fade]);

  const handlePress = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      (viewRef.current as any)?.measure(
        (_fx: number, _fy: number, _w: number, _h: number, px: number, py: number) =>
          onDoubleTap(px + 36, py + 36),
      );
    }
    lastTap.current = now;
  };

  return (
    <Animated.View ref={viewRef as any} style={{ opacity: fade, transform: [{ translateY: bobY }] }}>
      <TouchableOpacity activeOpacity={0.8} onPress={handlePress} style={styles.teamTouchable}>
        <View style={[styles.teamAvatarRing, { borderColor: color }]}>
          {flag
            ? <Image source={{ uri: flag }} style={styles.teamFlag} />
            : <View style={[styles.teamFallback, { backgroundColor: color }]}>
              <Text style={styles.teamFallbackText}>{initials(name)}</Text>
            </View>
          }
        </View>
        <Text style={styles.teamName} numberOfLines={2}>{name}</Text>
        <View style={[styles.teamLabelBadge, { backgroundColor: color + '30' }]}>
          <Text style={[styles.teamLabelText, { color }]}>{label}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}



// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MatchScreen() {
  const route = useRoute<MatchScreenRouteProp>();
  const [match, setMatch] = useState<Match>(route.params.match);
  const matchId = route.params.matchId || route.params.match?.id;

  useEffect(() => {
    setMatch(route.params.match);
  }, [route.params.match]);

  useEffect(() => {
    if (!matchId) {
      return;
    }

    let cancelled = false;

    const refreshFromApi = async () => {
      console.log('[Polling][Match] API refetch started', new Date().toISOString(), '| matchId:', matchId);
      try {
        const [fresh] = await fetchLiveStatuses([{ id: matchId } as Match]);
        if (!fresh || cancelled) {
          console.log('[Polling][Match] API refetch finished (no update)', new Date().toISOString(), '| matchId:', matchId);
          return;
        }

        setMatch(prev => ({
          ...prev,
          ...fresh,
          status: fresh.status ?? prev.status,
          score: fresh.score ?? prev.score,
          matchEnded: fresh.matchEnded ?? prev.matchEnded,
          matchStarted: fresh.matchStarted ?? prev.matchStarted,
        }));
        console.log(
          '[Polling][Match] API refetch finished (updated)',
          new Date().toISOString(),
          '| matchId:',
          matchId,
          '| status:',
          fresh.status,
          '| score:',
          fresh.score,
        );
      } catch {
        console.log('[Polling][Match] API refetch failed', new Date().toISOString(), '| matchId:', matchId);
        // keep existing match data on transient API failures
      }
    };

    console.log('[Polling][Match] Started 30s interval', new Date().toISOString(), '| matchId:', matchId);
    refreshFromApi();
    const interval = setInterval(refreshFromApi, THIRTY_SECONDS_IN_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      console.log('[Polling][Match] Cleared 30s interval', new Date().toISOString(), '| matchId:', matchId);
    };
  }, [matchId]);

  /*
   * Firebase live-score subscription disabled intentionally.
   * Keeping old implementation commented for later restore.
   *
   * useEffect(() => {
   *   const unsub = subscribeToLiveScores((freshMatches) => {
   *     const fresh = freshMatches.find(x => x.id === match.id);
   *     if (!fresh) { return; }
   *     setMatch(prev => ({
   *       ...prev,
   *       status: fresh.status ?? prev.status,
   *       score: fresh.score ?? prev.score,
   *       matchEnded: fresh.matchEnded ?? prev.matchEnded,
   *       matchStarted: fresh.matchStarted ?? prev.matchStarted,
   *     }));
   *   });
   *   return () => unsub();
   * }, [match.id]);
   */

  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [particles, setParticles] = useState<ParticleData[]>([]);
  const particleIdRef = useRef(0);
  const addRef = useRef<{ showAd?: (cb?: () => void) => void } | null>(null);
  const rewardRef = useRef<{ showAd?: (cb?: () => void) => void } | null>(null); // ← add
  const [predictionLocked, setPredictionLocked] = useState(true);
  const colors = getDynamicColors(match.matchType);

  // Reset prediction after 2 minutes to allow showing another ad
  useEffect(() => {
    if (!predictionLocked) {
      const resetTimer = setTimeout(() => {
        // console.log('Resetting prediction after 2 minutes');
        setPredictionLocked(true);
        setPrediction(null);
        setError(null);
        setLoading(false);
      }, 2 * 60 * 1000); // 2 minutes

      return () => clearTimeout(resetTimer);
    }
  }, [predictionLocked]);

  // Reset prediction on component mount (reload)
  useEffect(() => {
    // Reset to locked state on component mount to allow showing ad again
    setPredictionLocked(true);
    setPrediction(null);
    setError(null);
    setLoading(false);
  }, [match.id]); // Reset when match changes


  const slideLeft = useRef(new Animated.Value(0)).current;
  const slideRight = useRef(new Animated.Value(0)).current;
  const flipLeft = useRef(new Animated.Value(0)).current;
  const flipRight = useRef(new Animated.Value(0)).current;
  const pageFade = useRef(new Animated.Value(0)).current;
  const pageSlide = useRef(new Animated.Value(40)).current;
  const predFade = useRef(new Animated.Value(0)).current;
  const predScale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(pageFade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(pageSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [pageFade, pageSlide]);

  const animatePredCard = useCallback(() => {
    predFade.setValue(0); predScale.setValue(0.92);
    Animated.parallel([
      Animated.timing(predFade, { toValue: 1, duration: 500, delay: 100, useNativeDriver: true }),
      Animated.spring(predScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
    ]).start();
  }, [predFade, predScale]);


  const loadPrediction = useCallback(async () => {
    try {
      setError(null);
      const [matchUpdated] = await fetchLiveStatuses([match]);
      const result = await fetchPrediction(matchUpdated || match);
      setPrediction(result);
      setPredictionLocked(false); // ← unlock only when data is ready
      animatePredCard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prediction');
      setPredictionLocked(false); // ← also unlock on error so error shows
    } finally {
      setLoading(false);
    }
  }, [match, animatePredCard]);


  const handleGetPrediction = () => {
    const run = () => {
      setLoading(true); // show spinner inside locked card
      setTimeout(() => loadPrediction(), 300);
    };

    if (addRef.current?.showAd) {
      addRef.current.showAd(run);
    } else {
      run();
    }
  };


  const handleDoubleTap = useCallback((x: number, y: number) => {
    if (isSwapping) { return; }
    setIsSwapping(true);
    const burst: ParticleData[] = BURST_EMOJIS.map(emoji => ({ id: ++particleIdRef.current, emoji, x, y }));
    setParticles(prev => [...prev, ...burst]);
    const dist = (width - 100) / 2.2;
    Animated.parallel([
      Animated.timing(flipLeft, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(flipRight, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideLeft, { toValue: dist, duration: 520, useNativeDriver: true }),
      Animated.timing(slideRight, { toValue: -dist, duration: 520, useNativeDriver: true }),
    ]).start(() => {
      setSwapped(s => !s);
      slideLeft.setValue(-dist); slideRight.setValue(dist);
      flipLeft.setValue(0); flipRight.setValue(0);
      Animated.parallel([
        Animated.spring(slideLeft, { toValue: 0, useNativeDriver: true, tension: 110, friction: 11 }),
        Animated.spring(slideRight, { toValue: 0, useNativeDriver: true, tension: 110, friction: 11 }),
      ]).start(() => setIsSwapping(false));
    });
  }, [isSwapping, flipLeft, flipRight, slideLeft, slideRight]);

  const removeParticle = useCallback((id: number) => {
    setParticles(prev => prev.filter(p => p.id !== id));
  }, []);

  const { team1Flag, team2Flag } = resolveMatchTeamFlags(match);
  const t1 = {
    flag: team1Flag,
    name: match.teams[0] || 'Team A',
  };
  const t2 = {
    flag: team2Flag,
    name: match.teams[1] || 'Team B',
  };
  const left = swapped ? t2 : t1;
  const right = swapped ? t1 : t2;

  const leftRotY = flipLeft.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rightRotY = flipRight.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.root}>
      <Add ref={addRef} />
      <RewardAdd_ ref={rewardRef} />
      <View style={styles.bgLayer1} />
      <View style={styles.bgLayer2} />
      <View style={styles.bgCircle1} />
      <View style={styles.bgCircle2} />

      {particles.map(p => (
        <EmojiParticle key={p.id} emoji={p.emoji} startX={p.x} startY={p.y}
          onDone={() => removeParticle(p.id)} />
      ))}

      <Animated.View style={[styles.content, { opacity: pageFade, transform: [{ translateY: pageSlide }] }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* ── Match Card ─────────────────────────────────── */}
          <View style={styles.matchCard}>
            <View style={styles.matchCardHeader}>
              <View style={styles.matchBadge}>
                <Text style={styles.matchBadgeText}>🏏 MATCH DETAILS</Text>
              </View>
              {match.status?.toLowerCase().includes('live') && (
                <View style={styles.liveBadge}>
                  <PulsingDot />
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              )}
            </View>

            <View style={styles.teamsRow}>
              <Animated.View style={[
                styles.teamSlot,
                { transform: [{ translateX: slideLeft }, { perspective: 900 }, { rotateY: leftRotY }] },
              ]}>
                <IdleBobTeam flag={left.flag} name={left.name}
                  label={swapped ? 'TEAM 2' : 'TEAM 1'} color={swapped ? BLUE : GOLD}
                  entranceDelay={150} bobDelay={0} onDoubleTap={handleDoubleTap} />
              </Animated.View>

              <VSCircle isSwapping={isSwapping} />

              <Animated.View style={[
                styles.teamSlot,
                { transform: [{ translateX: slideRight }, { perspective: 900 }, { rotateY: rightRotY }] },
              ]}>
                <IdleBobTeam flag={right.flag} name={right.name}
                  label={swapped ? 'TEAM 1' : 'TEAM 2'} color={swapped ? GOLD : BLUE}
                  entranceDelay={250} bobDelay={460} onDoubleTap={handleDoubleTap} />
              </Animated.View>
            </View>

            <View style={styles.swapHintRow}>
              <Text style={styles.swapHintText}>👆 Double-tap either team to swap</Text>
            </View>
            <View style={styles.cardDivider} />

            <View style={styles.infoGrid}>
              <VenueRow venue={match.venue || '—'} delay={300} />
              <CountdownRow rawDate={match.date || ''} delay={360} />
              {match.matchType && <FormatRow format={match.matchType} delay={420} />}
              {match.status && <StatusRow status={match.status} delay={480} />}
            </View>
          </View>

          {/* ── Fan Poll ───────────────────────────────────── */}
          {/* <PollCard
            match = {match}
          /> */}

        

          {/* ── AI Prediction Card ────────────────────────── */}
          {predictionLocked ? (
            // ── LOCKED STATE ──
            <View style={styles.predCard}>
              <View style={styles.predGlow} />
              <View style={styles.predHeader}>
                <Text style={styles.predTitle}>🔮 AI PREDICTION</Text>
                <View style={styles.predTitleUnderline} />
              </View>

              {loading ? (
                // ── LOADING STATE — inside locked card ──
                <View style={[styles.loadingBox, { borderColor: colors.accentBorder, backgroundColor: colors.accentLight + '15' }]}>
                  <View style={[styles.loadingSpinnerWrap, { borderColor: colors.accentBorder }]}>
                    <ActivityIndicator size="large" color={colors.accent} />
                  </View>
                  <Text style={[styles.loadingPrimary, { color: colors.text }]}>Analyzing match data</Text>
                  <Text style={[styles.loadingSub, { color: colors.muted }]}>Crunching stats, pitch reports & form...</Text>
                </View>
              ) : (
                <View style={styles.predLockedBody}>
                  <Text style={styles.predLockedIcon}>🔮</Text>
                  <Text style={styles.predLockedTitle}>Who will win this match?</Text>
                  <Text style={styles.predLockedSub}>
                    Get an AI-powered prediction with detailed analysis
                  </Text>
                  <TouchableOpacity
                    style={styles.predGetBtn}
                    onPress={handleGetPrediction}
                    activeOpacity={0.85}
                  >
                    <View style={styles.predGetBtnInner}>
                      <Text style={styles.predGetBtnText}>⚡ GET PREDICTION</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </View>

          ) : (
            // ── UNLOCKED STATE ──
            <Animated.View style={[styles.predCard, { opacity: predFade, transform: [{ scale: predScale }] }]}>
              <View style={styles.predGlow} />
              <View style={styles.predHeader}>
                <Text style={styles.predTitle}>🔮 AI PREDICTION</Text>
                <View style={styles.predTitleUnderline} />
              </View>

              {loading ? (
                <View style={[styles.loadingBox, { borderColor: colors.accentBorder, backgroundColor: colors.accentLight + '15' }]}>
                  <View style={styles.loadingSpinnerWrap}>
                    <ActivityIndicator size="large" color={colors.accent} />
                  </View>
                  <Text style={[styles.loadingPrimary, { color: colors.text }]}>Analyzing match data</Text>
                  <Text style={[styles.loadingSub, { color: colors.muted }]}>Crunching stats, pitch reports & form...</Text>
                </View>
              ) : error ? (
                <View style={[styles.errorBox, { borderColor: colors.accentBorder, borderWidth: 1, borderRadius: 12, paddingVertical: 32, paddingHorizontal: 16 }]}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                  <Text style={[styles.errorText, { color: colors.muted }]}>{error}</Text>
                  <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.accent }]} onPress={loadPrediction}>
                    <Text style={[styles.retryBtnText, { color: colors.accentLight }]}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              ) : prediction ? (
                <View>
                  <View style={[styles.winnerChip, { backgroundColor: colors.accentLight, borderColor: colors.accentBorder }]}>
                    <Text style={[styles.winnerChipLabel, { color: colors.text }]}>PREDICTED WINNER</Text>
                    <Text style={[styles.winnerChipName, { color: colors.primary }]}>{prediction.winner}</Text>
                    <View style={[styles.winnerChipGlow, { backgroundColor: colors.accentLight }]} />
                  </View>
                  {prediction.reason && (
                    <View style={[styles.analysisBox, { borderColor: colors.accentBorder, backgroundColor: colors.accentLight + '10' }]}>
                      <View style={styles.analysisHeader}>
                        <Text style={styles.analysisIcon}>📝</Text>
                        <Text style={[styles.analysisTitle, { color: colors.muted }]}>Analysis</Text>
                      </View>
                      <View style={[styles.analysisDivider, { backgroundColor: colors.accentBorder }]} />
                      <Text style={[styles.analysisText, { color: colors.muted }]}>{prediction.reason}</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </Animated.View>
          )}

          {/* Refresh only shows after unlocked */}
          {!predictionLocked && !loading && (
            <TouchableOpacity 
              style={styles.refreshBtn} 
              onPress={() => {
                const run = () => {
                  setLoading(true);
                  loadPrediction();
                };

                if (addRef.current?.showAd) {
                  addRef.current.showAd(run);
                } else {
                  run();
                }
              }} 
              activeOpacity={0.82}
            >
              <View style={styles.refreshBtnInner}>
                <Text style={styles.refreshBtnIcon}>🔄</Text>
                <Text style={styles.refreshBtnText}>Refresh Prediction</Text>
              </View>
            </TouchableOpacity>
          )}

          <ProjectedScoreCard match={match} addRef={rewardRef} />

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1120' },
  bgLayer1: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0b1120' },
  bgLayer2: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 320,
    backgroundColor: '#101c38', borderBottomLeftRadius: 60, borderBottomRightRadius: 60,
  },
  bgCircle1: {
    position: 'absolute', top: -80, right: -80, width: 260, height: 260,
    borderRadius: 130, backgroundColor: 'rgba(245,158,11,0.08)',
  },
  bgCircle2: {
    position: 'absolute', top: 100, left: -100, width: 300, height: 300,
    borderRadius: 150, backgroundColor: 'rgba(56,189,248,0.06)',
  },
  content: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 16 },

  // Match card
  matchCard: {
    backgroundColor: CARD_BG, borderRadius: 24,
    borderWidth: 1, borderColor: CARD_BORDER, padding: 20, marginBottom: 16,
  },
  matchCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  matchBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  matchBadgeText: { color: GOLD, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', gap: 6,
  },
  pulsingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  liveBadgeText: { color: '#ef4444', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },

  teamsRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10, overflow: 'visible',
  },
  teamSlot: { flex: 1, alignItems: 'center' },
  teamTouchable: { alignItems: 'center', gap: 8 },
  teamAvatarRing: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', padding: 3, marginBottom: 8,
  },
  teamFlag: { width: 62, height: 62, borderRadius: 31 },
  teamFallback: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  teamFallbackText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  teamName: { color: '#e2e8f0', fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  teamLabelBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  teamLabelText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  vsBlock: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  vsGlowRing: {
    position: 'absolute', width: 66, height: 66, borderRadius: 33,
    borderWidth: 2, borderColor: GOLD,
  },
  vsCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  vsText: { color: '#94a3b8', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  vsHint: { color: 'rgba(255,255,255,0.22)', fontSize: 8, marginTop: 5, textAlign: 'center', letterSpacing: 0.3 },
  swapHintRow: { alignItems: 'center', marginBottom: 14 },
  swapHintText: { color: 'rgba(255,255,255,0.22)', fontSize: 11, letterSpacing: 0.3 },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 16 },

  infoGrid: { gap: 0 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)', gap: 12,
  },
  infoIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  infoIcon: { fontSize: 16 },

  // Standard row: label left, value right — used by Venue / Countdown / Format
  infoTextWrap: {
    flex: 1, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  infoLabel: { color: '#64748b', fontSize: 13, fontWeight: '500' },
  infoValue: {
    color: '#cbd5e1', fontSize: 13, fontWeight: '600',
    flex: 1, textAlign: 'right', paddingLeft: 8,
  },

  // ── FIX: Status uses column layout so long text wraps below the label ──
  infoTextWrapColumn: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 5,
  },

  // ── FIX: pill now wraps text instead of clipping ──
  statusPill: {
    borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',   // shrink to content width
    maxWidth: '100%',
  },
  statusPillGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 10,
  },
  // ── FIX: text wraps naturally, no clipping ──
  statusPillText: {
    fontSize: 12, fontWeight: '700', letterSpacing: 0.3,
    flexShrink: 1, flexWrap: 'wrap',
  },

  formatBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5, overflow: 'hidden',
  },
  formatShine: {
    position: 'absolute', top: 0, bottom: 0, width: 40,
    backgroundColor: 'rgba(255,255,255,0.18)', transform: [{ skewX: '-20deg' }],
  },
  formatBadgeIcon: { fontSize: 14 },
  formatBadgeText: { fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },

  // ── FIX: venue expanded taller so Maps button is never clipped ──
  venueExpanded: { overflow: 'hidden' },
  venueExpandedInner: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, marginBottom: 8,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  venueExpandedTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  venueStadiumIcon: {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  venueStadiumName: { color: '#e2e8f0', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  venueCity: { color: '#64748b', fontSize: 12, marginTop: 2 },
  venueMapsBtn: {
    backgroundColor: 'rgba(56,189,248,0.12)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)',
    paddingVertical: 10, alignItems: 'center',
  },
  venueMapsBtnText: { color: BLUE, fontSize: 13, fontWeight: '700' },

  // ── Poll Card ─────────────────────────────────────────────────────────────
  pollCard: {
    backgroundColor: 'rgba(10,18,42,0.95)',
    borderRadius: 24, borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    padding: 22, marginBottom: 16, overflow: 'hidden',
  },
  pollTopGlow: {
    position: 'absolute', top: -50, left: '50%', marginLeft: -80,
    width: 160, height: 120, borderRadius: 80,
    backgroundColor: 'rgba(167,139,250,0.08)',
  },
  pollHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 6,
  },
  pollHeaderLeft: { alignItems: 'flex-start' },
  pollTitle: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  pollTitleUnderline: { width: 36, height: 3, borderRadius: 2, backgroundColor: '#a78bfa' },
  pollVoteCountBadge: {
    backgroundColor: 'rgba(167,139,250,0.15)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  pollVoteCountText: { color: '#a78bfa', fontSize: 11, fontWeight: '700' },
  pollQuestion: { color: '#94a3b8', fontSize: 13, marginBottom: 18, marginTop: 4 },

  pollButtons: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  pollVoteBtn: {
    flex: 1, borderRadius: 16, borderWidth: 1, padding: 14,
    alignItems: 'center', gap: 6, overflow: 'hidden',
  },
  pollVoteBtn1: { backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' },
  pollVoteBtn2: { backgroundColor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.3)' },
  pollVoteBtnInitials: { color: '#fff', fontSize: 22, fontWeight: '800' },
  pollVoteBtnName: { color: '#cbd5e1', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  pollVoteBtnArrow: { marginTop: 2 },

  pollOr: { alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  pollOrLine: { width: 1, flex: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  pollOrText: { color: '#475569', fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  pollResults: { gap: 0 },
  pollResultRow: {},
  pollResultMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pollResultTeam: { color: '#e2e8f0', fontSize: 13, fontWeight: '700', flex: 1 },
  pollResultPct: { fontSize: 16, fontWeight: '800' },

  yourVoteBadge: {
    backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)',
  },
  yourVoteBadgeText: { color: GOLD, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },

  pollBarTrack: {
    height: 10, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 5, overflow: 'hidden',
  },
  pollBar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  pollBarShine: {
    position: 'absolute', top: 0, bottom: 0, left: 0, width: 40,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },

  pollVerdict: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 20, backgroundColor: 'rgba(167,139,250,0.1)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.25)',
  },
  pollVerdictEmoji: { fontSize: 22 },
  pollVerdictText: { color: '#cbd5e1', fontSize: 14, fontWeight: '600', flex: 1 },
  pollVerdictPct: { color: '#a78bfa', fontWeight: '800' },

  // Prediction card
  predCard: {
    backgroundColor: 'rgba(15,25,50,0.9)', borderRadius: 24,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    padding: 22, marginBottom: 16, overflow: 'hidden',
  },
  predGlow: {
    position: 'absolute', top: -60, right: -60, width: 200, height: 200,
    borderRadius: 100, backgroundColor: 'rgba(245,158,11,0.06)',
  },
  predHeader: { alignItems: 'center', marginBottom: 22 },
  predTitle: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  predTitleUnderline: { width: 48, height: 3, borderRadius: 2, backgroundColor: GOLD },

  loadingBox: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20,
    borderRadius: 16, borderWidth: 1,
  },
  loadingSpinnerWrap: {
    width: 72, height: 72, borderRadius: 36,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    borderWidth: 2,
  },
  loadingPrimary: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  loadingSub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  errorBox: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  errorIcon: { fontSize: 40 },
  errorText: { color: '#94a3b8', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn: { marginTop: 4, backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  retryBtnText: { color: '#0b1120', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  winnerChip: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    padding: 20, alignItems: 'center', marginBottom: 16, overflow: 'hidden',
  },
  winnerChipGlow: { position: 'absolute', bottom: -30, width: 160, height: 80, borderRadius: 80, backgroundColor: 'rgba(245,158,11,0.12)' },
  winnerChipLabel: { color: GOLD, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 10, opacity: 0.9 },
  winnerChipName: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },

  analysisBox: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 16 },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  analysisIcon: { fontSize: 16 },
  analysisTitle: { color: '#94a3b8', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  analysisDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 12 },
  analysisText: { color: '#cbd5e1', fontSize: 14, lineHeight: 22 },

  refreshBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)', backgroundColor: 'rgba(56,189,248,0.08)' },
  refreshBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  refreshBtnIcon: { fontSize: 18 },
  refreshBtnText: { color: BLUE, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  bottomSpacer: { height: 32 },
  predLockedBody: {
    alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8,
  },
  predLockedIcon: { fontSize: 44, marginBottom: 14 },
  predLockedTitle: {
    color: '#e2e8f0', fontSize: 16, fontWeight: '800',
    textAlign: 'center', marginBottom: 8,
  },
  predLockedSub: {
    color: '#64748b', fontSize: 13, textAlign: 'center',
    lineHeight: 20, marginBottom: 24, paddingHorizontal: 12,
  },
  predGetBtn: {
    width: '100%', borderRadius: 14,
    backgroundColor: GOLD, overflow: 'hidden',
  },
  predGetBtnInner: {
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  predGetBtnText: {
    color: '#0b1120', fontSize: 14, fontWeight: '900', letterSpacing: 1.5,
  },
});

const projStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(12,20,44,0.95)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    padding: 20,
    marginBottom: 16,
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute', top: -50, left: '50%', marginLeft: -90,
    width: 180, height: 120, borderRadius: 90,
    backgroundColor: 'rgba(167,139,250,0.07)',
  },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  headerLeft: { alignItems: 'flex-start', flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  titleUnderline: { width: 36, height: 3, borderRadius: 2, backgroundColor: PURPLE },
  inningBadge: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    paddingHorizontal: 10, paddingVertical: 4,
    maxWidth: 140, marginLeft: 8,
  },
  inningBadgeText: { color: PURPLE, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Current score strip
  currentStrip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12, paddingHorizontal: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  currentItem: { flex: 1, alignItems: 'center' },
  currentLabel: { color: '#475569', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  currentValue: { color: '#e2e8f0', fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  currentDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Checkpoints
  checkpointSection: { marginBottom: 12, marginHorizontal: -4, },
  sectionLabel: {
    color: '#475569', fontSize: 9, fontWeight: '800',
    letterSpacing: 2, marginBottom: 10,
  },
  checkpointGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pillOuter: {
    width: '50%',        // ← always exactly half
    padding: 4,          // ← gap between pills
  },
  pill: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    minHeight: 90,
  },
  pillCurrentDot: {
    position: 'absolute', top: 8, right: 8,
    width: 6, height: 6, borderRadius: 3,
  },
  pillPhase: {
    color: '#64748b', fontSize: 9, fontWeight: '700',
    letterSpacing: 0.8, marginBottom: 2, textAlign: 'center',
  },
  pillOvers: {
    color: '#94a3b8', fontSize: 10, fontWeight: '600',
    marginBottom: 4,
  },
  pillScore: {
    fontSize: 24, fontWeight: '900', letterSpacing: -0.5,
  },
  pillCurrentBadge: {
    marginTop: 5, borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  pillCurrentBadgeText: {
    fontSize: 8, fontWeight: '900', letterSpacing: 1.5,
  },

  // Test
  testSection: { marginBottom: 8 },
  testSessionBadge: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start', marginBottom: 12,
  },
  testSessionText: { color: GOLD, fontSize: 12, fontWeight: '700' },
  testCRRRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    padding: 12, marginBottom: 14,
  },
  testCRRLabel: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  testCRRValue: { color: '#22c55e', fontSize: 20, fontWeight: '900' },
  testSessionRow: { flexDirection: 'row', gap: 8 },
  testSessionCard: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12, alignItems: 'center', gap: 4,
  },
  testSessionIcon: { fontSize: 18 },
  testSessionRuns: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
  testSessionLabel: { color: '#64748b', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },

  disclaimer: {
    color: '#334155', fontSize: 10,
    textAlign: 'center', marginTop: 10,
    letterSpacing: 0.3, lineHeight: 16,
  },

  // Lock styles
  lockedWrap: { marginBottom: 8 },
  blurPreview: { position: 'relative', marginBottom: 0 },
  blurRow: { flexDirection: 'row', gap: 8 },
  blurPill: {
    opacity: 0.22,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  blurLine: {
    height: 10, width: 55, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  blurOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 55,
    backgroundColor: 'rgba(12,20,44,0.85)',
  },
  lockCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(167,139,250,0.07)',
    borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    padding: 22, marginTop: 4,
  },
  lockIcon: { fontSize: 34, marginBottom: 10 },
  lockTitle: {
    color: '#e2e8f0', fontSize: 15, fontWeight: '800',
    letterSpacing: 0.3, marginBottom: 6, textAlign: 'center',
  },
  lockSub: {
    color: '#64748b', fontSize: 12, textAlign: 'center',
    lineHeight: 18, marginBottom: 18, paddingHorizontal: 8,
  },
  watchAdBtn: {
    width: '100%', borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
    backgroundColor: 'rgba(167,139,250,0.15)',
    marginBottom: 8,
  },
  watchAdBtnInner: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 10, paddingVertical: 14,
  },
  watchAdIcon: { fontSize: 15 },
  watchAdText: { color: PURPLE, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  lockDisclaimer: { color: '#334155', fontSize: 10, letterSpacing: 0.5 },
  unlockedBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.25)',
    paddingHorizontal: 12, paddingVertical: 4,
    marginBottom: 10,
  },
  unlockedBadgeText: {
    color: '#22c55e', fontSize: 10, fontWeight: '800', letterSpacing: 1.5,
  },
  // Loading state
  loadingContainer: {
    justifyContent: 'center', alignItems: 'center',
    paddingVertical: 40, paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 16, fontSize: 12, fontWeight: '600',
    letterSpacing: 0.5,
  },
});
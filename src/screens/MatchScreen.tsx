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
  Alert,
  Animated,
  Dimensions,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { fetchPrediction, PredictionResponse } from '../services/Prediction';
import { fetchLiveStatuses } from '../services/LiveStatus';

type MatchScreenRouteProp = RouteProp<RootStackParamList, 'Match'>;

const { width } = Dimensions.get('window');

const GOLD        = '#f59e0b';
const BLUE        = '#38bdf8';
const CARD_BG     = 'rgba(255,255,255,0.06)';
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
  const hrs  = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const urgent = ms < 3_600_000;
  if (days > 0) { return { label: `${days}d ${hrs}h`, urgent: false }; }
  if (hrs > 0)  { return { label: `${hrs}h ${mins}m`, urgent: false }; }
  return { label: `${mins}m ${secs}s`, urgent };
}

function statusMeta(status: string) {
  const s = status.toLowerCase();
  if (s.includes('live') || s.includes('progress'))
    return { color: '#22c55e', glow: 'rgba(34,197,94,0.35)',   emoji: '🟢', label: status };
  if (s.includes('upcoming') || s.includes('scheduled') || s.includes('start'))
    return { color: GOLD,      glow: 'rgba(245,158,11,0.3)',   emoji: '⏳', label: status };
  if (s.includes('finish') || s.includes('complete') || s.includes('result') || s.includes('won'))
    return { color: '#a78bfa', glow: 'rgba(167,139,250,0.3)', emoji: '🏆', label: status };
  if (s.includes('abandon') || s.includes('cancel') || s.includes('postpone'))
    return { color: '#ef4444', glow: 'rgba(239,68,68,0.3)',   emoji: '❌', label: status };
  return   { color: '#94a3b8', glow: 'rgba(148,163,184,0.2)', emoji: '📊', label: status };
}

function formatMeta(fmt: string) {
  const f = fmt.toLowerCase();
  if (f.includes('t20') || f === 't20i')
    return { color: '#f97316', border: 'rgba(249,115,22,0.4)',  bg: 'rgba(249,115,22,0.12)',  icon: '⚡',  short: 'T20'  };
  if (f.includes('odi') || f.includes('one day'))
    return { color: BLUE,      border: 'rgba(56,189,248,0.4)',  bg: 'rgba(56,189,248,0.12)',  icon: '🏅',  short: 'ODI'  };
  if (f.includes('test'))
    return { color: '#a78bfa', border: 'rgba(167,139,250,0.4)',bg: 'rgba(167,139,250,0.12)', icon: '🎖️', short: 'TEST' };
  return   { color: GOLD,      border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.12)', icon: '🏏',  short: fmt.toUpperCase() };
}

// ─── PollCard ─────────────────────────────────────────────────────────────────

type PollVote = 0 | 1 | 2; // 0 = not voted, 1 = team1, 2 = team2

interface PollState {
  team1Votes: number;
  team2Votes: number;
  userVote: PollVote;
}

function PollCard({
  team1, team2, matchId,
}: {
  team1: string; team2: string; matchId: string;
}) {
  const STORAGE_KEY = `poll_${matchId}`;

  const [poll, setPoll] = useState<PollState>({
    team1Votes: 48, team2Votes: 31, userVote: 0,
  });
  const [revealing, setRevealing] = useState(false);

  // Animated bars
  const bar1Width = useRef(new Animated.Value(0)).current;
  const bar2Width = useRef(new Animated.Value(0)).current;
  // Card entrance
  const cardFade  = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(24)).current;
  // Vote tap scale per button
  const scale1    = useRef(new Animated.Value(1)).current;
  const scale2    = useRef(new Animated.Value(1)).current;
  // Results reveal
  const resultsFade  = useRef(new Animated.Value(0)).current;
  const resultsSlide = useRef(new Animated.Value(12)).current;
  // Trophy bounce
  const trophyScale  = useRef(new Animated.Value(0)).current;

  const total = (s: PollState) => s.team1Votes + s.team2Votes || 1;
  const pct1  = (s: PollState) => Math.round((s.team1Votes / total(s)) * 100);
  const pct2  = (s: PollState) => Math.round((s.team2Votes / total(s)) * 100);

  // Load persisted vote
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as PollState;
          setPoll(saved);
          if (saved.userVote !== 0) { triggerReveal(saved); }
        }
      } catch {}
    })();
    // Card entrance
    Animated.parallel([
      Animated.timing(cardFade,  { toValue: 1, duration: 500, delay: 200, useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: 0, duration: 500, delay: 200, useNativeDriver: true }),
    ]).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animateBars = useCallback((s: PollState) => {
    const p1 = pct1(s) / 100;
    const p2 = pct2(s) / 100;
    Animated.parallel([
      Animated.spring(bar1Width, { toValue: p1, useNativeDriver: false, tension: 60, friction: 8 }),
      Animated.spring(bar2Width, { toValue: p2, useNativeDriver: false, tension: 60, friction: 8 }),
    ]).start();
  }, [bar1Width, bar2Width, pct1, pct2]);

  const triggerReveal = useCallback((s: PollState) => {
    setRevealing(true);
    animateBars(s);
    Animated.parallel([
      Animated.timing(resultsFade,  { toValue: 1, duration: 400, delay: 200, useNativeDriver: true }),
      Animated.timing(resultsSlide, { toValue: 0, duration: 400, delay: 200, useNativeDriver: true }),
    ]).start();
    // Trophy pop for winning side
    Animated.sequence([
      Animated.delay(600),
      Animated.spring(trophyScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 6 }),
    ]).start();
  }, [animateBars, resultsFade, resultsSlide, trophyScale]);

  const handleVote = useCallback(async (choice: 1 | 2) => {
    if (poll.userVote !== 0) { return; }

    // Button pop
    const scaleRef = choice === 1 ? scale1 : scale2;
    Animated.sequence([
      Animated.timing(scaleRef, { toValue: 0.88, duration: 80,  useNativeDriver: true }),
      Animated.spring(scaleRef, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 8 }),
    ]).start();

    const next: PollState = {
      team1Votes: poll.team1Votes + (choice === 1 ? 1 : 0),
      team2Votes: poll.team2Votes + (choice === 2 ? 1 : 0),
      userVote:   choice,
    };
    setPoll(next);
    triggerReveal(next);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, [poll, STORAGE_KEY, scale1, scale2, triggerReveal]);

  const hasVoted  = poll.userVote !== 0;
  const leader    = pct1(poll) >= pct2(poll) ? 1 : 2;
  const leaderPct = leader === 1 ? pct1(poll) : pct2(poll);

  const bar1W = bar1Width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const bar2W = bar2Width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Animated.View style={[
      styles.pollCard,
      { opacity: cardFade, transform: [{ translateY: cardSlide }] },
    ]}>
      {/* Decorative top glow */}
      <View style={styles.pollTopGlow} />

      {/* Header */}
      <View style={styles.pollHeader}>
        <View style={styles.pollHeaderLeft}>
          <Text style={styles.pollTitle}>🗳️ FAN POLL</Text>
          <View style={styles.pollTitleUnderline} />
        </View>
        <View style={styles.pollVoteCountBadge}>
          <Text style={styles.pollVoteCountText}>
            {(total(poll)).toLocaleString()} votes
          </Text>
        </View>
      </View>

      <Text style={styles.pollQuestion}>Who do you think will win?</Text>

      {!hasVoted ? (
        /* ── Voting buttons ─────────────────────────────── */
        <View style={styles.pollButtons}>
          {/* Team 1 */}
          <Animated.View style={[{ flex: 1 }, { transform: [{ scale: scale1 }] }]}>
            <TouchableOpacity
              style={[styles.pollVoteBtn, styles.pollVoteBtn1]}
              onPress={() => handleVote(1)}
              activeOpacity={0.85}>
              <Text style={styles.pollVoteBtnInitials}>{initials(team1)}</Text>
              <Text style={styles.pollVoteBtnName} numberOfLines={2}>{team1}</Text>
              <View style={styles.pollVoteBtnArrow}>
                <Text style={{ color: GOLD, fontSize: 16, fontWeight: '800' }}>→</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          {/* Divider */}
          <View style={styles.pollOr}>
            <View style={styles.pollOrLine} />
            <Text style={styles.pollOrText}>OR</Text>
            <View style={styles.pollOrLine} />
          </View>

          {/* Team 2 */}
          <Animated.View style={[{ flex: 1 }, { transform: [{ scale: scale2 }] }]}>
            <TouchableOpacity
              style={[styles.pollVoteBtn, styles.pollVoteBtn2]}
              onPress={() => handleVote(2)}
              activeOpacity={0.85}>
              <Text style={styles.pollVoteBtnInitials}>{initials(team2)}</Text>
              <Text style={styles.pollVoteBtnName} numberOfLines={2}>{team2}</Text>
              <View style={styles.pollVoteBtnArrow}>
                <Text style={{ color: BLUE, fontSize: 16, fontWeight: '800' }}>→</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>
      ) : (
        /* ── Results ──────────────────────────────────────── */
        <Animated.View style={[
          styles.pollResults,
          { opacity: resultsFade, transform: [{ translateY: resultsSlide }] },
        ]}>
          {/* Team 1 bar */}
          <View style={styles.pollResultRow}>
            <View style={styles.pollResultMeta}>
              <Text style={styles.pollResultTeam} numberOfLines={1}>{team1}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {poll.userVote === 1 && (
                  <View style={styles.yourVoteBadge}>
                    <Text style={styles.yourVoteBadgeText}>YOUR VOTE</Text>
                  </View>
                )}
                <Text style={[
                  styles.pollResultPct,
                  { color: leader === 1 ? GOLD : '#64748b' },
                ]}>
                  {pct1(poll)}%
                </Text>
              </View>
            </View>
            {/* Bar track */}
            <View style={styles.pollBarTrack}>
              <Animated.View style={[
                styles.pollBar,
                { width: bar1W, backgroundColor: leader === 1 ? GOLD : 'rgba(245,158,11,0.35)' },
              ]}>
                <View style={styles.pollBarShine} />
              </Animated.View>
            </View>
          </View>

          {/* Team 2 bar */}
          <View style={[styles.pollResultRow, { marginTop: 14 }]}>
            <View style={styles.pollResultMeta}>
              <Text style={styles.pollResultTeam} numberOfLines={1}>{team2}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {poll.userVote === 2 && (
                  <View style={[styles.yourVoteBadge, { backgroundColor: 'rgba(56,189,248,0.2)', borderColor: 'rgba(56,189,248,0.4)' }]}>
                    <Text style={[styles.yourVoteBadgeText, { color: BLUE }]}>YOUR VOTE</Text>
                  </View>
                )}
                <Text style={[
                  styles.pollResultPct,
                  { color: leader === 2 ? BLUE : '#64748b' },
                ]}>
                  {pct2(poll)}%
                </Text>
              </View>
            </View>
            <View style={styles.pollBarTrack}>
              <Animated.View style={[
                styles.pollBar,
                { width: bar2W, backgroundColor: leader === 2 ? BLUE : 'rgba(56,189,248,0.35)' },
              ]}>
                <View style={styles.pollBarShine} />
              </Animated.View>
            </View>
          </View>

          {/* Verdict */}
          <Animated.View style={[
            styles.pollVerdict,
            { transform: [{ scale: trophyScale }] },
          ]}>
            <Text style={styles.pollVerdictEmoji}>🏆</Text>
            <Text style={styles.pollVerdictText}>
              Fans back{' '}
              <Text style={{ color: leader === 1 ? GOLD : BLUE, fontWeight: '800' }}>
                {leader === 1 ? team1 : team2}
              </Text>
              {'  '}
              <Text style={styles.pollVerdictPct}>{leaderPct}%</Text>
            </Text>
          </Animated.View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ─── CountdownRow ─────────────────────────────────────────────────────────────

function CountdownRow({ rawDate, delay }: { rawDate: string; delay: number }) {
  const matchDate = parseMatchDate(rawDate);
  const [ms, setMs] = useState<number>(matchDate ? matchDate.getTime() - Date.now() : -1);
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
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
          Animated.timing(pulse, { toValue: 1,    duration: 120, useNativeDriver: true }),
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
  const meta     = statusMeta(status);
  const fade     = useRef(new Animated.Value(0)).current;
  const slide    = useRef(new Animated.Value(16)).current;
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const isLive   = meta.color === '#22c55e';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
    if (isLive) {
      Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])).start();
    }
  }, [delay, fade, glowAnim, isLive, slide]);

  return (
    <Animated.View style={[styles.infoRow, { opacity: fade, transform: [{ translateX: slide }] }]}>
      <View style={styles.infoIconWrap}><Text style={styles.infoIcon}>📊</Text></View>
      <View style={styles.infoTextWrap}>
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
  const meta  = formatMeta(format);
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(16)).current;
  const shine = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
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
  const fade       = useRef(new Animated.Value(0)).current;
  const slide      = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, [delay, fade, slide]);

  const toggle = () => {
    setExpanded(e => !e);
    Animated.spring(expandAnim, {
      toValue: expanded ? 0 : 1, useNativeDriver: false, tension: 100, friction: 12,
    }).start();
  };

  const expandedHeight = expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 108] });
  const chevronRotate  = expandAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const expandOpacity  = expandAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
  const parts   = venue.split(',');
  const city    = parts[parts.length - 1]?.trim() || venue;
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
  const opacity    = useRef(new Animated.Value(1)).current;
  const scale      = useRef(new Animated.Value(0.4)).current;
  const angle      = useRef(Math.random() * Math.PI * 2).current;
  const distance   = useRef(45 + Math.random() * 65).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -distance * Math.sin(angle) - 20, duration: 1350, useNativeDriver: true }),
      Animated.timing(translateX, { toValue:  distance * Math.cos(angle),       duration: 1350, useNativeDriver: true }),
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
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale,   { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
      ]),
    ])).start();
  }, [opacity, scale]);
  return <Animated.View style={[styles.pulsingDot, { transform: [{ scale }], opacity }]} />;
}

// ─── VSCircle ─────────────────────────────────────────────────────────────────

function VSCircle({ isSwapping }: { isSwapping: boolean }) {
  const rotate = useRef(new Animated.Value(0)).current;
  const scale  = useRef(new Animated.Value(1)).current;
  const glow   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isSwapping) {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.45, duration: 200, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1,    duration: 400, useNativeDriver: true }),
        ]),
        Animated.timing(rotate, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start(() => rotate.setValue(0));
    }
  }, [isSwapping, glow, rotate, scale]);

  const spin        = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
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
  const fade    = useRef(new Animated.Value(0)).current;
  const bobY    = useRef(new Animated.Value(0)).current;
  const lastTap = useRef<number>(0);
  const viewRef = useRef<View>(null);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, delay: entranceDelay, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bobY, { toValue: -7, duration: 900, delay: bobDelay,  useNativeDriver: true }),
      Animated.timing(bobY, { toValue: 0,  duration: 900,                   useNativeDriver: true }),
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
  const { match } = route.params;

  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [swapped,    setSwapped]    = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [particles,  setParticles]  = useState<ParticleData[]>([]);
  const particleIdRef = useRef(0);

  const slideLeft  = useRef(new Animated.Value(0)).current;
  const slideRight = useRef(new Animated.Value(0)).current;
  const flipLeft   = useRef(new Animated.Value(0)).current;
  const flipRight  = useRef(new Animated.Value(0)).current;
  const pageFade   = useRef(new Animated.Value(0)).current;
  const pageSlide  = useRef(new Animated.Value(40)).current;
  const predFade   = useRef(new Animated.Value(0)).current;
  const predScale  = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(pageFade,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(pageSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [pageFade, pageSlide]);

  const animatePredCard = useCallback(() => {
    predFade.setValue(0); predScale.setValue(0.92);
    Animated.parallel([
      Animated.timing(predFade,  { toValue: 1, duration: 500, delay: 100, useNativeDriver: true }),
      Animated.spring(predScale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
    ]).start();
  }, [predFade, predScale]);

  const loadPrediction = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [matchUpdated] = await fetchLiveStatuses([match]);
      const result = await fetchPrediction(matchUpdated || match);
      setPrediction(result);
      animatePredCard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prediction');
      Alert.alert('Error', 'Failed to load prediction. Please try again.');
    } finally { setLoading(false); }
  }, [match, animatePredCard]);

  useEffect(() => { loadPrediction(); }, [loadPrediction]);

  const handleDoubleTap = useCallback((x: number, y: number) => {
    if (isSwapping) { return; }
    setIsSwapping(true);
    const burst: ParticleData[] = BURST_EMOJIS.map(emoji => ({ id: ++particleIdRef.current, emoji, x, y }));
    setParticles(prev => [...prev, ...burst]);
    const dist = (width - 100) / 2.2;
    Animated.parallel([
      Animated.timing(flipLeft,   { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(flipRight,  { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideLeft,  { toValue:  dist, duration: 520, useNativeDriver: true }),
      Animated.timing(slideRight, { toValue: -dist, duration: 520, useNativeDriver: true }),
    ]).start(() => {
      setSwapped(s => !s);
      slideLeft.setValue(-dist); slideRight.setValue(dist);
      flipLeft.setValue(0);      flipRight.setValue(0);
      Animated.parallel([
        Animated.spring(slideLeft,  { toValue: 0, useNativeDriver: true, tension: 110, friction: 11 }),
        Animated.spring(slideRight, { toValue: 0, useNativeDriver: true, tension: 110, friction: 11 }),
      ]).start(() => setIsSwapping(false));
    });
  }, [isSwapping, flipLeft, flipRight, slideLeft, slideRight]);

  const removeParticle = useCallback((id: number) => {
    setParticles(prev => prev.filter(p => p.id !== id));
  }, []);

  const t1 = { flag: match.teamInfo && match.teamInfo.length > 0 ? match.teamInfo[0].img : null, name: match.teams[0] || 'Team A' };
  const t2 = { flag: match.teamInfo && match.teamInfo.length > 1 ? match.teamInfo[1].img : null, name: match.teams[1] || 'Team B' };
  const left  = swapped ? t2 : t1;
  const right = swapped ? t1 : t2;

  const leftRotY  = flipLeft.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rightRotY = flipRight.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // stable match id for poll persistence
  const matchId = `${match.teams?.[0]}_${match.teams?.[1]}_${match.date}`.replace(/\s+/g, '_');

  return (
    <View style={styles.root}>
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
              <VenueRow    venue={match.venue || '—'}              delay={300} />
              <CountdownRow rawDate={match.date || ''}            delay={360} />
              {match.matchType && <FormatRow format={match.matchType} delay={420} />}
              {match.status    && <StatusRow status={match.status}    delay={480} />}
            </View>
          </View>

          {/* ── Fan Poll ───────────────────────────────────── */}
          <PollCard
            team1={match.teams[0] || 'Team A'}
            team2={match.teams[1] || 'Team B'}
            matchId={matchId}
          />

          {/* ── AI Prediction Card ────────────────────────── */}
          <Animated.View style={[styles.predCard, { opacity: predFade, transform: [{ scale: predScale }] }]}>
            <View style={styles.predGlow} />
            <View style={styles.predHeader}>
              <Text style={styles.predTitle}>🔮 AI PREDICTION</Text>
              <View style={styles.predTitleUnderline} />
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <View style={styles.loadingSpinnerWrap}>
                  <ActivityIndicator size="large" color={GOLD} />
                </View>
                <Text style={styles.loadingPrimary}>Analyzing match data</Text>
                <Text style={styles.loadingSub}>Crunching stats, pitch reports & form...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={loadPrediction}>
                  <Text style={styles.retryBtnText}>Try Again</Text>
                </TouchableOpacity>
              </View>
            ) : prediction ? (
              <View>
                <View style={styles.winnerChip}>
                  <Text style={styles.winnerChipLabel}>PREDICTED WINNER</Text>
                  <Text style={styles.winnerChipName}>{prediction.winner}</Text>
                  <View style={styles.winnerChipGlow} />
                </View>
                {prediction.reason && (
                  <View style={styles.analysisBox}>
                    <View style={styles.analysisHeader}>
                      <Text style={styles.analysisIcon}>📝</Text>
                      <Text style={styles.analysisTitle}>Analysis</Text>
                    </View>
                    <View style={styles.analysisDivider} />
                    <Text style={styles.analysisText}>{prediction.reason}</Text>
                  </View>
                )}
              </View>
            ) : null}
          </Animated.View>

          {!loading && (
            <TouchableOpacity style={styles.refreshBtn} onPress={loadPrediction} activeOpacity={0.82}>
              <View style={styles.refreshBtnInner}>
                <Text style={styles.refreshBtnIcon}>🔄</Text>
                <Text style={styles.refreshBtnText}>Refresh Prediction</Text>
              </View>
            </TouchableOpacity>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#0b1120' },
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
  content:       { flex: 1 },
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
  pulsingDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  liveBadgeText: { color: '#ef4444', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },

  teamsRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10, overflow: 'visible',
  },
  teamSlot:         { flex: 1, alignItems: 'center' },
  teamTouchable:    { alignItems: 'center', gap: 8 },
  teamAvatarRing:   {
    width: 72, height: 72, borderRadius: 36, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', padding: 3, marginBottom: 8,
  },
  teamFlag:         { width: 62, height: 62, borderRadius: 31 },
  teamFallback:     { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  teamFallbackText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  teamName:         { color: '#e2e8f0', fontSize: 13, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  teamLabelBadge:   { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  teamLabelText:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  vsBlock:    { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
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
  vsText:       { color: '#94a3b8', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  vsHint:       { color: 'rgba(255,255,255,0.22)', fontSize: 8, marginTop: 5, textAlign: 'center', letterSpacing: 0.3 },
  swapHintRow:  { alignItems: 'center', marginBottom: 14 },
  swapHintText: { color: 'rgba(255,255,255,0.22)', fontSize: 11, letterSpacing: 0.3 },
  cardDivider:  { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 16 },

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
  infoIcon:     { fontSize: 16 },
  infoTextWrap: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel:    { color: '#64748b', fontSize: 13, fontWeight: '500' },
  infoValue:    { color: '#cbd5e1', fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right', paddingLeft: 8 },

  statusPill: {
    borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4,
    overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
  },
  statusPillGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 20,
  },
  statusPillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

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

  venueExpanded:      { overflow: 'hidden' },
  venueExpandedInner: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, marginBottom: 8,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  venueExpandedTop:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  venueStadiumIcon:  {
    width: 52, height: 52, borderRadius: 12,
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  venueStadiumName: { color: '#e2e8f0', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  venueCity:        { color: '#64748b', fontSize: 12, marginTop: 2 },
  venueMapsBtn:     {
    backgroundColor: 'rgba(56,189,248,0.12)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)',
    paddingVertical: 8, alignItems: 'center',
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
  pollHeaderLeft:   { alignItems: 'flex-start' },
  pollTitle:        { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 2, marginBottom: 6 },
  pollTitleUnderline:{ width: 36, height: 3, borderRadius: 2, backgroundColor: '#a78bfa' },
  pollVoteCountBadge:{
    backgroundColor: 'rgba(167,139,250,0.15)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  pollVoteCountText: { color: '#a78bfa', fontSize: 11, fontWeight: '700' },
  pollQuestion:      { color: '#94a3b8', fontSize: 13, marginBottom: 18, marginTop: 4 },

  // Vote buttons
  pollButtons:    { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  pollVoteBtn:    {
    flex: 1, borderRadius: 16, borderWidth: 1, padding: 14,
    alignItems: 'center', gap: 6, overflow: 'hidden',
  },
  pollVoteBtn1:   { backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' },
  pollVoteBtn2:   { backgroundColor: 'rgba(56,189,248,0.08)', borderColor: 'rgba(56,189,248,0.3)' },
  pollVoteBtnInitials: { color: '#fff', fontSize: 22, fontWeight: '800' },
  pollVoteBtnName:     { color: '#cbd5e1', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  pollVoteBtnArrow:    { marginTop: 2 },

  // OR divider
  pollOr: { alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 2 },
  pollOrLine: { width: 1, flex: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  pollOrText: { color: '#475569', fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  // Results
  pollResults:    { gap: 0 },
  pollResultRow:  {},
  pollResultMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  pollResultTeam: { color: '#e2e8f0', fontSize: 13, fontWeight: '700', flex: 1 },
  pollResultPct:  { fontSize: 16, fontWeight: '800' },

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
  pollBar:      { height: 10, borderRadius: 5, overflow: 'hidden' },
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
  pollVerdictText:  { color: '#cbd5e1', fontSize: 14, fontWeight: '600', flex: 1 },
  pollVerdictPct:   { color: '#a78bfa', fontWeight: '800' },

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
  predHeader:         { alignItems: 'center', marginBottom: 22 },
  predTitle:          { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  predTitleUnderline: { width: 48, height: 3, borderRadius: 2, backgroundColor: GOLD },

  loadingBox: { alignItems: 'center', paddingVertical: 32 },
  loadingSpinnerWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(245,158,11,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
  },
  loadingPrimary: { color: '#e2e8f0', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  loadingSub:     { color: '#64748b', fontSize: 13, textAlign: 'center' },

  errorBox:     { alignItems: 'center', paddingVertical: 28, gap: 12 },
  errorIcon:    { fontSize: 40 },
  errorText:    { color: '#94a3b8', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  retryBtn:     { marginTop: 4, backgroundColor: GOLD, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  retryBtnText: { color: '#0b1120', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  winnerChip: {
    backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
    padding: 20, alignItems: 'center', marginBottom: 16, overflow: 'hidden',
  },
  winnerChipGlow:  { position: 'absolute', bottom: -30, width: 160, height: 80, borderRadius: 80, backgroundColor: 'rgba(245,158,11,0.12)' },
  winnerChipLabel: { color: GOLD, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 10, opacity: 0.9 },
  winnerChipName:  { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: 0.5 },

  analysisBox:     { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 16 },
  analysisHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  analysisIcon:    { fontSize: 16 },
  analysisTitle:   { color: '#94a3b8', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  analysisDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginBottom: 12 },
  analysisText:    { color: '#cbd5e1', fontSize: 14, lineHeight: 22 },

  refreshBtn:      { borderRadius: 16, overflow: 'hidden', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(56,189,248,0.3)', backgroundColor: 'rgba(56,189,248,0.08)' },
  refreshBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  refreshBtnIcon:  { fontSize: 18 },
  refreshBtnText:  { color: BLUE, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  bottomSpacer:    { height: 32 },
});
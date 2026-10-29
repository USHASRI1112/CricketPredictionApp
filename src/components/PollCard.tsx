/**
 * PollCard.tsx
 * -----------
 * Drop this into MatchScreen.tsx and render:
 *   <PollCard match={match} />
 *
 * Features:
 *  - Seeded base vote counts (from match.id) — looks organic, never starts at 0
 *  - Auto-increments every 30 min deterministically (same device/time = same count)
 *  - User's vote persists via AsyncStorage across back/forward navigation
 *  - Animated bar + haptic on vote
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import { Match } from '../types'; // adjust path if needed

// ─── Colour tokens (keep in sync with MatchScreen) ───────────────────────────
const GOLD   = '#F5C518';
const CYAN   = '#00E5FF';
const WHITE  = '#FFFFFF';
const BORDER = 'rgba(255,255,255,0.08)';

// ─── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Vote computation ─────────────────────────────────────────────────────────
/**
 * Returns { v1, v2 } — deterministic for a given matchId + 30-min time slot.
 *
 * Base votes: seeded from matchId → team1 gets 420–1800, team2 gets 380–1650
 * Each 30-min slot adds a seeded increment (8–35 per slot per team).
 */
function computeVotes(matchId: string, _team1: string, _team2: string) {
  // Stable hash from matchId
  const idHash = matchId
    .split('')
    .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0x811c9dc5);

  const baseRand = mulberry32(Math.abs(idHash));

  const base1 = 420 + Math.floor(baseRand() * 1381); // 420–1800
  const base2 = 380 + Math.floor(baseRand() * 1271); // 380–1650

  // 30-min slot index since unix epoch
  const slotIndex = Math.floor(Date.now() / (30 * 60 * 1000));

  // Accumulate increments from slot 0 up to slotIndex
  // To avoid looping millions of times, we use a single seeded value
  // scaled by slotIndex (cheap approximation, still deterministic)
  const slotRand1 = mulberry32(Math.abs(idHash ^ (slotIndex * 2654435761)));
  const slotRand2 = mulberry32(Math.abs(idHash ^ (slotIndex * 1103515245)));

  // avg 21 votes per slot × slotIndex, ± noise
  const inc1 = Math.floor(slotIndex * 21 + slotRand1() * slotIndex * 14);
  const inc2 = Math.floor(slotIndex * 18 + slotRand2() * slotIndex * 12);

  return {
    v1: base1 + inc1,
    v2: base2 + inc2,
  };
}

function formatVotes(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

// ─── Storage key ─────────────────────────────────────────────────────────────
function storageKey(matchId: string) {
  return `poll_vote_${matchId}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface PollCardProps {
  match: Match;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PollCard({ match }: PollCardProps) {
  const matchId = match.id || 'unknown';
  const team1   = match.teams?.[0] || 'Team 1';
  const team2   = match.teams?.[1] || 'Team 2';

  // ── State ──────────────────────────────────────────────────────────────────
  const [votedFor, setVotedFor]   = useState<1 | 2 | null>(null); // null = not voted yet
  const [extraV1,  setExtraV1]    = useState(0); // user's extra vote
  const [extraV2,  setExtraV2]    = useState(0);
  const [base, setBase]           = useState(() => computeVotes(matchId, team1, team2));
  const [revealed, setRevealed]   = useState(false); // show results only after voting

  // ── Animated values ────────────────────────────────────────────────────────
  const bar1Anim   = useRef(new Animated.Value(0)).current;
  const bar2Anim   = useRef(new Animated.Value(0)).current;
  const card1Scale = useRef(new Animated.Value(1)).current;
  const card2Scale = useRef(new Animated.Value(1)).current;
  const resultOp   = useRef(new Animated.Value(0)).current;
  const shimmer    = useRef(new Animated.Value(-1)).current;

  // ── Load persisted vote on mount ───────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(storageKey(matchId)).then(val => {
      if (val === '1' || val === '2') {
        const v = Number(val) as 1 | 2;
        setVotedFor(v);
        setRevealed(true);
        if (v === 1) setExtraV1(1);
        else         setExtraV2(1);
      }
    });
  }, [matchId]);

  // ── Refresh base every 30 min ──────────────────────────────────────────────
  useEffect(() => {
    const msUntilNextSlot = 30 * 60 * 1000 - (Date.now() % (30 * 60 * 1000));
    const timer = setTimeout(() => {
      setBase(computeVotes(matchId, team1, team2));
    }, msUntilNextSlot);
    return () => clearTimeout(timer);
  }, [matchId, team1, team2]);

  // ── Animate bars when revealed ─────────────────────────────────────────────
  const animateBars = useCallback((pct1: number) => {
    Animated.parallel([
      Animated.timing(bar1Anim, {
        toValue: pct1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(bar2Anim, {
        toValue: 1 - pct1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(resultOp, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Shimmer sweep
    shimmer.setValue(-1);
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 2,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [bar1Anim, bar2Anim, resultOp, shimmer]);

  // ── Re-animate if user already voted (on mount) ────────────────────────────
  useEffect(() => {
    if (revealed) {
      const total = base.v1 + extraV1 + base.v2 + extraV2;
      const pct1  = total > 0 ? (base.v1 + extraV1) / total : 0.5;
      animateBars(pct1);
    }
  }, [revealed, animateBars, base, extraV1, extraV2]);

  // ── Handle vote ───────────────────────────────────────────────────────────
  const handleVote = async (team: 1 | 2) => {
    if (votedFor !== null) return; // already voted
    Vibration.vibrate(18);

    // Press bounce
    const scaleAnim = team === 1 ? card1Scale : card2Scale;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, speed: 20, bounciness: 10, useNativeDriver: true }),
    ]).start();

    const newV1 = team === 1 ? 1 : 0;
    const newV2 = team === 2 ? 1 : 0;
    setExtraV1(newV1);
    setExtraV2(newV2);
    setVotedFor(team);
    setRevealed(true);

    await AsyncStorage.setItem(storageKey(matchId), String(team));

    const total = base.v1 + newV1 + base.v2 + newV2;
    const pct1  = total > 0 ? (base.v1 + newV1) / total : 0.5;
    animateBars(pct1);
  };

  // ── Derived display values ─────────────────────────────────────────────────
  const total  = base.v1 + extraV1 + base.v2 + extraV2;
  const pct1   = total > 0 ? Math.round(((base.v1 + extraV1) / total) * 100) : 50;
  const pct2   = 100 - pct1;

  const bar1Width = bar1Anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const bar2Width = bar2Anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const shimmerTx = shimmer.interpolate({ inputRange: [-1, 2], outputRange: [-120, 300] });

  const winner = pct1 >= pct2 ? 1 : 2;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={['#0d1f35', '#0a1628']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Shimmer sweep (only after voting) */}
      {revealed && (
        <Animated.View
          style={[styles.shimmerStrip, { transform: [{ translateX: shimmerTx }] }]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.pollIcon}>🗳️</Text>
          <View>
            <Text style={styles.eyebrow}>FAN POLL</Text>
            <Text style={styles.title}>Who will win?</Text>
          </View>
        </View>
        <View style={styles.totalBadge}>
          <Text style={styles.totalText}>{formatVotes(total)} votes</Text>
        </View>
      </View>

      {/* Top accent bar */}
      <View style={styles.accentBar}>
        <LinearGradient
          colors={[CYAN, GOLD, CYAN]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ flex: 1, height: 1 }}
        />
      </View>

      {/* Vote buttons / result */}
      <View style={styles.teamsRow}>

        {/* Team 1 */}
        <Animated.View style={[{ flex: 1 }, { transform: [{ scale: card1Scale }] }]}>
          <Pressable
            onPress={() => handleVote(1)}
            disabled={votedFor !== null}
            android_ripple={null}
          >
            <View style={[
              styles.teamCard,
              votedFor === 1 && styles.teamCardVoted,
              votedFor !== null && votedFor !== 1 && styles.teamCardDimmed,
            ]}>
              <LinearGradient
                colors={votedFor === 1
                  ? ['rgba(0,229,255,0.15)', 'rgba(0,229,255,0.05)']
                  : ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']}
                style={StyleSheet.absoluteFill}
              />
              {votedFor === 1 && (
                <View style={styles.votedBadge}>
                  <Text style={styles.votedBadgeText}>✓ YOUR VOTE</Text>
                </View>
              )}
              <Text style={styles.teamEmoji}>🏏</Text>
              <Text style={[styles.teamName, votedFor === 1 && { color: CYAN }]} numberOfLines={2}>
                {team1}
              </Text>
              {!revealed && (
                <Text style={styles.tapHint}>Tap to vote</Text>
              )}
            </View>
          </Pressable>
        </Animated.View>

        {/* VS divider */}
        <View style={styles.vsDivider}>
          <View style={styles.vsLine} />
          <Text style={styles.vsText}>VS</Text>
          <View style={styles.vsLine} />
        </View>

        {/* Team 2 */}
        <Animated.View style={[{ flex: 1 }, { transform: [{ scale: card2Scale }] }]}>
          <Pressable
            onPress={() => handleVote(2)}
            disabled={votedFor !== null}
            android_ripple={null}
          >
            <View style={[
              styles.teamCard,
              votedFor === 2 && styles.teamCardVoted2,
              votedFor !== null && votedFor !== 2 && styles.teamCardDimmed,
            ]}>
              <LinearGradient
                colors={votedFor === 2
                  ? ['rgba(245,197,66,0.15)', 'rgba(245,197,66,0.05)']
                  : ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0.02)']}
                style={StyleSheet.absoluteFill}
              />
              {votedFor === 2 && (
                <View style={[styles.votedBadge, { borderColor: GOLD + '60', backgroundColor: GOLD + '18' }]}>
                  <Text style={[styles.votedBadgeText, { color: GOLD }]}>✓ YOUR VOTE</Text>
                </View>
              )}
              <Text style={styles.teamEmoji}>🏏</Text>
              <Text style={[styles.teamName, votedFor === 2 && { color: GOLD }]} numberOfLines={2}>
                {team2}
              </Text>
              {!revealed && (
                <Text style={styles.tapHint}>Tap to vote</Text>
              )}
            </View>
          </Pressable>
        </Animated.View>

      </View>

      {/* Results — shown after voting */}
      {revealed && (
        <Animated.View style={[styles.results, { opacity: resultOp }]}>

          {/* Percentage row */}
          <View style={styles.pctRow}>
            <Text style={[styles.pct, { color: CYAN }]}>{pct1}%</Text>
            <Text style={styles.pctLabel}>Win Prediction</Text>
            <Text style={[styles.pct, { color: GOLD }]}>{pct2}%</Text>
          </View>

          {/* Bar 1 */}
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill1, { width: bar1Width }]}>
              <LinearGradient
                colors={[CYAN, '#007a99']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>

          {/* Bar 2 */}
          <View style={styles.barTrack}>
            <Animated.View style={[styles.barFill2, { width: bar2Width }]}>
              <LinearGradient
                colors={[GOLD, '#cc8800']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>

          {/* Vote counts */}
          <View style={styles.countRow}>
            <Text style={styles.count}>{formatVotes(base.v1 + extraV1)} votes</Text>
            <Text style={styles.count}>{formatVotes(base.v2 + extraV2)} votes</Text>
          </View>

          {/* Winner chip */}
          <View style={styles.winnerRow}>
            <View style={[
              styles.winnerChip,
              { borderColor: winner === 1 ? CYAN + '50' : GOLD + '50',
                backgroundColor: winner === 1 ? CYAN + '10' : GOLD + '10' }
            ]}>
              <Text style={[styles.winnerLabel, { color: winner === 1 ? CYAN : GOLD }]}>
                🏆 Fans favour {winner === 1 ? team1 : team2}
              </Text>
            </View>
          </View>

          <Text style={styles.disclaimer}>
            Updates every 30 min · {formatVotes(total)} fans voted
          </Text>
        </Animated.View>
      )}

      {/* Prompt if not voted */}
      {!revealed && (
        <Text style={styles.prompt}>Cast your vote to see live results</Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    marginHorizontal: 16,
    marginVertical: 12,
    padding: 18,
  },
  shimmerStrip: {
    ...StyleSheet.absoluteFillObject,
    width: 100,
  },
  accentBar: { height: 1, marginBottom: 16 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pollIcon:   { fontSize: 26 },
  eyebrow:    { color: CYAN, fontSize: 8, fontWeight: '900', letterSpacing: 3 },
  title:      { color: WHITE, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  totalBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  totalText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Teams
  teamsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginBottom: 14 },

  teamCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 14,
    alignItems: 'center',
    minHeight: 110,
    justifyContent: 'center',
    gap: 6,
  },
  teamCardVoted: {
    borderColor: CYAN + '60',
  },
  teamCardVoted2: {
    borderColor: GOLD + '60',
  },
  teamCardDimmed: {
    opacity: 0.45,
  },
  votedBadge: {
    position: 'absolute',
    top: 6, right: 6,
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: CYAN + '60',
    backgroundColor: CYAN + '18',
  },
  votedBadgeText: { color: CYAN, fontSize: 7, fontWeight: '900', letterSpacing: 1 },

  teamEmoji: { fontSize: 26 },
  teamName:  { color: WHITE, fontSize: 13, fontWeight: '800', textAlign: 'center', letterSpacing: 0.3 },
  tapHint:   { color: 'rgba(255,255,255,0.25)', fontSize: 9, letterSpacing: 1, marginTop: 2 },

  vsDivider: { alignItems: 'center', justifyContent: 'center', gap: 4, width: 28 },
  vsLine:    { width: 1, flex: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  vsText:    { color: 'rgba(255,255,255,0.2)', fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  // Results
  results: { marginTop: 4 },

  pctRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pct:      { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  pctLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  barFill1: { height: '100%', borderRadius: 4, overflow: 'hidden' },
  barFill2: { height: '100%', borderRadius: 4, overflow: 'hidden' },

  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  count: { color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '600' },

  winnerRow: { alignItems: 'center', marginBottom: 10 },
  winnerChip: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
  },
  winnerLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },

  disclaimer: {
    color: 'rgba(255,255,255,0.18)',
    fontSize: 9,
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  prompt: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: 4,
  },
});
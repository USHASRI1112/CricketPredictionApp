import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Match } from '../types';
import { resolveMatchTeamFlags } from '../services/Flags';

interface LiveCardProps {
  match: Match;
  onPress: () => void;
}

function PulseDot() {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.7, duration: 700, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,   duration: 700, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.15, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.9,  duration: 700, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, [opacity, scale]);

  return (
    <View style={dotStyles.wrap}>
      <Animated.View style={[dotStyles.halo, { transform: [{ scale }], opacity }]} />
      <View style={dotStyles.core} />
    </View>
  );
}

const dotStyles = StyleSheet.create({
  wrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  halo: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#38bdf8' },
  core: { width: 7,  height: 7,  borderRadius: 3.5,   backgroundColor: '#7dd3fc' },
});

const LiveCard: React.FC<LiveCardProps> = ({
  match,
  onPress,
}) => {
  const initials = (name = '') =>
    name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  const { team1Flag, team2Flag } = resolveMatchTeamFlags(match);

  // ── Format local time from ISO dateTimeGMT ──────────────────────────
  const localTime = match.dateTimeGMT
    ? new Date(match.dateTimeGMT).toLocaleTimeString([], {
        hour:   '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>

      {/* Top accent bar */}
      <View style={styles.topBar} />

      {/* LIVE row */}
      <View style={styles.liveRow}>
        <PulseDot />
        <Text style={styles.liveText}>LIVE</Text>
        <View style={styles.flex} />
        <Text style={styles.matchTypeChip}>{match.matchType?.toUpperCase() || ''}</Text>
      </View>

      {/* Teams + scores */}
      {/* Teams */}
      <View style={styles.teamsRow}>

        {/* Team 1 */}
        <View style={styles.team}>
          {team1Flag ? (
            <Image source={{ uri: team1Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback]}>
              <Text style={styles.teamInitial}>{initials(match.teams?.[0])}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>{match.teams?.[0]}</Text>
        </View>

        {/* Centre VS */}
        <View style={styles.centerDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.vsText}>VS</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Team 2 */}
        <View style={styles.team}>
          {team2Flag ? (
            <Image source={{ uri: team2Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback]}>
              <Text style={styles.teamInitial}>{initials(match.teams?.[1])}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>{match.teams?.[1]}</Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.metaText} numberOfLines={1}>📍 {match.venue}</Text>
        <View style={styles.footerDot} />
        <Text style={styles.metaText}>📅 {match.date}</Text>
        {localTime ? (
          <>
            <View style={styles.footerDot} />
            <Text style={styles.timeText}>🕐 {localTime}</Text>
          </>
        ) : null}
      </View>

    </TouchableOpacity>
  );
};

const C = {
  surface:    '#0d1f33',
  accent:     '#38bdf8',
  accentSoft: '#7dd3fc',
  border:     'rgba(56,189,248,0.18)',
  borderFaint:'rgba(56,189,248,0.08)',
  textHigh:   '#e2f0fb',
  textMid:    '#7bafc8',
  textLow:    '#2d5a7a',
  chipBg:     'rgba(56,189,248,0.10)',
  statsBg:    'rgba(56,189,248,0.05)',
  statusBg:   'rgba(56,189,248,0.07)',
  avatarBg:   '#0a1c2e',
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 18,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    elevation: 6,
  },
  topBar: {
    height: 3,
    backgroundColor: C.accent,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  liveText: {
    color: C.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
  },
  flex: { flex: 1 },
  matchTypeChip: {
    color: C.accentSoft,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    backgroundColor: C.chipBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  team: {
    flex: 1,
    alignItems: 'center',
    gap: 7,
  },
  teamAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: C.border,
  },
  teamAvatarFallback: {
    backgroundColor: C.avatarBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitial: {
    color: C.accent,
    fontWeight: '800',
    fontSize: 20,
    letterSpacing: 1,
  },
  teamName: {
    color: C.textMid,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  centerDivider: {
    alignItems: 'center',
    width: 38,
    gap: 6,
  },
  dividerLine: {
    width: 1,
    height: 22,
    backgroundColor: C.border,
  },
  vsText: {
    color: C.textLow,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.borderFaint,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.textLow,
  },
  metaText: {
    color: C.textLow,
    fontSize: 11,
    flex: 1,
  },
  timeText: {
    color: C.accentSoft,  // slightly brighter than metaText so time stands out
    fontSize: 11,
    fontWeight: '600',
  },
});

export default LiveCard;

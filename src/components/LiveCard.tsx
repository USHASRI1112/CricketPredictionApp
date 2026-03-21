/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Match } from '../types';

interface LiveCardProps {
  match: Match;
  onPress: () => void;
}

// Pulsing dot for LIVE indicator
function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.7, duration: 700, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.15, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <View style={dotStyles.wrap}>
      {/* Halo ring */}
      <Animated.View style={[dotStyles.halo, { transform: [{ scale }], opacity }]} />
      {/* Solid dot */}
      <View style={dotStyles.core} />
    </View>
  );
}

const dotStyles = StyleSheet.create({
  wrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  halo: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#e84040' },
  core: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#ff6060' },
});

const LiveCard: React.FC<LiveCardProps> = ({ match, onPress }) => {
  const initials = (name = '') =>
    name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  const team1Flag = match.teamInfo && match.teamInfo.length >= 2 ? match.teamInfo[0].img : null;
  const team2Flag = match.teamInfo && match.teamInfo.length >= 2 ? match.teamInfo[1].img : null;

  const parseInning = (inning: any) => {
    if (!inning) return { label: '', runs: '', wickets: '', overs: '' };
    return {
      label: inning.inning || inning.title || '',
      runs: (inning.r ?? inning.runs ?? '') + '',
      wickets: (inning.w ?? inning.wkts ?? '') + '',
      overs: (inning.o ?? inning.overs ?? '') + '',
    };
  };

  let oversText = '';
  if (Array.isArray(match.score) && match.score.length > 0) {
    const firstOvers = match.score[0]?.o ?? '';
    oversText = firstOvers ? `${firstOvers} ov` : '';
  }

  const inning1 = Array.isArray(match.score) && match.score.length > 0
    ? parseInning(match.score[0])
    : { label: '', runs: '', wickets: '', overs: '' };
  const inning2 = Array.isArray(match.score) && match.score.length > 1
    ? parseInning(match.score[1])
    : { label: '', runs: '', wickets: '', overs: '' };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Glowing red top bar */}
      <View style={styles.topBar} />

      {/* LIVE badge row */}
      <View style={styles.liveRow}>
        <PulseDot />
        <Text style={styles.liveText}>LIVE</Text>
        <View style={styles.flex} />
        <Text style={styles.matchTypeChip}>{match.matchType?.toUpperCase() || ''}</Text>
      </View>

      {/* Teams + score row */}
      <View style={styles.teamsRow}>
        {/* Team 1 */}
        <View style={styles.team}>
          {team1Flag ? (
            <Image source={{ uri: team1Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#3d1a1a' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams?.[0])}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>{match.teams?.[0]}</Text>
          {inning1.runs ? (
            <View style={styles.bigScoreWrap}>
              <Text style={styles.bigScore}>{inning1.runs}
                {inning1.wickets ? <Text style={styles.wickets}>/{inning1.wickets}</Text> : null}
              </Text>
              {inning1.overs ? <Text style={styles.oversBadge}>{inning1.overs} ov</Text> : null}
            </View>
          ) : null}
        </View>

        {/* Center divider */}
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
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#1a2a3d' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams?.[1])}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>{match.teams?.[1]}</Text>
          {inning2.runs ? (
            <View style={styles.bigScoreWrap}>
              <Text style={styles.bigScore}>{inning2.runs}
                {inning2.wickets ? <Text style={styles.wickets}>/{inning2.wickets}</Text> : null}
              </Text>
              {inning2.overs ? <Text style={styles.oversBadge}>{inning2.overs} ov</Text> : null}
            </View>
          ) : null}
        </View>
      </View>

      {/* Stats grid */}
      {(inning1.label || inning2.label) ? (
        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>INNINGS</Text>
            <Text style={styles.statsVal}>{inning1.label || '—'}</Text>
            {inning2.label ? (
              <>
                <View style={styles.statsDiv} />
                <Text style={styles.statsVal}>{inning2.label}</Text>
              </>
            ) : null}
          </View>
          <View style={styles.statsRow}>
            <Text style={styles.statsLabel}>OVERS</Text>
            <Text style={styles.statsVal}>{inning1.overs || '—'}</Text>
            {inning2.overs ? (
              <>
                <View style={styles.statsDiv} />
                <Text style={styles.statsVal}>{inning2.overs}</Text>
              </>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Status pill */}
      {match.status ? (
        <View style={styles.statusBanner}>
          <Text style={styles.statusText} numberOfLines={2}>{match.status}</Text>
        </View>
      ) : null}

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.metaText} numberOfLines={1}>📍 {match.venue}</Text>
        <View style={styles.footerDot} />
        <Text style={styles.metaText}>📅 {match.date}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a0e0e',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(232,64,64,0.3)',
    shadowColor: '#e84040',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  topBar: {
    height: 3,
    backgroundColor: '#e84040',
    // Glow via shadow isn't possible on a View, but the card shadow handles it
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  liveText: {
    color: '#e84040',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
  },
  flex: { flex: 1 },
  matchTypeChip: {
    color: '#6a3030',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    backgroundColor: 'rgba(232,64,64,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(232,64,64,0.2)',
  },

  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  team: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  teamAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: 'rgba(232,64,64,0.3)',
  },
  teamAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitial: {
    color: '#e84040',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 1,
  },
  teamName: {
    color: '#c0a0a0',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  bigScoreWrap: {
    alignItems: 'center',
  },
  bigScore: {
    color: '#f0e6c8',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  wickets: {
    color: '#e84040',
    fontSize: 18,
    fontWeight: '700',
  },
  oversBadge: {
    color: '#7a5050',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 2,
  },
  centerDivider: {
    alignItems: 'center',
    width: 36,
    gap: 6,
  },
  dividerLine: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(232,64,64,0.2)',
  },
  vsText: {
    color: '#6a3030',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // Stats grid
  statsGrid: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,64,64,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  statsLabel: {
    color: '#6a3030',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    width: 62,
  },
  statsVal: {
    color: '#c0a0a0',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  statsDiv: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(232,64,64,0.2)',
    marginHorizontal: 8,
  },

  statusBanner: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: 'rgba(232,64,64,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#e84040',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  statusText: {
    color: '#e0a0a0',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#4a2a2a',
  },
  metaText: {
    color: '#5a3030',
    fontSize: 11,
    flex: 1,
  },
});

export default LiveCard;
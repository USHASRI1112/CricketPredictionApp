/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Match } from '../types';
import { resolveMatchTeamFlags } from '../services/Flags';

interface TodayCardProps {
  match: Match;
  onPress: () => void;
}

const TodayCard: React.FC<TodayCardProps> = ({ match, onPress }) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, [shimmer]);

  const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  const initials = (name: string) =>
    name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  const { team1Flag, team2Flag } = resolveMatchTeamFlags(match);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Amber top bar */}
      <View style={styles.topBar} />

      {/* TODAY badge row */}
      <View style={styles.badgeRow}>
        <Animated.View style={[styles.todayBadge, { opacity: shimmerOpacity }]}>
          <Text style={styles.todayDot}>◆</Text>
          <Text style={styles.todayBadgeText}>TODAY</Text>
        </Animated.View>
        <View style={styles.flex} />
        {match.matchType ? (
          <Text style={styles.matchTypeChip}>{match.matchType.toUpperCase()}</Text>
        ) : null}
      </View>

      {/* Teams row */}
      <View style={styles.teamsRow}>
        {/* Team 1 */}
        <View style={styles.team}>
          {team1Flag ? (
            <Image source={{ uri: team1Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#2e2010' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams[0] || '')}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>{match.teams[0]}</Text>
        </View>

        {/* Center */}
        <View style={styles.centerCol}>
          <Text style={styles.vsText}>VS</Text>
          <View style={styles.timePill}>
            <Text style={styles.timeText} numberOfLines={1}>{match.dateTimeGMT}</Text>
          </View>
        </View>

        {/* Team 2 */}
        <View style={styles.team}>
          {team2Flag ? (
            <Image source={{ uri: team2Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#1e2018' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams[1] || '')}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>{match.teams[1]}</Text>
        </View>
      </View>

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
    backgroundColor: '#1c1608',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.35)',
    shadowColor: '#d4a843',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 7,
  },
  topBar: {
    height: 3,
    backgroundColor: '#d4a843',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  todayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(212,168,67,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.4)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
  },
  todayDot: {
    color: '#d4a843',
    fontSize: 7,
  },
  todayBadgeText: {
    color: '#d4a843',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  flex: { flex: 1 },
  matchTypeChip: {
    color: '#7a5c20',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    backgroundColor: 'rgba(212,168,67,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.15)',
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
    gap: 8,
  },
  teamAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(212,168,67,0.3)',
  },
  teamAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitial: {
    color: '#d4a843',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 1,
  },
  teamName: {
    color: '#b09060',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  centerCol: {
    alignItems: 'center',
    width: 80,
    gap: 8,
  },
  vsText: {
    color: '#f0e6c8',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 3,
    textShadowColor: 'rgba(212,168,67,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  timePill: {
    backgroundColor: 'rgba(212,168,67,0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.2)',
  },
  timeText: {
    color: '#8a6a30',
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(212,168,67,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#5a4020',
  },
  metaText: {
    color: '#6a5030',
    fontSize: 11,
    flex: 1,
  },
});

export default TodayCard;
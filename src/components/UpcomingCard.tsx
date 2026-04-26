/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Match } from '../types';
import { resolveMatchTeamFlags } from '../services/Flags';

interface UpcomingCardProps {
  match: Match;
  onPress: () => void;
}

// Countdown-style ticking arrow animation
function TickArrow() {
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, { toValue: 4, duration: 600, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [translateX]);

  return (
    <Animated.Text style={[styles.arrowAnim, { transform: [{ translateX }] }]}>›</Animated.Text>
  );
}

const UpcomingCard: React.FC<UpcomingCardProps> = ({ match, onPress }) => {
  const initials = (name: string) =>
    name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  const { team1Flag, team2Flag } = resolveMatchTeamFlags(match);
  const localTime = match.dateTimeGMT
    ? new Date(match.dateTimeGMT).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Teal top bar */}
      <View style={styles.topBar} />

      {/* UPCOMING badge row */}
      <View style={styles.badgeRow}>
        <View style={styles.upcomingBadge}>
          <TickArrow />
          <Text style={styles.upcomingBadgeText}>UPCOMING</Text>
        </View>
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
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#0e2420' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams[0] || '')}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>{match.teams[0]}</Text>
        </View>

        {/* Center */}
        <View style={styles.centerCol}>
          {/* Hourglass / countdown feel */}
          <Text style={styles.countdownIcon}>⏳</Text>
          <Text style={styles.vsText}>VS</Text>
          <View style={styles.timePill}>
            <Text style={styles.timeText} numberOfLines={2}>{match.dateTimeGMT}</Text>
          </View>
        </View>

        {/* Team 2 */}
        <View style={styles.team}>
          {team2Flag ? (
            <Image source={{ uri: team2Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#0e1e22' }]}>
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
        {localTime ? (
          <>
            <View style={styles.footerDot} />
            <Text style={styles.footerTimeText}>🕐 {localTime}</Text>
          </>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#081814',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(56,200,160,0.25)',
    shadowColor: '#38c8a0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 7,
  },
  topBar: {
    height: 3,
    backgroundColor: '#38c8a0',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  upcomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56,200,160,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,200,160,0.35)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  arrowAnim: {
    color: '#38c8a0',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 14,
  },
  upcomingBadgeText: {
    color: '#38c8a0',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  flex: { flex: 1 },
  matchTypeChip: {
    color: '#206050',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    backgroundColor: 'rgba(56,200,160,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(56,200,160,0.15)',
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
    borderColor: 'rgba(56,200,160,0.25)',
  },
  teamAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitial: {
    color: '#38c8a0',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 1,
  },
  teamName: {
    color: '#5a9080',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  centerCol: {
    alignItems: 'center',
    width: 80,
    gap: 5,
  },
  countdownIcon: {
    fontSize: 18,
  },
  vsText: {
    color: '#f0e6c8',
    fontWeight: '900',
    fontSize: 16,
    letterSpacing: 3,
  },
  timePill: {
    backgroundColor: 'rgba(56,200,160,0.08)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(56,200,160,0.18)',
  },
  timeText: {
    color: '#2a7060',
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 14,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(56,200,160,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#1a4838',
  },
  metaText: {
    color: '#2a5040',
    fontSize: 11,
    flex: 1,
  },
  footerTimeText: {
    color: '#2a7060',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default UpcomingCard;
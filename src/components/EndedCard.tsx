/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Match } from '../types';
import { resolveMatchTeamFlags } from '../services/Flags';

interface EndedCardProps {
  match: Match;
  onPress: () => void;
}

const EndedCard: React.FC<EndedCardProps> = ({ match, onPress }) => {
  const initials = (name: string) =>
    name
      .split(' ')
      .map(s => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  const { team1Flag, team2Flag } = resolveMatchTeamFlags(match);

  const scoreMatches = (match.status || '').match(/(\d{1,4}\/\d{1,3})/g) || [];
  const team1Score = scoreMatches[0] || '';
  const team2Score = scoreMatches[1] || '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Top tinted bar */}
      <View style={styles.topBar} />

      {/* ENDED ribbon */}
      <View style={styles.ribbonWrap}>
        <View style={styles.ribbon}>
          <Text style={styles.ribbonText}>ENDED</Text>
        </View>
      </View>

      {/* Teams row */}
      <View style={styles.row}>
        {/* Team 1 */}
        <View style={styles.team}>
          {team1Flag ? (
            <Image source={{ uri: team1Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#3a4a2a' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams[0] || '')}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.teams[0]}
          </Text>
          {team1Score ? (
            <View style={styles.scorePill}>
              <Text style={styles.scorePillText}>{team1Score}</Text>
            </View>
          ) : null}
        </View>

        {/* Center */}
        <View style={styles.centerCol}>
          <Text style={styles.vsText}>VS</Text>
          <Text style={styles.matchTypeText}>{match.matchType?.toUpperCase() || ''}</Text>
        </View>

        {/* Team 2 */}
        <View style={styles.team}>
          {team2Flag ? (
            <Image source={{ uri: team2Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#2a3a4a' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams[1] || '')}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.teams[1]}
          </Text>
          {team2Score ? (
            <View style={styles.scorePill}>
              <Text style={styles.scorePillText}>{team2Score}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Result banner */}
      {match.status ? (
        <View style={styles.resultBanner}>
          <Text style={styles.trophyIcon}>🏆</Text>
          <Text style={styles.resultText} numberOfLines={2}>{match.status}</Text>
        </View>
      ) : null}

      {/* Footer meta */}
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
    backgroundColor: '#14231a',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 7,
  },
  topBar: {
    height: 3,
    backgroundColor: '#6b7a5a',   // muted olive — "ended" energy
    width: '100%',
  },
  ribbonWrap: {
    position: 'absolute',
    top: 10,
    right: 0,
    zIndex: 10,
  },
  ribbon: {
    backgroundColor: '#4a5568',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  ribbonText: {
    color: '#cbd5e0',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
  team: {
    alignItems: 'center',
    width: '32%',
  },
  teamAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(212,168,67,0.25)',
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
    color: '#a0b090',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  scorePill: {
    marginTop: 6,
    backgroundColor: 'rgba(212,168,67,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,168,67,0.3)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  scorePillText: {
    color: '#d4a843',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  centerCol: {
    alignItems: 'center',
    width: '36%',
    gap: 6,
  },
  vsText: {
    color: '#f0e6c8',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 3,
  },
  matchTypeText: {
    color: '#5a7048',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: 'rgba(212,168,67,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#d4a843',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  trophyIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  resultText: {
    color: '#e0cc90',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  footerDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#4a5568',
  },
  metaText: {
    color: '#5a7050',
    fontSize: 11,
    flex: 1,
  },
});

export default EndedCard;
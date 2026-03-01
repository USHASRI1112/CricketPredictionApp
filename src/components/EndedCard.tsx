/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Match } from '../types';

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

  const team1Flag = match.teamInfo && match.teamInfo.length >= 2 ? match.teamInfo[0].img : null;
  const team2Flag = match.teamInfo && match.teamInfo.length >= 2 ? match.teamInfo[1].img : null;

  const scoreMatches = (match.status || '').match(/(\d{1,4}\/\d{1,3})/g) || [];
  const team1Score = scoreMatches[0] || '';
  const team2Score = scoreMatches[1] || '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.team}>
          {team1Flag ? (
            <Image source={{ uri: team1Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#64748b' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams[0] || '')}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.teams[0]}
          </Text>
          {team1Score && <Text style={styles.score}>{team1Score}</Text>}
        </View>

        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>VS</Text>
          <View style={styles.endedBadge}>
            <Text style={styles.badgeText}>ENDED</Text>
          </View>
          <Text style={styles.timeText}>{match.dateTimeGMT}</Text>
        </View>

        <View style={styles.team}>
          {team2Flag ? (
            <Image source={{ uri: team2Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#475569' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams[1] || '')}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.teams[1]}
          </Text>
          {team2Score && <Text style={styles.score}>{team2Score}</Text>}
        </View>
      </View>

      <View style={styles.matchMeta}>
        <Text style={styles.matchVenue}>📍 {match.venue}</Text>
        <Text style={styles.matchDate}>📅 {match.date}</Text>
      </View>

      {match.status && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultText}>🏆 {match.status}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fafafa',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3.84,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  team: {
    alignItems: 'center',
    width: '30%',
  },
  teamAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginBottom: 6,
  },
  teamAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInitial: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },
  teamName: {
    color: '#2d3748',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  vsContainer: {
    alignItems: 'center',
    width: '40%',
  },
  vsText: {
    color: '#1a202c',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 6,
  },
  timeText: {
    color: '#718096',
    fontSize: 11,
    textAlign: 'center',
  },
  endedBadge: {
    backgroundColor: '#718096',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginVertical: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  matchMeta: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  matchVenue: {
    color: '#4a5568',
    fontSize: 12,
    marginBottom: 4,
  },
  matchDate: {
    color: '#718096',
    fontSize: 12,
  },
  score: {
    color: '#2d3748',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  resultContainer: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#edf2f7',
    borderRadius: 8,
    alignItems: 'center',
  },
  resultText: {
    color: '#2d3748',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default EndedCard;

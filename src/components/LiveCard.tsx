/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Match } from '../types';

interface LiveCardProps {
  match: Match;
  onPress: () => void;
}

const LiveCard: React.FC<LiveCardProps> = ({ match, onPress }) => {
  const initials = (name = '') =>
    name
      .split(' ')
      .map(s => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  const team1Flag = match.teamInfo && match.teamInfo.length >= 2 ? match.teamInfo[0].img : null;
  const team2Flag = match.teamInfo && match.teamInfo.length >= 2 ? match.teamInfo[1].img : null;

//   const formatInning = (inning: any) => {
//     if (!inning) return '';
//     const inningLabel = inning.inning || inning.title || '';
//     const r = inning.r ?? inning.runs ?? '';
//     const w = inning.w ?? inning.wkts ?? '';
//     const o = inning.o ?? inning.overs ?? '';
//     const scorePart = r !== '' && w !== '' ? `${r}/${w}` : r !== '' ? `${r}` : '';
//     const oversPart = o !== '' ? `${o}` : '';
//     return [inningLabel, scorePart, oversPart].filter(Boolean).join(' ').trim();
//   };

  const parseInning = (inning: any) => {
    if (!inning) return { label: '', runs: '', wickets: '', overs: '' };
    return {
      label: inning.inning || inning.title || '',
      runs: (inning.r ?? inning.runs ?? '') + '' ,
      wickets: (inning.w ?? inning.wkts ?? '') + '',
      overs: (inning.o ?? inning.overs ?? '') + '',
    };
  };

//   let team1Score = '';
//   let team2Score = '';
  let oversText = '';

  if (Array.isArray(match.score) && match.score.length > 0) {
    // team1Score = formatInning(match.score[0]);
    // if (match.score.length > 1) team2Score = formatInning(match.score[1]);
    const firstOvers = match.score[0]?.o ?? match.score[0]?.o ?? '';
    oversText = firstOvers ? `(${firstOvers} overs)` : '';
  }

  const inning1 = Array.isArray(match.score) && match.score.length > 0 ? parseInning(match.score[0]) : { label: '', runs: '', wickets: '', overs: '' };
  const inning2 = Array.isArray(match.score) && match.score.length > 1 ? parseInning(match.score[1]) : { label: '', runs: '', wickets: '', overs: '' };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.row}>
        {/* Left team */}
        <View style={styles.team}>
          {team1Flag ? (
            <Image source={{ uri: team1Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#ef4444' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams?.[0] || '')}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.teams?.[0]}
          </Text>
          {oversText ? <Text style={styles.scoreMeta}>{oversText}</Text> : null}
        </View>

        {/* Center block: VS, live, time, centered score */}
        <View style={styles.centerBlock}>
          <Text style={styles.vsText}>VS</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.badgeText}>LIVE</Text>
          </View>
          <Text style={styles.timeText} numberOfLines={1}>{match.dateTimeGMT}</Text>
          {match.status ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusText} numberOfLines={1}>{match.status}</Text>
            </View>
          ) : null}

          <View style={styles.detailBlock}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Inning</Text>
              <Text style={styles.detailValue}>{(inning1.label || '—')}{inning2.label ? `  •  ${inning2.label}` : ''}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Runs</Text>
              <Text style={styles.detailValue}>{(inning1.runs || '—')}{inning2.runs ? `  —  ${inning2.runs}` : ''}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Wickets</Text>
              <Text style={styles.detailValue}>{(inning1.wickets || '—')}{inning2.wickets ? `  —  ${inning2.wickets}` : ''}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Over</Text>
              <Text style={styles.detailValue}>{(inning1.overs || '—')}{inning2.overs ? `  —  ${inning2.overs}` : ''}</Text>
            </View>
          </View>
        </View>

        {/* Right team */}
        <View style={styles.team}>
          {team2Flag ? (
            <Image source={{ uri: team2Flag }} style={styles.teamAvatar} />
          ) : (
            <View style={[styles.teamAvatar, styles.teamAvatarFallback, { backgroundColor: '#06b6d4' }]}>
              <Text style={styles.teamInitial}>{initials(match.teams?.[1] || '')}</Text>
            </View>
          )}
          <Text style={styles.teamName} numberOfLines={1}>
            {match.teams?.[1]}
          </Text>
          {oversText ? <Text style={styles.scoreMeta}>{oversText}</Text> : null}
        </View>
      </View>

      <View style={styles.matchMeta}>
        <Text style={styles.matchVenue}>📍 {match.venue}</Text>
        <Text style={styles.matchDate}>📅 {match.date}</Text>
        <Text style={styles.matchDate}>📅 {match.matchType}</Text>

      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff5f5',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#fed7d7',
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
    width: '28%',
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
    marginTop: 4,
  },
  centerBlock: {
    alignItems: 'center',
    width: '44%',
    paddingHorizontal: 6,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f56565',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginVertical: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
    marginRight: 5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  matchMeta: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#fed7d7',
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
  centerScore: {
    color: '#c53030',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 8,
    textAlign: 'center',
    flexShrink: 1,
  },
  detailBlock: {
    marginTop: 8,
    width: '100%',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  detailLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  detailValue: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flexShrink: 1,
  },
  statusPill: {
    marginTop: 6,
    backgroundColor: '#fff1f2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  statusText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
  },
  largeScore: {
    color: '#c53030',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
  },
  scoreMeta: {
    color: '#718096',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
});

export default LiveCard;

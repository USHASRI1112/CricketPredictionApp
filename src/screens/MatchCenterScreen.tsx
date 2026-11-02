import React, { useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { RootStackParamList } from '../../App';
import { isLiveMatch } from '../helpers/MatchDate';
import {
  DetailNotAvailableError, fetchScorecard, fetchSquads, Innings, Scorecard, SquadTeam,
} from '../services/MatchDetails';
import { NativeAdCard } from './Add';

type MatchCenterRoute = RouteProp<RootStackParamList, 'MatchCenter'>;
export type MatchCenterTab = 'squads' | 'scorecard';

const C = {
  bg: '#03080F',
  card: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  cyan: '#00E5FF',
  gold: '#F5C542',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.5)',
  faint: 'rgba(255,255,255,0.3)',
};

const cell = (value: unknown): string => (value === undefined || value === null || value === '' ? '-' : String(value));

export default function MatchCenterScreen() {
  const { params } = useRoute<MatchCenterRoute>();
  const { match } = params;
  const [tab, setTab] = useState<MatchCenterTab>(params.tab ?? (match.matchStarted ? 'scorecard' : 'squads'));
  const live = isLiveMatch(match);

  const squads = useQuery({
    queryKey: ['squads', match.id],
    queryFn: () => fetchSquads(match.id),
    enabled: tab === 'squads',
    staleTime: 30 * 60 * 1000,
    retry: (count, error) => !(error instanceof DetailNotAvailableError) && count < 1,
  });
  const scorecard = useQuery({
    queryKey: ['scorecard', match.id],
    queryFn: () => fetchScorecard(match.id),
    enabled: tab === 'scorecard',
    staleTime: 60 * 1000,
    refetchInterval: live ? 2 * 60 * 1000 : false,
    retry: (count, error) => !(error instanceof DetailNotAvailableError) && count < 1,
  });
  const active = tab === 'squads' ? squads : scorecard;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.matchName} numberOfLines={2}>{match.name}</Text>
        <Text style={styles.status} numberOfLines={2}>{match.status}</Text>
        <View style={styles.tabs}>
          {(['squads', 'scorecard'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'squads' ? '👥 SQUADS' : '📊 SCORECARD'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={active.isRefetching} onRefresh={() => { void active.refetch(); }} tintColor={C.cyan} />
        }
      >
        {active.isLoading ? (
          <ActivityIndicator color={C.cyan} style={styles.loader} />
        ) : active.error ? (
          <>
            <Text style={styles.message}>{(active.error as Error).message}</Text>
            <NativeAdCard />
          </>
        ) : tab === 'squads' ? (
          <SquadsView teams={squads.data ?? []} />
        ) : (
          <ScorecardView scorecard={scorecard.data ?? {}} />
        )}
      </ScrollView>
    </View>
  );
}

function SquadsView({ teams }: { teams: SquadTeam[] }) {
  if (!teams.some(team => (team.players?.length ?? 0) > 0)) {
    return <Text style={styles.message}>Squads aren't announced yet.</Text>;
  }
  return (
    <>
      {teams.map((team, i) => (
        <React.Fragment key={team.teamName ?? i}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{team.teamName}</Text>
            {(team.players ?? []).map((p, j) => (
              <View key={p.id ?? j} style={styles.playerRow}>
                <Text style={styles.playerName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.playerRole} numberOfLines={1}>{p.role ?? ''}</Text>
              </View>
            ))}
          </View>
          <NativeAdCard />
        </React.Fragment>
      ))}
    </>
  );
}

function ScorecardView({ scorecard }: { scorecard: Scorecard }) {
  const innings = scorecard.scorecard ?? [];
  if (innings.length === 0) {
    return <Text style={styles.message}>Scorecard will appear once play starts.</Text>;
  }
  return (
    <>
      {innings.map((inn, i) => (
        <React.Fragment key={inn.inning ?? i}>
          <InningsCard innings={inn} total={scorecard.score?.[i]} />
          <NativeAdCard />
        </React.Fragment>
      ))}
    </>
  );
}

function InningsCard({ innings, total }: { innings: Innings; total?: { r?: number; w?: number; o?: number } }) {
  return (
    <View style={styles.card}>
      <View style={styles.inningsHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>{innings.inning}</Text>
        {total && <Text style={styles.total}>{cell(total.r)}/{cell(total.w)} ({cell(total.o)} ov)</Text>}
      </View>

      <TableHeader columns={['BATTER', 'R', 'B', '4s', '6s', 'SR']} />
      {(innings.batting ?? []).map((row, i) => (
        <View key={i} style={styles.tableRow}>
          <View style={styles.nameCol}>
            <Text style={styles.playerName} numberOfLines={1}>{row.batsman?.name}</Text>
            <Text style={styles.dismissal} numberOfLines={1}>{row['dismissal-text'] ?? ''}</Text>
          </View>
          {[row.r, row.b, row['4s'], row['6s'], row.sr].map((v, j) => (
            <Text key={j} style={[styles.numCol, j === 0 && styles.bold]}>{cell(v)}</Text>
          ))}
        </View>
      ))}

      <View style={styles.spacer} />
      <TableHeader columns={['BOWLER', 'O', 'M', 'R', 'W', 'ECO']} />
      {(innings.bowling ?? []).map((row, i) => (
        <View key={i} style={styles.tableRow}>
          <View style={styles.nameCol}>
            <Text style={styles.playerName} numberOfLines={1}>{row.bowler?.name}</Text>
          </View>
          {[row.o, row.m, row.r, row.w, row.eco].map((v, j) => (
            <Text key={j} style={[styles.numCol, j === 3 && styles.bold]}>{cell(v)}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function TableHeader({ columns }: { columns: string[] }) {
  return (
    <View style={[styles.tableRow, styles.tableHeader]}>
      <Text style={[styles.nameCol, styles.headerText]}>{columns[0]}</Text>
      {columns.slice(1).map(c => <Text key={c} style={[styles.numCol, styles.headerText]}>{c}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  matchName: { color: C.white, fontSize: 16, fontWeight: '800' },
  status: { color: C.gold, fontSize: 12, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tab: {
    flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  tabActive: { borderColor: C.cyan, backgroundColor: 'rgba(0,229,255,0.1)' },
  tabText: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  tabTextActive: { color: C.cyan },
  content: { padding: 16, paddingBottom: 40 },
  loader: { marginTop: 40 },
  message: { color: C.muted, fontSize: 14, textAlign: 'center', marginVertical: 32 },
  card: {
    backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 14,
    padding: 14, marginBottom: 4,
  },
  cardTitle: { color: C.white, fontSize: 15, fontWeight: '800', marginBottom: 8, flexShrink: 1 },
  inningsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  total: { color: C.cyan, fontSize: 15, fontWeight: '800' },
  playerRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 12,
    paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.border,
  },
  playerName: { color: C.white, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  playerRole: { color: C.muted, fontSize: 12 },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  tableHeader: { borderTopWidth: 0 },
  headerText: { color: C.faint, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  nameCol: { flex: 1, paddingRight: 6 },
  numCol: { width: 38, textAlign: 'right', color: C.muted, fontSize: 12 },
  bold: { color: C.white, fontWeight: '800' },
  dismissal: { color: C.faint, fontSize: 11, marginTop: 1 },
  spacer: { height: 12 },
});

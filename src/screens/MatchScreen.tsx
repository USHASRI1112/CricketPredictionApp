/* eslint-disable react-native/no-inline-styles */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { fetchPrediction, PredictionResponse } from '../services/Prediction';
import { fetchLiveStatuses } from '../services/LiveStatus';

type MatchScreenRouteProp = RouteProp<RootStackParamList, 'Match'>;

export default function MatchScreen() {
  const route = useRoute<MatchScreenRouteProp>();
  const { match } = route.params;
  console.log('match screen', match);

  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPrediction = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [matchUpdatedDetatils] = await fetchLiveStatuses([match]);
      let topredictMatch = match;
      if (matchUpdatedDetatils) {
        console.log('Fetched live status for prediction', matchUpdatedDetatils);
        topredictMatch = matchUpdatedDetatils;
      }
      const result = await fetchPrediction(topredictMatch);
      setPrediction(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load prediction',
      );
      Alert.alert('Error', 'Failed to load prediction. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [match]);

  useEffect(() => {
    loadPrediction();
  }, [loadPrediction]);

  const team1Flag =
    match.teamInfo && match.teamInfo.length >= 2 ? match.teamInfo[0].img : null;
  const team2Flag =
    match.teamInfo && match.teamInfo.length >= 2 ? match.teamInfo[1].img : null;

  const initials = (name: string) =>
    name
      .split(' ')
      .map(s => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {/* Match Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🏏 Match Details</Text>

          <View style={styles.teamsContainer}>
            <View style={styles.teamSection}>
              {team1Flag ? (
                <Image source={{ uri: team1Flag }} style={styles.teamFlag} />
              ) : (
                <View
                  style={[styles.teamFallback, { backgroundColor: '#3b82f6' }]}
                >
                  <Text style={styles.teamFallbackText}>
                    {initials(match.teams[0] || 'Team A')}
                  </Text>
                </View>
              )}
              <Text style={styles.teamName}>{match.teams[0] || 'Team A'}</Text>
              <Text style={styles.teamLabel}>Team 1</Text>
            </View>

            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            <View style={styles.teamSection}>
              {team2Flag ? (
                <Image source={{ uri: team2Flag }} style={styles.teamFlag} />
              ) : (
                <View
                  style={[styles.teamFallback, { backgroundColor: '#ec4899' }]}
                >
                  <Text style={styles.teamFallbackText}>
                    {initials(match.teams[1] || 'Team B')}
                  </Text>
                </View>
              )}
              <Text style={styles.teamName}>{match.teams[1] || 'Team B'}</Text>
              <Text style={styles.teamLabel}>Team 2</Text>
            </View>
          </View>

          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>📍 Venue:</Text>
              <Text style={styles.detailValue}>{match.venue}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>📅 Date:</Text>
              <Text style={styles.detailValue}>{match.date}</Text>
            </View>
            {match.matchType && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>🏏 Format:</Text>
                <Text style={styles.detailValue}>
                  {match.matchType.toUpperCase()}
                </Text>
              </View>
            )}
            {match.status && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>📊 Status:</Text>
                <Text style={styles.detailValue}>{match.status}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Prediction Card */}
        <View style={styles.predictionCard}>
          <Text style={styles.predictionTitle}>🔮 AI Prediction</Text>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.loadingText}>Analyzing match data...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={loadPrediction}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : prediction ? (
            <>
              <View style={styles.predictionContent}>
                <Text style={styles.predictionLabel}>Predicted Winner</Text>
                <Text style={styles.predictionWinner}>{prediction.winner}</Text>
              </View>

              {/* <View style={styles.predictionContent}>
                <Text style={styles.predictionLabel}>Confidence Level</Text>
                <View style={styles.confidenceContainer}>
                  <Text
                    style={[
                      styles.confidenceBadge,
                      {
                        backgroundColor: getConfidenceColor(
                          prediction.confidence,
                        ),
                      },
                    ]}
                  >
                    {prediction.confidence}
                  </Text>
                  <Text style={styles.confidencePercentage}>
                    {getConfidencePercentage(prediction.confidence)}
                  </Text>
                </View>
              </View> */}

              {prediction.reason && (
                <View style={styles.reasonContainer}>
                  <Text style={styles.reasonLabel}>📝 Analysis:</Text>
                  <Text style={styles.reasonText}>{prediction.reason}</Text>
                </View>
              )}
            </>
          ) : null}
        </View>

        {!loading && (
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={loadPrediction}
          >
            <Text style={styles.refreshButtonText}>🔄 Refresh Prediction</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7fafc',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: 20,
    textAlign: 'center',
  },
  teamsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  teamSection: {
    flex: 1,
    alignItems: 'center',
  },
  teamFlag: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
  },
  teamFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamFallbackText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  teamName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2d3748',
    textAlign: 'center',
    marginBottom: 4,
  },
  teamLabel: {
    fontSize: 12,
    color: '#718096',
  },
  vsContainer: {
    paddingHorizontal: 16,
  },
  vsText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a202c',
  },
  detailsContainer: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#718096',
  },
  detailValue: {
    fontSize: 14,
    color: '#2d3748',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  predictionCard: {
    backgroundColor: '#667eea',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  predictionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 20,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: '#ffffff',
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#667eea',
    fontWeight: '600',
    fontSize: 16,
  },
  predictionContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  predictionLabel: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  predictionWinner: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  confidenceBadge: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  confidencePercentage: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  reasonContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 16,
  },
  reasonLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  reasonText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
  },
  refreshButton: {
    backgroundColor: '#4299e1',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  refreshButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

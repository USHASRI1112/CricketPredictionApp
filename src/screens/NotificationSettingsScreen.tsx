import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
  loadNotificationPrefs,
  NotificationPrefs,
  setTopicEnabled,
  TOPIC_OPTIONS,
  TopicName,
} from '../services/NotificationPrefs';
import { ensureAndroidNotificationPermission } from '../services/PushNotifications';

const C = {
  bg: '#03080F',
  card: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  cyan: '#00E5FF',
  white: '#FFFFFF',
  muted: 'rgba(255,255,255,0.5)',
};

export default function NotificationSettingsScreen() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [permitted, setPermitted] = useState(true);

  useEffect(() => {
    loadNotificationPrefs().then(setPrefs);
    ensureAndroidNotificationPermission().then(setPermitted);
  }, []);

  const toggle = async (topic: TopicName, enabled: boolean) => {
    setPrefs(p => (p ? { ...p, [topic]: enabled } : p)); // optimistic
    setPrefs(await setTopicEnabled(topic, enabled));
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {!permitted && (
        <TouchableOpacity style={styles.warning} onPress={() => Linking.openSettings()} activeOpacity={0.8}>
          <Text style={styles.warningText}>
            Notifications are turned off for this app. Tap to open settings.
          </Text>
        </TouchableOpacity>
      )}

      {TOPIC_OPTIONS.map(({ topic, title, description }) => (
        <View key={topic} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
          <Switch
            value={prefs?.[topic] ?? false}
            disabled={!prefs}
            onValueChange={enabled => { void toggle(topic, enabled); }}
            trackColor={{ true: C.cyan, false: 'rgba(255,255,255,0.2)' }}
            thumbColor={C.white}
          />
        </View>
      ))}

      <Text style={styles.footnote}>
        Quiet hours: no alerts from 11 PM to 8 AM IST, except when India goes live.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  rowText: { flex: 1 },
  title: { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  description: { color: C.muted, fontSize: 12, lineHeight: 17 },
  warning: {
    backgroundColor: 'rgba(245,197,66,0.12)', borderColor: 'rgba(245,197,66,0.4)', borderWidth: 1,
    borderRadius: 14, padding: 14,
  },
  warningText: { color: '#F5C542', fontSize: 13, fontWeight: '600' },
  footnote: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 6, paddingHorizontal: 4 },
});

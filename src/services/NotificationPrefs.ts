import AsyncStorage from '@react-native-async-storage/async-storage';
import { subscribeToTopicHandler, TOPICS, unsubscribeFromTopicHandler } from './PushNotifications';

const PREFS_KEY = 'notification_prefs';

export type TopicName = typeof TOPICS[keyof typeof TOPICS];
export type NotificationPrefs = Record<TopicName, boolean>;

export const TOPIC_OPTIONS: { topic: TopicName; title: string; description: string }[] = [
  { topic: TOPICS.PREDICTIONS,   title: 'AI predictions',  description: 'The AI pick for India & IPL matches, about an hour before start' },
  { topic: TOPICS.INDIA_MATCHES, title: 'India matches',   description: 'Start times and when India goes live' },
  { topic: TOPICS.IPL_MATCHES,   title: 'IPL',             description: 'IPL start times, live alerts and key moments' },
  { topic: TOPICS.LIVE_MATCHES,  title: 'Other live matches', description: 'When any other match goes live' },
];

const DEFAULT_PREFS: NotificationPrefs = {
  [TOPICS.PREDICTIONS]: true,
  [TOPICS.INDIA_MATCHES]: true,
  [TOPICS.IPL_MATCHES]: true,
  [TOPICS.LIVE_MATCHES]: false, // the noisiest topic; opt-in
};

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// Subscribes/unsubscribes every topic so FCM matches the saved choices.
export async function applyNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await Promise.all(TOPIC_OPTIONS.map(({ topic }) =>
    prefs[topic] ? subscribeToTopicHandler(topic) : unsubscribeFromTopicHandler(topic)));
}

export async function setTopicEnabled(topic: TopicName, enabled: boolean): Promise<NotificationPrefs> {
  const prefs = { ...(await loadNotificationPrefs()), [topic]: enabled };
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  await (enabled ? subscribeToTopicHandler(topic) : unsubscribeFromTopicHandler(topic));
  return prefs;
}

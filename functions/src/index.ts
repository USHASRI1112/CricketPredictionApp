import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { defineSecret } from 'firebase-functions/params';

// ─── Firebase Init ────────────────────────────────────────────────────────
const envProjectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT       ||
  process.env.GCP_PROJECT          ||
  process.env.GCLOUD_PROJECT_ID;

admin.initializeApp(envProjectId ? { projectId: envProjectId } : undefined);
setGlobalOptions({ maxInstances: 10 });

// ─── Firestore collections ────────────────────────────────────────────────
const CACHE_COL         = 'cricket_cache';
const LIVE_SCORES_DOC   = 'live_scores';
const NOTIF_TRACKER_DOC = 'notif_tracker';
const RATE_LIMIT_DOC    = 'rate_limit';
const ACTIVITY_DOC      = 'user_activity';

// ─── API Config ───────────────────────────────────────────────────────────
const API_KEY  = '46e9b267-ff97-43e0-a615-2f5ce700571c';
const BASE_URL = 'https://api.cricapi.com/v1';

// ─── IPL Season (used only for fetch frequency, NOT for notifications) ────
const IPL_START = new Date('2026-03-27T00:00:00+05:30');
const IPL_END   = new Date('2026-05-25T23:59:59+05:30');

// ─── Notification config ──────────────────────────────────────────────────
const MAX_NOTIFS_PER_MATCH = 5;              // max total notifs per match ever
const NOTIF_THROTTLE_MS    = 15 * 60 * 1000; // 15 min between notification runs

// ─── Other config ─────────────────────────────────────────────────────────
const MAX_ROWS         = 50;
const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // skip if no user in last 5 min

// ─── Types ────────────────────────────────────────────────────────────────
interface Match {
  id:            string;
  name:          string;
  matchType?:    string;
  status:        string;
  venue:         string;
  date:          string;
  dateTimeGMT:   string;
  teams:         string[];
  teamInfo?:     any[];
  series_id:     string;
  series?:       string;
  score?:        any[];
  matchStarted?: boolean;
  matchEnded?:   boolean;
}

interface ApiPage {
  data?:   Match[];
  info?:   { totalRows: number; offsetRows: number };
  status?: string;
}

interface LiveScoreDoc {
  matches:       Match[];
  lastUpdatedAt: number;
  totalLive:     number;
}

interface NotifEntry {
  sentCount:  number;
  lastSentAt: number;
  types:      string[];
}

interface NotifTrackerDoc {
  [matchId: string]: NotifEntry;
}

interface RateLimitDoc {
  hitsUsed:  number;
  hitsLimit: number;
  resetAt:   number;
}

interface ActivityDoc {
  lastActiveAt: number;
}

interface PredictRequest {
  matchId:     string;
  teamA:       string;
  teamB:       string;
  date?:       string;
  tournament?: string;
  matchType?:  string;
  venue?:      string;
  status?:     string;
  matchEnded?: boolean;
  scoreText?:  string;
}

interface PredictionResponse {
  winner:     string;
  confidence: string;
  reason:     string;
}

// ─── Match detection helpers ──────────────────────────────────────────────
const INDIA_VENUES = [
  'mumbai','delhi','chennai','kolkata','bangalore','bengaluru',
  'hyderabad','ahmedabad','pune','jaipur','lucknow','mohali',
  'chandigarh','nagpur','visakhapatnam','vizag','dharamsala',
  'ranchi','guwahati','cuttack','raipur','india',
];

function isIndiaMatch(m: Match): boolean {
  const t = (m.teams || []).join(' ').toLowerCase();
  return t.includes('india') || t.includes(' ind ') ||
    t.startsWith('ind ') || t.endsWith(' ind') || t === 'ind';
}

function isIPLMatch(m: Match): boolean {
  const s = (m.series_id || m.series || m.name || '').toLowerCase();
  return s.includes('ipl') || s.includes('indian premier');
}

function isMatchInIndia(m: Match): boolean {
  const v = (m.venue || '').toLowerCase();
  return INDIA_VENUES.some(x => v.includes(x));
}

function isLive(m: Match): boolean {
  const s = (m.status || '').toLowerCase();
  return !m.matchEnded && (
    s.includes('live') || s.includes('progress') || !!m.matchStarted
  );
}

function minutesUntilStart(m: Match): number | null {
  if (!m.dateTimeGMT) { return null; }
  return Math.floor((new Date(m.dateTimeGMT).getTime() - Date.now()) / 60000);
}

function getTeamLabel(m: Match): string {
  return `${m.teams?.[0] || 'Team A'} vs ${m.teams?.[1] || 'Team B'}`;
}

function getFormat(m: Match): string {
  const t = (m.matchType || '').toLowerCase();
  if (t.includes('t20'))  { return 'T20';  }
  if (t.includes('odi'))  { return 'ODI';  }
  if (t.includes('test')) { return 'Test'; }
  return m.matchType?.toUpperCase() || '';
}

// ─── IPL season / match hours (only for fetch frequency) ─────────────────
function isIPLSeason(): boolean {
  return new Date() >= IPL_START && new Date() <= IPL_END;
}

function isIPLMatchHours(): boolean {
  const now   = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist   = new Date(utcMs + 5.5 * 60 * 60 * 1000);
  const h     = ist.getHours();
  const min   = ist.getMinutes();
  const isSun = ist.getDay() === 0;

  // Convert current time to minutes for easier comparison
  const totalMins = h * 60 + min;

  // Sunday  → 3:30 PM (15:30) to 11:30 PM (23:30)
  // Weekday → 7:30 PM (19:30) to 11:30 PM (23:30)
  return isSun
    ? (totalMins >= 15 * 60 + 30 && totalMins < 23 * 60 + 30)
    : (totalMins >= 19 * 60 + 30 && totalMins < 23 * 60 + 30);
}


function getNextMidnightUTC(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

// ─── Activity check ───────────────────────────────────────────────────────
async function wasRecentlyActive(): Promise<boolean> {
  try {
    const snap = await admin.firestore()
      .collection(CACHE_COL).doc(ACTIVITY_DOC).get();
    if (!snap.exists) {
      logger.info('[Activity] No activity recorded yet — skipping');
      return false;
    }
    const data          = snap.data() as ActivityDoc;
    const msSinceActive = Date.now() - data.lastActiveAt;
    const isActive      = msSinceActive < ACTIVE_WINDOW_MS;
    logger.info(
      `[Activity] Last active: ${Math.round(msSinceActive / 1000)}s ago` +
      ` → ${isActive ? 'ACTIVE ✅' : 'INACTIVE ⏭ skipping'}`
    );
    return isActive;
  } catch {
    return false;
  }
}

// ─── Rate limit helpers ───────────────────────────────────────────────────
async function getRateLimit(): Promise<RateLimitDoc> {
  try {
    const snap = await admin.firestore()
      .collection(CACHE_COL).doc(RATE_LIMIT_DOC).get();
    if (!snap.exists) {
      const defaults: RateLimitDoc = {
        hitsUsed: 0, hitsLimit: 100, resetAt: getNextMidnightUTC(),
      };
      await admin.firestore()
        .collection(CACHE_COL).doc(RATE_LIMIT_DOC).set(defaults);
      return defaults;
    }
    const data = snap.data() as RateLimitDoc;
    if (Date.now() > data.resetAt) {
      const reset: RateLimitDoc = {
        hitsUsed: 0, hitsLimit: data.hitsLimit, resetAt: getNextMidnightUTC(),
      };
      await admin.firestore()
        .collection(CACHE_COL).doc(RATE_LIMIT_DOC).set(reset);
      logger.info('[RateLimit] Daily reset ✅');
      return reset;
    }
    return data;
  } catch {
    return { hitsUsed: 0, hitsLimit: 100, resetAt: getNextMidnightUTC() };
  }
}

async function incrementRateLimit(hits: number = 1): Promise<void> {
  try {
    await admin.firestore()
      .collection(CACHE_COL).doc(RATE_LIMIT_DOC)
      .update({ hitsUsed: admin.firestore.FieldValue.increment(hits) });
  } catch (e) {
    logger.warn('[RateLimit] Increment failed', e);
  }
}

// ─── Sliding window fetch ─────────────────────────────────────────────────
async function fetchPage(
  offset: number,
): Promise<{ matches: Match[]; totalRows: number }> {
  try {
    const url  = `${BASE_URL}/currentMatches?apikey=${API_KEY}&offset=${offset}`;
    const res  = await axios.get(url);
    const json = res.data as ApiPage;
    const matches   = json.data            || [];
    const totalRows = json.info?.totalRows || matches.length;
    logger.info(`[API] offset=${offset} → ${matches.length} matches (totalRows: ${totalRows})`);
    return { matches, totalRows };
  } catch (e: any) {
    logger.warn(`[API] offset=${offset} failed:`, e.message);
    return { matches: [], totalRows: 0 };
  }
}

async function fetchCurrentMatches(): Promise<Match[]> {
  try {
    const { matches: page0, totalRows } = await fetchPage(0);
    if (page0.length === 0) { return []; }

    const target    = Math.min(totalRows, MAX_ROWS);
    const remaining = Math.max(0, target - page0.length);

    if (remaining === 0) {
      logger.info(`[API] Single page sufficient (${page0.length} matches)`);
      return page0;
    }

    const offsets: number[] = [];
    for (let o = page0.length; o < target; o += 25) {
      offsets.push(o);
    }
    logger.info(`[API] Fetching ${offsets.length} more page(s): [${offsets.join(', ')}]`);

    const remainingPages = await Promise.all(
      offsets.map(o => fetchPage(o).then(r => r.matches))
    );

    const all    = [...page0, ...remainingPages.flat()];
    const unique = Array.from(new Map(all.map(m => [m.id, m])).values());
    logger.info(`[API] Total unique: ${unique.length}`);
    return unique;

  } catch (e: any) {
    logger.error('[API] fetchCurrentMatches failed:', e.message);
    return [];
  }
}

// ─── Save live scores to Firestore ────────────────────────────────────────
async function saveLiveScores(matches: Match[]): Promise<void> {
  const live = matches.filter(isLive);
  await admin.firestore()
    .collection(CACHE_COL).doc(LIVE_SCORES_DOC)
    .set({
      matches:       live,
      lastUpdatedAt: Date.now(),
      totalLive:     live.length,
    } as LiveScoreDoc);
  logger.info(`[Firestore] Saved ${live.length} live matches`);
}

// ─── Notification tracker ─────────────────────────────────────────────────
async function getNotifTracker(): Promise<NotifTrackerDoc> {
  try {
    const snap = await admin.firestore()
      .collection(CACHE_COL).doc(NOTIF_TRACKER_DOC).get();
    return snap.exists ? (snap.data() as NotifTrackerDoc) : {};
  } catch {
    return {};
  }
}

function canSendNotif(
  matchId: string, type: string, tracker: NotifTrackerDoc,
): boolean {
  const entry = tracker[matchId];
  if (!entry)                                  { return true;  }
  if (entry.sentCount >= MAX_NOTIFS_PER_MATCH) { return false; }
  if (entry.types.includes(type))              { return false; }
  return true;
}

async function recordNotifSent(
  matchId: string, type: string, tracker: NotifTrackerDoc,
): Promise<void> {
  const existing = tracker[matchId] || { sentCount: 0, lastSentAt: 0, types: [] };
  const updated: NotifEntry = {
    sentCount:  existing.sentCount + 1,
    lastSentAt: Date.now(),
    types:      [...existing.types, type],
  };
  await admin.firestore()
    .collection(CACHE_COL).doc(NOTIF_TRACKER_DOC)
    .set({ [matchId]: updated }, { merge: true });
  tracker[matchId] = updated;
}

// ─── Send FCM ─────────────────────────────────────────────────────────────
async function sendFCM(
  topic: string, title: string, body: string,
  matchId: string, type: string,
): Promise<void> {
  const color =
    topic === 'india_matches' ? '#00E5FF' :
    topic === 'ipl_matches'   ? '#FF8C00' :
    topic === 'live_matches'  ? '#00E096' : '#F5C542';

  await admin.messaging().send({
    topic,
    notification: { title, body },
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'cricket_alerts', color },
    },
    data: { screen: 'Match', matchId, type },
  });
  logger.info(`[FCM] ✅ [${topic}] "${title}"`);
}

// ─── Push notifications ────────────────────────────────────────────────────
// ✅ Runs EVERY DAY — not restricted to IPL season
// ✅ 15 min throttle — max one notification run per 15 min
// ✅ Max 5 notifications per match total
// ✅ No duplicate types per match
async function checkAndNotify(matches: Match[]): Promise<void> {

  // ── 15 min throttle ───────────────────────────────────────────────────
  // Prevents spam — even though cricketMaster runs every 2 min,
  // we only actually check + send notifications every 15 min
  const tracker          = await getNotifTracker();
  const lastNotifRun     = (tracker as any)._lastNotifRunAt as number || 0;
  const msSinceLastNotif = Date.now() - lastNotifRun;

  if (msSinceLastNotif < NOTIF_THROTTLE_MS) {
    logger.info(
      `[Notif] Throttled — last run ${Math.round(msSinceLastNotif / 60000)}min ago` +
      ` (next in ${Math.round((NOTIF_THROTTLE_MS - msSinceLastNotif) / 60000)}min)`
    );
    return;
  }

  // Record this run timestamp first
  await admin.firestore()
    .collection(CACHE_COL).doc(NOTIF_TRACKER_DOC)
    .set({ _lastNotifRunAt: Date.now() }, { merge: true });

  logger.info('[Notif] Running notification check ✅');

  for (const m of matches) {
    const label = getTeamLabel(m);
    const fmt   = getFormat(m);
    const tag   = fmt ? `${label} · ${fmt}` : label;
    const mins  = minutesUntilStart(m);

    // ── IPL LIVE ───────────────────────────────────────────────────────
    if (isIPLMatch(m) && isLive(m) && canSendNotif(m.id, 'live_ipl', tracker)) {
      await sendFCM('ipl_matches', '🏏 IPL is LIVE!', `${tag} has started!`, m.id, 'live_ipl');
      await recordNotifSent(m.id, 'live_ipl', tracker);
    }

    // ── India LIVE ─────────────────────────────────────────────────────
    if (isIndiaMatch(m) && isLive(m) && canSendNotif(m.id, 'live_india', tracker)) {
      await sendFCM('india_matches', '🇮🇳 India Match is LIVE!', `${tag} — AI prediction ready!`, m.id, 'live_india');
      await recordNotifSent(m.id, 'live_india', tracker);
    }

    // ── Any match LIVE ─────────────────────────────────────────────────
    if (isLive(m) && !isIPLMatch(m) && !isIndiaMatch(m) && canSendNotif(m.id, 'live_any', tracker)) {
      await sendFCM('live_matches', '🟢 Match is LIVE', `${tag} has started!`, m.id, 'live_any');
      await recordNotifSent(m.id, 'live_any', tracker);
    }

    // ── IPL starting ≤ 30 min ──────────────────────────────────────────
    if (isIPLMatch(m) && mins !== null && mins > 0 && mins <= 30
        && canSendNotif(m.id, 'soon_ipl', tracker)) {
      await sendFCM('ipl_matches', `🏏 IPL in ${mins} min!`, `${tag} — check prediction!`, m.id, 'soon_ipl');
      await recordNotifSent(m.id, 'soon_ipl', tracker);
    }

    // ── India starting ≤ 30 min ────────────────────────────────────────
    if (isIndiaMatch(m) && mins !== null && mins > 0 && mins <= 30
        && canSendNotif(m.id, 'soon_india', tracker)) {
      await sendFCM('india_matches', `🇮🇳 India in ${mins} min!`, `${tag} — get ready!`, m.id, 'soon_india');
      await recordNotifSent(m.id, 'soon_india', tracker);
    }

    // ── International in India ≤ 30 min ────────────────────────────────
    if (isMatchInIndia(m) && !isIndiaMatch(m) && !isIPLMatch(m)
        && mins !== null && mins > 0 && mins <= 30
        && canSendNotif(m.id, 'soon_india_venue', tracker)) {
      await sendFCM('india_matches', `📍 Match in India in ${mins} min!`, `${tag} at ${m.venue}`, m.id, 'soon_india_venue');
      await recordNotifSent(m.id, 'soon_india_venue', tracker);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  cricketMaster — SINGLE MERGED SCHEDULER
//
//  Runs every 2 minutes. Guards in order:
//  ① Activity guard   — no user in last 5 min?  → skip (zero API hit)
//  ② Rate limit guard — near cricapi daily limit? → skip
//  ③ Time threshold   — data still fresh?         → skip fetch
//  ④ Fetch            — sliding window, up to 50 matches
//  ⑤ Save             — live scores to Firestore
//  ⑥ Notify           — EVERY DAY, 15 min throttle, max 5/match
// ────────────────────────────────────────────────────────────────────────────
export const cricketMaster = onSchedule(
  {
    schedule:       'every 2 minutes',
    region:         'us-central1',
    timeoutSeconds: 120,
    memory:         '256MiB',
  },
  async (): Promise<void> => {
    logger.info('[Master] ▶ Starting');

    try {
      // ① Activity guard
      const active = await wasRecentlyActive();
      if (!active) {
        logger.info('[Master] ⏭ No recent activity — skipping');
        return;
      }

      // ② Rate limit guard
      const rateLimit = await getRateLimit();
      if (rateLimit.hitsUsed >= rateLimit.hitsLimit - 5) {
        logger.warn(`[Master] ⚠ Rate limit near (${rateLimit.hitsUsed}/${rateLimit.hitsLimit}) — skipping`);
        return;
      }

      // ③ Time threshold guard
      // IPL match hours → fetch every 2 min
      // All other times → fetch every 15 min
      const snap          = await admin.firestore()
        .collection(CACHE_COL).doc(LIVE_SCORES_DOC).get();
      const lastUpdatedAt = snap.exists
        ? (snap.data() as LiveScoreDoc).lastUpdatedAt : 0;
      const msSinceLast   = Date.now() - lastUpdatedAt;
      const isActiveTime  = isIPLSeason() && isIPLMatchHours();
      const thresholdMs   = isActiveTime ? 2 * 60 * 1000 : 15 * 60 * 1000;

      if (msSinceLast < thresholdMs) {
        logger.info(`[Master] ⏭ Data fresh (${Math.round(msSinceLast / 1000)}s) — skipping fetch`);
        // Still run notifications even if fetch skipped
        // (matches already in Firestore may have live ones to notify about)
        const existingMatches = snap.exists
          ? (snap.data() as LiveScoreDoc).matches : [];
        if (existingMatches.length > 0) {
          await checkAndNotify(existingMatches);
        }
        return;
      }

      logger.info(
        `[Master] Fetching — IPL active: ${isActiveTime},` +
        ` last fetch: ${Math.round(msSinceLast / 60000)}min ago,` +
        ` hits: ${rateLimit.hitsUsed}/${rateLimit.hitsLimit}`
      );

      // ④ Fetch
      const matches = await fetchCurrentMatches();
      if (matches.length === 0) {
        logger.warn('[Master] No matches returned');
        return;
      }

      const extraPages = Math.max(0, Math.ceil(Math.min(matches.length, MAX_ROWS) / 25) - 1);
      await incrementRateLimit(1 + extraPages);

      // ⑤ Save live scores
      await saveLiveScores(matches);

      // ⑥ Notifications — every day, 15 min throttle, max 5/match
      await checkAndNotify(matches);

      logger.info(
        `[Master] ✅ Done — live: ${matches.filter(isLive).length}/${matches.length}`
      );

    } catch (error) {
      logger.error('[Master] ❌ Failed:', error);
      throw error;
    }
  },
);

// ────────────────────────────────────────────────────────────────────────────
//  predictMatch — unchanged
// ────────────────────────────────────────────────────────────────────────────
const config = defineSecret('FUNCTIONS_CONFIG_EXPORT');

export const predictMatch = onCall(
  { secrets: [config] },
  async (request): Promise<PredictionResponse> => {
    try {
      const body: any = request.data as PredictRequest;
      logger.info('Received prediction request', body);

      const {
        matchId, teamA, teamB, date, tournament,
        matchType, venue, status, matchEnded, scoreText,
      } = body;

      const predictionDate = date || new Date().toISOString().slice(0, 10);
      const groqKey        = JSON.parse(config.value()).groq.key;

      const prompt = `
You are a highly experienced international cricket analyst with deep knowledge of:
- team compositions, batting depth, bowling strength
- pitch behaviour, match situations, tournament pressure, historical performance

Your analysis should sound like a professional cricket expert, not a generic AI.

Match Details:
Match ID: ${matchId} | Date: ${predictionDate}
Teams: ${teamA} vs ${teamB} | Tournament: ${tournament}
Format: ${matchType} | Venue: ${venue}
Pitch: Estimate pitch conditions based on venue knowledge.
Match Status: ${status} | Match Ended: ${matchEnded}
Current Score: ${scoreText}

Instructions:
1. If Match Ended = true:
   - status contains "won" → return actual winner, confidence = "Actual"
   - "No result" / "abandoned" → winner = "No Result", confidence = "Actual"
2. If LIVE → predict using current match situation
3. If UPCOMING → predict using team balance and venue
4. ONE winner only.
5. Cannot predict strongly → confidence = "Low"
6. Reason MUST sound like a broadcast analyst. Specific cricket factors only.

Return ONLY JSON (no markdown, no backticks):
{"winner":"Team Name or No Result","confidence":"Low|Medium|High|Actual","reason":"Expert cricket analysis"}`;

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model:       'llama-3.3-70b-versatile',
          messages:    [
            { role: 'system', content: 'You are a cricket prediction AI.' },
            { role: 'user',   content: prompt },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization:  `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data.choices[0].message.content;
      const parsed: PredictionResponse = JSON.parse(content);
      logger.info('Prediction done', parsed);
      return parsed;

    } catch (error) {
      logger.error('Prediction failed', error);
      throw new Error('Prediction failed');
    }
  },
);

logger.info('Cricket Functions ready ✅', { structuredData: true });
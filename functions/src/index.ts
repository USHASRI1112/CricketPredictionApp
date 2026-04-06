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
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GCLOUD_PROJECT_ID;

admin.initializeApp(envProjectId ? { projectId: envProjectId } : undefined);
setGlobalOptions({ maxInstances: 10 });

// ─── Firestore collections ────────────────────────────────────────────────
const CACHE_COL = 'cricket_cache';
const LIVE_SCORES_DOC = 'live_scores';
const NOTIF_TRACKER_DOC = 'notif_tracker';
const RATE_LIMIT_DOC = 'rate_limit';
const ACTIVITY_DOC = 'user_activity';

// ─── API Config ───────────────────────────────────────────────────────────
const API_KEY = '5de3a03b-2e22-442c-85cc-d03e80e45715';
const BASE_URL = 'https://api.cricapi.com/v1';

// ─── IPL Season (used only for fetch frequency, NOT for notifications) ────
const IPL_START = new Date('2026-03-27T00:00:00+05:30');
const IPL_END = new Date('2026-05-25T23:59:59+05:30');

// ─── Premium window ───────────────────────────────────────────────────────
const PREMIUM_START = new Date('2026-04-05T00:00:00+05:30');
const PREMIUM_END = new Date('2026-05-05T23:59:59+05:30');

// ─── Notification config ──────────────────────────────────────────────────
const MAX_NOTIFS_PER_MATCH = 5;              // max total notifs per match ever


const DEFAULT_NOTIF_THROTTLE_MS = 15 * 60 * 1000; // non-IPL
const IPL_NOTIF_THROTTLE_MS = 7 * 60 * 1000; // IPL matches

// ─── Other config ─────────────────────────────────────────────────────────
const MAX_ROWS = 100;
const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // skip if no user in last 5 min

// ─── Types ────────────────────────────────────────────────────────────────
interface InningScore {
  inning?: string;
  title?: string;
  r?: number | string;
  runs?: number | string;
  w?: number | string;
  wkts?: number | string;
  o?: number | string;
  overs?: number | string;
}

interface Match {
  id: string;
  name: string;
  matchType?: string;
  status: string;
  venue: string;
  date: string;
  dateTimeGMT: string;
  teams: string[];
  teamInfo?: any[];
  series_id: string;
  series?: string;
  score?: InningScore[];
  matchStarted?: boolean;
  matchEnded?: boolean;
}

interface ApiPage {
  data?: Match[];
  info?: { totalRows: number; offsetRows: number };
  status?: string;
}

interface LiveScoreDoc {
  matches: Match[];
  lastUpdatedAt: number;
  totalLive: number;
}

interface NotifEntry {
  sentCount: number;
  lastSentAt: number;
  types: string[];
}

interface NotifTrackerDoc {
  [matchId: string]: NotifEntry;
}

interface RateLimitDoc {
  hitsUsed: number;
  hitsLimit: number;
  resetAt: number;
}

interface ActivityDoc {
  lastActiveAt: number;
}

interface PredictRequest {
  matchId: string;
  teamA: string;
  teamB: string;
  date?: string;
  tournament?: string;
  matchType?: string;
  venue?: string;
  status?: string;
  matchEnded?: boolean;
  scoreText?: string;
}

interface PredictionResponse {
  winner: string;
  confidence: string;
  reason: string;
}


interface NotifEntry {
  sentCount: number;
  lastSentAt: number;
  types: string[];

  // NEW
  wicketCount?: number;
  overCount?: number;
  milestoneCount?: number;
  lastScore?: string;
}

// ─── PREMIUM MODE ────────────────────────────────────────────────────────

function isPremiumMode(): boolean {
  return isPremiumPeriod();
}


// ─── Match detection helpers ──────────────────────────────────────────────
const INDIA_VENUES = [
  'mumbai', 'delhi', 'chennai', 'kolkata', 'bangalore', 'bengaluru',
  'hyderabad', 'ahmedabad', 'pune', 'jaipur', 'lucknow', 'mohali',
  'chandigarh', 'nagpur', 'visakhapatnam', 'vizag', 'dharamsala',
  'ranchi', 'guwahati', 'cuttack', 'raipur', 'india',
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
  if (t.includes('t20')) { return 'T20'; }
  if (t.includes('odi')) { return 'ODI'; }
  if (t.includes('test')) { return 'Test'; }
  return m.matchType?.toUpperCase() || '';
}

// ─── IPL season / match hours (only for fetch frequency) ─────────────────
function isIPLSeason(): boolean {
  return new Date() >= IPL_START && new Date() <= IPL_END;
}

function isPremiumPeriod(): boolean {
  return new Date() >= PREMIUM_START && new Date() <= PREMIUM_END;
}

function isIPLMatchHours(): boolean {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utcMs + 5.5 * 60 * 60 * 1000);
  const h = ist.getHours();
  const min = ist.getMinutes();
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
    const data = snap.data() as ActivityDoc;
    const msSinceActive = Date.now() - data.lastActiveAt;
    const isActive = msSinceActive < ACTIVE_WINDOW_MS;
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
    const isPremium = isPremiumPeriod();
    const defaultLimit = isPremium ? 100000 : 100;
    if (!snap.exists) {
      const defaults: RateLimitDoc = {
        hitsUsed: 0, hitsLimit: defaultLimit, resetAt: getNextMidnightUTC(),
      };
      await admin.firestore()
        .collection(CACHE_COL).doc(RATE_LIMIT_DOC).set(defaults);
      return defaults;
    }
    const data = snap.data() as RateLimitDoc;
    if (Date.now() > data.resetAt) {
      const reset: RateLimitDoc = {
        hitsUsed: 0, hitsLimit: defaultLimit, resetAt: getNextMidnightUTC(),
      };
      await admin.firestore()
        .collection(CACHE_COL).doc(RATE_LIMIT_DOC).set(reset);
      logger.info('[RateLimit] Daily reset ✅');
      return reset;
    }
    return data;
  } catch {
    return { hitsUsed: 0, hitsLimit: isPremiumPeriod() ? 100000 : 100, resetAt: getNextMidnightUTC() };
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
    const url = `${BASE_URL}/currentMatches?apikey=${API_KEY}&offset=${offset}`;
    const res = await axios.get(url);
    const json = res.data as ApiPage;
    const matches = json.data || [];
    const totalRows = json.info?.totalRows || matches.length;
    logger.info(`[API] offset=${offset} → ${matches.length} matches (totalRows: ${totalRows})`);
    return { matches, totalRows };
  } catch (e: any) {
    logger.warn(`[API] offset=${offset} failed:`, e.message);
    return { matches: [], totalRows: 0 };
  }
}

async function fetchCurrentMatches(): Promise<Match[]> {
  logger.info('[API] Starting fetchCurrentMatches');
  try {
    const { matches: page0, totalRows } = await fetchPage(0);
    if (page0.length === 0) {
      logger.warn('[API] No matches from first page');
      return [];
    }

    const target = Math.min(totalRows, MAX_ROWS);
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

    const all = [...page0, ...remainingPages.flat()];
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
  logger.info(`[Firestore] Saving ${live.length} live matches`);
  live.forEach(match => {
    logger.info('[Firestore] Live match payload', {
      id: match.id,
      name: match.name,
      status: match.status,
      date: match.date,
      dateTimeGMT: match.dateTimeGMT,
      score: match.score ?? [],
    });
  });
  await admin.firestore()
    .collection(CACHE_COL).doc(LIVE_SCORES_DOC)
    .set({
      matches: live,
      lastUpdatedAt: Date.now(),
      totalLive: live.length,
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
  if (!entry) { return true; }
  if (entry.sentCount >= MAX_NOTIFS_PER_MATCH) { return false; }
  if (entry.types.includes(type)) { return false; }
  return true;
}

async function recordNotifSent(
  matchId: string, type: string, tracker: NotifTrackerDoc,
): Promise<void> {
  const existing = tracker[matchId] || { sentCount: 0, lastSentAt: 0, types: [], wicketCount: 0, overCount: 0, milestoneCount: 0, lastScore: '' };
  const updated: NotifEntry = {
    sentCount: existing.sentCount + 1,
    lastSentAt: Date.now(),
    types: [...existing.types, type],
    wicketCount: existing.wicketCount || 0,
    overCount: existing.overCount || 0,
    milestoneCount: existing.milestoneCount || 0,
    lastScore: existing.lastScore || '',
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
      topic === 'ipl_matches' ? '#FF8C00' :
        topic === 'live_matches' ? '#00E096' : '#F5C542';

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

  const tracker = await getNotifTracker();

  // Detect if ANY IPL match is live
  const hasLiveIPLMatch = matches.some(m => isIPLMatch(m) && isLive(m));

  // Choose throttle dynamically
  const throttleMs = hasLiveIPLMatch
    ? IPL_NOTIF_THROTTLE_MS
    : DEFAULT_NOTIF_THROTTLE_MS;

  const lastNotifRun = (tracker as any)._lastNotifRunAt as number || 0;
  const msSinceLastNotif = Date.now() - lastNotifRun;

  if (msSinceLastNotif < throttleMs) {
    logger.info(`[Notif] Throttled (${Math.round(msSinceLastNotif / 1000)}s < ${throttleMs / 1000}s)`);
    return;
  }

  await admin.firestore()
    .collection(CACHE_COL).doc(NOTIF_TRACKER_DOC)
    .set({ _lastNotifRunAt: Date.now() }, { merge: true });

  const parseNumber = (value: unknown): number => {
    if (value === null || value === undefined || value === '') {
      return NaN;
    }
    if (typeof value === 'number') {
      return value;
    }
    const normalized = String(value).replace(/[^\d./]/g, '');
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  const parseScoreText = (text: string | undefined) => {
    if (!text) return null;
    const match = text.match(/^(\d+)\s*\/\s*(\d+)\s*\(\s*([0-9]+(?:\.[0-9]+)?)\s*ov\s*\)/i);
    if (!match) return null;
    return {
      runs: parseInt(match[1], 10),
      wickets: parseInt(match[2], 10),
      overs: parseFloat(match[3]),
    };
  };

  const shouldSendScoreUpdate = (prev?: string, curr?: string) => {
    const a = parseScoreText(prev);
    const b = parseScoreText(curr);
    if (!a || !b) return { send: false };

    if (b.wickets > a.wickets) return { send: true, type: 'wicket' };
    if (Math.floor(b.overs) % 5 === 0 && Math.floor(b.overs) !== Math.floor(a.overs)) {
      return { send: true, type: 'over' };
    }
    if (Math.floor(b.runs / 50) > Math.floor(a.runs / 50)) {
      return { send: true, type: 'milestone' };
    }

    return { send: false };
  };

  const getLatestInningScore = (m: Match): InningScore | null => {
    if (!m.score || m.score.length === 0) return null;

    const candidates = m.score.map((inning, index) => {
      const runs = parseNumber(inning.r ?? inning.runs);
      const wickets = parseNumber(inning.w ?? inning.wkts);
      const overs = parseNumber(inning.o ?? inning.overs);
      const hasNumbers = !Number.isNaN(runs) || !Number.isNaN(wickets) || !Number.isNaN(overs);

      return { inning, index, runs, wickets, overs, hasNumbers };
    }).filter(candidate => candidate.hasNumbers);

    if (candidates.length === 0) {
      return m.score[m.score.length - 1] ?? null;
    }

    candidates.sort((a, b) => {
      const oversA = Number.isNaN(a.overs) ? -1 : a.overs;
      const oversB = Number.isNaN(b.overs) ? -1 : b.overs;
      if (oversA !== oversB) {
        return oversB - oversA;
      }

      const runsA = Number.isNaN(a.runs) ? -1 : a.runs;
      const runsB = Number.isNaN(b.runs) ? -1 : b.runs;
      if (runsA !== runsB) {
        return runsB - runsA;
      }

      return b.index - a.index;
    });

    return candidates[0]?.inning ?? null;
  };

  const getScoreText = (m: Match): string => {
    const s = getLatestInningScore(m);
    if (!s) return '';
    const runs = parseNumber(s.r ?? s.runs);
    const wickets = parseNumber(s.w ?? s.wkts);
    const overs = parseNumber(s.o ?? s.overs);

    if (Number.isNaN(runs) || Number.isNaN(wickets) || Number.isNaN(overs)) {
      return '';
    }

    return `${Math.round(runs)}/${Math.round(wickets)} (${overs.toFixed(1)} ov)`;
  };

  for (const m of matches) {

    const isPremium = isPremiumMode();

    // 🔥 dynamic limits
    const maxPerMatch = isPremium
      ? (isIPLMatch(m) ? 10 : 7)
      : MAX_NOTIFS_PER_MATCH;

    const entry: NotifEntry = tracker[m.id] || {
      sentCount: 0,
      types: [],
      wicketCount: 0,
      overCount: 0,
      milestoneCount: 0,
      lastScore: '',
    };

    // Ensure optional fields are always defined
    entry.wicketCount = entry.wicketCount ?? 0;
    entry.overCount = entry.overCount ?? 0;
    entry.milestoneCount = entry.milestoneCount ?? 0;
    entry.lastScore = entry.lastScore ?? '';

    if (entry.sentCount >= maxPerMatch) continue;

    const label = getTeamLabel(m);
    const fmt = getFormat(m);
    const tag = fmt ? `${label} · ${fmt}` : label;
    const mins = minutesUntilStart(m);
    const scoreText = getScoreText(m);

    if (isLive(m)) {
      logger.info('[Notif] Processing live match', {
        matchId: m.id,
        name: m.name,
        status: m.status,
        previousScoreText: entry.lastScore,
        scoreText,
      });
    }

    // ───────── PREMIUM MODE LOGIC ─────────
    if (isPremium) {

      // BEFORE MATCH
      if (mins !== null && mins > 0) {

        if (mins <= 60 && mins > 30 && !entry.types.includes('soon_60')) {
          await sendFCM('ipl_matches', '⏰ Match in 1 hour', tag, m.id, 'soon_60');
          entry.types.push('soon_60'); entry.sentCount++;
        }

        if (mins <= 30 && mins > 10 && !entry.types.includes('soon_30')) {
          await sendFCM('ipl_matches', '⏰ Match in 30 min', tag, m.id, 'soon_30');
          entry.types.push('soon_30'); entry.sentCount++;
        }

        if (mins <= 10 && mins > 0 && !entry.types.includes('soon_10')) {
          await sendFCM('ipl_matches', '⏰ Starting soon', tag, m.id, 'soon_10');
          entry.types.push('soon_10'); entry.sentCount++;
        }
      }

      // LIVE
      if (isLive(m) && !entry.types.includes('live')) {
        await sendFCM('ipl_matches', '🟢 Match LIVE', `${tag} has started`, m.id, 'live');
        entry.types.push('live'); entry.sentCount++;
      }

      // SCORE UPDATES
      if (isLive(m) && entry.sentCount < maxPerMatch) {

        const decision = shouldSendScoreUpdate(entry.lastScore, scoreText);
        logger.info('[Notif] Live score evaluation', {
          matchId: m.id,
          name: m.name,
          status: m.status,
          previousScoreText: entry.lastScore,
          scoreText,
          decision,
        });

        if (decision.send) {

          if (decision.type === 'wicket' && entry.wicketCount < 2) {
            await sendFCM('ipl_matches', '🚨 WICKET!', `${tag} — ${scoreText}`, m.id, 'wicket');
            entry.wicketCount++; entry.sentCount++;
          }

          if (decision.type === 'over' && entry.overCount < 2) {
            await sendFCM('ipl_matches', '📊 Over Update', `${tag} — ${scoreText}`, m.id, 'over');
            entry.overCount++; entry.sentCount++;
          }

          if (decision.type === 'milestone' && entry.milestoneCount < 2) {
            await sendFCM('ipl_matches', '🔥 Milestone', `${tag} — ${scoreText}`, m.id, 'milestone');
            entry.milestoneCount++; entry.sentCount++;
          }
        }

        entry.lastScore = scoreText;
      }

      // SAVE
      await admin.firestore()
        .collection(CACHE_COL).doc(NOTIF_TRACKER_DOC)
        .set({ [m.id]: entry }, { merge: true });

      continue; // skip old logic
    }

    // ───────── OLD LOGIC (UNCHANGED AFTER MAY 5) ─────────

    if (isIPLMatch(m) && isLive(m) && canSendNotif(m.id, 'live_ipl', tracker)) {
      await sendFCM('ipl_matches', '🏏 IPL is LIVE!', `${tag} has started!`, m.id, 'live_ipl');
      await recordNotifSent(m.id, 'live_ipl', tracker);
    }

    if (isIndiaMatch(m) && isLive(m) && canSendNotif(m.id, 'live_india', tracker)) {
      await sendFCM('india_matches', '🇮🇳 India Match is LIVE!', `${tag}`, m.id, 'live_india');
      await recordNotifSent(m.id, 'live_india', tracker);
    }

    if (isLive(m) && !isIPLMatch(m) && !isIndiaMatch(m) && canSendNotif(m.id, 'live_any', tracker)) {
      await sendFCM('live_matches', '🟢 Match is LIVE', `${tag}`, m.id, 'live_any');
      await recordNotifSent(m.id, 'live_any', tracker);
    }

    if (isIPLMatch(m) && mins !== null && mins > 0 && mins <= 30
      && canSendNotif(m.id, 'soon_ipl', tracker)) {
      await sendFCM('ipl_matches', `🏏 IPL in ${mins} min!`, `${tag}`, m.id, 'soon_ipl');
      await recordNotifSent(m.id, 'soon_ipl', tracker);
    }

    if (isIndiaMatch(m) && mins !== null && mins > 0 && mins <= 30
      && canSendNotif(m.id, 'soon_india', tracker)) {
      await sendFCM('india_matches', `🇮🇳 India in ${mins} min!`, `${tag}`, m.id, 'soon_india');
      await recordNotifSent(m.id, 'soon_india', tracker);
    }

    if (isMatchInIndia(m) && !isIndiaMatch(m) && !isIPLMatch(m)
      && mins !== null && mins > 0 && mins <= 30
      && canSendNotif(m.id, 'soon_india_venue', tracker)) {
      await sendFCM('india_matches', `📍 Match in India in ${mins} min!`, `${tag}`, m.id, 'soon_india_venue');
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
    schedule: '*/1 * * * *',
    region: 'us-central1',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (): Promise<void> => {
    logger.info('[Master] ▶ Starting');

    try {
      // ① Activity guard (skip during premium)
      const isPremium = isPremiumPeriod();
      if (!isPremium) {
        const active = await wasRecentlyActive();
        if (!active) {
          logger.info('[Master] ⏭ No recent activity — skipping');
          return;
        }
      }

      // ② Rate limit guard
      const rateLimit = await getRateLimit();
      if (rateLimit.hitsUsed >= rateLimit.hitsLimit - 5) {
        logger.warn(`[Master] ⚠ Rate limit near (${rateLimit.hitsUsed}/${rateLimit.hitsLimit}) — skipping`);
        return;
      }

      // ③ Time threshold guard
      // Premium mode and IPL match hours use aggressive refresh
      // All other times use a slower refresh cadence.
      const snap = await admin.firestore()
        .collection(CACHE_COL).doc(LIVE_SCORES_DOC).get();
      const lastUpdatedAt = snap.exists
        ? (snap.data() as LiveScoreDoc).lastUpdatedAt : 0;
      const msSinceLast = Date.now() - lastUpdatedAt;
      const isActiveTime = isPremium || (isIPLSeason() && isIPLMatchHours());
      const thresholdMs = isActiveTime ? 1 * 60 * 1000 : 7 * 60 * 1000;

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
      const groqKey = JSON.parse(config.value()).groq.key;

      const prompt = `
          You are an elite international cricket analyst with deep expertise in:
          - team composition, batting depth, bowling quality
          - pitch conditions and venue behavior
          - match situations, pressure handling, and game momentum
          - historical team performance and player roles

          Your analysis must sound like a professional broadcast expert, not generic AI.

          Match Details:
          Match ID: ${matchId}
          Date: ${predictionDate}
          Teams: ${teamA} vs ${teamB}
          Tournament: ${tournament}
          Format: ${matchType}
          Venue: ${venue}
          Match Status: ${status}
          Match Ended: ${matchEnded}
          Current Score: ${scoreText}

          Instructions:

          1. If Match Ended = true:
            - If status contains "won" → return actual winner with confidence = "Actual"
            - If status contains "No result" or "abandoned" → winner = "No Result", confidence = "Actual"

          2. If LIVE:
            - Base prediction on:
              • current score (runs/wickets)
              • overs completed
              • required vs current run rate
              • wickets in hand
              • match phase (powerplay, middle overs, death overs)
              • momentum shifts (recent wickets or partnerships)
            - You MUST explicitly reference the score or overs in the reason.
            - Give more weight to current match situation than pre-match strength.

          3. If UPCOMING:
            - Predict using:
              • team balance (batting vs bowling strength)
              • venue & pitch behavior
              • format-specific strengths (T20/ODI/Test)

          4. Always return EXACTLY ONE winner (or "No Result")

          5. Confidence Rules:
            - High → clear advantage
            - Medium → slight edge
            - Low → very close / uncertain
            - Actual → match already decided

          6. Include winProbability (0–100%) based on match situation realism

          7. Include keyFactor:
            - Maximum 5 words
            - The single biggest deciding factor

          8. Reason MUST:
            - Be between 200–250 words
            - Be specific and match-aware
            - Mention score, overs, pitch, or team strengths
            - Sound like a TV cricket analyst
            - Avoid generic phrases

          9. If reason exceeds 100 words, shorten it automatically

          10. Return ONLY valid JSON:
          Do not include markdown, explanations, or backticks.

          Output format:
          {"winner":"Team Name or No Result","confidence":"Low|Medium|High|Actual","winProbability":"0-100%","keyFactor":"short phrase","reason":"Expert cricket analysis"}
`;
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are a cricket prediction AI.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${groqKey}`,
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

import * as admin from 'firebase-admin';
import axios from 'axios';
import { logger } from './logger';
import {
  allowNotification, BudgetInput, currentRefreshIntervalMs, DailyNotifCounts, freshDailyCounts,
  LIST_PAGES, LIST_REFRESH_MS, withinBudget,
} from './pacing';
import { isClockLive, isInEndWindow } from './matchTiming';
import { MatchDetailUnavailableError } from './errors';

// ─── Firebase Init ────────────────────────────────────────────────────────
const envProjectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GCLOUD_PROJECT_ID;

const credentialJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
admin.initializeApp({
  ...(envProjectId ? { projectId: envProjectId } : {}),
  credential: credentialJson
    ? admin.credential.cert(JSON.parse(credentialJson))
    : admin.credential.applicationDefault(),
});

// ─── Firestore collections ────────────────────────────────────────────────
const CACHE_COL = 'cricket_cache';
const LIVE_SCORES_DOC = 'live_scores';
const NOTIF_TRACKER_DOC = 'notif_tracker';
const RATE_LIMIT_DOC = 'rate_limit';
const ACTIVITY_DOC = 'user_activity';
const SNAPSHOT_DOC = 'matches_snapshot';
const PREDICTIONS_COL = 'predictions';
const MATCH_DETAILS_COL = 'match_details';

// ─── API Config ───────────────────────────────────────────────────────────
// Set in the Voroa service environment. Only this backend calls CricAPI;
// app versions before the /matches endpoint still read /config/cric-api.
export function getCricApiKey(): string {
  const key = process.env.CRIC_API_KEY?.trim();
  if (!key) throw new Error('CRIC_API_KEY is not configured');
  return key;
}
const BASE_URL = 'https://api.cricapi.com/v1';

// ─── Premium window ───────────────────────────────────────────────────────
const PREMIUM_START = new Date('2026-04-05T00:00:00+05:30');
const PREMIUM_END = new Date('2026-05-05T23:59:59+05:30');

// ─── Notification config ──────────────────────────────────────────────────
const MAX_NOTIFS_PER_MATCH = 5;              // max total notifs per match ever


const DEFAULT_NOTIF_THROTTLE_MS = 15 * 60 * 1000; // non-IPL
const IPL_NOTIF_THROTTLE_MS = 7 * 60 * 1000; // IPL matches

// Per topic per IST day; quiet hours are in pacing.ts.
const NOTIF_DAILY_CAP_PER_TOPIC = Number(process.env.NOTIF_DAILY_CAP_PER_TOPIC) || 6;
const PREMIUM_NOTIF_DAILY_CAP_PER_TOPIC = 20;

// ─── Other config ─────────────────────────────────────────────────────────
const MAX_ROWS = 100;
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;    // user recently active (< 2 min)
const IDLE_WINDOW_MS = 10 * 60 * 1000;     // user was active but idle (< 10 min)
const ACTIVITY_WRITE_INTERVAL_MS = 60 * 1000;
const SNAPSHOT_MEMORY_TTL_MS = 60 * 1000;
const SNAPSHOT_RETENTION_MS = 4 * 24 * 60 * 60 * 1000; // matches the app's 4-day window

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
  hasSquad?: boolean;
  fantasyEnabled?: boolean;
}

interface ApiUsage {
  hitsToday?: number;
  hitsLimit?: number;
}

interface ApiPage {
  data?: Match[];
  info?: { totalRows: number; offsetRows: number } & ApiUsage;
  status?: string;
}

export interface MatchesSnapshot {
  matches: Match[];
  updatedAt: number;
  currentFetchedAt: number;
  listFetchedAt: number;
  pagesPerRefresh: number;
  endCheckedAt: Record<string, number>; // last end-of-match check per match
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
  apiHitsLimit?: number; // as reported by CricAPI for this key's plan
}

interface ActivityDoc {
  lastActiveAt: number;
}

export interface PredictRequest {
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
  squads?: string; // added server-side from the cached match squad
}

export interface PredictionResponse {
  winner: string;
  confidence: string;
  reason: string;
  winProbability?: string;
  keyFactor?: string;
}

export type Predictor = (data: PredictRequest) => Promise<PredictionResponse>;


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

// Live from toss time by the clock, so it doesn't wait for the next CricAPI refresh.
function isLive(m: Match, now: number = Date.now()): boolean {
  const s = (m.status || '').toLowerCase();
  return !m.matchEnded && (
    s.includes('live') || s.includes('progress') || !!m.matchStarted ||
    isClockLive(matchStartMs(m), m.matchType, now)
  );
}

// India, IPL and big international events get 2-minute end checks first.
function isPriorityMatch(m: Match): boolean {
  const s = `${m.series || ''} ${m.name || ''}`.toLowerCase();
  return isIndiaMatch(m) || isIPLMatch(m) ||
    [' tour of ', 'world cup', 'champions trophy', 'asia cup', 'wtc'].some(x => s.includes(x));
}

function minutesUntilStart(m: Match): number | null {
  if (!m.dateTimeGMT) { return null; }
  const start = matchStartMs(m);
  return Number.isNaN(start) ? null : Math.floor((start - Date.now()) / 60000);
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

function isPremiumPeriod(): boolean {
  return new Date() >= PREMIUM_START && new Date() <= PREMIUM_END;
}

function getNextMidnightUTC(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

// ─── Activity check ───────────────────────────────────────────────────────
async function wasRecentlyActive(): Promise<{ isActive: boolean; msSinceActive: number }> {
  try {
    const snap = await admin.firestore()
      .collection(CACHE_COL).doc(ACTIVITY_DOC).get();
    if (!snap.exists) {
      logger.info('[Activity] No activity recorded yet');
      return { isActive: false, msSinceActive: Infinity };
    }
    const data = snap.data() as ActivityDoc;
    const msSinceActive = Date.now() - data.lastActiveAt;
    const isActive = msSinceActive < ACTIVE_WINDOW_MS;
    const status = isActive ? '🟢 ACTIVE' : msSinceActive < IDLE_WINDOW_MS ? '🟡 IDLE' : '⚫ DORMANT';
    logger.info(
      `[Activity] Last active: ${Math.round(msSinceActive / 1000)}s ago → ${status}`
    );
    return { isActive: msSinceActive < IDLE_WINDOW_MS, msSinceActive };
  } catch {
    return { isActive: false, msSinceActive: Infinity };
  }
}

// Called when the app requests /matches; at most one Firestore write per instance per minute.
let lastActivityWriteAt = 0;
export function recordActivity(): void {
  const now = Date.now();
  if (now - lastActivityWriteAt < ACTIVITY_WRITE_INTERVAL_MS) return;
  lastActivityWriteAt = now;
  admin.firestore().collection(CACHE_COL).doc(ACTIVITY_DOC)
    .set({ lastActiveAt: now }, { merge: true })
    .catch(e => logger.warn('[Activity] Write failed', e));
}

// ─── Rate limit helpers ───────────────────────────────────────────────────
// CricAPI reports the key's plan limit in every response; CRICAPI_DAILY_LIMIT overrides it.
function dailyLimit(apiHitsLimit?: number): number {
  return Number(process.env.CRICAPI_DAILY_LIMIT) || apiHitsLimit || 100;
}

async function getRateLimit(): Promise<RateLimitDoc> {
  try {
    const ref = admin.firestore().collection(CACHE_COL).doc(RATE_LIMIT_DOC);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() as RateLimitDoc : undefined;
    if (!data || Date.now() > data.resetAt) {
      const fresh: RateLimitDoc = {
        hitsUsed: 0, hitsLimit: dailyLimit(data?.apiHitsLimit), resetAt: getNextMidnightUTC(),
        ...(data?.apiHitsLimit ? { apiHitsLimit: data.apiHitsLimit } : {}),
      };
      await ref.set(fresh);
      if (data) logger.info('[RateLimit] Daily reset ✅');
      return fresh;
    }
    return { ...data, hitsLimit: dailyLimit(data.apiHitsLimit) };
  } catch {
    return { hitsUsed: 0, hitsLimit: dailyLimit(), resetAt: getNextMidnightUTC() };
  }
}

// Counts our hits, then trusts CricAPI's own counter when it reports one
// (it also includes hits from older app versions still using the key).
async function recordApiHits(hits: number, usage?: ApiUsage): Promise<void> {
  try {
    const ref = admin.firestore().collection(CACHE_COL).doc(RATE_LIMIT_DOC);
    await ref.update({
      hitsUsed: admin.firestore.FieldValue.increment(hits),
      ...(typeof usage?.hitsLimit === 'number' && usage.hitsLimit > 0 ? { apiHitsLimit: usage.hitsLimit } : {}),
    });
    if (typeof usage?.hitsToday === 'number') {
      await admin.firestore().runTransaction(async transaction => {
        const used = ((await transaction.get(ref)).data() as RateLimitDoc | undefined)?.hitsUsed || 0;
        transaction.update(ref, { hitsUsed: Math.max(used, usage.hitsToday as number) });
      });
    }
  } catch (e) {
    logger.warn('[RateLimit] Increment failed', e);
  }
}

// ─── Sliding window fetch ─────────────────────────────────────────────────
async function fetchPage(
  endpoint: 'currentMatches' | 'matches',
  offset: number,
): Promise<{ matches: Match[]; totalRows: number; usage?: ApiUsage }> {
  try {
    const key = getCricApiKey();
    const url = `${BASE_URL}/${endpoint}?apikey=${encodeURIComponent(key)}&offset=${offset}`;
    const res = await axios.get(url, { timeout: 15000 });
    const json = res.data as ApiPage;
    const matches = json.data || [];
    const totalRows = json.info?.totalRows || matches.length;
    logger.info(`[API] ${endpoint} offset=${offset} → ${matches.length} matches (totalRows: ${totalRows})`);
    return { matches, totalRows, usage: json.info };
  } catch (e: any) {
    logger.warn(`[API] ${endpoint} offset=${offset} failed:`, e.message);
    return { matches: [], totalRows: 0 };
  }
}

interface FetchResult {
  matches: Match[];
  pages: number;
  usage?: ApiUsage;
}

async function fetchMatchList(): Promise<FetchResult> {
  const pages = await Promise.all(
    Array.from({ length: LIST_PAGES }, (_, i) => fetchPage('matches', i * 25)));
  return {
    matches: pages.flatMap(p => p.matches),
    pages: LIST_PAGES,
    usage: pages.map(p => p.usage).filter(Boolean).pop(),
  };
}

// Single match (1 hit) — used for the 2-minute end-of-match checks.
async function fetchMatchInfo(id: string): Promise<{ match: Match | null; usage?: ApiUsage }> {
  try {
    const url = `${BASE_URL}/match_info?apikey=${encodeURIComponent(getCricApiKey())}&id=${encodeURIComponent(id)}`;
    const res = await axios.get(url, { timeout: 15000 });
    const json = res.data as { data?: Match; info?: ApiUsage; status?: string };
    return { match: json.status === 'success' && json.data?.id ? json.data : null, usage: json.info };
  } catch (e: any) {
    logger.warn(`[API] match_info ${id} failed:`, e.message);
    return { match: null };
  }
}

async function fetchCurrentMatches(): Promise<FetchResult> {
  logger.info('[API] Starting fetchCurrentMatches');
  try {
    const { matches: page0, totalRows, usage } = await fetchPage('currentMatches', 0);
    if (page0.length === 0) {
      logger.warn('[API] No matches from first page');
      return { matches: [], pages: 1, usage };
    }

    if (totalRows > MAX_ROWS) {
      logger.warn(`[API] ${totalRows} current matches but only ${MAX_ROWS} are fetched — some will be missed`);
    }
    const target = Math.min(totalRows, MAX_ROWS);
    const remaining = Math.max(0, target - page0.length);

    if (remaining === 0) {
      logger.info(`[API] Single page sufficient (${page0.length} matches)`);
      return { matches: page0, pages: 1, usage };
    }

    const offsets: number[] = [];
    for (let o = page0.length; o < target; o += 25) {
      offsets.push(o);
    }
    logger.info(`[API] Fetching ${offsets.length} more page(s): [${offsets.join(', ')}]`);

    const remainingPages = await Promise.all(
      offsets.map(o => fetchPage('currentMatches', o))
    );

    const all = [...page0, ...remainingPages.flatMap(r => r.matches)];
    const unique = Array.from(new Map(all.map(m => [m.id, m])).values());
    logger.info(`[API] Total unique: ${unique.length}`);
    const lastUsage = remainingPages.map(r => r.usage).filter(Boolean).pop() || usage;
    return { matches: unique, pages: 1 + offsets.length, usage: lastUsage };

  } catch (e: any) {
    logger.error('[API] fetchCurrentMatches failed:', e.message);
    return { matches: [], pages: 1 };
  }
}

// ─── Matches snapshot (what the app reads via GET /matches) ──────────────
const EMPTY_SNAPSHOT: MatchesSnapshot = {
  matches: [], updatedAt: 0, currentFetchedAt: 0, listFetchedAt: 0, pagesPerRefresh: 3, endCheckedAt: {},
};

function matchStartMs(m: Match): number {
  const raw = m.dateTimeGMT || m.date;
  if (!raw) return NaN;
  // CricAPI sends GMT timestamps without a zone suffix.
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(raw) || !raw.includes('T') ? raw : `${raw}Z`);
}

// Later sources win field by field; old matches drop out to keep the doc small.
export function mergeMatches(base: Match[], updates: Match[], now: number): Match[] {
  const merged = new Map(base.map(m => [m.id, m]));
  for (const m of updates) {
    merged.set(m.id, { ...merged.get(m.id), ...m });
  }
  return Array.from(merged.values()).filter(m => {
    const start = matchStartMs(m);
    return Number.isNaN(start) || start >= now - SNAPSHOT_RETENTION_MS;
  });
}

async function readSnapshot(): Promise<MatchesSnapshot> {
  const snap = await admin.firestore().collection(CACHE_COL).doc(SNAPSHOT_DOC).get();
  return snap.exists ? { ...EMPTY_SNAPSHOT, ...(snap.data() as MatchesSnapshot) } : { ...EMPTY_SNAPSHOT };
}

let memorySnapshot: MatchesSnapshot | null = null;
let memorySnapshotLoadedAt = 0;
let snapshotLoad: Promise<MatchesSnapshot> | null = null;

// Served to every app user; other instances refresh from Firestore once a minute.
export async function getMatchesSnapshot(): Promise<MatchesSnapshot> {
  if (memorySnapshot && Date.now() - memorySnapshotLoadedAt < SNAPSHOT_MEMORY_TTL_MS) {
    return memorySnapshot;
  }
  if (!snapshotLoad) {
    snapshotLoad = readSnapshot()
      .then(snapshot => {
        memorySnapshot = snapshot;
        memorySnapshotLoadedAt = Date.now();
        return snapshot;
      })
      .catch(error => {
        if (memorySnapshot) return memorySnapshot;
        throw error;
      })
      .finally(() => { snapshotLoad = null; });
  }
  return snapshotLoad;
}

async function saveSnapshot(snapshot: MatchesSnapshot): Promise<void> {
  await admin.firestore().collection(CACHE_COL).doc(SNAPSHOT_DOC).set(snapshot);
  memorySnapshot = snapshot;
  memorySnapshotLoadedAt = Date.now();
}

// ─── Prediction cache store ───────────────────────────────────────────────
export const firestorePredictionStore = {
  async get(matchId: string) {
    const snap = await admin.firestore().collection(PREDICTIONS_COL).doc(matchId).get();
    return snap.exists ? snap.data() as any : undefined;
  },
  async set(matchId: string, value: unknown) {
    await admin.firestore().collection(PREDICTIONS_COL).doc(matchId).set(value as any);
  },
};

// ─── Scorecards & squads (fetched on demand, cached per match) ───────────
// Each is ~1 hit per match: squads are final once the match starts, the
// scorecard once it ends. Until then they are refreshed at most every TTL.
export type MatchDetailKind = 'scorecard' | 'squad';
const DETAIL_ENDPOINT: Record<MatchDetailKind, string> = { scorecard: 'match_scorecard', squad: 'match_squad' };
const DETAIL_TTL_MS: Record<MatchDetailKind, number> = { scorecard: 5 * 60 * 1000, squad: 6 * 60 * 60 * 1000 };
const DETAIL_UNAVAILABLE_TTL_MS = 30 * 60 * 1000;

interface CachedDetail {
  data: unknown | null; // null = CricAPI has no data for this match (yet)
  fetchedAt: number;
  final: boolean;
}

const detailMemory = new Map<string, CachedDetail>();
const detailInFlight = new Map<string, Promise<CachedDetail>>();

// CricAPI sometimes answers "success" with an empty squad/scorecard; treat that as not available yet.
export function hasDetailData(kind: MatchDetailKind, data: unknown): boolean {
  if (data == null) return false;
  if (kind === 'squad') {
    return Array.isArray(data) && data.some(team => ((team as SquadTeam)?.players?.length ?? 0) > 0);
  }
  return ((data as { scorecard?: unknown[] }).scorecard?.length ?? 0) > 0;
}

function normalizeDetail(kind: MatchDetailKind, entry: CachedDetail | undefined): CachedDetail | undefined {
  if (!entry || entry.data === null || hasDetailData(kind, entry.data)) return entry;
  return { ...entry, data: null, final: false };
}

function isDetailFresh(entry: CachedDetail | undefined, kind: MatchDetailKind, now: number): boolean {
  if (!entry) return false;
  if (entry.final) return true;
  return now - entry.fetchedAt < (entry.data === null ? DETAIL_UNAVAILABLE_TTL_MS : DETAIL_TTL_MS[kind]);
}

async function loadDetail(kind: MatchDetailKind, matchId: string): Promise<CachedDetail> {
  const now = Date.now();
  const ref = admin.firestore().collection(MATCH_DETAILS_COL).doc(matchId);
  const stored = normalizeDetail(kind, (await ref.get()).data()?.[kind] as CachedDetail | undefined);
  if (isDetailFresh(stored, kind, now)) return stored as CachedDetail;

  const match = (await getMatchesSnapshot()).matches.find(m => m.id === matchId);
  // CricAPI flags matches without a squad; asking anyway wastes a hit.
  if (kind === 'squad' && match && !match.hasSquad) {
    return { data: null, fetchedAt: now, final: false };
  }

  const rateLimit = await getRateLimit();
  if (!withinBudget({ ...rateLimit, now }, 1)) {
    if (stored?.data) return stored; // stale beats nothing
    throw new MatchDetailUnavailableError(`${kind} budget exhausted`);
  }

  const url = `${BASE_URL}/${DETAIL_ENDPOINT[kind]}?apikey=${encodeURIComponent(getCricApiKey())}&id=${encodeURIComponent(matchId)}`;
  const res = await axios.get(url, { timeout: 15000 });
  const json = res.data as { data?: unknown; info?: ApiUsage; status?: string };
  await recordApiHits(1, json.info);

  const data = json.status === 'success' && hasDetailData(kind, json.data) ? json.data! : null;
  const final = data !== null && (kind === 'scorecard'
    ? !!match?.matchEnded || (data as { matchEnded?: boolean }).matchEnded === true
    : !!match && (!!match.matchStarted || !!match.matchEnded));
  const entry: CachedDetail = { data, fetchedAt: now, final };
  await ref.set({ [kind]: entry }, { merge: true });
  return entry;
}

export async function getMatchDetail(kind: MatchDetailKind, matchId: string): Promise<unknown> {
  const key = `${kind}:${matchId}`;
  let entry = detailMemory.get(key);
  if (!isDetailFresh(entry, kind, Date.now())) {
    let pending = detailInFlight.get(key);
    if (!pending) {
      pending = loadDetail(kind, matchId).finally(() => detailInFlight.delete(key));
      detailInFlight.set(key, pending);
    }
    entry = await pending;
    if (detailMemory.size >= 500) detailMemory.delete(detailMemory.keys().next().value as string);
    detailMemory.set(key, entry);
  }
  if (entry?.data == null) throw new MatchDetailUnavailableError(`${kind} not available`);
  return entry.data;
}

interface SquadTeam {
  teamName?: string;
  players?: { name?: string; role?: string }[];
}

// "India: Rohit Sharma (Batsman), …" for the AI prompt; undefined when unknown.
export async function getSquadSummary(matchId: string): Promise<string | undefined> {
  const match = (await getMatchesSnapshot().catch(() => null))?.matches.find(m => m.id === matchId);
  if (!match?.hasSquad) return undefined;
  try {
    const teams = await getMatchDetail('squad', matchId) as SquadTeam[];
    return teams
      .map(t => `${t.teamName}: ${(t.players || []).slice(0, 16)
        .map(p => (p.role ? `${p.name} (${p.role})` : p.name)).join(', ')}`)
      .join('\n');
  } catch {
    return undefined;
  }
}

// Same fields the app sends, so the notification's prediction is a cache hit when users tap.
function toPredictRequest(m: Match): PredictRequest {
  return {
    matchId: m.id,
    teamA: m.teams?.[0] || 'Team A',
    teamB: m.teams?.[1] || 'Team B',
    date: m.date,
    tournament: m.name,
    matchType: m.matchType || 'unknown',
    venue: m.venue,
    status: m.status,
    matchEnded: false,
    scoreText: '',
  };
}

// ─── Save live scores to Firestore ────────────────────────────────────────
async function saveLiveScores(matches: Match[]): Promise<void> {
  const live = matches.filter(m => isLive(m));
  const disabledPayload: LiveScoreDoc = {
    matches: live,
    lastUpdatedAt: Date.now(),
    totalLive: live.length,
  };

  logger.info(`[Firestore] Live score storage disabled (doc: ${LIVE_SCORES_DOC}) — live matches seen: ${disabledPayload.totalLive}`);

  /*
   * Disabled intentionally: we do not store live match data in Firebase.
   * Keeping old implementation commented for later restore.
   *
   * logger.info(`[Firestore] Saving ${live.length} live matches`);
   * live.forEach(match => {
   *   logger.info('[Firestore] Live match payload', {
   *     id: match.id,
   *     name: match.name,
   *     status: match.status,
   *     date: match.date,
   *     dateTimeGMT: match.dateTimeGMT,
   *     score: match.score ?? [],
   *   });
   * });
   * await admin.firestore()
   *   .collection(CACHE_COL).doc(LIVE_SCORES_DOC)
   *   .set({
   *     matches: live,
   *     lastUpdatedAt: Date.now(),
   *     totalLive: live.length,
   *   } as LiveScoreDoc);
   * logger.info(`[Firestore] Saved ${live.length} live matches`);
   */
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

  // Local testing shares the production Firebase project; keep real users out of it.
  if (process.env.NOTIFICATIONS_ENABLED === 'false') {
    logger.info(`[FCM] (disabled) would send [${topic}] "${title}" — ${body}`);
    return;
  }

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
// ✅ Quiet hours (IST) and a daily cap per topic; suppressed alerts are not retried
// ✅ "Prediction ready" for India/IPL matches 30–90 min before start

const PREDICTIONS_TOPIC = 'predictions_ready';

// bypassThrottle: used right after an end-of-match check so the result goes out immediately.
async function checkAndNotify(
  matches: Match[], predict?: Predictor, opts: { bypassThrottle?: boolean } = {},
): Promise<void> {

  const tracker = await getNotifTracker();

  // Detect if ANY IPL match is live
  const hasLiveIPLMatch = matches.some(m => isIPLMatch(m) && isLive(m));

  // Choose throttle dynamically
  const throttleMs = hasLiveIPLMatch
    ? IPL_NOTIF_THROTTLE_MS
    : DEFAULT_NOTIF_THROTTLE_MS;

  const lastNotifRun = (tracker as any)._lastNotifRunAt as number || 0;
  const msSinceLastNotif = Date.now() - lastNotifRun;

  if (!opts.bypassThrottle) {
    if (msSinceLastNotif < throttleMs) {
      logger.info(`[Notif] Throttled (${Math.round(msSinceLastNotif / 1000)}s < ${throttleMs / 1000}s)`);
      return;
    }

    await admin.firestore()
      .collection(CACHE_COL).doc(NOTIF_TRACKER_DOC)
      .set({ _lastNotifRunAt: Date.now() }, { merge: true });
  }

  const daily = freshDailyCounts((tracker as any)._daily as DailyNotifCounts | undefined, Date.now());
  const dailyCap = isPremiumMode() ? PREMIUM_NOTIF_DAILY_CAP_PER_TOPIC : NOTIF_DAILY_CAP_PER_TOPIC;

  const send = async (
    topic: string, title: string, body: string, matchId: string, type: string,
  ): Promise<boolean> => {
    if (!allowNotification(topic, type, daily, dailyCap, Date.now())) {
      logger.info(`[Notif] Suppressed [${topic}] ${type} (quiet hours or daily cap)`);
      return false;
    }
    await sendFCM(topic, title, body, matchId, type);
    daily.counts[topic] = (daily.counts[topic] || 0) + 1;
    return true;
  };

  // Generates (and caches) the prediction, so users who tap get it instantly.
  const sendPredictionReady = async (m: Match, tag: string, mins: number | null): Promise<boolean> => {
    if (!predict || mins === null || mins <= 30 || mins > 90) return false;
    if (!(isIndiaMatch(m) || isIPLMatch(m)) || (m.teams?.length || 0) < 2) return false;
    // Check before calling the AI so suppressed alerts cost nothing.
    if (!allowNotification(PREDICTIONS_TOPIC, 'prediction_ready', daily, dailyCap, Date.now())) return false;
    try {
      const p = await predict(toPredictRequest(m));
      const odds = p.winProbability || `${p.confidence} confidence`;
      return await send(PREDICTIONS_TOPIC, '🔮 AI prediction ready',
        `${tag} — AI pick: ${p.winner} (${odds}). Tap for the full analysis.`, m.id, 'prediction_ready');
    } catch (e) {
      logger.warn('[Notif] Prediction-ready skipped', e);
      return false;
    }
  };

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

  try {
  for (const m of matches) {

    const isPremium = isPremiumMode();

    // 🔥 dynamic limits
    const maxPerMatch = isPremium
      ? (isIPLMatch(m) ? 10 : 7)
      : MAX_NOTIFS_PER_MATCH;

    // RESULT — India/IPL matches we announced as live; not limited by maxPerMatch
    const seen = tracker[m.id];
    if (m.matchEnded && (isIndiaMatch(m) || isIPLMatch(m))
      && seen?.types.some(t => t.startsWith('live')) && !seen.types.includes('result')) {
      await send(isIndiaMatch(m) ? 'india_matches' : 'ipl_matches',
        `🏁 ${getTeamLabel(m)}`, m.status || 'Match ended', m.id, 'result');
      await recordNotifSent(m.id, 'result', tracker);
    }
    if (m.matchEnded) continue;

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
      if (!entry.types.includes('prediction_ready') && entry.sentCount < maxPerMatch
        && await sendPredictionReady(m, tag, mins)) {
        entry.types.push('prediction_ready'); entry.sentCount++;
      }

      if (mins !== null && mins > 0) {

        if (mins <= 60 && mins > 30 && !entry.types.includes('soon_60')) {
          await send('ipl_matches', '⏰ Match in 1 hour', tag, m.id, 'soon_60');
          entry.types.push('soon_60'); entry.sentCount++;
        }

        if (mins <= 30 && mins > 10 && !entry.types.includes('soon_30')) {
          await send('ipl_matches', '⏰ Match in 30 min', tag, m.id, 'soon_30');
          entry.types.push('soon_30'); entry.sentCount++;
        }

        if (mins <= 10 && mins > 0 && !entry.types.includes('soon_10')) {
          await send('ipl_matches', '⏰ Starting soon', tag, m.id, 'soon_10');
          entry.types.push('soon_10'); entry.sentCount++;
        }
      }

      // LIVE
      if (isLive(m) && !entry.types.includes('live')) {
        await send('ipl_matches', '🟢 Match LIVE', `${tag} has started`, m.id, 'live');
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
            await send('ipl_matches', '🚨 WICKET!', `${tag} — ${scoreText}`, m.id, 'wicket');
            entry.wicketCount++; entry.sentCount++;
          }

          if (decision.type === 'over' && entry.overCount < 2) {
            await send('ipl_matches', '📊 Over Update', `${tag} — ${scoreText}`, m.id, 'over');
            entry.overCount++; entry.sentCount++;
          }

          if (decision.type === 'milestone' && entry.milestoneCount < 2) {
            await send('ipl_matches', '🔥 Milestone', `${tag} — ${scoreText}`, m.id, 'milestone');
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

    if (canSendNotif(m.id, 'prediction_ready', tracker) && await sendPredictionReady(m, tag, mins)) {
      await recordNotifSent(m.id, 'prediction_ready', tracker);
    }

    if (isIPLMatch(m) && isLive(m) && canSendNotif(m.id, 'live_ipl', tracker)) {
      await send('ipl_matches', '🏏 IPL is LIVE!', `${tag} has started!`, m.id, 'live_ipl');
      await recordNotifSent(m.id, 'live_ipl', tracker);
    }

    if (isIndiaMatch(m) && isLive(m) && canSendNotif(m.id, 'live_india', tracker)) {
      await send('india_matches', '🇮🇳 India Match is LIVE!', `${tag}`, m.id, 'live_india');
      await recordNotifSent(m.id, 'live_india', tracker);
    }

    if (isLive(m) && !isIPLMatch(m) && !isIndiaMatch(m) && canSendNotif(m.id, 'live_any', tracker)) {
      await send('live_matches', '🟢 Match is LIVE', `${tag}`, m.id, 'live_any');
      await recordNotifSent(m.id, 'live_any', tracker);
    }

    if (isIPLMatch(m) && mins !== null && mins > 0 && mins <= 30
      && canSendNotif(m.id, 'soon_ipl', tracker)) {
      await send('ipl_matches', `🏏 IPL in ${mins} min!`, `${tag}`, m.id, 'soon_ipl');
      await recordNotifSent(m.id, 'soon_ipl', tracker);
    }

    if (isIndiaMatch(m) && mins !== null && mins > 0 && mins <= 30
      && canSendNotif(m.id, 'soon_india', tracker)) {
      await send('india_matches', `🇮🇳 India in ${mins} min!`, `${tag}`, m.id, 'soon_india');
      await recordNotifSent(m.id, 'soon_india', tracker);
    }

    if (isMatchInIndia(m) && !isIndiaMatch(m) && !isIPLMatch(m)
      && mins !== null && mins > 0 && mins <= 30
      && canSendNotif(m.id, 'soon_india_venue', tracker)) {
      await send('india_matches', `📍 Match in India in ${mins} min!`, `${tag}`, m.id, 'soon_india_venue');
      await recordNotifSent(m.id, 'soon_india_venue', tracker);
    }
  }
  } finally {
    await admin.firestore()
      .collection(CACHE_COL).doc(NOTIF_TRACKER_DOC)
      .set({ _daily: daily }, { merge: true });
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  End-of-match checks — so matches move to Ended within ~2 minutes
// ────────────────────────────────────────────────────────────────────────────
const END_CHECK_INTERVAL_MS = 2 * 60 * 1000;            // priority matches
const NON_PRIORITY_END_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_INSTEAD_AT = 4; // 4+ single checks cost more than one 3-page sweep

// Which matches near their finish to re-check now: one match_info each (1 hit),
// or a single currentMatches sweep when many finish together. Priority first;
// stops when spending would run ahead of the day's even pace.
export function planEndChecks(
  matches: Match[], endCheckedAt: Record<string, number>, now: number, budget: BudgetInput,
): { sweep: boolean; ids: string[] } {
  const due = matches
    .filter(m => !m.matchEnded && isInEndWindow(matchStartMs(m), m.matchType, now))
    .filter(m => now - (endCheckedAt[m.id] || 0) >=
      (isPriorityMatch(m) ? END_CHECK_INTERVAL_MS : NON_PRIORITY_END_CHECK_INTERVAL_MS))
    .sort((a, b) => Number(isPriorityMatch(b)) - Number(isPriorityMatch(a)));
  if (due.length >= SWEEP_INSTEAD_AT && withinBudget(budget, 3)) {
    return { sweep: true, ids: due.map(m => m.id) };
  }
  const ids: string[] = [];
  for (const m of due) {
    if (!withinBudget({ ...budget, hitsUsed: budget.hitsUsed + ids.length }, 1)) break;
    ids.push(m.id);
  }
  return { sweep: false, ids };
}

// ────────────────────────────────────────────────────────────────────────────
//  cricketMaster — SINGLE MERGED SCHEDULER
//
//  Runs every 1 minute on the instance holding the lease. This backend is the
//  only CricAPI caller; the app reads the saved snapshot via GET /matches, so
//  API usage no longer grows with the number of users.
//
//  ① Load snapshot + quota   — when did we last fetch, how many hits are left
//  ② Plan                    — sweep interval (pacing.ts), fixtures every 2 h,
//                              2-minute checks for matches near their finish
//  ③ Fetch                   — list / currentMatches sweep / match_info
//  ④ Save                    — merged snapshot to Firestore
//  ⑤ Notify                  — live/soon after sweeps; results right away
// ────────────────────────────────────────────────────────────────────────────
export async function cricketMaster(predict?: Predictor): Promise<void> {
  logger.info('[Master] ▶ Starting');

  try {
    // ① Load snapshot + quota
    const now = Date.now();
    const snapshot = await readSnapshot();
    const rateLimit = await getRateLimit();
    const { isActive } = await wasRecentlyActive();
    const budget: BudgetInput = { ...rateLimit, now };

    // ② Plan
    const hasLiveOrSoon = snapshot.matches.some(m => {
      const mins = minutesUntilStart(m);
      return isLive(m, now) || (mins !== null && mins > 0 && mins <= 90);
    });
    const intervalMs = currentRefreshIntervalMs({
      now,
      resetAt: rateLimit.resetAt,
      hitsUsed: rateLimit.hitsUsed,
      hitsLimit: rateLimit.hitsLimit,
      pagesPerRefresh: snapshot.pagesPerRefresh,
      usersActive: isActive,
      hasLiveOrSoon,
    });
    const listDue = now - snapshot.listFetchedAt >= LIST_REFRESH_MS
      && rateLimit.hitsUsed + LIST_PAGES <= rateLimit.hitsLimit;
    const sweepDue = now - snapshot.currentFetchedAt >= intervalMs;
    // A due sweep already covers every match, so end checks wait for the next tick.
    const endPlan = sweepDue ? { sweep: false, ids: [] } : planEndChecks(snapshot.matches, snapshot.endCheckedAt, now, budget);
    const sweepNow = sweepDue || endPlan.sweep;
    logger.info(
      `[Master] hits ${rateLimit.hitsUsed}/${rateLimit.hitsLimit}, active: ${isActive},` +
      ` live/soon: ${hasLiveOrSoon}, sweep every: ${Number.isFinite(intervalMs) ? Math.round(intervalMs / 60000) + 'm' : 'quota exhausted'},` +
      ` end checks: ${endPlan.sweep ? 'sweep' : endPlan.ids.length}`
    );
    if (!listDue && !sweepNow && endPlan.ids.length === 0) {
      logger.info('[Master] ⏭ Nothing due — skipping CricAPI');
      return;
    }

    // ③ Fetch (attempt times are recorded even on failure so errors can't burn quota every minute)
    const next: MatchesSnapshot = { ...snapshot, endCheckedAt: { ...snapshot.endCheckedAt } };
    let swept: FetchResult | null = null;
    if (listDue) {
      const list = await fetchMatchList();
      await recordApiHits(list.pages, list.usage);
      next.listFetchedAt = now;
      next.matches = mergeMatches(next.matches, list.matches, now);
    }
    if (sweepNow) {
      swept = await fetchCurrentMatches();
      await recordApiHits(swept.pages, swept.usage);
      next.currentFetchedAt = now;
      next.pagesPerRefresh = swept.pages;
      next.matches = mergeMatches(next.matches, swept.matches, now);
      next.matches
        .filter(m => isInEndWindow(matchStartMs(m), m.matchType, now))
        .forEach(m => { next.endCheckedAt[m.id] = now; });
    } else if (endPlan.ids.length > 0) {
      const results = await Promise.all(endPlan.ids.map(fetchMatchInfo));
      await recordApiHits(results.length, results.map(r => r.usage).filter(Boolean).pop());
      next.matches = mergeMatches(next.matches, results.flatMap(r => (r.match ? [r.match] : [])), now);
      endPlan.ids.forEach(id => { next.endCheckedAt[id] = now; });
    }

    // ④ Save
    const wasEnded = new Set(snapshot.matches.filter(m => m.matchEnded).map(m => m.id));
    const endedNow = next.matches.filter(m => m.matchEnded && !wasEnded.has(m.id));
    const open = new Set(next.matches.filter(m => !m.matchEnded).map(m => m.id));
    next.endCheckedAt = Object.fromEntries(Object.entries(next.endCheckedAt).filter(([id]) => open.has(id)));
    next.updatedAt = now;
    await saveSnapshot(next);
    await saveLiveScores(next.matches);
    if (endedNow.length > 0) {
      logger.info(`[Master] 🏁 Ended: ${endedNow.map(m => m.name).join(' | ')}`);
    }

    // ⑤ Notifications — live/soon on fresh sweeps (throttled), results immediately
    if (swept && swept.matches.length > 0) {
      const nearby = next.matches.filter(m => {
        const start = matchStartMs(m);
        return Number.isNaN(start) || Math.abs(start - now) <= 24 * 60 * 60 * 1000;
      });
      await checkAndNotify(nearby, predict);
    }
    if (endedNow.length > 0) {
      await checkAndNotify(endedNow, predict, { bypassThrottle: true });
    }

    logger.info(
      `[Master] ✅ Done — live: ${next.matches.filter(m => isLive(m, now)).length}/${next.matches.length}`
    );

  } catch (error) {
    logger.error('[Master] ❌ Failed:', error);
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  predictMatch
// ────────────────────────────────────────────────────────────────────────────
export async function predictMatch(body: PredictRequest): Promise<PredictionResponse> {
  const startedAt = Date.now();
  try {
    logger.info('Received prediction request', body);

    const {
      matchId, teamA, teamB, date, tournament,
      matchType, venue, status, matchEnded, scoreText, squads,
    } = body;

    const predictionDate = date || new Date().toISOString().slice(0, 10);
    const groqKey = process.env.GROQ_API_KEY?.trim();
    if (!groqKey) throw new Error('GROQ_API_KEY is not configured');
    const model = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b';
    const effort = process.env.GROQ_REASONING_EFFORT?.trim() || 'low';
    if (!['low', 'medium', 'high'].includes(effort)) {
      throw new Error('GROQ_REASONING_EFFORT must be low, medium, or high');
    }

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
        Squads:
        ${squads || 'Not available'}

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
          - Be between 70–100 words
          - Be specific and match-aware
          - Mention score, overs, pitch, or team strengths
          - Sound like a TV cricket analyst
          - If squads are given, name the key players who decide the match
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
        model,
        // These controls are supported by GPT-OSS; do not send them to unrelated models.
        ...(model === 'openai/gpt-oss-20b' || model === 'openai/gpt-oss-120b'
          ? { reasoning_effort: effort, include_reasoning: false } : {}),
        max_completion_tokens: 1536,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a cricket prediction AI.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      },
      {
        timeout: 25000,
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
    if (axios.isAxiosError(error)) {
      // Keep credentials and raw request/response payloads out of logs.
      const upstreamCode = error.response?.data?.error?.code || error.code;
      logger.error('Prediction failed', {
        status: error.response?.status,
        durationMs: Date.now() - startedAt,
        code: typeof upstreamCode === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(upstreamCode)
          ? upstreamCode : undefined,
        model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b',
      });
    } else {
      logger.error('Prediction failed', error);
    }
    throw new Error('Prediction failed');
  }
}


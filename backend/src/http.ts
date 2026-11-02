import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';
import { PredictionRateLimitedError } from './predictionCache';
import { MatchDetailUnavailableError } from './errors';

interface Dependencies {
  // Legacy: app versions before GET /matches call CricAPI with this key. Omit to disable.
  getKey?: () => string;
  predict: (data: any) => Promise<unknown>;
  getMatches?: () => Promise<{ matches: unknown[]; updatedAt: number }>;
  getMatchDetail?: (kind: 'scorecard' | 'squad', matchId: string) => Promise<unknown>;
  onActivity?: () => void;
  appAdsTxt?: string;
}
function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage): Promise<any> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) throw new Error('body-too-large');
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createApiServer(deps: Dependencies) {
  // The matches payload is the same for every user until the snapshot changes.
  let matchesBody: { updatedAt: number; json: Buffer; gzip: Buffer } | null = null;
  return createServer(async (req, res) => {
    const path = (req.url || '').split('?')[0];
    if (req.method === 'GET' && path === '/health') {
      reply(res, 200, { status: 'ok' });
      return;
    }
    if (req.method === 'GET' && path === '/app-ads.txt' && deps.appAdsTxt) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      res.end(deps.appAdsTxt);
      return;
    }
    if (req.method === 'GET' && path === '/matches' && deps.getMatches) {
      deps.onActivity?.();
      try {
        const snapshot = await deps.getMatches();
        if (matchesBody?.updatedAt !== snapshot.updatedAt) {
          const json = Buffer.from(JSON.stringify(snapshot));
          matchesBody = { updatedAt: snapshot.updatedAt, json, gzip: gzipSync(json) };
        }
        const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60',
          Vary: 'Accept-Encoding',
          ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
        });
        res.end(gzip ? matchesBody.gzip : matchesBody.json);
      } catch {
        reply(res, 503, { error: 'Matches unavailable; try again shortly' });
      }
      return;
    }
    const detail = path.match(/^\/matches\/([A-Za-z0-9-]{1,64})\/(scorecard|squad)$/);
    if (req.method === 'GET' && detail && deps.getMatchDetail) {
      try {
        const data = await deps.getMatchDetail(detail[2] as 'scorecard' | 'squad', detail[1]);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' });
        res.end(JSON.stringify({ data }));
      } catch (error) {
        reply(res, error instanceof MatchDetailUnavailableError ? 404 : 503,
          { error: `${detail[2] === 'squad' ? 'Squads' : 'Scorecard'} not available yet` });
      }
      return;
    }
    if (req.method === 'GET' && path === '/config/cric-api' && deps.getKey) {
      try {
        reply(res, 200, { apiKey: deps.getKey() });
      } catch {
        reply(res, 503, { error: 'Cric API configuration unavailable' });
      }
      return;
    }
    if (path !== '/predictMatch') {
      reply(res, 404, { error: 'Not found' });
      return;
    }
    if (req.method !== 'POST') {
      reply(res, 405, { error: 'Use POST' });
      return;
    }
    if (!req.headers['content-type']?.includes('application/json')) {
      reply(res, 415, { error: 'Use application/json' });
      return;
    }
    try {
      let body;
      try {
        body = await readBody(req);
      } catch (error) {
        reply(res, error instanceof Error && error.message === 'body-too-large' ? 413 : 400,
          { error: 'Invalid request body' });
        return;
      }
      const data = body?.data;
      const required = ['matchId', 'teamA', 'teamB'];
      const strings = [...required, 'date', 'tournament', 'matchType', 'venue', 'status', 'scoreText'];
      if (!data || typeof data !== 'object' || Array.isArray(data) ||
          required.some(key => typeof data[key] !== 'string' || !data[key].trim()) ||
          strings.some(key => data[key] !== undefined &&
            (typeof data[key] !== 'string' || data[key].length > 2000)) ||
          (data.matchEnded !== undefined && typeof data.matchEnded !== 'boolean')) {
        reply(res, 400, { error: 'Invalid match details' });
        return;
      }
      // Keep the existing callable-style request/response contract for the app.
      reply(res, 200, { result: await deps.predict(data) });
    } catch (error) {
      if (error instanceof PredictionRateLimitedError) {
        reply(res, 429, { error: 'Too many prediction requests; try again shortly' });
      } else {
        reply(res, 502, { error: 'Prediction failed; please try again' });
      }
    }
  });
}

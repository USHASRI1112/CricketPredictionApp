import { createServer, IncomingMessage, ServerResponse } from 'node:http';

interface Dependencies {
  getKey: () => string;
  predict: (data: any) => Promise<unknown>;
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
  let activePredictions = 0;
  let windowStart = Date.now();
  let predictionCount = 0;
  return createServer(async (req, res) => {
    const path = (req.url || '').split('?')[0];
    if (req.method === 'GET' && path === '/health') {
      reply(res, 200, { status: 'ok' });
      return;
    }
    if (req.method === 'GET' && path === '/config/cric-api') {
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
    if (Date.now() - windowStart >= 60000) {
      windowStart = Date.now();
      predictionCount = 0;
    }
    // Global per-process guard protects the paid AI API without trusting client IP headers.
    if (activePredictions >= 5 || predictionCount >= 30) {
      reply(res, 429, { error: 'Too many prediction requests; try again shortly' });
      return;
    }
    predictionCount++;
    activePredictions++;
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
    } catch {
      reply(res, 502, { error: 'Prediction failed; please try again' });
    } finally {
      activePredictions--;
    }
  });
}

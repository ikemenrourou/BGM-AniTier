import { createStateFile } from './src/lib/stateFile';
import { fetchBangumiSubjectDetails } from './src/lib/bangumiDeepData';
import { fetchSeasonalSubjects } from './src/lib/bangumiSeasonal';
import { handlePublicComments } from './cloudflare/pages/_worker.js';
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { resolveGeminiModel } from './src/lib/tierLogic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BANGUMI_API_BASE = 'https://api.bgm.tv';
const BANGUMI_USER_AGENT = 'ikemenrourou/BGM-AniTier/2.6.0 (https://github.com/ikemenrourou/BGM-AniTier)';
const FALLBACK_BGM_TOKEN = process.env.BGM_ACCESS_TOKEN || ''; 

const DATA_DIR = process.env.BGM_DATA_DIR || path.resolve(__dirname, '.data');
const stateFile = createStateFile(path.join(DATA_DIR, 'user-state.json'));
const readPersistedState = stateFile.read;

/**
 * Resolves the active Bangumi Access Token so R18 / NSFW subjects, covers, and searches authenticate properly.
 */
function getActiveBangumiToken(explicitToken?: string): string {
  if (explicitToken && typeof explicitToken === 'string' && explicitToken.trim()) {
    return explicitToken.trim();
  }
  const state = readPersistedState();
  const savedToken = state?.bgmSyncConfig?.token;
  if (savedToken && typeof savedToken === 'string' && savedToken.trim()) {
    return savedToken.trim();
  }
  return FALLBACK_BGM_TOKEN;
}

function getBangumiHeaders(explicitToken?: string, includeJsonContentType = false): Record<string, string> {
  const token = getActiveBangumiToken(explicitToken);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': BANGUMI_USER_AGENT,
  };
  if (includeJsonContentType) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function getGenAIClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const DEFAULT_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use('/api/storage/state', express.json({ limit: process.env.STORAGE_BODY_LIMIT || '200mb' }));
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/storage/state', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json({ state: readPersistedState(), persistent: true, storageVersion: 1 }); }
    catch { res.status(500).json({ error: '存档文件读取失败，已保留原始文件。' }); }
  });

  app.post('/api/storage/state', (req, res) => {
    try {
      stateFile.write(req.body);
      res.json({ ok: true, persistent: true, storageVersion: 1 });
    } catch (error) {
      const status = (error as { status?: number }).status || 500;
      res.status(status).json({ ok: false, error: status === 409 ? '存档已被更新，请刷新后重试' : '写入失败，旧存档已保留' });
    }
  });

  app.get('/api/public-comments/:kind/:id', async (req, res) => {
    const response = await handlePublicComments(new Request('http://localhost' + req.originalUrl));
    res.status(response.status).set('Content-Type', 'application/json').send(await response.text());
  });

  // Proxy Bangumi v0 search API (includes Authorization header so R18 / NSFW works are also searchable,
  // and supports full-quarter multi-page seasonal search via seasonalYear + seasonalMonth)
  app.post('/api/bangumi/search', async (req, res) => {
    try {
      const {
        keyword = '',
        tag = '',
        subjectType = 2,
        limit = 50,
        offset = 0,
        seasonalYear,
        seasonalMonth,
        token,
      } = req.body || {};

      const headers = getBangumiHeaders(token, true);

      if (seasonalYear && seasonalMonth) {
        return res.json(await fetchSeasonalSubjects({ year: Number(seasonalYear), month: Number(seasonalMonth), headers }));
      }

      const typeArray = Array.isArray(subjectType)
        ? subjectType.map(Number).filter(Boolean)
        : [Number(subjectType) || 2];
      const filter: Record<string, unknown> = { type: typeArray, nsfw: true };
      if (tag && typeof tag === 'string' && tag.trim()) {
        filter.tag = [tag.trim()];
      }

      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 50);
      const bgmRes = await fetch(
        `${BANGUMI_API_BASE}/v0/search/subjects?limit=${safeLimit}&offset=${Number(offset) || 0}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            keyword: typeof keyword === 'string' ? keyword.trim() : '',
            filter,
            sort: 'match',
          }),
        },
      );

      if (!bgmRes.ok) {
        return res.status(bgmRes.status).json({ error: `Bangumi API error: ${bgmRes.status}` });
      }

      const data = await bgmRes.json();
      return res.json(data);
    } catch (error) {
      console.error('Bangumi search proxy error:', error);
      return res.status(502).json({ error: 'Failed to reach Bangumi API' });
    }
  });

  // Fetch user profile & collections using Bangumi Access Token, with optional `daysLimit` filter on `updated_at`
  app.post('/api/bangumi/me-collections', async (req, res) => {
    try {
      const {
        token = '',
        username: fallbackUsername = '',
        subjectTypes = [2], // 2=动画, 1=书籍, 4=游戏
        collectionTypes = [3, 2], // 3=在看/在玩, 2=看过/玩过, 1=想看
        limitPerQuery = 36,
        daysLimit = 0, // 0 = no time limit; >0 = only entries updated within the last N days
      } = req.body || {};

      const activeToken = getActiveBangumiToken(token);
      const authHeaders = getBangumiHeaders(activeToken);

      let resolvedUsername = typeof fallbackUsername === 'string' ? fallbackUsername.trim() : '';
      let userProfile: { id?: number; username: string; nickname: string; avatar?: string } | null = null;

      if (resolvedUsername) {
        const uRes = await fetch(`${BANGUMI_API_BASE}/v0/users/${encodeURIComponent(resolvedUsername)}`, {
          method: 'GET',
          headers: authHeaders,
        });
        if (uRes.ok) {
          const uData = await uRes.json();
          resolvedUsername = String(uData.username || uData.id || resolvedUsername);
          userProfile = {
            id: uData.id,
            username: resolvedUsername,
            nickname: uData.nickname || resolvedUsername,
            avatar: uData.avatar?.large || uData.avatar?.medium || '',
          };
        }
      } else if (activeToken) {
        const meRes = await fetch(`${BANGUMI_API_BASE}/v0/me`, {
          method: 'GET',
          headers: authHeaders,
        });
        if (!meRes.ok) {
          return res.status(meRes.status).json({
            error: `Bangumi Token 验证失败 (${meRes.status})，请检查 Token 是否有效`,
          });
        }
        const meData = await meRes.json();
        resolvedUsername = String(meData.username || meData.id || '');
        userProfile = {
          id: meData.id,
          username: resolvedUsername,
          nickname: meData.nickname || resolvedUsername,
          avatar: meData.avatar?.large || meData.avatar?.medium || '',
        };
      }

      if (!resolvedUsername) {
        return res.status(400).json({ error: '请填写有效的 Bangumi Token 或用户名/UID' });
      }

      const sTypes: number[] = Array.isArray(subjectTypes) && subjectTypes.length > 0
        ? subjectTypes.map(Number)
        : [2];
      const cTypes: number[] = Array.isArray(collectionTypes) && collectionTypes.length > 0
        ? collectionTypes.map(Number)
        : [3, 2];

      const rawItems: any[] = [];
      const limit = Math.min(Math.max(Number(limitPerQuery) || 36, 5), 50);

      for (const sType of sTypes) {
        for (const cType of cTypes) {
          const url = `${BANGUMI_API_BASE}/v0/users/${encodeURIComponent(
            resolvedUsername,
          )}/collections?subject_type=${sType}&type=${cType}&limit=${limit}&offset=0`;
          const colRes = await fetch(url, {
            method: 'GET',
            headers: authHeaders,
          });
          if (colRes.ok) {
            const colJson = await colRes.json();
            if (Array.isArray(colJson.data)) {
              rawItems.push(
                ...colJson.data.map((item: any) => ({
                  ...item,
                  subject_type: sType,
                  collection_type: cType,
                })),
              );
            }
          }
        }
      }

      // Deduplicate by subject_id and sort by updated_at descending
      const seen = new Set<number>();
      let deduped = rawItems
        .sort((a, b) => {
          const tA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const tB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return tB - tA;
        })
        .filter(item => {
          const sid = Number(item.subject_id || item.subject?.id);
          if (!sid || seen.has(sid)) return false;
          seen.add(sid);
          return true;
        });

      const totalBeforeDateFilter = deduped.length;
      const numericDays = Number(daysLimit) || 0;
      if (numericDays > 0) {
        const cutoffMs = Date.now() - numericDays * 86400 * 1000;
        deduped = deduped.filter(item => {
          if (!item.updated_at) return false;
          const updatedMs = new Date(item.updated_at).getTime();
          return !Number.isNaN(updatedMs) && updatedMs >= cutoffMs;
        });
      }

      return res.json({
        user: userProfile || { username: resolvedUsername, nickname: resolvedUsername },
        data: deduped,
        total: deduped.length,
        totalBeforeDateFilter,
      });
    } catch (error) {
      console.error('Bangumi collections sync error:', error);
      return res.status(502).json({
        error: error instanceof Error ? error.message : '连接 Bangumi 收藏接口失败',
      });
    }
  });

  // Push / Update user collection status, score, and optional comment on Bangumi (POST /v0/users/-/collections/:subject_id)
  app.post('/api/bangumi/push-collection', async (req, res) => {
    try {
      const {
        token = '',
        subjectId,
        type = 2, // 1=想看/想玩/想读, 2=看过/玩过/读过, 3=在看/在玩/在读, 4=搁置, 5=抛弃
        rate,
        comment,
        isPrivate = false,
      } = req.body || {};

      const sid = Number(subjectId);
      if (!sid || sid <= 0) {
        return res.status(400).json({ error: '无效的 Bangumi 条目 ID' });
      }

      const activeToken = getActiveBangumiToken(token);
      if (!activeToken) {
        return res.status(401).json({ error: '请先填写具有写入权限的 Bangumi Access Token' });
      }

      const payload: Record<string, unknown> = {
        type: [1, 2, 3, 4, 5].includes(Number(type)) ? Number(type) : 2,
        private: Boolean(isPrivate),
      };

      if (typeof rate === 'number' && !Number.isNaN(rate) && rate >= 1 && rate <= 10) {
        payload.rate = Math.round(rate);
      }
      if (typeof comment === 'string' && comment.trim().length > 0) {
        payload.comment = comment.trim().slice(0, 380);
      }

      const bgmRes = await fetch(`${BANGUMI_API_BASE}/v0/users/-/collections/${sid}`, {
        method: 'POST',
        headers: getBangumiHeaders(activeToken, true),
        body: JSON.stringify(payload),
      });

      if (!bgmRes.ok && bgmRes.status !== 202 && bgmRes.status !== 204) {
        const errText = await bgmRes.text().catch(() => '');
        return res.status(bgmRes.status).json({
          error: `同步到 Bangumi 失败 (${bgmRes.status}): ${errText.slice(0, 140) || '请确认 Token 具有修改收藏权限'}`,
        });
      }

      return res.json({
        ok: true,
        subjectId: sid,
        type: payload.type,
        rate: payload.rate,
      });
    } catch (error) {
      console.error('Bangumi push collection error:', error);
      return res.status(502).json({
        error: error instanceof Error ? error.message : '连接 Bangumi 写入接口失败',
      });
    }
  });

  // Proxy Bangumi v0 subject detail API (with Bearer token so R18 subjects return full metadata)
  app.get('/api/bangumi/subject/:id', async (req, res) => {
    try {
      const subjectId = Number(req.params.id);
      if (!subjectId) {
        return res.status(400).json({ error: 'Invalid subject ID' });
      }

      const bgmRes = await fetch(`${BANGUMI_API_BASE}/v0/subjects/${subjectId}`, {
        method: 'GET',
        headers: getBangumiHeaders(),
      });

      if (!bgmRes.ok) {
        return res.status(bgmRes.status).json({ error: `Bangumi subject error: ${bgmRes.status}` });
      }

      const data = await bgmRes.json();
      return res.json(data);
    } catch (error) {
      console.error('Bangumi subject proxy error:', error);
      return res.status(502).json({ error: 'Failed to reach Bangumi subject API' });
    }
  });

  // In-memory cache for deep subject metadata (subject detail + main characters + character stats/comments + subject netizen comments)
  const deepSubjectCache = new Map<number, { ts: number; payload: any }>();

  app.get('/api/bangumi/subject-deep/:id', async (req, res) => {
    try {
      const subjectId = Number(req.params.id);
      if (!subjectId) {
        return res.status(400).json({ error: 'Invalid subject ID' });
      }

      const cached = deepSubjectCache.get(subjectId);
      if (!req.query.refresh && cached && Date.now() - cached.ts < 1000 * 60 * 60 * 6) {
        return res.json(cached.payload);
      }

      const headers = getBangumiHeaders();

      const payload = await fetchBangumiSubjectDetails(subjectId, url =>
        fetch(url, { headers: url.startsWith('https://next.bgm.tv/') ? { Accept: 'application/json', 'User-Agent': BANGUMI_USER_AGENT } : headers, signal: AbortSignal.timeout(10000) })
          .then(response => response.ok ? response.json() : null),
      );
      if (!payload) return res.status(404).json({ error: 'Subject not found' });

      deepSubjectCache.set(subjectId, { ts: Date.now(), payload });
      return res.json(payload);
    } catch (error) {
      console.error('Bangumi deep subject proxy error:', error);
      return res.status(502).json({ error: 'Failed to fetch deep Bangumi data' });
    }
  });

  // Proxy Bangumi v0 subject cover image WITH Authorization Bearer token so R18 / NSFW covers never 404!
  app.get('/api/bangumi/cover/:id', async (req, res) => {
    try {
      const subjectId = Number(req.params.id);
      const fallbackImgUrl = typeof req.query.img === 'string' ? req.query.img.trim() : '';

      const authHeaders: Record<string, string> = {
        'User-Agent': BANGUMI_USER_AGENT,
      };
      const activeToken = getActiveBangumiToken();
      if (activeToken) {
        authHeaders.Authorization = `Bearer ${activeToken}`;
      }

      let imgRes: Response | null = null;

      // If direct CDN URL was passed via ?img=https://lain.bgm.tv/..., try it first for speed
      if (fallbackImgUrl && /^https:\/\/lain\.bgm\.tv\//i.test(fallbackImgUrl)) {
        imgRes = await fetch(fallbackImgUrl, {
          method: 'GET',
          headers: { 'User-Agent': BANGUMI_USER_AGENT },
          redirect: 'follow',
        });
      }

      if (!imgRes || !imgRes.ok) {
        if (!subjectId) {
          return res.status(400).end();
        }
        imgRes = await fetch(`${BANGUMI_API_BASE}/v0/subjects/${subjectId}/image?type=common`, {
          method: 'GET',
          headers: authHeaders,
          redirect: 'follow',
        });
      }

      if (!imgRes.ok) {
        return res.status(imgRes.status).end();
      }

      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const arrayBuffer = await imgRes.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error('Bangumi cover proxy error:', error);
      return res.status(502).end();
    }
  });

  // Server-side Gemini API (unary)
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const { prompt, model } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const ai = getGenAIClient();
      const modelName = resolveGeminiModel(model);

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          safetySettings: DEFAULT_SAFETY_SETTINGS,
          temperature: 1.05,
          topK: 40,
          topP: 0.95,
        },
      });

      const text = response.text;
      if (!text) {
        return res.status(500).json({ error: 'API返回内容为空' });
      }

      return res.json({ text });
    } catch (error) {
      console.error('Gemini generate error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Gemini API request failed',
      });
    }
  });

  // Server-side Gemini API (SSE streaming)
  app.post('/api/gemini/stream', async (req, res) => {
    try {
      const { prompt, model } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      const ai = getGenAIClient();
      const modelName = resolveGeminiModel(model);

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents: prompt,
        config: {
          safetySettings: DEFAULT_SAFETY_SETTINGS,
          temperature: 1.05,
          topK: 40,
          topP: 0.95,
        },
      });

      for await (const chunk of responseStream) {
        const chunkText = chunk.text;
        if (chunkText) {
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error('Gemini stream error:', error);
      const message = error instanceof Error ? error.message : 'Gemini stream failed';
      if (!res.headersSent) {
        return res.status(500).json({ error: message });
      }
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  });

  // Custom OpenAI-compatible BaseURL proxy route (DeepSeek / OpenAI / OpenRouter / Custom Proxy)
  app.post('/api/ai/custom-stream', async (req, res) => {
    try {
      const { baseUrl, apiKey, model, prompt } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Prompt 不能为空' });
      }
      if (!baseUrl || typeof baseUrl !== 'string') {
        return res.status(400).json({ error: '请填写自定义 API Base URL' });
      }

      const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
      const endpoint = normalizedBase.endsWith('/chat/completions')
        ? normalizedBase
        : `${normalizedBase}/chat/completions`;

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const upstreamRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${String(apiKey).trim()}` } : {}),
        },
        body: JSON.stringify({
          model: model?.trim() || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          temperature: 0.95,
        }),
      });

      if (!upstreamRes.ok || !upstreamRes.body) {
        const errText = await upstreamRes.text().catch(() => '');
        res.write(
          `data: ${JSON.stringify({
            error: `上游接口返回错误 (${upstreamRes.status}): ${errText.slice(0, 180)}`,
          })}\n\n`,
        );
        return res.end();
      }

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            const delta =
              parsed.choices?.[0]?.delta?.content ??
              parsed.choices?.[0]?.message?.content ??
              '';
            if (delta) {
              res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
            }
          } catch {
            // ignore partial JSON chunks
          }
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : '自定义 API 请求失败';
      if (!res.headersSent) {
        return res.status(500).json({ error: message });
      }
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  });

  // Fetch available models from custom OpenAI/Gemini-compatible BaseURL
  app.post('/api/ai/models', async (req, res) => {
    try {
      const { baseUrl, apiKey } = req.body || {};
      if (!baseUrl || typeof baseUrl !== 'string') {
        return res.status(400).json({ error: '请先填写 API Base URL' });
      }

      const normalizedBase = baseUrl
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/chat\/completions$/i, '');
      const modelsEndpoint = `${normalizedBase}/models`;

      const upstreamRes = await fetch(modelsEndpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${String(apiKey).trim()}` } : {}),
        },
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => '');
        return res.status(upstreamRes.status).json({
          error: `拉取模型失败 (${upstreamRes.status}): ${errText.slice(0, 160)}`,
        });
      }

      const data = await upstreamRes.json();
      const rawList = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
        ? data.models
        : [];

      const models: string[] = [];
      for (const item of rawList) {
        const rawId =
          typeof item === 'string'
            ? item
            : typeof item?.id === 'string'
            ? item.id
            : typeof item?.name === 'string'
            ? item.name
            : '';
        const cleaned = rawId.replace(/^models\//i, '').trim();
        if (cleaned && !models.includes(cleaned)) {
          models.push(cleaned);
        }
      }

      return res.json({ models });
    } catch (error) {
      return res.status(502).json({
        error: error instanceof Error ? error.message : '拉取模型列表失败',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const host = process.env.HOST || '127.0.0.1';
  app.listen(PORT, host, () => {
    console.log(`Server listening on http://${host}:${PORT}`);
  });
}

startServer();

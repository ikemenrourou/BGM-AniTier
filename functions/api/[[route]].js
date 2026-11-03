import { fetchSeasonalSubjects } from '../../src/lib/bangumiSeasonal.ts';
import { fetchBangumiSubjectDetails } from '../../src/lib/bangumiDeepData.ts';

/**
 * Cloudflare Pages Functions catch-all handler for `/api/*`
 * When deployed to Cloudflare Pages (Build command: `npm run build`, Output dir: `dist`),
 * this function automatically handles:
 * - `/api/bangumi/cover/:id` (with CORS headers & Bearer token fallback for R18 covers)
 * - `/api/bangumi/subject/:id` & `/api/bangumi/subject-deep/:id`
 * - `/api/bangumi/me-collections` (deduplicated & sorted by updated_at)
 * - `/api/bangumi/search` (including full-quarter 4-way parallel seasonal anime aggregation)
 * - `/api/ai/models` & `/api/ai/custom-stream`
 * - `/api/gemini/stream` & `/api/gemini/generate` (supports Cloudflare env `GEMINI_API_KEY` or `DEFAULT_AI_API_KEY` + `DEFAULT_AI_BASE_URL` for zero-config sharing with friends)
 */
const BGM_USER_AGENT = 'ikemenrourou/BGM-AniTier/2.6.0 (https://github.com/ikemenrourou/BGM-AniTier)';
const DEFAULT_BGM_TOKEN = ''; 

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getBgmToken(env, explicitToken) {
  if (explicitToken && typeof explicitToken === 'string' && explicitToken.trim()) {
    return explicitToken.trim();
  }
  if (env && typeof env.BGM_ACCESS_TOKEN === 'string' && env.BGM_ACCESS_TOKEN.trim()) {
    return env.BGM_ACCESS_TOKEN.trim();
  }
  return DEFAULT_BGM_TOKEN;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (path === '/api/health') {
    return new Response(JSON.stringify({ status: 'ok', runtime: 'cloudflare-pages-functions' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  // 1. Cover Image CORS Proxy: /api/bangumi/cover/:id
  const coverMatch = path.match(/^\/api\/bangumi\/cover\/(\d+)$/);
  if (coverMatch && request.method === 'GET') {
    const subjectId = coverMatch[1];
    const directImg = (url.searchParams.get('img') || '').trim();
    const activeToken = getBgmToken(env);

    try {
      let upstream = null;
      if (directImg && /^https:\/\/lain\.bgm\.tv\//i.test(directImg)) {
        upstream = await fetch(directImg, {
          headers: { 'User-Agent': BGM_USER_AGENT },
          redirect: 'follow',
        });
      }

      if (!upstream || !upstream.ok) {
        upstream = await fetch(`https://api.bgm.tv/v0/subjects/${subjectId}/image?type=common`, {
          headers: {
            'User-Agent': BGM_USER_AGENT,
            ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
          },
          redirect: 'follow',
        });
      }

      if (!upstream.ok) {
        return new Response('Cover not found', { status: 404, headers: CORS_HEADERS });
      }
      const headers = new Headers(CORS_HEADERS);
      headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=604800, immutable');
      return new Response(upstream.body, { status: 200, headers });
    } catch {
      return new Response('Cover proxy error', { status: 502, headers: CORS_HEADERS });
    }
  }

  // 2. Bangumi Subject Detail Proxy: /api/bangumi/subject/:id
  const subjectMatch = path.match(/^\/api\/bangumi\/subject\/(\d+)$/);
  if (subjectMatch && request.method === 'GET') {
    const subjectId = subjectMatch[1];
    const activeToken = getBgmToken(env);
    try {
      const upstream = await fetch(`https://api.bgm.tv/v0/subjects/${subjectId}`, {
        headers: {
          'User-Agent': BGM_USER_AGENT,
          Accept: 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
      });
      const data = await upstream.json().catch(() => ({}));
      return new Response(JSON.stringify(data), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  }

  // 2b. Bangumi Deep Subject Metadata Proxy: /api/bangumi/subject-deep/:id
  const deepMatch = path.match(/^\/api\/bangumi\/subject-deep\/(\d+)$/);
  if (deepMatch && request.method === 'GET') {
    const subjectId = deepMatch[1];
    const activeToken = getBgmToken(env);
    const headers = {
      'User-Agent': BGM_USER_AGENT,
      Accept: 'application/json',
      Authorization: `Bearer ${activeToken}`,
    };
    try {
      const payload = await fetchBangumiSubjectDetails(subjectId, url =>
        fetch(url, { headers, signal: AbortSignal.timeout(10000) })
          .then(response => response.ok ? response.json() : null),
      );
      return new Response(JSON.stringify(payload || { error: 'Subject not found' }), {
        status: payload ? 200 : 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  }

  // 3. Bangumi Personal Collections Proxy: /api/bangumi/me-collections
  if (path === '/api/bangumi/me-collections' && request.method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const cleanToken = getBgmToken(env, body.token);
      const authHeaders = {
        'User-Agent': BGM_USER_AGENT,
        Accept: 'application/json',
        ...(cleanToken ? { Authorization: `Bearer ${cleanToken}` } : {}),
      };
      let resolvedUsername = String(body.username || '').trim();
      let nickname = resolvedUsername;
      let avatar = '';

      if (resolvedUsername) {
        const uRes = await fetch(`https://api.bgm.tv/v0/users/${encodeURIComponent(resolvedUsername)}`, {
          headers: authHeaders,
        });
        if (uRes.ok) {
          const uData = await uRes.json();
          resolvedUsername = String(uData.username || uData.id || resolvedUsername);
          nickname = String(uData.nickname || resolvedUsername);
          avatar = uData.avatar?.large || uData.avatar?.medium || '';
        }
      } else if (cleanToken) {
        const meRes = await fetch('https://api.bgm.tv/v0/me', { headers: authHeaders });
        if (!meRes.ok) {
          return new Response(
            JSON.stringify({
              error: `Bangumi Token 验证失败 (${meRes.status})，请检查 Token 是否有效`,
            }),
            {
              status: meRes.status,
              headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
            },
          );
        }
        const meData = await meRes.json();
        resolvedUsername = String(meData.username || meData.id || resolvedUsername);
        nickname = String(meData.nickname || resolvedUsername);
        avatar = meData.avatar?.large || meData.avatar?.medium || '';
      }
      if (!resolvedUsername) {
        return new Response(JSON.stringify({ error: '请提供有效的 Bangumi Token 或用户名/UID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      const sTypes =
        Array.isArray(body.subjectTypes) && body.subjectTypes.length > 0
          ? body.subjectTypes
          : [2];
      const cTypes =
        Array.isArray(body.collectionTypes) && body.collectionTypes.length > 0
          ? body.collectionTypes
          : [3, 2];
      const perQuery = Math.min(Math.max(Number(body.limitPerQuery) || 36, 5), 50);

      const tasks = [];
      for (const st of sTypes) {
        for (const ct of cTypes) {
          const u = `https://api.bgm.tv/v0/users/${encodeURIComponent(
            resolvedUsername,
          )}/collections?subject_type=${Number(st)}&type=${Number(ct)}&limit=${perQuery}&offset=0`;
          tasks.push(
            fetch(u, { headers: authHeaders })
              .then(async r => {
                if (!r.ok) return [];
                const d = await r.json();
                return Array.isArray(d.data)
                  ? d.data.map(item => ({
                      ...item,
                      subject_type: Number(st),
                      collection_type: Number(ct),
                    }))
                  : [];
              })
              .catch(() => []),
          );
        }
      }
      const results = await Promise.all(tasks);
      const rawItems = results.flat();

      // Deduplicate by subject_id and sort by updated_at descending
      const seen = new Set();
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
      const days = Number(body.daysLimit) || 0;
      if (days > 0) {
        const cutoffMs = Date.now() - days * 86400 * 1000;
        deduped = deduped.filter(entry => {
          if (!entry.updated_at) return false;
          const updatedMs = new Date(entry.updated_at).getTime();
          return !Number.isNaN(updatedMs) && updatedMs >= cutoffMs;
        });
      }

      return new Response(
        JSON.stringify({
          user: { username: resolvedUsername, nickname, avatar },
          data: deduped,
          total: deduped.length,
          totalBeforeDateFilter,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        },
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  }

  // 3b. Push / Update user collection status, score, and optional comment on Bangumi: /api/bangumi/push-collection
  if (path === '/api/bangumi/push-collection' && request.method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const {
        token = '',
        subjectId,
        type = 2, // 1=想看, 2=看过, 3=在看, 4=搁置, 5=抛弃
        rate,
        comment,
        isPrivate = false,
      } = body;

      const sid = Number(subjectId);
      if (!sid || sid <= 0) {
        return new Response(JSON.stringify({ error: '无效的 Bangumi 条目 ID' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }

      const activeToken = getBgmToken(env, token);
      if (!activeToken) {
        return new Response(
          JSON.stringify({ error: '请先填写具有写入权限的 Bangumi Access Token' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          },
        );
      }

      const payload = {
        type: [1, 2, 3, 4, 5].includes(Number(type)) ? Number(type) : 2,
        private: Boolean(isPrivate),
      };
      if (typeof rate === 'number' && !Number.isNaN(rate) && rate >= 1 && rate <= 10) {
        payload.rate = Math.round(rate);
      }
      if (typeof comment === 'string' && comment.trim().length > 0) {
        payload.comment = comment.trim().slice(0, 380);
      }

      const bgmRes = await fetch(`https://api.bgm.tv/v0/users/-/collections/${sid}`, {
        method: 'POST',
        headers: {
          'User-Agent': BGM_USER_AGENT,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!bgmRes.ok && bgmRes.status !== 202 && bgmRes.status !== 204) {
        const errText = await bgmRes.text().catch(() => '');
        return new Response(
          JSON.stringify({
            error: `同步到 Bangumi 失败 (${bgmRes.status}): ${errText.slice(0, 140) || '请确认 Token 具有修改收藏权限'}`,
          }),
          {
            status: bgmRes.status,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          },
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          subjectId: sid,
          type: payload.type,
          rate: payload.rate,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        },
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  }

  // 4. Bangumi Search Proxy: /api/bangumi/search
  if (path === '/api/bangumi/search' && request.method === 'POST') {
    try {
      const body = await request.json().catch(() => ({}));
      const {
        keyword = '',
        tag = '',
        subjectType = 2,
        limit = 50,
        offset = 0,
        seasonalYear,
        seasonalMonth,
        token,
      } = body;

      const activeToken = getBgmToken(env, token);
      const headers = {
        'User-Agent': BGM_USER_AGENT,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${activeToken}`,
      };

      if (seasonalYear && seasonalMonth) {
        const result = await fetchSeasonalSubjects({ year: Number(seasonalYear), month: Number(seasonalMonth), headers });
        return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } });
      }

      const typeFilter = Array.isArray(subjectType)
        ? subjectType.map(Number).filter(n => [1, 2, 4].includes(n))
        : [Number(subjectType) || 2];

      const filterObj = {
        type: typeFilter.length > 0 ? typeFilter : [2],
        nsfw: true,
      };
      if (tag && typeof tag === 'string' && tag.trim()) {
        filterObj.tag = [tag.trim()];
      }

      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 50);
      const upstream = await fetch(
        `https://api.bgm.tv/v0/search/subjects?limit=${safeLimit}&offset=${Number(offset) || 0}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            keyword: keyword ? String(keyword).trim() : '',
            sort: 'match',
            filter: filterObj,
          }),
        },
      );
      const data = await upstream.json().catch(() => ({ data: [], total: 0 }));
      return new Response(JSON.stringify(data), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err), data: [], total: 0 }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  }

  // 5. AI Models Proxy: /api/ai/models
  if (path === '/api/ai/models' && request.method === 'POST') {
    try {
      const { baseUrl, apiKey } = await request.json().catch(() => ({}));
      const cleanBase = String(baseUrl || env?.DEFAULT_AI_BASE_URL || '')
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/chat\/completions$/i, '');
      const cleanKey = String(apiKey || env?.DEFAULT_AI_API_KEY || '').trim();
      const upstream = await fetch(`${cleanBase}/models`, {
        headers: {
          Accept: 'application/json',
          ...(cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {}),
        },
      });
      const data = await upstream.json().catch(() => ({}));
      const rawArr = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.models)
          ? data.models
          : [];
      const models = [];
      for (const item of rawArr) {
        const rawId =
          typeof item === 'string'
            ? item
            : typeof item?.id === 'string'
              ? item.id
              : typeof item?.name === 'string'
                ? item.name
                : '';
        const cleaned = rawId.replace(/^models\//i, '').trim();
        if (cleaned && !models.includes(cleaned)) models.push(cleaned);
      }
      return new Response(JSON.stringify({ models }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  }

  // 6. AI Custom Stream Proxy: /api/ai/custom-stream
  if (path === '/api/ai/custom-stream' && request.method === 'POST') {
    try {
      const { baseUrl, apiKey, model, prompt } = await request.json().catch(() => ({}));
      const resolvedBase = String(baseUrl || env?.DEFAULT_AI_BASE_URL || '').trim().replace(/\/+$/, '');
      const resolvedKey = String(apiKey || env?.DEFAULT_AI_API_KEY || '').trim();
      if (!resolvedBase) {
        return new Response(JSON.stringify({ error: '请填写 API Base URL' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        });
      }
      const endpoint = resolvedBase.endsWith('/chat/completions')
        ? resolvedBase
        : `${resolvedBase}/chat/completions`;
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(resolvedKey ? { Authorization: `Bearer ${resolvedKey}` } : {}),
        },
        body: JSON.stringify({
          model: model || 'gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          temperature: 0.95,
        }),
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  }

  // 7. Server-side Gemini / Default AI Stream fallback (/api/gemini/stream)
  // Allows Cloudflare Pages owner to configure `GEMINI_API_KEY` or `DEFAULT_AI_API_KEY` + `DEFAULT_AI_BASE_URL`
  // so friends can generate AI reports out-of-the-box without entering a key!
  if (path === '/api/gemini/stream' && request.method === 'POST') {
    try {
      const { prompt, model } = await request.json().catch(() => ({}));
      const geminiKey = String(env?.GEMINI_API_KEY || '').trim();
      const defaultAiKey = String(env?.DEFAULT_AI_API_KEY || '').trim();
      const defaultAiBase = String(
        env?.DEFAULT_AI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
      )
        .trim()
        .replace(/\/+$/, '');

      const activeKey = defaultAiKey || geminiKey;
      if (!activeKey) {
        return new Response(
          JSON.stringify({
            error: '未配置服务端默认 API Key，请在页面「API 设置」中填写你的 API Key',
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
          },
        );
      }

      const endpoint = defaultAiBase.endsWith('/chat/completions')
        ? defaultAiBase
        : `${defaultAiBase}/chat/completions`;

      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeKey}`,
        },
        body: JSON.stringify({
          model: model || env?.DEFAULT_AI_MODEL || 'gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }],
          stream: true,
          temperature: 1.0,
        }),
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...CORS_HEADERS,
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  }

  // 8. Storage state stub on serverless edge (each user's browser localStorage is their own independent state!)
  if (path === '/api/storage/state') {
    return new Response(JSON.stringify({ ok: true, state: null, persistent: false, storageVersion: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  return new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

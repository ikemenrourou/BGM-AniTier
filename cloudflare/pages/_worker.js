const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };

/** Public discussions only: fixed upstream, no credentials, writes, or user storage. */
export async function handlePublicComments(request) {
  const url = new URL(request.url);
  const match = /^\/api\/public-comments\/(subjects|characters)\/([1-9]\d{0,8})$/.exec(url.pathname);
  if (!match) return Response.json({ error: '评论接口不存在' }, { status: 404, headers: jsonHeaders });
  if (request.method !== 'GET') return Response.json({ error: '只支持读取公开评论' }, { status: 405, headers: { ...jsonHeaders, Allow: 'GET' } });
  if (request.headers.has('Authorization') || [...url.searchParams.keys()].some(key => key !== 'limit')) {
    return Response.json({ error: '公开评论接口不接受凭证或其他参数' }, { status: 400, headers: jsonHeaders });
  }
  const limit = Math.max(1, Math.min(match[1] === 'subjects' ? 40 : 16, Math.floor(Number(url.searchParams.get('limit'))) || 12));
  const upstream = `https://next.bgm.tv/p1/${match[1]}/${match[2]}/comments?limit=${limit}`;
  try {
    const response = await fetch(upstream, {
      headers: { Accept: 'application/json', 'User-Agent': 'BGM-AniTier/2.0 (public discussion reader)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('upstream');
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(rows)) throw new Error('format');
    const selected = match[1] === 'characters' ? [...rows].sort((a, b) => Number(b.createdAt) - Number(a.createdAt)) : rows;
    const data = selected.filter(item => String(item?.comment || item?.content || '').trim()).slice(0, limit).map(item => ({
      id: item.id,
      content: String(item.content || item.comment || '').slice(0, 2000),
      comment: String(item.comment || item.content || '').slice(0, 2000),
      user: { nickname: String(item.user?.nickname || item.user?.username || 'BGM网友') },
      rate: typeof item.rate === 'number' ? item.rate : undefined,
      type: typeof item.type === 'number' ? item.type : undefined,
    }));
    return Response.json({ data, total: typeof payload.total === 'number' ? payload.total : rows.length }, {
      headers: { ...jsonHeaders, 'Cache-Control': 'public, max-age=300, s-maxage=600' },
    });
  } catch (error) {
    console.warn('Bangumi public comments upstream failed:', error instanceof Error ? error.message : 'unknown error');
    return Response.json({ error: 'Bangumi 公开吐槽暂时读取失败，请稍后刷新。' }, { status: 502, headers: { ...jsonHeaders, 'Cache-Control': 'no-store' } });
  }
}

export default {
  async fetch(request, env, context) {
    if (!new URL(request.url).pathname.startsWith('/api/public-comments/')) return env.ASSETS.fetch(request);
    const cache = caches.default;
    const refresh = /no-cache|no-store/.test(request.headers.get('Cache-Control') || '');
    if (request.method === 'GET' && !request.headers.has('Authorization') && !refresh) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    const response = await handlePublicComments(request);
    if (response.ok) context.waitUntil(cache.put(new Request(request.url), response.clone()).catch(() => {}));
    return response;
  },
};

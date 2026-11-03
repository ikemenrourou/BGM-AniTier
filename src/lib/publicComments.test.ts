import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePublicComments } from '../../cloudflare/pages/_worker.js';

test('relay reads the fixed public upstream without forwarding cookies or visitor headers', async t => {
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://next.bgm.tv/p1/subjects/400602/comments?limit=40');
    const headers = new Headers(init.headers);
    assert.equal(headers.has('Authorization'), false);
    assert.equal(headers.has('Cookie'), false);
    assert.equal(headers.has('X-Visitor-Data'), false);
    assert.equal(init.redirect, 'manual');
    return Response.json({ data: [{ id: 1, comment: '真实公开吐槽', rate: 8, type: 2, user: { nickname: '网友', email: 'private@example.test' }, internal: 'not public output' }], total: 100 });
  });
  const response = await handlePublicComments(new Request('https://app.test/api/public-comments/subjects/400602?limit=1000', { headers: { Cookie: 'local=private', 'X-Visitor-Data': 'private' } }));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.data[0].user, { nickname: '网友' });
  assert.equal(payload.data[0].comment, '真实公开吐槽');
  assert.equal(payload.data[0].internal, undefined);
  assert.equal(payload.total, 100);
});

test('relay rejects credentials, arbitrary URLs, unsupported paths, and writes before any upstream request', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not call'); });
  const requests = [
    new Request('https://app.test/api/public-comments/subjects/1', { headers: { Authorization: 'Bearer test-only' } }),
    new Request('https://app.test/api/public-comments/subjects/1?token=test-only'),
    new Request('https://app.test/api/public-comments/subjects/1?url=https://elsewhere.test'),
    new Request('https://app.test/api/public-comments/users/1'),
    new Request('https://app.test/api/public-comments/characters/0'),
    new Request('https://app.test/api/public-comments/characters/1', { method: 'POST' }),
  ];
  const statuses = await Promise.all(requests.map(async request => (await handlePublicComments(request)).status));
  assert.deepEqual(statuses, [400, 400, 400, 404, 404, 405]);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('character array responses are sorted and capped; upstream failures are never cached as empty success', async t => {
  let failed = false;
  t.mock.method(globalThis, 'fetch', async () => failed ? new Response(null, { status: 503 }) : Response.json([
    { id: 1, content: '较早评论', createdAt: 1 },
    { id: 2, content: '最新留言', createdAt: 3 },
    { id: 3, content: '中间评论', createdAt: 2 },
  ]));
  const request = new Request('https://app.test/api/public-comments/characters/86246?limit=2.9');
  const success = await handlePublicComments(request);
  assert.deepEqual((await success.json()).data.map((row: { id: number }) => row.id), [2, 3]);
  failed = true;
  const failure = await handlePublicComments(request);
  assert.equal(failure.status, 502);
  assert.equal(failure.headers.get('Cache-Control'), 'no-store');
});

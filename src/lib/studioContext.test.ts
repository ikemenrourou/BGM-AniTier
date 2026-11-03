import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStudioSubjectContext, getStudioContextBudget, getCharacterCommentBudget } from './studioContext';
import { fetchBangumiSubjectDetails } from './bangumiDeepData';

test('comment budgets grow with collection counts, with rating counts as fallback', () => {
  assert.equal(getStudioContextBudget({}).subjectComments, 10);
  assert.equal(getStudioContextBudget({ ratingTotal: 1000 }).subjectComments, 16);
  assert.equal(getStudioContextBudget({ collectionStats: { doing: 10000 } }).subjectComments, 24);
  assert.equal(getStudioContextBudget({ collectionStats: { collect: 40000, wish: 10000 } }).subjectComments, 36);
  assert.equal(getCharacterCommentBudget({ commentCount: 1000 }), 12);
  assert.equal(getCharacterCommentBudget({ commentCount: 0, collects: 5000 }), 4);
});

test('prompt includes long biographies and gives more discussed characters more review samples', () => {
  const context = buildStudioSubjectContext({
    id: 123, title: '测试作品', cover: '', ratingTotal: 60000,
    characters: [
      { id: 1, name: '普通角色', commentCount: 20, topComments: Array.from({ length: 14 }, (_, i) => `普通评论${i}`) },
      { id: 2, name: '热门角色', cv: '声优', summary: '介绍'.repeat(300), commentCount: 2000, topComments: Array.from({ length: 14 }, (_, i) => `热门评论${i}`) },
    ],
    bgmNetizenComments: Array.from({ length: 40 }, (_, i) => ({ user: '观众', comment: `作品评论${i}` })),
  });
  assert.ok(context.indexOf('热门角色') < context.indexOf('普通角色'));
  assert.match(context, /声优：声优/);
  assert.ok(context.includes('介绍'.repeat(300)));
  assert.equal((context.match(/热门评论/g) || []).length, 12);
  assert.equal((context.match(/普通评论/g) || []).length, 4);
  assert.equal((context.match(/作品评论/g) || []).length, 36);
});

test('deep fetch supports both discussion shapes, preserves long comments and bounds concurrency', async () => {
  let active = 0;
  let peak = 0;
  const requests: string[] = [];
  const payload = await fetchBangumiSubjectDetails(123, async url => {
    requests.push(url);
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    if (url.endsWith('/subjects/123')) return { id: 123, collection: { collect: 60000 } };
    if (url.endsWith('/subjects/123/characters')) return Array.from({ length: 14 }, (_, i) => ({ id: i + 1, name: `角色${i + 1}`, relation: i < 4 ? '主角' : '配角' }));
    if (url.includes('/subjects/123/comments')) return Array.from({ length: 40 }, (_, i) => ({ comment: `评论${i}`, user: { nickname: '网友' } }));
    if (url.includes('/comments?')) return { data: [{ content: '长评论'.repeat(100) }, { content: '长评论'.repeat(100) }, { content: '第二条评论' }] };
    const id = Number(url.split('/').at(-1));
    return { summary: '角色传记'.repeat(200), stat: { comments: id * 100, collects: id * 10 } };
  });
  assert.ok(payload);
  assert.equal(payload.characters.length, 14);
  assert.equal(requests.filter(url => /\/characters\/\d+\/comments/.test(url)).length, 10);
  assert.equal(payload.characters[0].id, 14);
  assert.equal(payload.characters[0].summary.length, 800);
  assert.equal(payload.characters[0].topComments[0].length, 300);
  assert.equal(payload.characters[0].topComments.length, 2);
  assert.equal(payload.bgmNetizenComments.length, 36);
  assert.ok(requests.some(url => url.endsWith('/characters/14/comments?limit=16')));
  assert.ok(peak <= 4, `Too many simultaneous requests: ${peak}`);
});

test('unavailable comment endpoints keep subject and character biographies without inventing reviews', async () => {
  const payload = await fetchBangumiSubjectDetails(123, async url => {
    if (url.endsWith('/subjects/123')) return { id: 123 };
    if (url.endsWith('/subjects/123/characters')) return [{ id: 1, name: '角色' }];
    if (url.endsWith('/characters/1')) return { summary: '原始介绍' };
    throw new Error('Unavailable');
  });
  assert.equal(payload?.characters[0].summary, '原始介绍');
  assert.deepEqual(payload?.characters[0].topComments, []);
  assert.deepEqual(payload?.bgmNetizenComments, []);
  assert.equal(payload?.discussionStatus.subject, 'unavailable');
  assert.equal(payload?.discussionStatus.charactersFetched, 0);
});

test('supporting characters with at most five comments only contribute name and CV without a comments request', async () => {
  const requests: string[] = [];
  const payload = await fetchBangumiSubjectDetails(321, async url => {
    requests.push(url);
    if (url.endsWith('/subjects/321')) return { id: 321 };
    if (url.endsWith('/subjects/321/characters')) return [
      { id: 1, name: '主角甲', relation: '主角', actors: [{ name: '声优甲' }] },
      { id: 2, name: '配角乙', relation: '配角', actors: [{ name: '声优乙' }] },
      { id: 3, name: '配角丙', relation: '配角', actors: [{ name: '声优丙' }] },
    ];
    if (url.includes('/comments?')) return { data: [{ content: '公开网友吐槽' }] };
    const id = Number(url.split('/').at(-1));
    return { summary: `人物介绍${id}`, stat: { comments: id === 1 ? 0 : id === 2 ? 5 : 6 } };
  });
  assert.ok(payload);
  assert.equal(requests.some(url => url.includes('/characters/2/comments')), false);
  assert.equal(requests.some(url => url.includes('/characters/3/comments')), true);
  const prompt = buildStudioSubjectContext({ id: 321, title: '测试', cover: '', ...payload });
  assert.match(prompt, /配角：配角乙 \| CV：声优乙/);
  assert.equal(prompt.includes('人物介绍2'), false);
  assert.ok(prompt.includes('人物介绍1'));
  assert.ok(prompt.includes('人物介绍3'));
  assert.equal(payload.discussionStatus.charactersRequested, 2);
  assert.equal(payload.discussionStatus.charactersFetched, 2);
});

test('forced Prompt refresh bypasses metadata and memory caches and calls the public relay without credentials', async t => {
  const { fetchBangumiDeepSubjectData } = await import('./bangumiApi');
  const { DEEP_DATA_VERSION } = await import('./bangumiDeepData');
  const original = { id: 988001, title: '保留我的标题', cover: 'my-cover', deepDataVersion: DEEP_DATA_VERSION, characters: [], bgmNetizenComments: [] };
  let revision = 1;
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init?: RequestInit) => {
    calls.push(input);
    if (input.startsWith('/api/bangumi/')) return new Response(null, { status: 404 });
    if (input.startsWith('/api/public-comments/')) {
      assert.equal(new Headers(init?.headers).has('Authorization'), false);
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.cache, 'no-cache');
      return Response.json({ data: [{ content: `已刷新的真实吐槽${revision}` }] });
    }
    if (input.endsWith('/subjects/988001/characters')) return Response.json([]);
    if (input.endsWith('/subjects/988001')) return Response.json({ id: 988001, name: '官方标题' });
    throw new Error('Unexpected request');
  });
  assert.equal(await fetchBangumiDeepSubjectData(original), original);
  assert.equal(calls.length, 0);
  const first = await fetchBangumiDeepSubjectData(original, { force: true });
  assert.equal(first.title, original.title);
  assert.equal(first.cover, original.cover);
  assert.equal(first.bgmNetizenComments[0].comment, '已刷新的真实吐槽1');
  revision++;
  const refreshed = await fetchBangumiDeepSubjectData(first, { force: true });
  assert.equal(refreshed.bgmNetizenComments[0].comment, '已刷新的真实吐槽2');
  assert.equal(refreshed.discussionStatus.subject, 'ok');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeasonalSubjectPager, fetchSeasonalSubjects, getSeasonDateRange } from './bangumiSeasonal';

test('season ranges include the full quarter and handle the December boundary', () => {
  assert.deepEqual(getSeasonDateRange(2026, 10), ['>=2026-10-01', '<2027-01-01']);
  assert.deepEqual(getSeasonDateRange(2026, 1), ['>=2026-01-01', '<2026-04-01']);
  assert.throws(() => getSeasonDateRange(2026, 11));
});

test('scroll pages exceed 20, respect the actual page size, and deduplicate overlapping sources', async t => {
  const calls: Array<{ source: string; offset: number }> = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    const offset = Number(new URL(input).searchParams.get('offset'));
    const filter = JSON.parse(String(init.body)).filter;
    const source = filter.tag ? 'tag' : 'date';
    calls.push({ source, offset });
    if (source === 'date') assert.deepEqual(filter.air_date, ['>=2026-10-01', '<2027-01-01']);
    const ids = source === 'tag' ? Array.from({ length: 43 }, (_, i) => i + 1) : Array.from({ length: 47 }, (_, i) => i + 30);
    return Response.json({ data: ids.slice(offset, offset + 7).map(id => ({ id })), total: ids.length, limit: 7, offset });
  });
  const pager = createSeasonalSubjectPager({ year: 2026, month: 10 });
  const firstRequest = pager.loadMore();
  assert.equal(pager.loadMore(), firstRequest, 'simultaneous scroll events share one request');
  let page = await firstRequest;
  assert.equal(calls.length, 2, 'one load does not eagerly fetch the entire quarter');
  const initialIds = page.data.map(item => item.id);
  while (page.hasMore) page = await pager.loadMore();
  assert.equal(page.data.length, 76);
  assert.deepEqual(page.data.slice(0, initialIds.length).map(item => item.id), initialIds);
  for (const source of ['tag', 'date']) assert.deepEqual(calls.filter(call => call.source === source).map(call => call.offset), [0, 7, 14, 21, 28, 35, 42]);
});

test('a failed source is retried without skipping any page or discarding the successful first page', async t => {
  let fail = true;
  const offsets: number[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string, init: RequestInit) => {
    const offset = Number(new URL(input).searchParams.get('offset'));
    offsets.push(offset);
    if (!JSON.parse(String(init.body)).filter.tag && offset === 20 && fail) {
      fail = false;
      return new Response(null, { status: 503 });
    }
    return Response.json({ data: Array.from({ length: Math.min(20, 42 - offset) }, (_, i) => ({ id: offset + i + 1 })), offset, total: 42, limit: 20 });
  });
  const pager = createSeasonalSubjectPager({ year: 2026, month: 4 });
  assert.equal((await pager.loadMore()).data.length, 20);
  await assert.rejects(pager.loadMore(), /未加载完整/);
  assert.equal((await pager.loadMore()).data.length, 40);
  assert.equal((await pager.loadMore()).data.length, 42);
  assert.deepEqual(offsets, [0, 0, 20, 20, 20, 20, 40, 40]);
});

test('repeated pages and cancelled searches cannot loop forever or append stale results', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [{ id: 1 }], total: 100, limit: 1 }));
  const pager = createSeasonalSubjectPager({ year: 2026, month: 7 });
  await pager.loadMore();
  await assert.rejects(pager.loadMore(), /重复/);
  const controller = new AbortController();
  controller.abort();
  const count = fetchMock.mock.callCount();
  await assert.rejects(fetchSeasonalSubjects({ year: 2026, month: 7, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fetchMock.mock.callCount(), count);
});

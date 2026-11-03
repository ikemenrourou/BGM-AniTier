export interface SeasonalSearchOptions {
  year: number;
  month: number;
  headers?: HeadersInit;
  signal?: AbortSignal;
  onProgress?: (loaded: number) => void;
}

export function getSeasonDateRange(year: number, month: number): [string, string] {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 || ![1, 4, 7, 10].includes(month)) {
    throw new Error('请选择有效的年份和季度。');
  }
  const nextYear = month === 10 ? year + 1 : year;
  const nextMonth = month === 10 ? 1 : month + 3;
  return [`>=${year}-${String(month).padStart(2, '0')}-01`, `<${nextYear}-${String(nextMonth).padStart(2, '0')}-01`];
}

/** A caller-controlled pager: each load fetches at most one page from each source. */
export function createSeasonalSubjectPager(options: SeasonalSearchOptions) {
  const { year, month, onProgress } = options;
  const airDate = getSeasonDateRange(year, month);
  const signal = options.signal;
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  const merged = new Map<number, any>();
  const sources = [
    { type: [2], tag: [`${year}年${month}月`], nsfw: true },
    { type: [2], air_date: airDate, nsfw: true },
  ].map(filter => ({ filter, offset: 0, done: false, seen: new Set<number>() }));
  const snapshot = () => ({ data: [...merged.values()], hasMore: sources.some(source => !source.done) });
  let pending: Promise<ReturnType<typeof snapshot>> | null = null;

  const loadPage = async () => {
    try {
      const pages = await Promise.all(sources.filter(source => !source.done).map(async source => {
        signal?.throwIfAborted();
        const response = await fetch(`https://api.bgm.tv/v0/search/subjects?limit=20&offset=${source.offset}`, {
          method: 'POST',
          headers,
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
          body: JSON.stringify({ keyword: '', sort: 'heat', filter: source.filter }),
        });
        if (!response.ok) throw new Error(`Bangumi 请求失败 (${response.status})`);
        const page = await response.json();
        if (!Array.isArray(page.data)) throw new Error('Bangumi 返回的数据格式不正确');
        const total = typeof page.total === 'number' ? page.total : undefined;
        if (!page.data.length && total !== undefined && source.offset < total) throw new Error('Bangumi 分页提前中断');
        if (typeof page.offset === 'number' && page.offset !== source.offset) throw new Error('Bangumi 返回了错误的页码');
        const items = page.data.filter((item: any) => Number.isFinite(Number(item?.id)) && Number(item.id) > 0);
        if (page.data.length && !items.some((item: any) => !source.seen.has(Number(item.id)))) throw new Error('Bangumi 重复返回了同一页');
        return { source, page, items, total };
      }));
      signal?.throwIfAborted();
      // Commit only after all pages succeed, so retries cannot skip a failed page.
      for (const { source, page, items, total } of pages) {
        for (const item of items) {
          const id = Number(item.id);
          source.seen.add(id);
          if (!merged.has(id)) merged.set(id, item);
        }
        source.offset += page.data.length;
        source.done = !page.data.length || (total !== undefined ? source.offset >= total : page.data.length < (Number(page.limit) || 20));
      }
      onProgress?.(merged.size);
      return snapshot();
    } catch (error) {
      if (signal?.aborted) throw error;
      const detail = error instanceof Error ? error.message : '网络请求失败';
      throw new Error(`本季作品未加载完整，请重试。${detail}`);
    }
  };

  return {
    loadMore: () => pending ?? (pending = loadPage().finally(() => { pending = null; })),
  };
}

/** Shared complete fetch for server callers; the browser requests pages as the user scrolls. */
export async function fetchSeasonalSubjects(options: SeasonalSearchOptions): Promise<{ data: any[]; total: number }> {
  const pager = createSeasonalSubjectPager(options);
  let page = await pager.loadMore();
  while (page.hasMore) page = await pager.loadMore();
  return { data: page.data, total: page.data.length };
}

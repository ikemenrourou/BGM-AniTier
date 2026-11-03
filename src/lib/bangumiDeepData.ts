import type { AnimeCharacterInfo, BgmNetizenComment } from '../types';
import { getCharacterCommentBudget, getStudioContextBudget, shouldIncludeCharacterDetails } from './studioContext';

export const DEEP_DATA_VERSION = 5;

type FetchJson = (url: string) => Promise<any>;
const rows = (value: any): any[] => Array.isArray(value) ? value : Array.isArray(value?.data) ? value.data : [];
const clean = (value: unknown, limit: number) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

/** Bound requests per subject; one unavailable discussion endpoint must not discard the other data. */
async function mapLimited<T, R>(items: T[], transform: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += 3) {
    results.push(...await Promise.all(items.slice(i, i + 3).map(transform)));
  }
  return results;
}

/** Shared by Express, the Pages function and the direct browser fallback. */
export async function fetchBangumiSubjectDetails(subjectId: number, fetchJson: FetchJson) {
  const safeFetch: FetchJson = url => fetchJson(url).catch(() => null);
  const [subject, characterList] = await Promise.all([
    safeFetch(`https://api.bgm.tv/v0/subjects/${subjectId}`),
    safeFetch(`https://api.bgm.tv/v0/subjects/${subjectId}/characters`),
  ]);
  if (!subject?.id) return null;

  const budget = getStudioContextBudget({ collectionStats: subject.collection, ratingTotal: subject.rating?.total });
  const candidates = rows(characterList)
    .filter(c => Number(c?.id) > 0)
    .sort((a, b) => Number(b.relation === '主角') - Number(a.relation === '主角'))
    .slice(0, budget.characters * 2);

  const [details, subjectComments] = await Promise.all([
    mapLimited(candidates, async c => {
      const detail = await safeFetch(`https://api.bgm.tv/v0/characters/${c.id}`);
      const infobox = rows(detail?.infobox || c.infobox);
      const nameCn = infobox.find(e => String(e?.key).includes('简体中文名'))?.value;
      return {
        id: Number(c.id),
        name: c.name || detail?.name || `角色 #${c.id}`,
        nameCn: typeof nameCn === 'string' ? nameCn.trim() : undefined,
        relation: c.relation,
        cv: rows(c.actors).map(a => a?.name).filter(Boolean).join(' / ') || undefined,
        avatar: c.images?.medium || c.images?.grid || detail?.images?.medium,
        summary: clean(detail?.summary || c.summary, 900),
        collects: detail?.stat?.collects,
        commentCount: detail?.stat?.comments,
      } satisfies AnimeCharacterInfo;
    }),
    safeFetch(`https://next.bgm.tv/p1/subjects/${subjectId}/comments?limit=${Math.min(40, budget.subjectComments + 4)}`),
  ]);

  const selected = details
    .filter(shouldIncludeCharacterDetails)
    .sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0) || (b.collects || 0) - (a.collects || 0))
    .slice(0, budget.characters);
  let charactersFetched = 0;
  const discussedCharacters = await mapLimited(selected, async character => {
    const limit = getCharacterCommentBudget(character);
    const response = await safeFetch(`https://next.bgm.tv/p1/characters/${character.id}/comments?limit=${limit + 4}`);
    if (Array.isArray(response) || Array.isArray(response?.data)) charactersFetched += 1;
    const topComments = [...new Set(rows(response)
      .map(comment => clean(comment?.content || comment?.comment, 500))
      .filter(text => text.length >= 2))].slice(0, limit);
    return { ...character, topComments };
  });
  const discussedById = new Map(discussedCharacters.map(character => [character.id, character]));
  const detailById = new Map(details.map(character => [character.id, character]));
  const characters: AnimeCharacterInfo[] = rows(characterList).filter(c => Number(c?.id) > 0).map(c => {
    const detail = detailById.get(Number(c.id));
    const discussed = discussedById.get(Number(c.id));
    if (discussed) return discussed;
    return {
      id: Number(c.id), name: c.name || `角色 #${c.id}`, nameCn: detail?.nameCn,
      relation: c.relation, cv: rows(c.actors).map(a => a?.name).filter(Boolean).join(' / ') || undefined,
      avatar: c.images?.medium || c.images?.grid, commentCount: detail?.commentCount, collects: detail?.collects,
    };
  }).sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0) || (b.collects || 0) - (a.collects || 0));

  const statusMap: Record<number, string> = { 1: '想看', 2: '看过', 3: '在看', 4: '搁置', 5: '抛弃' };
  const seen = new Set<string>();
  const bgmNetizenComments: BgmNetizenComment[] = rows(subjectComments).flatMap(item => {
    const comment = clean(item?.comment || item?.content, 600);
    if (!comment || seen.has(comment)) return [];
    seen.add(comment);
    return [{
      user: item?.user?.nickname || item?.user?.username || 'BGM网友',
      rate: typeof item?.rate === 'number' && item.rate > 0 ? item.rate : undefined,
      status: statusMap[Number(item?.type)],
      comment,
    }];
  }).slice(0, budget.subjectComments);

  return {
    subject, characters, bgmNetizenComments, deepDataVersion: DEEP_DATA_VERSION,
    discussionStatus: {
      subject: (Array.isArray(subjectComments) || Array.isArray(subjectComments?.data) ? 'ok' : 'unavailable') as 'ok' | 'unavailable',
      charactersRequested: selected.length, charactersFetched, updatedAt: Date.now(),
    },
  };
}

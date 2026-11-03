import type { AnimeItem, AnimeCharacterInfo } from '../types';

export function shouldIncludeCharacterDetails(character: AnimeCharacterInfo): boolean {
  return !character.relation || character.relation === '主角' || (character.commentCount ?? character.topComments?.length ?? 0) > 5;
}

export function getStudioContextBudget(anime: Pick<AnimeItem, 'collectionStats' | 'ratingTotal'>) {
  const collectionTotal = Object.values(anime.collectionStats || {}).reduce(
    (sum, value) => sum + (typeof value === 'number' && value > 0 ? value : 0),
    0,
  );
  const popularity = collectionTotal || anime.ratingTotal || 0;
  return {
    popularity,
    basis: collectionTotal ? '收藏/追番总人数' : anime.ratingTotal ? '评分人数' : '暂无热度统计',
    subjectComments: popularity >= 50000 ? 36 : popularity >= 10000 ? 24 : popularity >= 1000 ? 16 : 10,
    characters: popularity >= 10000 ? 10 : 6,
  };
}

export function getCharacterCommentBudget(character: { commentCount?: number; collects?: number }) {
  const interest = character.commentCount ?? character.collects ?? 0;
  return interest >= 1000 ? 12 : interest >= 100 ? 8 : 4;
}

const clean = (value: string | undefined, limit: number) =>
  (value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

/** Reports and studio use the same discussion selection and supporting-character policy. */
export function buildBangumiDiscussionContext(anime: AnimeItem): string {
  const budget = getStudioContextBudget(anime);
  const characters = [...(anime.characters || [])]
    .sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0) || (b.collects || 0) - (a.collects || 0));
  const characterBlocks = characters.map(character => {
    if (!shouldIncludeCharacterDetails(character)) return `- 配角：${character.nameCn || character.name} | CV：${character.cv || '未提供'}`;
    const limit = getCharacterCommentBudget(character);
    const comments = [...new Set(character.topComments || [])].slice(0, limit);
    return [
      `#### 角色：${character.nameCn || character.name}${character.nameCn && character.name !== character.nameCn ? ` / ${character.name}` : ''} (CHARACTER_ID=${character.id})`,
      `- 定位：${character.relation || '未提供'} | 声优：${character.cv || '未提供'} | 收藏人数：${character.collects ?? '未提供'} | 评论数：${character.commentCount ?? '未提供'}`,
      character.summary ? `- 角色介绍：${clean(character.summary, 900)}` : '',
      comments.length ? `- 角色网友评论（采样 ${comments.length} 条）：\n${comments.map((text, i) => `  ${i + 1}. ${clean(text, 500)}`).join('\n')}` : '- 暂无可用角色评论，不要编造网友评价。',
    ].filter(Boolean).join('\n');
  });
  const subjectComments = (anime.bgmNetizenComments || []).filter(item => item.comment?.trim()).slice(0, budget.subjectComments);
  return [
    characterBlocks.length ? `### 角色档案与人气数据\n${characterBlocks.join('\n\n')}` : '- 暂无角色详情。',
    subjectComments.length ? `### BGM网友真实吐槽摘录（采样 ${subjectComments.length} 条）\n${subjectComments.map((item, i) => `${i + 1}. ${item.user || 'BGM网友'}${item.status ? ` · ${item.status}` : ''}${item.rate ? ` · ${item.rate}分` : ''}：${clean(item.comment, 600)}`).join('\n')}` : '- 暂无可用作品评论，不要编造网友评价。',
  ].join('\n');
}

/** Keep source material detailed; output length is governed by the final dialogue rules. */
export function buildStudioSubjectContext(anime: AnimeItem): string {
  const budget = getStudioContextBudget(anime);
  const stats = anime.collectionStats;
  return [
    anime.originalTitle ? `- 原名：${anime.originalTitle}` : '',
    `- 播出/发行：${anime.airDate || '未提供'} | 集数：${anime.eps ?? '未提供'} | 类型：${anime.category || 'anime'}`,
    anime.summary ? `- 作品介绍：${clean(anime.summary, 1600)}` : '',
    anime.tags?.length ? `- 标签：${anime.tags.slice(0, 18).join('、')}` : '',
    stats ? `- 观众收藏状态：想看 ${stats.wish ?? '未知'} / 看过 ${stats.collect ?? '未知'} / 在看 ${stats.doing ?? '未知'} / 搁置 ${stats.on_hold ?? '未知'} / 抛弃 ${stats.dropped ?? '未知'}` : '',
    anime.ratingTotal ? `- 评分人数：${anime.ratingTotal}` : '',
    anime.ratingCounts ? `- 评分分布：${Object.entries(anime.ratingCounts).map(([score, count]) => `${score}分 ${count}人`).join('；')}` : '',
    `- 资料采样依据：${budget.basis}${budget.popularity ? ` ${budget.popularity}` : ''}；角色按评论数、收藏数优先排列。`,
    buildBangumiDiscussionContext(anime),
  ].filter(Boolean).join('\n');
}

export function summarizeDiscussionData(items: AnimeItem[]): string {
  const works = items.filter(item => item.id > 0 && !item.isCustom);
  const subjectCount = works.reduce((sum, item) => sum + (item.bgmNetizenComments?.length || 0), 0);
  const characterCount = works.reduce((sum, item) => sum + (item.characters || []).reduce((count, character) => count + (character.topComments?.length || 0), 0), 0);
  const unavailable = works.filter(item => item.discussionStatus?.subject !== 'ok').length;
  const missingCharacters = works.reduce((sum, item) => sum + Math.max(0, (item.discussionStatus?.charactersRequested || 0) - (item.discussionStatus?.charactersFetched || 0)), 0);
  return `已载入 ${subjectCount} 条作品吐槽、${characterCount} 条角色吐槽${unavailable ? `；${unavailable} 部作品暂未确认获取成功` : ''}${missingCharacters ? `；${missingCharacters} 个角色的吐槽暂未取到` : ''}。`;
}

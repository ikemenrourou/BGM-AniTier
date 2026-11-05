import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyTierMap,
  addAnimeToTier,
  moveAnimeBetweenTiers,
  removeAnimeFromBoard,
  getBoardStats,
  aggregateTagCounts,
  resolveGeminiModel,
  buildTasteReportPrompt,
  formatTierLabel,
  formatTierBadgeText,
  consolidateTierMapForLetterMode,
  restoreTierMapForNumericMode,
  AI_ROLES,
  DEFAULT_WORLD_BOOK_ENTRIES,
  normalizeWorldBookEntries,
  mergeTierMetadata,
} from './tierLogic';
import type { AnimeItem, TierMap } from '../types';

test('late metadata never resurrects deleted works or resets a newer score, title, or cover', () => {
  const current = { ...createEmptyTierMap(), '7': [{ id: 1, title: 'Edited', cover: 'custom', originalNumericScore: 7 as const }], '9': [{ id: 3, title: 'Added later', cover: '' }] };
  const stale = { '10': [{ id: 1, title: 'Old', cover: 'old', originalNumericScore: 10 as const, bgmScore: 8.2 }, { id: 2, title: 'Deleted', cover: '' }] };
  const result = mergeTierMetadata(current, stale);
  assert.equal(result['10'].length, 0);
  assert.equal(result['7'][0].title, 'Edited');
  assert.equal(result['7'][0].cover, 'custom');
  assert.equal(result['7'][0].originalNumericScore, 7);
  assert.equal(result['7'][0].bgmScore, 8.2);
  assert.equal(result['9'][0].id, 3);
});

const sampleFrieren: AnimeItem = {
  id: 400602,
  title: '葬送的芙莉莲',
  cover: 'https://lain.bgm.tv/pic/cover/l/13/c5/400602_ZI8Y9.jpg',
  bgmScore: 8.6,
  studio: 'MADHOUSE',
  tags: ['奇幻', '冒险', '漫画改', 'MADHOUSE'],
};

const sampleBocchi: AnimeItem = {
  id: 328609,
  title: '孤独摇滚！',
  cover: 'https://lain.bgm.tv/pic/cover/l/ec/9a/328609_2EHLJ.jpg',
  bgmScore: 8.4,
  studio: 'CloverWorks',
  tags: ['音乐', '日常', '搞笑', '奇幻'],
};

test('formatTierLabel and formatTierBadgeText map 1-10 numeric scores to strictly 5 S-D tiers (9-10->S, 7-8->A, 5-6->B, 3-4->C, 1-2->D)', () => {
  assert.equal(formatTierLabel(10, 'numeric'), '10');
  assert.equal(formatTierLabel(8.5, 'numeric'), '8.5');
  assert.equal(formatTierLabel(10, 'letter'), 'S');
  assert.equal(formatTierLabel(9, 'letter'), 'S');
  assert.equal(formatTierLabel(8, 'letter'), 'A');
  assert.equal(formatTierLabel(7, 'letter'), 'A');
  assert.equal(formatTierLabel(6, 'letter'), 'B');
  assert.equal(formatTierLabel(5, 'letter'), 'B');
  assert.equal(formatTierLabel(4, 'letter'), 'C');
  assert.equal(formatTierLabel(3, 'letter'), 'C');
  assert.equal(formatTierLabel(2, 'letter'), 'D');
  assert.equal(formatTierLabel(1, 'letter'), 'D');
  assert.equal(formatTierBadgeText(10, 'letter'), 'S 档');
  assert.equal(formatTierBadgeText(8, 'letter'), 'A 档');
  assert.equal(formatTierBadgeText(2, 'letter'), 'D 档');
  assert.equal(formatTierBadgeText(10, 'numeric'), '10 分档');
});

test('consolidateTierMapForLetterMode consolidates 9-10 into S(10) and 7-8 into A(8), and restoreTierMapForNumericMode restores original scores', () => {
  let map = createEmptyTierMap();
  map = addAnimeToTier(map, 9, sampleFrieren);
  map = addAnimeToTier(map, 7, sampleBocchi);

  const letterMap = consolidateTierMapForLetterMode(map);
  assert.equal(letterMap['10'].length, 1);
  assert.equal(letterMap['9'].length, 0);
  assert.equal(letterMap['8'].length, 1);
  assert.equal(letterMap['7'].length, 0);

  const restoredMap = restoreTierMapForNumericMode(letterMap);
  assert.equal(restoredMap['9'].length, 1);
  assert.equal(restoredMap['7'].length, 1);
});

test('AI_ROLES use clean display names and authentic prompts from my-tier-list.js', () => {
  assert.equal(AI_ROLES.mesugaki.displayName, '婆罗门zako');
  assert.equal(AI_ROLES.cat_girl.displayName, '元气猫娘');
  assert.equal(AI_ROLES.atri.displayName, '亚托莉');
  assert.equal(AI_ROLES.patrick_star.displayName, '派大星');
  assert.ok(AI_ROLES.mesugaki.prompt.includes('<RoleDefinition>'));
  assert.ok(AI_ROLES.mesugaki.prompt.includes('<EmojiIntegration>'));
  assert.ok(AI_ROLES.cat_girl.prompt.includes('<RoleDefinition>'));
});

test('addAnimeToTier deduplicates across tiers and places anime in target tier', () => {
  let map = createEmptyTierMap();
  map = addAnimeToTier(map, 9, sampleFrieren);
  assert.equal(map['9'].length, 1);

  map = addAnimeToTier(map, 10, sampleFrieren);
  assert.equal(map['9'].length, 0);
  assert.equal(map['10'].length, 1);
  assert.equal(map['10'][0].title, '葬送的芙莉莲');
});

test('moveAnimeBetweenTiers and removeAnimeFromBoard update board state cleanly', () => {
  let map = createEmptyTierMap();
  map = addAnimeToTier(map, 10, sampleFrieren);
  map = addAnimeToTier(map, 8, sampleBocchi);

  map = moveAnimeBetweenTiers(map, sampleBocchi.id, 10, 0);
  assert.equal(map['8'].length, 0);
  assert.equal(map['10'].length, 2);
  assert.equal(map['10'][0].id, sampleBocchi.id);

  const stats = getBoardStats(map);
  assert.equal(stats.totalAnime, 2);
  assert.equal(stats.averageScore, 10);
  assert.equal(stats.topTierCount, 2);

  map = removeAnimeFromBoard(map, sampleFrieren.id);
  assert.equal(map['10'].length, 1);
});

test('aggregateTagCounts computes tag frequencies and average scores accurately', () => {
  let map = createEmptyTierMap();
  map = addAnimeToTier(map, 10, sampleFrieren);
  map = addAnimeToTier(map, 8, sampleBocchi);

  const tags = aggregateTagCounts(map);
  const fantasy = tags.find(t => t.name === '奇幻');
  assert.ok(fantasy);
  assert.equal(fantasy.count, 2);
  assert.equal(fantasy.avgScore, 9);
});

test('resolveGeminiModel normalizes legacy or empty models to gemini-3.8-flash', () => {
  assert.equal(resolveGeminiModel(''), 'gemini-3.8-flash');
  assert.equal(resolveGeminiModel('gemini-2.0-flash-exp'), 'gemini-3.8-flash');
  assert.equal(resolveGeminiModel('gemini-2.5-flash-preview-05-20'), 'gemini-3.8-flash');
  assert.equal(resolveGeminiModel('gemini-3.1-flash-lite'), 'gemini-3.1-flash-lite');
});

test('default worldbooks separate knowledge from report formatting with configurable placement', () => {
  assert.equal(DEFAULT_WORLD_BOOK_ENTRIES.length, 3);
  assert.equal(DEFAULT_WORLD_BOOK_ENTRIES[0].id, 'wb-d0-default');
  assert.equal(DEFAULT_WORLD_BOOK_ENTRIES[0].position, 'after-character');
  assert.equal(DEFAULT_WORLD_BOOK_ENTRIES[1].id, 'wb-html-visualization');
  assert.equal(DEFAULT_WORLD_BOOK_ENTRIES[1].priority, 9);
  assert.equal(DEFAULT_WORLD_BOOK_ENTRIES[2].priority, 10);

  // No legacy ID is an excuse to remove user-authored entries or reinstall defaults.
  const normalized = normalizeWorldBookEntries([
    { id: 'wb-studios', title: 'old', shortDesc: 'old', content: 'old', enabled: true },
    { id: 'wb-creators', title: 'old', shortDesc: 'old', content: 'old', enabled: true },
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 'wb-studios');
  assert.equal(normalized[1].id, 'wb-creators');

  let map = createEmptyTierMap();
  map = addAnimeToTier(map, 10, sampleFrieren);

  const prompt = buildTasteReportPrompt(map, [], 'mesugaki', {
    worldBookEntries: DEFAULT_WORLD_BOOK_ENTRIES,
    gradingSystem: 'letter',
  });
  const bangumiIdx = prompt.indexOf('\n<bangumi_data>\n');
  const knowledgeIdx = prompt.indexOf('<动画公司知识库>');
  assert.ok(knowledgeIdx > 0 && knowledgeIdx < bangumiIdx);
  assert.ok(prompt.indexOf('<输出规范>') > bangumiIdx);
});

test('extractTitleFromFileName strips extension and preserves anime/book/game title cleanly', async () => {
  const { extractTitleFromFileName } = await import('./bangumiApi');
  assert.equal(extractTitleFromFileName('葬送的芙莉莲_主视觉图.png'), '葬送的芙莉莲 主视觉图');
  assert.equal(extractTitleFromFileName("BanG Dream! It's MyGO!!!!!.jpg"), "BanG Dream! It's MyGO!!!!!");
  assert.equal(extractTitleFromFileName('艾尔登法环 黄金树幽影.webp'), '艾尔登法环 黄金树幽影');
});

test('shufflePosterEntries mixes high-score and low-score works and choosePosterCardVariant boosts comment card probability without making it 100%', async () => {
  const {
    shufflePosterEntries,
    getPosterExtremeScoreType,
    choosePosterCardVariant,
  } = await import('./tierLogic');

  assert.equal(getPosterExtremeScoreType(10), 'ultra-high');
  assert.equal(getPosterExtremeScoreType(9), 'ultra-high');
  assert.equal(getPosterExtremeScoreType(8), null);
  assert.equal(getPosterExtremeScoreType(3), 'ultra-low');
  assert.equal(getPosterExtremeScoreType(1), 'ultra-low');

  const sortedInput = [10, 9, 9, 8, 8, 7, 6, 5, 3, 2].map((score, i) => ({
    anime: { id: 1000 + i, title: `Work ${i}`, cover: '' },
    score,
  }));
  const shuffled = shufflePosterEntries(sortedInput, 1);
  assert.equal(shuffled.length, sortedInput.length);
  // Ensure order is not monotonically non-increasing by score
  const isStillMonotonic = shuffled.every(
    (item, idx) => idx === 0 || (shuffled[idx - 1].score ?? 0) >= (item.score ?? 0),
  );
  assert.equal(isStillMonotonic, false);

  // Check weighted probability for commented items across 100 samples: should be boosted (>55%) but not 100% (<90%)
  const commentShowcasingSet = new Set([
    'wide-feather',
    'wide-split',
    'wide-polaroid',
    'portrait-bottom-feather',
    'portrait-polaroid',
  ]);
  let commentCardHits = 0;
  let uncommentedWideFeatherHits = 0;
  for (let i = 0; i < 100; i++) {
    const res = choosePosterCardVariant({
      animeId: 5000 + i * 17,
      index: i,
      score: 7.5,
      hasComment: true,
      seed: 3,
    });
    if (commentShowcasingSet.has(res.variant)) {
      commentCardHits++;
    }

    const uncommentedRes = choosePosterCardVariant({
      animeId: 8000 + i * 23,
      index: i,
      score: 8,
      hasComment: false,
      seed: 1,
    });
    if (uncommentedRes.variant === 'wide-feather') {
      uncommentedWideFeatherHits++;
    }
  }
  assert.ok(
    commentCardHits >= 48 && commentCardHits < 90,
    `Expected boosted but non-100% comment card hit rate, got ${commentCardHits}%`,
  );
  assert.ok(
    uncommentedWideFeatherHits >= 4 && uncommentedWideFeatherHits <= 22,
    `Expected wide-feather to appear for uncommented works at a balanced rate (4%-22%), got ${uncommentedWideFeatherHits}%`,
  );
});

test('buildTasteReportPrompt formats book/game categories accurately and includes deep character & netizen comments', () => {
  const sampleTiers: TierMap = {
    '10': [],
    '9': [
      {
        id: 500001,
        title: '玩玩的恋爱关系',
        originalTitle: 'あそびのかんけい',
        cover: 'https://lain.bgm.tv/pic/cover/l/test.jpg',
        bgmScore: 8.1,
        bgmRank: 514,
        airDate: '2025.05',
        studio: 'KADOKAWA',
        director: '未知监督',
        author: '葵关南',
        illustrator: '深崎暮人',
        publisher: '富士见Fantasia文库',
        category: 'book',
        summary: '桌游咖啡厅店长代理与辣妹打工生的恋爱喜剧。',
        tags: ['轻小说', '葵关南', '深崎暮人', '恋爱喜剧'],
        collectionStats: {
          wish: 120,
          collect: 350,
          doing: 95,
          on_hold: 18,
          dropped: 12,
        },
        characters: [
          {
            id: 9001,
            name: '小鸟游みくる',
            relation: '主角',
            collects: 420,
            commentCount: 88,
            summary: '毫无桌游爱的天敌辣妹女子高中生。',
            topComments: ['深崎暮人画的辣妹实在太顶了！'],
          },
        ],
        bgmNetizenComments: [
          {
            user: 'BGM读者甲',
            rate: 9,
            comment: '葵关南老贼的误解系恋爱喜剧依旧稳定发挥！',
          },
        ],
      },
    ],
    '8': [],
    '7': [],
    '6': [],
    '5': [],
    '4': [],
    '3': [],
    '2': [],
    '1': [],
  };

  const prompt = buildTasteReportPrompt(sampleTiers, [], 'mesugaki');
  assert.ok(prompt.includes('【前端预计算·全局审美诊断摘要】'));
  assert.ok(prompt.includes('[类型: 书籍/轻小说·漫画]'));
  assert.ok(prompt.includes('作者: 葵关南'));
  assert.ok(prompt.includes('插画/作画: 深崎暮人'));
  assert.ok(!prompt.includes('制作公司: 未知'));
  assert.ok(prompt.includes('角色档案与人气数据'));
  assert.ok(prompt.includes('角色：小鸟游みくる'));
  assert.ok(prompt.includes('BGM网友真实吐槽摘录'));
  assert.ok(prompt.includes('葵关南老贼的误解系恋爱喜剧依旧稳定发挥！'));
  assert.ok(prompt.includes('<anitier-view>'));
});

test('normalizeTierMap unwraps legacy { nextTiers } wrapper and enrichTierMapWithDeepBangumiData preserves all works', async () => {
  const { normalizeTierMap, getBoardStats } = await import('./tierLogic');
  const { enrichTierMapWithDeepBangumiData } = await import('./bangumiApi');

  const wrappedCorruptedState = {
    nextTiers: {
      '10': [{ id: 400602, title: '葬送的芙莉莲', cover: '/cover.jpg', bgmScore: 8.6 }],
      '9': [{ id: 500001, title: '玩玩的恋爱关系', cover: '/book.jpg', bgmScore: 8.1 }],
    },
    updatedCount: 2,
  };

  const recovered = normalizeTierMap(wrappedCorruptedState);
  assert.equal(getBoardStats(recovered).totalAnime, 2);
  assert.equal(recovered['10'][0].title, '葬送的芙莉莲');
  assert.equal(recovered['9'][0].title, '玩玩的恋爱关系');

  // Ensure enrichTierMapWithDeepBangumiData returns a valid TierMap directly and never drops works
  const enriched = await enrichTierMapWithDeepBangumiData(recovered);
  assert.equal(getBoardStats(enriched).totalAnime, 2);
  assert.equal(enriched['10'][0].title, '葬送的芙莉莲');
  assert.equal(enriched['9'][0].title, '玩玩的恋爱关系');
});

test('createCustomWorkId generates unique negative safe integers across batches', async () => {
  const { createCustomWorkId } = await import('./tierLogic');
  const ids = Array.from({ length: 25 }, (_, i) => createCustomWorkId(i));
  for (const id of ids) {
    assert.equal(Number.isSafeInteger(id), true);
    assert.ok(id < 0, `Expected negative ID for custom work, got ${id}`);
  }
  assert.equal(new Set(ids).size, ids.length);
});





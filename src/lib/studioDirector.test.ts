import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STUDIO_AI_COMPANIONS,
  buildInitialStudioScriptList,
  buildPlaybackSteps,
  buildStudioTimelinePrompt,
  formatExpressionListPlaceholder,
  parseDialogueSegments,
  parseStudioAiScriptResponse,
  resolveCharacterStandeeUrl,
  normalizeStudioTimelineRuleTemplate,
  normalizeStudioBookends,
  parseStudioBookendResponse,
  getStudioWorldBookEntries,
} from './studioDirector';
import { DEFAULT_WORLD_BOOK_ENTRIES } from './tierLogic';
import { requestAiStream } from './aiStream';
import type { TierMap } from '../types';

test('parseDialogueSegments preserves custom expression names with parentheses and only attaches emotes when explicitly written', () => {
  const raw =
    '[思考(认真地)] 唔……这部居然只给7分吗？[得分(10分):闪光] 不过若山诗音女士的配音确实封神啦！';
  const segments = parseDialogueSegments(raw, true, true);

  assert.equal(segments.length, 2);
  assert.equal(segments[0].expression, '思考(认真地)');
  assert.equal(segments[0].emote, 'none');
  assert.match(segments[0].text, /这部居然只给7分吗/);

  assert.equal(segments[1].expression, '得分(10分)');
  assert.equal(segments[1].emote, 'sparkles');
  assert.match(segments[1].text, /若山诗音女士的配音/);
});

test('parseDialogueSegments supports disabling expressions or emotes cleanly', () => {
  const raw = '[打字(生气):青筋] 哼，这种展开太离谱了！';
  const noExpr = parseDialogueSegments(raw, false, true);
  assert.equal(noExpr[0].expression, 'default');
  assert.equal(noExpr[0].emote, 'anger_vein');

  const noEmote = parseDialogueSegments(raw, true, false);
  assert.equal(noEmote[0].expression, '打字(生气)');
  assert.equal(noEmote[0].emote, 'none');
});

test('resolveCharacterStandeeUrl resolves Feiyu 28 GIF expressions and custom expressions accurately', () => {
  const feiyu = DEFAULT_STUDIO_AI_COMPANIONS[0];
  assert.equal(feiyu.id, 'studio-feiyu');
  assert.equal(feiyu.customExpressions.length, 28);

  const shakeUrl = resolveCharacterStandeeUrl(feiyu, '摇头', true);
  assert.ok(shakeUrl.includes('%E5%A4%A7%E8%82%A5%E9%B1%BC-%E6%91%87%E5%A4%B4.gif'));

  const score10Url = resolveCharacterStandeeUrl(feiyu, '得分(10分)', true);
  assert.ok(score10Url.includes('10'));
});

test('buildPlaybackSteps builds reversible timeline steps where user speaks first if userText exists', () => {
  const mockTiers: TierMap = {
    '10': [
      {
        id: 101,
        title: '葬送的芙莉莲',
        cover: 'https://example.com/101.jpg',
        bgmScore: 8.9,
      },
    ],
    '7': [
      {
        id: 202,
        title: '莉可丽丝',
        cover: 'https://example.com/202.jpg',
        bgmScore: 7.4,
      },
    ],
  };

  const scripts = buildInitialStudioScriptList(mockTiers, [
    {
      id: 'c-1',
      animeId: 101,
      animeTitle: '葬送的芙莉莲',
      animeCover: 'https://example.com/101.jpg',
      tierScore: 10,
      text: '斋藤圭一郎神演出！',
      cardStyle: 1,
      updatedAt: 1000,
    },
  ]);

  assert.equal(scripts.length, 2);
  for (const item of scripts) item.aiRawText = '[思考] 测试台词。[笑] 下一句。';

  const steps = buildPlaybackSteps(scripts);
  assert.ok(steps.length >= 4);

  const firstWorkSteps = steps.filter(s => s.workOrderIndex === 0);
  assert.ok(firstWorkSteps[0].isWorkEntryStep);
  assert.equal(firstWorkSteps[0].remainingPool.length, 1);

  const secondWorkSteps = steps.filter(s => s.workOrderIndex === 1);
  assert.ok(secondWorkSteps[0].isWorkEntryStep);
  assert.equal(secondWorkSteps[0].remainingPool.length, 0);
});

test('new works start without generated dialogue and silent playback does not invent speech', () => {
  const tiers = { '9': [{ id: 91, title: '用户作品', cover: '' }] };
  const scripts = buildInitialStudioScriptList(tiers, []);
  assert.equal(scripts[0].userText, '');
  assert.equal(scripts[0].aiRawText, '');
  const steps = buildPlaybackSteps(scripts);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].isWorkEntryStep, true);
  assert.equal(steps[0].aiBubble.visible, false);
  assert.equal(steps[0].aiBubble.text, '');
  scripts[0].aiRawText = '我自己写的台词';
  assert.equal(buildInitialStudioScriptList(tiers, [], scripts)[0].aiRawText, '我自己写的台词');
});

test('an image-only host turn displays its insert without inventing a spoken bubble', () => {
  const scripts = buildInitialStudioScriptList({ '8': [{ id: 92, title: '配图作品', cover: '' }] }, []);
  scripts[0].userImage = 'data:image/png;base64,insert';
  scripts[0].aiRawText = '[笑] 接着聊这部作品';
  const steps = buildPlaybackSteps(scripts);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].isWorkEntryStep, true);
  for (const step of steps) {
    assert.equal(step.userBubble.visible, false);
    assert.equal(step.userBubble.isTypingNow, false);
    assert.equal(step.userBubble.text, '');
    assert.equal(step.userBubble.image, scripts[0].userImage);
  }
  assert.equal(steps[1].aiBubble.visible, true);
  scripts[0].userText = '这是我自己写的配图吐槽';
  assert.equal(buildPlaybackSteps(scripts)[0].userBubble.text, scripts[0].userText);
  scripts[0].userText = '';
  scripts[0].aiRawText = '';
  assert.equal(buildPlaybackSteps(scripts).length, 1);
});

test('all enabled studio worldbooks reach the AI request intact, including long custom entries', async t => {
  const first = '# 制作资料\n' + '自定义知识库正文。'.repeat(6000);
  const second = '# 我的口吻\n只针对具体作品吐槽，保留我的独特说法。';
  const worldBookEntries = [
    ...DEFAULT_WORLD_BOOK_ENTRIES,
    { id: 'custom-one', title: '制作知识库', content: first, shortDesc: '', enabled: false },
    { id: 'custom-two', title: '口吻库', content: second, shortDesc: '', enabled: false },
    { id: 'off', title: '关闭条目', content: 'SHOULD_NOT_BE_SENT', shortDesc: '', enabled: true },
  ];
  // Studio selection is independent of report selection; no preset is forced on.
  const enabledWorldBookIds = ['custom-one', 'custom-two'];
  assert.deepEqual(getStudioWorldBookEntries(worldBookEntries, enabledWorldBookIds).map(entry => entry.id), ['custom-one', 'custom-two']);
  const prompt = buildStudioTimelinePrompt({ scriptItems: [], companion: DEFAULT_STUDIO_AI_COMPANIONS[0], worldBookEntries, enabledWorldBookIds });
  assert.ok(prompt.includes(first));
  assert.ok(prompt.includes(second));
  assert.ok(!prompt.includes('SHOULD_NOT_BE_SENT'));
  assert.ok(prompt.indexOf(second) < prompt.indexOf('<bangumi_data>'));
  let actualPrompt = '';
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    actualPrompt = JSON.parse(String(init.body)).messages[0].content;
    return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  });
  await requestAiStream({ apiKey: 'test-only-not-a-real-key', baseUrl: 'https://ai-test.invalid/v1', model: 'test' }, prompt);
  assert.equal(actualPrompt, prompt);
});

test('buildStudioTimelinePrompt expands {{EXPRESSION_LIST}} with custom expressions and notes and parses response', () => {
  const mockTiers: TierMap = {
    '9': [
      {
        id: 301,
        title: '孤独摇滚！',
        cover: 'https://example.com/301.jpg',
        bgmScore: 8.4,
      },
    ],
  };

  const scripts = buildInitialStudioScriptList(mockTiers, []);
  const feiyu = DEFAULT_STUDIO_AI_COMPANIONS[0];
  const exprPlaceholder = formatExpressionListPlaceholder(feiyu.customExpressions);
  assert.match(exprPlaceholder, /\[摇头\]/);
  assert.match(exprPlaceholder, /\[馋\(筷子\)\]/);

  const prompt = buildStudioTimelinePrompt({
    scriptItems: scripts,
    companion: feiyu,
  });

  assert.match(prompt, /出场顺位 #1/);
  assert.match(prompt, /ANIME_ID=301/);
  assert.match(prompt, /\[摇头\]/);
  assert.match(prompt, /\[得分\(10分\)\]/);
  assert.doesNotMatch(prompt, /已出场可引用前作/);
  assert.match(prompt, /不限制提及作品名称/);
  assert.match(prompt, /最终分数、档位/);
  assert.ok(prompt.trim().endsWith('</world_book>'));
  assert.ok(prompt.indexOf('</bangumi_data>') < prompt.indexOf('title="时间线与台词输出规则"'));

  const mockAiResponse = `
<<<ANIME_ID:301>>> [得分(10分)] 哇，波奇酱居然拿到了9分！[笑] 梅原翔太厨力拉满啦！
  `;
  const parsed = parseStudioAiScriptResponse(mockAiResponse);
  assert.equal(parsed.get(301), '[得分(10分)] 哇，波奇酱居然拿到了9分！[笑] 梅原翔太厨力拉满啦！');
});

test('legacy timeline restrictions migrate while preserving custom instructions', () => {
  const migrated = normalizeStudioTimelineRuleTemplate('自定义规则：说话活泼。\n**绝对禁止提及、暗示或剧透 #(k+1) 及之后还未出场作品的名字或分数**！');
  assert.match(migrated, /自定义规则：说话活泼/);
  assert.doesNotMatch(migrated, /禁止提及/);
  assert.match(migrated, /不限制提及作品名称/);
});

test('custom works with negative IDs keep their AI lines separate from opening and ending', () => {
  const response = '<<<OPENING>>> 开始\n<<<ANIME_ID:-901>>> 自定义作品一\n<<<ANIME_ID:123>>> 作品二\n<<<ENDING>>> 完毕';
  assert.equal(parseStudioAiScriptResponse(response).get(-901), '自定义作品一');
  assert.equal(parseStudioAiScriptResponse(response).get(123), '作品二');
  assert.deepEqual(parseStudioBookendResponse(response), { opening: '开始', ending: '完毕' });
});

const bookendScripts = () => buildInitialStudioScriptList({
  '9': [{ id: 501, title: '第一部', cover: '/first.jpg' }],
  '6': [{ id: 502, title: '第二部', cover: '/second.jpg' }],
}, []);

test('bookends type both speakers in order without revealing or reentering any work', () => {
  const bookends = normalizeStudioBookends({
    opening: { enabled: true, userText: '[思考] 先说评分规则。[笑] 我按个人喜好来。', aiRawText: '[笑] 那就开始吧。' },
    ending: { enabled: true, userText: '全部排完，聊聊反差。', aiRawText: '[思考] 这张榜很有意思。[笑:闪光] 评论区见。' },
  });
  const scripts = bookendScripts();
  const steps = buildPlaybackSteps(scripts, { bookends });
  const opening = steps.filter(step => step.phase === 'opening');
  const ending = steps.filter(step => step.phase === 'finale');
  assert.deepEqual(opening.map(step => step.speaker), ['user', 'user', 'ai']);
  assert.deepEqual(ending.map(step => step.speaker), ['user', 'ai', 'ai']);
  assert.equal(opening[2].userBubble.text, '我按个人喜好来。');
  for (const step of [...opening, ...ending]) {
    assert.equal(step.isWorkEntryStep, false);
    assert.equal(step.activeWork, null);
    assert.equal(step.activeTargetScore, null);
    assert.equal(step[step.speaker === 'user' ? 'userBubble' : 'aiBubble'].isTypingNow, true);
  }
  assert.equal(Object.values(opening[0].rankedByTierSoFar).flat().length, 0);
  assert.equal(opening[0].remainingPool.length, 2);
  assert.equal(Object.values(ending[0].rankedByTierSoFar).flat().length, 2);
  assert.equal(ending[0].remainingPool.length, 0);
  assert.equal(steps.filter(step => step.isWorkEntryStep).length, scripts.length);
  assert.deepEqual(steps.map(step => step.stepIndex), steps.map((_, index) => index));
});

test('disabled and blank bookends skip cleanly, including solo dialogue and empty boards', () => {
  const bookends = normalizeStudioBookends({
    opening: { enabled: false, userText: '不播放', aiRawText: '也不播放' },
    ending: { enabled: true, userText: '  ', aiRawText: '\n' },
  });
  assert.ok(buildPlaybackSteps(bookendScripts(), { bookends }).every(step => step.phase === 'work'));
  bookends.ending.aiRawText = '[笑:闪光] AI 单人总结。';
  const ending = buildPlaybackSteps(bookendScripts(), { bookends, enableExpressions: false, enableEmotes: false }).at(-1)!;
  assert.equal(ending.userBubble.visible, false);
  assert.equal(ending.speaker, 'ai');
  assert.equal(ending.aiBubble.expression, 'default');
  assert.equal(ending.aiBubble.emote, 'none');
  assert.deepEqual(buildPlaybackSteps([], { bookends }), []);
});

test('bookend settings preserve intentionally blank dialogue and recover malformed saved fields', () => {
  const saved = normalizeStudioBookends({ opening: null, ending: { enabled: false, userText: '', aiRawText: 7, generateAi: false } });
  assert.equal(saved.opening.enabled, false);
  assert.equal(saved.ending.enabled, false);
  assert.equal(saved.ending.userText, '');
  assert.equal(typeof saved.ending.aiRawText, 'string');
  assert.equal(saved.ending.generateAi, false);
});

test('AI parsing separates opening, work blocks and ending, including multiline and partial streams', () => {
  const response = '<<<OPENING>>> [笑] 先来聊规则。\n<<<ANIME_ID:501>>> [思考] 第一部点评。\n再补一句。\n<<<ANIME_ID:502>>> 第二部点评。\n<<<ENDING>>> [笑] 全榜总结。';
  const works = parseStudioAiScriptResponse(response);
  assert.equal(works.size, 2);
  assert.equal(works.get(502), '第二部点评。');
  assert.equal(works.get(501), '[思考] 第一部点评。 再补一句。');
  assert.deepEqual(parseStudioBookendResponse(response), { opening: '[笑] 先来聊规则。', ending: '[笑] 全榜总结。' });
  assert.equal(parseStudioAiScriptResponse('<<<OPENING>>> 开场').size, 0);
  assert.deepEqual(parseStudioBookendResponse('<<<ENDING>>>'), {});
});

test('bookend prompt requests only enabled AI turns, keeps user rules and final system rules placement', () => {
  const bookends = normalizeStudioBookends({
    opening: { enabled: true, userText: '评分按个人喜好。', generateAi: false },
    ending: { enabled: true, userText: '这张榜的反差在哪里？', generateAi: true },
  });
  const prompt = buildStudioTimelinePrompt({ scriptItems: bookendScripts(), companion: DEFAULT_STUDIO_AI_COMPANIONS[0], bookends });
  assert.match(prompt, /评分按个人喜好/);
  assert.match(prompt, /这张榜的反差在哪里/);
  assert.doesNotMatch(prompt, /<<<OPENING>>>/);
  assert.match(prompt, /<<<ENDING>>>/);
  assert.match(prompt, /所有作品已揭晓/);
  assert.ok(prompt.endsWith('</world_book>'));
});

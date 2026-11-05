import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_STUDIO_AI_COMPANIONS,
  buildInitialStudioScriptList,
  buildPlaybackSteps,
  buildStudioTimelinePrompt,
  extractUserTextAndHiddenNotes,
  formatExpressionListPlaceholder,
  normalizeStudioCompanions,
  parseDialogueSegments,
  parseStudioAiScriptResponse,
  resolveBubbleActiveCue,
  resolveCharacterStandeeUrl,
  normalizeStudioTimelineRuleTemplate,
  normalizeStudioBookends,
  parseStudioBookendResponse,
  getStudioWorldBookEntries,
  updateStudioCharacter,
} from './studioDirector';
import { DEFAULT_WORLD_BOOK_ENTRIES } from './tierLogic';
import { requestAiStream } from './aiStream';
import type { TierMap } from '../types';

test('parseDialogueSegments keeps multiple [表情] tags on the same bubble page with live charOffset cues, and splits pages only on explicit [换页]', () => {
  const raw =
    '[思考(认真地)] 唔……这部居然只给7分吗？[得分(10分):闪光] 不过若山诗音女士的配音确实封神啦！';
  const segments = parseDialogueSegments(raw, true, true);

  // Without [换页], stays on 1 bubble page so the bubble is not erased!
  assert.equal(segments.length, 1);
  assert.equal(segments[0].expression, '思考(认真地)');
  assert.match(segments[0].text, /这部居然只给7分吗/);
  assert.match(segments[0].text, /若山诗音女士的配音/);
  assert.equal(segments[0].cues?.length, 2);

  // At charOffset 0 (start of typing), active cue is 思考(认真地) with no emote
  assert.deepEqual(resolveBubbleActiveCue(segments[0], 3, true), {
    expression: '思考(认真地)',
    emote: 'none',
  });

  // Once typing reaches the 2nd cue's charOffset, standee expression switches to 得分(10分) and sparkles emote pops
  const secondCueOffset = segments[0].cues![1].charOffset;
  assert.deepEqual(resolveBubbleActiveCue(segments[0], secondCueOffset + 1, true), {
    expression: '得分(10分)',
    emote: 'sparkles',
  });

  // Explicit [换页] or <换页> splits into 2 separate bubble pages
  const pagedRaw =
    '[思考(认真地)] 唔……这部居然只给7分吗？[换页][得分(10分):闪光] 不过若山诗音女士的配音确实封神啦！';
  const pagedSegments = parseDialogueSegments(pagedRaw, true, true);
  assert.equal(pagedSegments.length, 2);
  assert.equal(pagedSegments[0].expression, '思考(认真地)');
  assert.equal(pagedSegments[0].emote, 'none');
  assert.match(pagedSegments[0].text, /这部居然只给7分吗/);
  assert.equal(pagedSegments[1].expression, '得分(10分)');
  assert.equal(pagedSegments[1].emote, 'sparkles');
  assert.match(pagedSegments[1].text, /若山诗音女士的配音/);
});

test('parseDialogueSegments supports disabling expressions or emotes cleanly and defaults to default expression when omitted', () => {
  const raw = '[打字(生气):青筋] 哼，这种展开太离谱了！';
  const noExpr = parseDialogueSegments(raw, false, true);
  assert.equal(noExpr[0].expression, 'default');
  assert.equal(noExpr[0].emote, 'anger_vein');

  const noEmote = parseDialogueSegments(raw, true, false);
  assert.equal(noEmote[0].expression, '打字(生气)');
  assert.equal(noEmote[0].emote, 'none');

  // Line without any [表情] tag uses 'default' expression
  const plain = parseDialogueSegments('这部的作画和配乐都很稳！', true, true);
  assert.equal(plain.length, 1);
  assert.equal(plain[0].expression, 'default');
  assert.equal(plain[0].text, '这部的作画和配乐都很稳！');
});

test('resolveCharacterStandeeUrl resolves Feiyu 72 GIF expressions and custom expressions accurately', () => {
  const feiyu = DEFAULT_STUDIO_AI_COMPANIONS[0];
  assert.equal(feiyu.id, 'studio-feiyu');
  assert.equal(feiyu.customExpressions.length, 72);

  const shakeUrl = resolveCharacterStandeeUrl(feiyu, '摇头', true);
  assert.ok(shakeUrl.includes('%E5%A4%A7%E8%82%A5%E9%B1%BC-%E6%91%87%E5%A4%B4.gif'));

  const popcornUrl = resolveCharacterStandeeUrl(feiyu, '吃(爆米花)', true);
  assert.ok(popcornUrl.includes(encodeURIComponent('大肥鱼-吃(爆米花).gif')));

  const questionUrl = resolveCharacterStandeeUrl(feiyu, '问号', true);
  assert.ok(questionUrl.includes(encodeURIComponent('大肥鱼-问号.gif')));

  const questionSegments = parseDialogueSegments('[问号] 咦？这是什么操作？', true, true);
  assert.equal(questionSegments[0].expression, '问号');

  const score10Url = resolveCharacterStandeeUrl(feiyu, '得分(10分)', true);
  assert.ok(score10Url.includes('10'));

  // Saved studio-feiyu with old 28 expressions automatically merges the 44 new ones
  const olderSaved = {
    ...feiyu,
    customExpressions: feiyu.customExpressions.slice(0, 28),
  };
  const migrated = normalizeStudioCompanions([olderSaved])[0];
  assert.equal(migrated.customExpressions.length, 72);
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
  for (const item of scripts) item.aiRawText = '[思考] 测试台词。[换页][笑] 下一句。';

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

test('hidden <备注> and userImageNote strip from stage bubbles while inline effect tags and AI timeline prompt survive', () => {
  const scripts = buildInitialStudioScriptList({ '9': [{ id: 93, title: '莉可丽丝', cover: '' }] }, []);
  scripts[0].userImage = 'data:image/png;base64,lycoris';
  scripts[0].userText = '<这张图是千束躲子弹的名场面截图>';
  scripts[0].userImageNote = '请顺便吐槽一下这段动作作画';
  scripts[0].aiRawText = '[吃(爆米花)] 这段枪斗术确实<big>帅爆了</big>！';

  const extracted = extractUserTextAndHiddenNotes(scripts[0].userText, scripts[0].userImageNote);
  assert.equal(extracted.visibleText, '');
  assert.deepEqual(extracted.hiddenNotes, ['这张图是千束躲子弹的名场面截图', '请顺便吐槽一下这段动作作画']);

  // Because visibleText is empty after stripping <...>, the host bubble stays hidden on stage while the image still shows!
  const steps = buildPlaybackSteps(scripts);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].userBubble.visible, false);
  assert.equal(steps[0].userBubble.text, '');
  assert.equal(steps[0].userBubble.image, scripts[0].userImage);

  // Mixed visible text + inline effect tags + <备注> keeps visible text and inline effect tags while stripping <备注>
  scripts[0].userText = '先看这张<big>名场面</big>！<备注：画面里是千束在铁塔下反击>';
  const mixedSteps = buildPlaybackSteps(scripts);
  assert.equal(mixedSteps[0].userBubble.visible, true);
  assert.equal(mixedSteps[0].userBubble.text, '先看这张<big>名场面</big>！');
  assert.ok(!mixedSteps[0].userBubble.text.includes('备注'));

  // Both <备注> and userImageNote are sent to AI in buildStudioTimelinePrompt
  const prompt = buildStudioTimelinePrompt({
    scriptItems: scripts,
    companion: DEFAULT_STUDIO_AI_COMPANIONS[0],
  });
  assert.ok(prompt.includes('画面里是千束在铁塔下反击'));
  assert.ok(prompt.includes('请顺便吐槽一下这段动作作画'));
  assert.ok(prompt.includes('UP主晒出的配图/画面暗注'));
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
    opening: { enabled: true, userText: '[思考] 先说评分规则。[换页][笑] 我按个人喜好来。', aiRawText: '[笑] 那就开始吧。' },
    ending: { enabled: true, userText: '全部排完，聊聊反差。', aiRawText: '[思考] 这张榜很有意思。[换页][笑:闪光] 评论区见。' },
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

test('inline effect parser repairs malformed <mask] brackets and never leaks raw tag syntax into bubble text', async () => {
  const { parseBubbleInlineEffects } = await import('../components/StudioDialogueBubble');

  // 1. Exact reproduction of screenshot bug: `<mask]鉴黄师的小头评委</mask>`
  const lineWithMixedBracket =
    '[笑(指)(嘲笑)] 嘴上说着在喝营养快线，鼠标悬停在组长配音的小恶魔身上看现场直播，<mask]鉴黄师的小头评委</mask>属性当场爆表了吧？';
  const segs1 = parseDialogueSegments(lineWithMixedBracket, true, true);
  assert.equal(segs1.length, 1);
  assert.equal(segs1[0].expression, '笑(指)(嘲笑)');
  const parsed1 = parseBubbleInlineEffects(segs1[0].text);
  assert.equal(
    parsed1.plainText,
    '嘴上说着在喝营养快线，鼠标悬停在组长配音的小恶魔身上看现场直播，鉴黄师的小头评委属性当场爆表了吧？',
  );
  assert.ok(!parsed1.plainText.includes('<mask'));
  assert.deepEqual(
    parsed1.segments.find(s => s.effect === 'mask'),
    { text: '鉴黄师的小头评委', effect: 'mask' },
  );

  // 2. Unclosed `<mask]鉴黄师的小头评委属性当场爆表了吧？` (missing closing tag altogether)
  const lineUnclosed =
    '嘴上说着在喝营养快线，<mask]鉴黄师的小头评委属性当场爆表了吧？';
  const segs2 = parseDialogueSegments(lineUnclosed, true, true);
  const parsed2 = parseBubbleInlineEffects(segs2[0].text);
  assert.equal(parsed2.plainText, '嘴上说着在喝营养快线，鉴黄师的小头评委属性当场爆表了吧？');
  assert.ok(!parsed2.plainText.includes('<mask'));
  assert.deepEqual(
    parsed2.segments.find(s => s.effect === 'mask'),
    { text: '鉴黄师的小头评委属性当场爆表了吧', effect: 'mask' },
  );

  // 3. `<del>`, `{划:...}`, `[mask]...[/mask]` all map cleanly to strikethrough (`mask`) without triggering expression cues
  const lineVariants = '[思考(认真地)] <del>划掉真话</del>和{划:欲盖弥彰}以及[mask]方括号删除线[/mask]';
  const segs3 = parseDialogueSegments(lineVariants, true, true);
  assert.equal(segs3[0].cues?.length, 1);
  assert.equal(segs3[0].cues?.[0].expression, '思考(认真地)');
  const parsed3 = parseBubbleInlineEffects(segs3[0].text);
  assert.equal(parsed3.plainText, '划掉真话和欲盖弥彰以及方括号删除线');
  assert.equal(parsed3.segments.filter(s => s.effect === 'mask').length, 3);
});

test('AI companion GIF standee stays animated and retains active expression while UP主 is speaking', () => {
  const feiyuWithStaticDefault = {
    ...DEFAULT_STUDIO_AI_COMPANIONS[0],
    defaultAvatarUrl: 'https://files.catbox.moe/static-avatar.png',
  };

  // Even if defaultAvatarUrl was set to a static PNG, default expression resolves to animated GIF
  const defaultResolved = resolveCharacterStandeeUrl(feiyuWithStaticDefault, 'default', true);
  assert.match(defaultResolved, /\.gif$/i);

  const mockTiers: TierMap = {
    '9': [{ id: 701, title: '第一部作品', cover: '' }],
    '8': [{ id: 702, title: '第二部作品', cover: '' }],
  };
  const scripts = buildInitialStudioScriptList(mockTiers, []);
  scripts[0].userText = 'UP主评价第一部';
  scripts[0].aiRawText = '[笑] 鱼接话第一部 [点赞] 结尾竖大拇指';
  scripts[1].userText = 'UP主评价第二部';
  scripts[1].aiRawText = '[吃(爆米花)] 鱼接话第二部';

  const steps = buildPlaybackSteps(scripts);
  assert.equal(steps.length, 4);

  // Step 0: UP主 speaks on Work #1 -> AI standee already uses her upcoming GIF expression ('笑')
  assert.equal(steps[0].speaker, 'user');
  assert.equal(steps[0].aiBubble.expression, '笑');
  assert.match(resolveCharacterStandeeUrl(feiyuWithStaticDefault, steps[0].aiBubble.expression, true), /\.gif$/i);

  // Step 2: UP主 speaks on Work #2 -> AI standee retains her ending GIF expression from Work #1 ('点赞') instead of resetting to static default
  assert.equal(steps[2].speaker, 'user');
  assert.equal(steps[2].aiBubble.expression, '点赞');
  assert.match(resolveCharacterStandeeUrl(feiyuWithStaticDefault, steps[2].aiBubble.expression, true), /\.gif$/i);
});

test('full-width parentheses, bare expression names, and companion edits resolve to exact GIFs without static fallback', () => {
  const feiyu = DEFAULT_STUDIO_AI_COMPANIONS[0];

  // Full-width parentheses match exact GIFs rather than falling back to default or shorter substrings
  assert.equal(
    resolveCharacterStandeeUrl(feiyu, '思考（认真地）', true),
    resolveCharacterStandeeUrl(feiyu, '思考(认真地)', true),
  );
  assert.equal(
    resolveCharacterStandeeUrl(feiyu, '笑（指）（嘲笑）', true),
    resolveCharacterStandeeUrl(feiyu, '笑(指)(嘲笑)', true),
  );
  assert.notEqual(
    resolveCharacterStandeeUrl(feiyu, '笑（指）（嘲笑）', true),
    resolveCharacterStandeeUrl(feiyu, '笑', true),
  );
  assert.equal(
    resolveCharacterStandeeUrl(feiyu, '打字生气', true),
    resolveCharacterStandeeUrl(feiyu, '打字(生气)', true),
  );

  // Editing studio-feiyu name or avatar to a static PNG never corrupts her GIF expressions with followDefaultAvatar
  const editedFeiyu = updateStudioCharacter(feiyu, {
    name: '鱼',
    defaultAvatarUrl: 'https://files.catbox.moe/static-avatar.png',
  });
  const normalizedFeiyu = normalizeStudioCompanions([editedFeiyu])[0];
  assert.match(
    resolveCharacterStandeeUrl(normalizedFeiyu, '思考(认真地)', true),
    /\.gif$/i,
  );
});

test('mid-sentence [表情] tags and standalone emote tags preserve active expression without static default gaps', () => {
  // 1. Mid-sentence multi-tag line on Work #1 uses the FIRST cue as initial expression, not the last cue or default
  const midSentenceSegs = parseDialogueSegments(
    '唔……这部居然只给7分吗？[思考(认真地)] 不过后面[得分(10分)]真香！',
    true,
    true,
  );
  assert.equal(midSentenceSegs.length, 1);
  assert.equal(midSentenceSegs[0].expression, '思考(认真地)');
  assert.equal(resolveBubbleActiveCue(midSentenceSegs[0], 2, true).expression, '思考(认真地)');
  const secondOffset = midSentenceSegs[0].cues![1].charOffset;
  assert.equal(resolveBubbleActiveCue(midSentenceSegs[0], secondOffset, true).expression, '得分(10分)');

  // 2. Across works in buildPlaybackSteps, Work #2 with a mid-sentence tag holds Work #1's ending expression until typing reaches the tag
  const mockTiers: TierMap = {
    '9': [{ id: 801, title: '第一部', cover: '' }],
    '8': [{ id: 802, title: '第二部', cover: '' }],
  };
  const scripts = buildInitialStudioScriptList(mockTiers, []);
  scripts[0].aiRawText = '[笑] 第一部开头 [点赞] 第一部结尾';
  scripts[1].aiRawText = '唔……先卖个关子，[吃(爆米花)] 第二部句中才切表情！';

  const steps = buildPlaybackSteps(scripts);
  assert.equal(steps.length, 2);
  // At charOffset 2 of Work #2 (before '[吃(爆米花)]'), AI retains '点赞' from Work #1
  assert.equal(resolveBubbleActiveCue(steps[1].aiBubble, 2, true).expression, '点赞');
  // Once typing reaches '[吃(爆米花)]', AI switches to '吃(爆米花)'
  const cueOffset = steps[1].aiBubble.cues![0].charOffset;
  assert.equal(resolveBubbleActiveCue(steps[1].aiBubble, cueOffset, true).expression, '吃(爆米花)');

  // 3. Standalone emote tag at charOffset 0 ([闪光]) keeps bubble.expression instead of resetting to 'default'
  const emoteOnlySegs = parseDialogueSegments('[闪光] 哇塞太神了！', true, true);
  const bubbleWithCarryOver = {
    ...emoteOnlySegs[0],
    expression: '点赞',
  };
  assert.deepEqual(resolveBubbleActiveCue(bubbleWithCarryOver, 1, true), {
    expression: '点赞',
    emote: 'sparkles',
  });
});




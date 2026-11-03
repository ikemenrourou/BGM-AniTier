import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReportMarkup, parseReportIntoRichBlocks } from './reportMarkup';
import { AI_ROLES, DEFAULT_WORLD_BOOK_ENTRIES, buildTasteReportPrompt, normalizeWorldBookEntries } from './tierLogic';
import { DEFAULT_STUDIO_AI_COMPANIONS, buildStudioTimelinePrompt } from './studioDirector';

const retiredTag = 'htm1fenge';

test('reports render new and saved wrappers with summaries and streaming placeholders', () => {
  const report = '开头\n<anitier-view><body>互动页面</body></anitier-view>\n<!-- FRONTEND_SUMMARY: 小结 -->\n中段\n<anitier-view>第二页</anitier-view>\n结尾';
  const expected = [
    { type: 'narrative', markdown: '开头' },
    { type: 'html-viz', htmlContent: '<body>互动页面</body>', summary: '小结' },
    { type: 'narrative', markdown: '中段' },
    { type: 'html-viz', htmlContent: '第二页', summary: undefined },
    { type: 'narrative', markdown: '结尾' },
  ];
  assert.deepEqual(parseReportIntoRichBlocks(report), expected);
  assert.deepEqual(parseReportIntoRichBlocks(report.replaceAll('anitier-view', retiredTag)), expected);
  assert.deepEqual(parseReportIntoRichBlocks('序言\n<ANITIER-VIEW>尚未结束'), [{ type: 'narrative', markdown: '序言' }, { type: 'html-viz-loading' }]);
  assert.deepEqual(parseReportIntoRichBlocks(`<${retiredTag}>尚未结束`), [{ type: 'html-viz-loading' }]);
  assert.deepEqual(parseReportIntoRichBlocks('普通报告'), [{ type: 'narrative', markdown: '普通报告' }]);
  assert.deepEqual(parseReportIntoRichBlocks('  '), []);
  assert.equal(normalizeReportMarkup(`&lt;${retiredTag}&gt;`), '&lt;anitier-view&gt;');
});

test('saved visualization rules keep custom wording and enablement while adopting the new wrapper', () => {
  const saved = DEFAULT_WORLD_BOOK_ENTRIES.map(entry => ({
    ...entry,
    title: entry.title.replaceAll('anitier-view', retiredTag),
    content: entry.content.replaceAll('anitier-view', retiredTag) + '\n保留我的自定义补充',
    enabled: false,
  }));
  const entries = normalizeWorldBookEntries(saved);
  const visualization = entries.find(entry => entry.id === 'wb-html-visualization')!;
  assert.equal(visualization.enabled, false);
  assert.ok(visualization.content.includes('保留我的自定义补充'));
  assert.ok(visualization.content.includes('<anitier-view>'));
  assert.ok(!JSON.stringify(entries).includes(retiredTag));
  const report = buildTasteReportPrompt({}, [], 'atri', {
    persona: { ...AI_ROLES.atri, prompt: `请用 <${retiredTag}> 输出` },
    worldBookEntries: saved,
    d0Prompt: `结束于 </${retiredTag}>`,
  });
  const studio = buildStudioTimelinePrompt({
    scriptItems: [],
    companion: { ...DEFAULT_STUDIO_AI_COMPANIONS[0], prompt: `请用 <${retiredTag}> 输出` },
    worldBookEntries: saved,
  });
  for (const prompt of [report, studio]) {
    assert.ok(prompt.includes('请用 <anitier-view> 输出'));
    assert.ok(!prompt.includes(retiredTag));
  }
  assert.ok(report.includes('结束于 </anitier-view>'));
});

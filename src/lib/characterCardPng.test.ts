import test from 'node:test';
import assert from 'node:assert/strict';
import {
  embedCharacterCardInPngBytes,
  extractCharacterCardFromPngBytes,
  parseCharacterCardImportBytes,
  type StudioCharacterCardPayload,
} from './characterCardPng';

// Minimal valid 1x1 transparent PNG
const MINIMAL_1X1_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

test('embedCharacterCardInPngBytes and extractCharacterCardFromPngBytes round-trip persona, expressions, and worldbooks losslessly', () => {
  const payload: StudioCharacterCardPayload = {
    format: 'bgm-anitier-character-card-v1',
    exportedAt: '2026-11-05T00:00:00.000Z',
    character: {
      id: 'studio-custom-test',
      name: '毒舌大肥鱼改',
      subtitle: '专属分享卡',
      defaultAvatarUrl: 'https://example.com/feiyu-default.gif',
      customExpressions: [
        {
          id: 'expr-1',
          name: '思考(认真地)',
          url: 'https://example.com/feiyu-think.gif',
          note: '认真思考时使用',
        },
        {
          id: 'expr-2',
          name: '反向点赞',
          url: 'https://example.com/feiyu-dislike.gif',
          note: '嫌弃时使用',
        },
      ],
      voicePreset: 'mochi_loli',
      voicePitch: 1.18,
      prompt: '你是主人的专属毒舌鉴赏搭档，喜欢吐槽工业糖精。',
      isCustom: true,
    },
    worldBookEntries: [
      {
        id: 'wb-custom-1',
        title: '专属黑话词条',
        shortDesc: '测试词条',
        content: '遇到异世界厕纸直接开火。',
        enabled: true,
        position: 'after-character',
        priority: 100,
        scope: 'studio',
      },
    ],
  };

  const embeddedPng = embedCharacterCardInPngBytes(MINIMAL_1X1_PNG, payload);
  assert.ok(embeddedPng.length > MINIMAL_1X1_PNG.length);

  const extracted = extractCharacterCardFromPngBytes(embeddedPng);
  assert.ok(extracted);
  assert.equal(extracted.character.name, '毒舌大肥鱼改');
  assert.equal(extracted.character.voicePitch, 1.18);
  assert.equal(extracted.character.customExpressions.length, 2);
  assert.equal(extracted.character.customExpressions[0].name, '思考(认真地)');
  assert.equal(extracted.character.customExpressions[1].url, 'https://example.com/feiyu-dislike.gif');
  assert.equal(extracted.worldBookEntries?.length, 1);
  assert.equal(extracted.worldBookEntries?.[0].title, '专属黑话词条');

  // Also test parseCharacterCardImportBytes with JSON fallback
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const fromJson = parseCharacterCardImportBytes(jsonBytes);
  assert.equal(fromJson.character.name, '毒舌大肥鱼改');
  assert.equal(fromJson.character.customExpressions.length, 2);
});

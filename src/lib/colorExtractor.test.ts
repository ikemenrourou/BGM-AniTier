import test from 'node:test';
import assert from 'node:assert/strict';
import { getAnimePalette } from './colorExtractor';

test('getAnimePalette returns curated colors for known IDs', () => {
  const frieren = getAnimePalette({ id: 400602, title: '葬送的芙莉莲' });
  assert.equal(frieren.rgb[0], 122);
  assert.equal(frieren.rgb[1], 156);
  assert.equal(frieren.rgb[2], 104);

  const bocchi = getAnimePalette({ id: 328609, title: '孤独摇滚！' });
  assert.equal(bocchi.rgb[0], 166);
  assert.equal(bocchi.rgb[1], 118);
  assert.equal(bocchi.rgb[2], 108);
});

test('getAnimePalette returns curated colors for known titles', () => {
  const bebop = getAnimePalette({ title: '星际牛仔' });
  assert.equal(bebop.rgb[0], 64);
  assert.equal(bebop.rgb[1], 74);
  assert.equal(bebop.rgb[2], 98);

  const demoLove = getAnimePalette({ title: '玩玩的恋爱关系' });
  assert.equal(demoLove.rgb[0], 156);
  assert.equal(demoLove.rgb[1], 108);
  assert.equal(demoLove.rgb[2], 104);
});

test('getAnimePalette glowRgba outputs valid rgba string', () => {
  const palette = getAnimePalette({ title: '新世纪福音战士' });
  const rgba = palette.glowRgba(0.5);
  assert.match(rgba, /^rgba\(88,\s*68,\s*104,\s*0\.500\)$/);
});

test('getAnimePalette handles arbitrary unknown anime without throwing', () => {
  const unknown = getAnimePalette({ title: '神秘动画XYZ' });
  assert.ok(Array.isArray(unknown.rgb));
  assert.equal(unknown.rgb.length, 3);
  assert.ok(unknown.hex.startsWith('#'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STUDIO_SPEECH_SPEED, normalizeStudioSpeechSpeed, getStudioCharacterDelay, getStudioTurnDelay } from './studioSpeech';

test('speech speed restores saved choices and recovers missing or invalid settings', () => {
  assert.equal(normalizeStudioSpeechSpeed('2'), 2);
  assert.equal(normalizeStudioSpeechSpeed('0.75'), 0.75);
  assert.equal(normalizeStudioSpeechSpeed('0.5'), 0.5);
  assert.equal(normalizeStudioSpeechSpeed('0.25'), 0.25);
  for (const value of [null, undefined, '', 'broken', 0, -1, 99]) {
    assert.equal(normalizeStudioSpeechSpeed(value), DEFAULT_STUDIO_SPEECH_SPEED);
  }
});

test('faster speech shortens typing and dialogue pauses while retaining punctuation and work buffers', () => {
  assert.ok(getStudioCharacterDelay('字', 1.5) < getStudioCharacterDelay('字', 1));
  assert.ok(getStudioCharacterDelay('。', 2) > getStudioCharacterDelay('字', 2));
  assert.ok(getStudioCharacterDelay('字', 2) < getStudioCharacterDelay('字', 0.75));
  assert.ok(getStudioTurnDelay(false, 2) < getStudioTurnDelay(false, 1));
  assert.equal(getStudioTurnDelay(true, 2), getStudioTurnDelay(true, 0.75));
});

test('slow settings leave several seconds to read a thirty-character line', () => {
  const sentence = '字'.repeat(30);
  const duration = (speed: number) => [...sentence].reduce((total, character) => total + getStudioCharacterDelay(character, speed), 0);
  assert.ok(duration(0.75) >= 3000 && duration(0.75) <= 4000);
  assert.ok(duration(0.5) >= 4500 && duration(0.5) <= 5500);
  assert.ok(duration(0.25) >= 9000 && duration(0.25) <= 11000);
  assert.ok(Math.abs(duration(0.5) - duration(1) * 2) <= 30);
});

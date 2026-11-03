export const STUDIO_SPEECH_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const DEFAULT_STUDIO_SPEECH_SPEED = 1;

export function normalizeStudioSpeechSpeed(value: unknown): number {
  const speed = Number(value);
  return STUDIO_SPEECH_SPEEDS.some(option => option === speed) ? speed : DEFAULT_STUDIO_SPEECH_SPEED;
}

export function getStudioCharacterDelay(character: string, speed: number): number {
  // 1× reveals about 12 characters/second; punctuation keeps a small natural pause.
  const baseDelay = /[。！？!?；;…]/.test(character) ? 110 : 80;
  return Math.round(baseDelay / normalizeStudioSpeechSpeed(speed));
}

export function getStudioTurnDelay(isNewWork: boolean, speed: number): number {
  // Keep the next work's visual breathing room independent of dialogue speed.
  return isNewWork ? 900 : Math.round(550 / normalizeStudioSpeechSpeed(speed));
}

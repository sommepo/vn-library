/* Gyakuten Saiban 3 (AGB-A3JJ) native reader: the shared series engine
 * (gyakuten-native.mjs) with this edition's native RAM, sprite and script facts. */
import {GyakutenNativeEngine, validateNativeContent, FRAME_HZ, KEY} from './gyakuten-native.mjs';
import {LENGTHS, PRESENTATION} from './gs2-engine.mjs';

export const ROM_SHA1 = '70944b396da3f9ce039cc96bc1661826c37b0aa2';
// Five commands take more arguments here than in Gyakuten Saiban 2 (measured so
// that every section of every script parses exactly).
const lengths = LENGTHS.slice(); for (const [op, n] of [[0x06, 3], [0x3A, 3], [0x55, 3], [0x69, 3], [0x6B, 4]]) lengths[op] = n;
// IWRAM symbols and struct offsets for this exact edition: gMain is shifted after
// +0x3C, and the script context is reordered (script pointer first, flags at +0x1C).
export const GS3_PROFILE = Object.freeze({
  key: 'gs3', name: 'Gyakuten Saiban 3', runtimeId: 'gs3-gba-native', caseFormat: 'vnkit.gs3-case', romSha1: ROM_SHA1, glyphs: 1536, episodes: 5,
  main: 0x030037B0, script: 0x03007200, investigation: 0x03003C40, text: 0x03003E50, textStride: 12, textCount: 0x3F,
  m: {process: 8, selected: 0x17, scenario: 0xC1, episodes: 0xC2, gameState: 0xE8, detector: null},
  // No paragraph or full-screen input delay counter exists in this edition's context.
  // The choice cursor counts options from 1.
  s: {flags: 0x1C, ptr: 0, token: 0x08, delay: null, section: 0x0C, speaker: 0x24, fullDelay: null, cursor: 0x12, cursorBase: 1, textbox: 0x23,
    detector: {flag: 0x2E, value: 1, phase: 0x2F, ready: 2, token: 0x69}}, // metal detector: command 0x69 with the operation flag set; phase 2 takes input (1 while it slides in or out)
  inv: {option: 4, paused: 7, action: 0x0C, actionState: 0x10, options: 0x14},
  oam: {text: 2, choiceText: 58, arrows: [0, 1], plates: 38, actions: 52, scroll: 56, press: [53, 54], present: [55, 56],
    recordR: [45, 46, 47], recordA: [57, 58], recordB: [59, 60], lockStop: [48, 49], lockPresent: [50, 51]},
  // The episode select is a carousel: 1-based cursor, episode count in the enable byte's high nibble.
  select: {state: 3, carousel: true},
  lengths, presentation: PRESENTATION,
});

export function validateGS3NativeContent(c) { return validateNativeContent(GS3_PROFILE, c); }
export class GS3NativeEngine extends GyakutenNativeEngine {
  static create(content, options = {}) { return GyakutenNativeEngine.createWith(GS3_PROFILE, content, options, GS3NativeEngine); }
  constructor(content, rom, data, options = {}, profile = GS3_PROFILE) { super(content, rom, data, options, profile); }
}
export {FRAME_HZ, KEY};

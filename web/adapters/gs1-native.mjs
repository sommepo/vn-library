/* Gyakuten Saiban (AGB-ASBJ) native reader: the shared series engine
 * (gyakuten-native.mjs) with this edition's native RAM, sprite and script facts. */
import {GyakutenNativeEngine, validateNativeContent, FRAME_HZ, KEY} from './gyakuten-native.mjs';
import {LENGTHS, PRESENTATION} from './gs2-engine.mjs';

export const ROM_SHA1 = '15c0e3389709bb275c42e99ed25212d09e49e361';
// IWRAM symbols and struct offsets for this exact edition (gMain is laid out
// differently from later editions: process at +4, scenario at +0x8D).
export const GS1_PROFILE = Object.freeze({
  key: 'gs1', name: 'Gyakuten Saiban', runtimeId: 'gs1-gba-native', caseFormat: 'vnkit.gs1-case', romSha1: ROM_SHA1, glyphs: 1351, episodes: 4,
  main: 0x03003730, script: 0x03003A70, investigation: 0x03003A50, text: 0x03003C00, textStride: 12, textCount: 0x3F,
  m: {process: 4, selected: 0x13, scenario: 0x8D, episodes: 0x8E, gameState: 0xB4, detector: null},
  s: {flags: 0, ptr: 4, token: 0x0C, delay: 0x14, section: 0x1E, speaker: 0x34, fullDelay: 0x35, cursor: 0x39, textbox: 0x38},
  inv: {option: 4, paused: 6, action: 0x0A, actionState: 0x0C, options: 0x10},
  oam: {text: 2, choiceText: 57, arrows: [0, 1], plates: 38, actions: 49, scroll: 53, press: [53, 54], present: [55, 56],
    recordR: [45, 46, 47, 48], recordA: [], recordB: [],
    // One sprite run (45-48) shows R 人物ファイル, A 決定 / B もどる or B もどる; tiles name the prompt.
    recordTiles: {R: [0x1C8, 0x1A8, 0x1B0], A: [0x1C0, 0x1D0], B: [0x1C4, 0x1CC, 0x1D8]}, lockStop: null, lockPresent: null},
  // The series command format is shared; this edition uses only commands up to 0x5F.
  lengths: LENGTHS, presentation: PRESENTATION,
});

export function validateGS1NativeContent(c) { return validateNativeContent(GS1_PROFILE, c); }
export class GS1NativeEngine extends GyakutenNativeEngine {
  static create(content, options = {}) { return GyakutenNativeEngine.createWith(GS1_PROFILE, content, options, GS1NativeEngine); }
  constructor(content, rom, data, options = {}, profile = GS1_PROFILE) { super(content, rom, data, options, profile); }
}
export {FRAME_HZ, KEY};

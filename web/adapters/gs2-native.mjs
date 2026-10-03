/* Gyakuten Saiban 2 (AGB-A3GJ) native reader: the shared series engine
 * (gyakuten-native.mjs) with this edition's native RAM, sprite and script facts. */
import {GyakutenNativeEngine, validateNativeContent, FRAME_HZ, KEY} from './gyakuten-native.mjs';
import {LENGTHS, PRESENTATION} from './gs2-engine.mjs';

export const ROM_SHA1 = 'f7a156dbed52d3edb8104112ae40e6e2aaca57f9';
// IWRAM symbols and struct offsets for this exact edition.
export const GS2_PROFILE = Object.freeze({
  key: 'gs2', name: 'Gyakuten Saiban 2', runtimeId: 'gs2-gba-native', caseFormat: 'vnkit.gs2-case', romSha1: ROM_SHA1, glyphs: 1416, episodes: 4,
  main: 0x030037B0, script: 0x03003C40, investigation: 0x03003C20, text: 0x03003E70, textStride: 12, textCount: 0x3F,
  m: {process: 8, selected: 0x17, scenario: 0xB3, episodes: 0xB4, gameState: 0xDC, detector: 0x2B4},
  s: {flags: 0, ptr: 4, token: 0x0C, delay: 0x14, section: 0x1E, speaker: 0x34, fullDelay: 0x35, cursor: 0x39, textbox: 0x38},
  inv: {option: 4, paused: 7, action: 0x0C, actionState: 0x0E, options: 0x12},
  oam: {text: 2, choiceText: 58, arrows: [0, 1], plates: 38, actions: 52, scroll: 56, press: [53, 54], present: [55, 56],
    recordR: [45, 46, 47], recordA: [57, 58], recordB: [59, 60], lockStop: [48, 49], lockPresent: [50, 51]},
  lengths: LENGTHS, presentation: PRESENTATION,
});

export function validateGS2NativeContent(c) { return validateNativeContent(GS2_PROFILE, c); }
export class GS2NativeEngine extends GyakutenNativeEngine {
  static create(content, options = {}) { return GyakutenNativeEngine.createWith(GS2_PROFILE, content, options, GS2NativeEngine); }
  constructor(content, rom, data, options = {}, profile = GS2_PROFILE) { super(content, rom, data, options, profile); }
}
export {FRAME_HZ, KEY};

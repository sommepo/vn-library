// Synthetic tests for the GBA machine: hand-assembled Thumb/ARM code, no game data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {GBA} from '../web/adapters/gba/machine.mjs';
import {PPU} from '../web/adapters/gba/ppu.mjs';
import {APU} from '../web/adapters/gba/apu.mjs';
import {pack, unpack} from '../web/adapters/gba/pack.mjs';

function cart(words16, arm = []) {
  const rom = new Uint8Array(0x1000), v = new DataView(rom.buffer);
  arm.forEach((w, i) => v.setUint32(i * 4, w, true));
  words16.forEach((w, i) => v.setUint16(0x100 + i * 2, w, true));
  return rom;
}
const run = (g, steps) => { for (let k = 0; k < steps; k++) g.cpu.step(); };

test('Thumb arithmetic, flags, branches, calls and stack', () => {
  const code = [
    0x2005,         // movs r0,#5
    0x2103,         // movs r1,#3
    0x1a42,         // subs r2,r0,r1   -> 2, C=1
    0x1ac3,         // subs r3,r0,r3?  (r3=0) -> 5
    0x4348,         // muls r0,r1      -> 15
    0xb500,         // push {lr}
    0xf000, 0xf802, // bl +4 -> target
    0xe7fe,         // b .
    0x0000,
    0x3401,         // target: adds r4,#1
    0x4770,         // bx lr
  ];
  const g = new GBA(cart(code)); g.cpu.reset(0x08000101);
  run(g, 5); const R = g.cpu.r;
  assert.deepEqual([R[0], R[1], R[2], R[3]], [15, 3, 2, 5]); assert.equal(g.cpu.c, 1);
  run(g, 5); assert.equal(R[4], 1); assert.equal(R[15], 0x08000110, 'returned after the call');
});

test('ARM data processing, conditional execution, loads/stores and BX to Thumb', () => {
  const arm = [
    0xE3A00403, // mov r0,#0x03000000
    0xE3A0102A, // mov r1,#42
    0xE5801000, // str r1,[r0]
    0xE5902000, // ldr r2,[r0]
    0xE3520029, // cmp r2,#41
    0xC2833001, // addgt r3,r3,#1
    0xD2833010, // addle r3,r3,#16
    0xE28F4001, // add r4,pc,#1  (points at next+8 | 1)
    0xE12FFF14, // bx r4
    0x00000000,
    0x2707,     // (thumb at +0x28) movs r7,#7 ; b .
  ];
  const rom = cart([], arm); new DataView(rom.buffer).setUint32(0x24, 0xE7FE2707, true);
  const g = new GBA(rom); g.cpu.reset(0x08000000);
  run(g, 10); const R = g.cpu.r;
  assert.equal(R[2], 42); assert.equal(R[3], 1); assert.equal(g.cpu.t, 1); assert.equal(R[7], 7);
});

test('BIOS services: division and LZ77 decompression', () => {
  const g = new GBA(cart([0xdf06, 0xe7fe])); g.cpu.reset(0x08000101);
  g.cpu.r[0] = (-17) >>> 0; g.cpu.r[1] = 5; run(g, 1);
  assert.equal(g.cpu.r[0] | 0, -3); assert.equal(g.cpu.r[1] | 0, -2); assert.equal(g.cpu.r[3], 3);
  const blob = [0x10, 8, 0, 0, 0b00001000, 65, 66, 67, 68, 0x10, 0x03];
  blob.forEach((b, i) => g.write8(0x02000000 + i, b));
  const h = new GBA(cart([0xdf11, 0xe7fe])); blob.forEach((b, i) => h.write8(0x02000000 + i, b));
  h.cpu.reset(0x08000101); h.cpu.r[0] = 0x02000000; h.cpu.r[1] = 0x03000000; run(h, 1);
  assert.equal(String.fromCharCode(...Array.from({length: 8}, (_, i) => h.read8(0x03000000 + i))), 'ABCDABCD');
});

test('interrupts reach the handler through the IRQ vector and return', () => {
  // Handler at 0x03000000 (ARM): acknowledge IF, mov r5,#1, bx lr
  const g = new GBA(cart([0xe7fe])); g.cpu.reset(0x08000101);
  [0xE3A00301, 0xE2800C02, 0xE3A01001, 0xE1C010B2, 0xE3A05001, 0xE12FFF1E].forEach((w, i) => g.write32(0x03000000 + i * 4, w));
  g.write32(0x03007FFC, 0x03000000);
  g.write16(0x04000200, 1); g.write16(0x04000208, 1); g.write16(0x04000004, 8);
  g.runFrame(); assert.equal(g.cpu.r[5], 1); assert.equal(g.cpu.t, 1); assert.equal(g.cpu.mode, 0x1F);
});

test('PPU draws a 4bpp text background tile and sprites respect priority', () => {
  const g = new GBA(cart([0xe7fe])); g.ppu = new PPU(g); g.cpu.reset(0x08000101);
  g.write16(0x05000002, 0x001F); g.write16(0x05000202, 0x7C00);          // BG red, OBJ blue
  for (let k = 0; k < 32; k++) g.write8(0x06000020 + k, 0x11);            // tile 1 solid colour 1
  g.write16(0x06008000, 1);                                                // map (0,0) -> tile 1
  for (let k = 0; k < 32; k++) g.write8(0x06010000 + k, 0x11);            // OBJ tile 0 solid
  for (let i = 1; i < 128; i++) g.write16(0x07000000 + i * 8, 0x200);    // zeroed OAM would be visible: disable
  g.write16(0x07000000, 0); g.write16(0x07000002, 8); g.write16(0x07000004, 0); // 8x8 sprite at x=8
  g.write16(0x04000008, 0x1000); g.write16(0x04000000, 0x1140);            // BG0 map base 16, OBJ 1D, BG0+OBJ
  g.ppu.renderLine(0);
  const px = x => Array.from(g.ppu.frame.slice(x * 4, x * 4 + 3));
  assert.deepEqual(px(0), [255, 0, 0]); assert.deepEqual(px(8), [0, 0, 255]); assert.deepEqual(px(20), [0, 0, 0]);
});

test('snapshot packer round-trips', () => {
  const data = new Uint8Array(70000); for (let k = 0; k < data.length; k++) data[k] = k % 7 === 0 ? k & 255 : 0;
  assert.deepEqual(unpack(pack(data), data.length), data);
});

// --- batched timers, idle-loop skipping, frame skipping ------------------------------
// VBlank handler (ARM, in IWRAM): acknowledge IF bit 0, then add 1 to the byte at 0x03000100.
const VBLANK_HANDLER = [0xE3A00301, 0xE2800C02, 0xE3A01001, 0xE1C010B2, 0xE3A00403, 0xE5D01100, 0xE2811001, 0xE5C01100, 0xE12FFF1E];
// Main program: count frames in r5 by busy-waiting on that byte, the way games wait for VBlank.
const WAIT_PROGRAM = [
  0x4c03,         // ldr  r4,=0x03000100
  0x2500,         // movs r5,#0
  0x7822,         // main: ldrb r2,[r4]
  0x7820,         // wait: ldrb r0,[r4]
  0x4290,         //       cmp  r0,r2
  0xd0fc,         //       beq  wait
  0x3501,         // adds r5,#1
  0xe7f9,         // b main
  0x0100, 0x0300, // literal
];
function waiting(idleSkip) {
  const g = new GBA(cart(WAIT_PROGRAM)); g.cpu.reset(0x08000101); g.cpu.idleSkip = idleSkip;
  VBLANK_HANDLER.forEach((w, i) => g.write32(0x03000000 + i * 4, w)); g.write32(0x03007FFC, 0x03000000);
  g.write16(0x04000200, 1); g.write16(0x04000208, 1); g.write16(0x04000004, 8);
  return g;
}

test('skipping whole turns of a busy-wait loop leaves the machine exactly where stepping would', () => {
  const fast = waiting(true), slow = waiting(false); let stepped = 0, skipped = 0;
  for (const [g, count] of [[fast, n => { skipped += n; }], [slow, n => { stepped += n; }]]) { const thumb = g.cpu.thumb.bind(g.cpu); g.cpu.thumb = () => { count(1); thumb(); }; }
  for (let frame = 1; frame <= 6; frame++) {
    fast.runFrame(); slow.runFrame();
    assert.deepEqual(fast.snapshot(), slow.snapshot(), `frame ${frame}`);
    assert.equal(fast.cpu.r[5], frame, 'one pass of the main loop per VBlank');
  }
  assert.ok(skipped * 10 < stepped, `${skipped} instructions run instead of ${stepped}`);
});

test('timer overflows are applied at the instruction that reaches them, in batches or not', () => {
  // Timer 0: 1024 cycles per overflow, interrupt on overflow; the handler counts them.
  const handler = [0xE3A00301, 0xE2800C02, 0xE3A01008, 0xE1C010B2, 0xE3A00403, 0xE5901100, 0xE2811001, 0xE5801100, 0xE12FFF1E]; // ack IF bit 3; word at 0x03000100 += 1
  const g = new GBA(cart([0xe7fe])); g.cpu.reset(0x08000101);
  handler.forEach((w, i) => g.write32(0x03000000 + i * 4, w)); g.write32(0x03007FFC, 0x03000000);
  g.write16(0x04000200, 8); g.write16(0x04000208, 1);
  g.write16(0x04000100, 0xFC00); g.write16(0x04000102, 0xC0);
  g.runFrame();
  assert.equal(g.read32(0x03000100), Math.floor(280896 / 1024));
  assert.equal(g.timers[0].counter, 0xFC00 + (280896 + g.lineCycle) % 1024, 'the frame ran over its last line by lineCycle cycles');
});

test('a timer read inside a batch sees the count at the start of its instruction', () => {
  const code = [
    0x4c01,         // ldr  r4,=0x04000100   (4 cycles)
    0x8820,         // ldrh r0,[r4]          (4 cycles)
    0x8821,         // ldrh r1,[r4]
    0xe7fe,         // b .
    0x0100, 0x0400, // literal
  ];
  const g = new GBA(cart(code)); g.cpu.reset(0x08000101);
  g.write16(0x04000100, 0x1000); g.write16(0x04000102, 0x80);
  g.runFrame();
  assert.deepEqual([g.cpu.r[0], g.cpu.r[1]], [0x1004, 0x1008]);
});

test('a frame run without drawing leaves the same machine state and an untouched picture', () => {
  const make = () => { const g = waiting(true); g.ppu = new PPU(g); g.write16(0x05000000, 0x001F); g.write16(0x04000000, 0x0100); return g; };
  const shown = make(), hidden = make(); hidden.skipRender = true;
  for (let k = 0; k < 3; k++) { shown.runFrame(); hidden.runFrame(); }
  assert.deepEqual(hidden.snapshot(), shown.snapshot());
  assert.deepEqual(Array.from(shown.ppu.frame.slice(0, 4)), [255, 0, 0, 255]); assert.ok(hidden.ppu.frame.every(v => v === 0));
});

test('sound is produced at the output rate, whatever the batch sizes', () => {
  const g = waiting(true); g.apu = new APU(g, 48000);
  let samples = 0; for (let k = 0; k < 10; k++) { g.runFrame(); samples += g.apu.drain().length / 2; }
  assert.ok(Math.abs(samples - 10 * 280896 * 48000 / 16777216) <= 1, String(samples));
});

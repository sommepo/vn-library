// Static validation of a private Gyakuten Saiban 2 import: script identity,
// complete token parse and fail-closed native sites. No game data is embedded.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {LENGTHS, HANDLED, PRESENTATION, decodeWords, headerOf} from '../web/adapters/gs2-engine.mjs';
export async function validateDirectory(dir) {
  const content = JSON.parse(await fs.readFile(path.join(dir, 'content.json'), 'utf8')), errors = [], unsupported = [];
  let instructions = 0, glyphs = 0;
  const read = async ref => { const bytes = await fs.readFile(path.join(dir, ref.url)); return bytes; };
  const caseBytes = await read(content.runtime.case);
  if (crypto.createHash('sha256').update(caseBytes).digest('hex') !== content.runtime.case.sha256) errors.push('case.json hash mismatch');
  for (const [id, ref] of Object.entries(content.runtime.scripts)) {
    const data = JSON.parse(await read(ref)), words = decodeWords(data.words);
    const raw = Buffer.from(data.words, 'base64');
    if (crypto.createHash('sha256').update(raw).digest('hex') !== ref.sha256 || data.sha256 !== ref.sha256) { errors.push(`${id}: script hash mismatch`); continue; }
    const {entries, sections} = headerOf(words), bounds = [...entries.slice(0, sections), words.length * 2];
    for (let s = 0; s < sections; s++) {
      for (let w = bounds[s] / 2; w < bounds[s + 1] / 2;) {
        const op = words[w];
        if (op >= 0x80) { glyphs++; w++; continue; }
        const n = LENGTHS[op];
        if (n === undefined || w + n > bounds[s + 1] / 2) { errors.push(`${id}:§${s}:${(w * 2).toString(16)} invalid command ${op}`); break; }
        instructions++;
        if (!HANDLED.has(op) && !PRESENTATION.has(op)) unsupported.push({id: `${id}:${(w * 2).toString(16)}`, op});
        w += n;
      }
    }
  }
  return {errors, unsupported, instructions, glyphs, scripts: Object.keys(content.runtime.scripts).length};
}

// Native import: the exact cartridge and its ROM-bound review data.
export async function validateNativeDirectory(dir) {
  const content = JSON.parse(await fs.readFile(path.join(dir, 'content.json'), 'utf8')), errors = [];
  const rom = await fs.readFile(path.join(dir, content.runtime.rom.url));
  if (crypto.createHash('sha1').update(rom).digest('hex') !== content.runtime.rom_sha1) errors.push('cartridge SHA-1 mismatch');
  if (crypto.createHash('sha256').update(rom).digest('hex') !== content.runtime.rom.sha256) errors.push('cartridge SHA-256 mismatch');
  const caseBytes = await fs.readFile(path.join(dir, content.runtime.case.url));
  if (crypto.createHash('sha256').update(caseBytes).digest('hex') !== content.runtime.case.sha256) errors.push('case.json hash mismatch');
  const data = JSON.parse(caseBytes);
  if (data.charset?.length !== 1416 || data.nametags?.length !== 0x2F || data.speakerNametags?.length !== 56) errors.push('review data incomplete');
  return {errors, instructions: 0, unsupported: [], glyphs: data.charset?.length || 0};
}

// Any series edition's native import: exact cartridge, hashed review data, full charset.
export async function validateGyakutenNativeDirectory(dir, {glyphs}) {
  const content = JSON.parse(await fs.readFile(path.join(dir, 'content.json'), 'utf8')), errors = [];
  const rom = await fs.readFile(path.join(dir, content.runtime.rom.url));
  if (crypto.createHash('sha1').update(rom).digest('hex') !== content.runtime.rom_sha1) errors.push('cartridge SHA-1 mismatch');
  if (crypto.createHash('sha256').update(rom).digest('hex') !== content.runtime.rom.sha256) errors.push('cartridge SHA-256 mismatch');
  const caseBytes = await fs.readFile(path.join(dir, content.runtime.case.url));
  if (crypto.createHash('sha256').update(caseBytes).digest('hex') !== content.runtime.case.sha256) errors.push('case.json hash mismatch');
  const data = JSON.parse(caseBytes);
  if (data.charset?.length !== glyphs || !data.nametags?.length || !Array.isArray(data.speakerNametags)) errors.push('review data incomplete');
  return {errors, instructions: 0, unsupported: [], glyphs: data.charset?.length || 0};
}

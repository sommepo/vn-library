/* SNS 01.82 control operands, verified against ULJS-00219 v1.01 consumers.
 * No title scripts, labels, progress tables or media are embedded here. */
export const FLAG_COUNT = 0x800;
export class Operands {
  constructor(instruction) {
    this.instruction = instruction; this.bytes = instruction.args; this.pos = 0;
    if (!Array.isArray(this.bytes) || this.bytes.some(v => !Number.isInteger(v) || v < 0 || v > 255)) this.fail('Invalid operand bytes');
  }
  fail(message) { throw Error(`${this.instruction.id}: ${message}`); }
  uint(n = 1) {
    if (this.pos + n > this.bytes.length) this.fail('Truncated SNS operand');
    let value = 0;
    while (n--) value = value * 256 + this.bytes[this.pos++];
    return value;
  }
  signed16() { const n = this.uint(2); return n < 0x8000 ? n : n - 0x10000; }
  label() {
    const start = this.pos;
    while (this.pos < this.bytes.length && this.bytes[this.pos]) {
      if (this.bytes[this.pos] < 0x20 || this.bytes[this.pos] > 0x7e) this.fail('Invalid source label');
      this.pos++;
    }
    if (this.pos === this.bytes.length || this.pos === start) this.fail('Unterminated or empty source label');
    return String.fromCharCode(...this.bytes.slice(start, this.pos++));
  }
  target() { return {script: this.uint(), label: this.label()}; }
  end() { if (this.pos !== this.bytes.length) this.fail('Unconsumed SNS operands'); }
  flag(index) { if (!Number.isInteger(index) || index < 0 || index >= FLAG_COUNT) this.fail(`Flag index outside native bank: ${index}`); return index; }
}

export function compare(left, operator, right) {
  switch (operator) {
    case 6: case 7: return left === right;
    case 8: return left > right;
    case 9: return left < right;
    case 10: return left >= right;
    case 11: return left <= right;
    case 12: return left !== right;
    default: throw Error(`Unsupported SNS comparison ${operator}`);
  }
}

// Native 0x08898748: the negative prefix counts predicates, not join bytes.
// Joins set an accumulator mode; there is no precedence or short circuit.
export function condition(r, {literal = 0x57, variable = 0x58, unconditional = false} = {}) {
  const first = r.signed16();
  if (unconditional && first === -1) return [{constant: true}];
  function predicate(index, kind, join) {
    r.flag(index);
    const operator = r.uint(), value = kind === variable ? r.signed16() : r.uint(2);
    if (operator < 6 || operator > 12) r.fail(`Unsupported SNS comparison ${operator}`);
    if (kind === variable) r.flag(value);
    return {index, operator, value, variable: kind === variable, join};
  }
  if (first >= 0) return [predicate(first, literal, 0)];
  const count = -first, predicates = []; let join = 0, tokens = 0;
  while (predicates.length < count) {
    if (++tokens > 512) r.fail('Condition budget exceeded');
    const code = r.uint();
    if (code === 0 || code === 1) { join = code; continue; }
    if (code !== literal && code !== variable) r.fail(`Unknown condition term ${code}`);
    predicates.push(predicate(r.signed16(), code, join));
  }
  return predicates;
}
export function evaluate(clauses, flags) {
  let result = false;
  for (const c of clauses) {
    if ('constant' in c) return c.constant;
    const yes = compare(flags[c.index], c.operator, c.variable ? flags[c.value] : c.value);
    result = c.join === 1 ? result && yes : result || yes;
  }
  return result;
}
export function decodeBranch(i) {
  const r = new Operands(i), clauses = condition(r), target = r.target(); r.end();
  return {clauses, target}; // Jump if false, fall through if true.
}
export function decodeChoice(i) {
  const r = new Operands(i), presentation = [r.uint(), r.uint(), r.uint()], count = r.uint();
  if (count < 1 || count > 10) r.fail('Choice exceeds native capacity');
  const options = Array.from({length: count}, (_, index) => ({index, spacing: r.uint(), ...r.target()}));
  const restartLabel = i.code === 0x54 ? r.label() : null; r.end();
  return {presentation, options, restartLabel, timeoutFrames: i.code === 0x55 ? 0 : presentation[2] * 60};
}

export function decodeCheckpoint(instruction) {
  const operands = new Operands(instruction), restart = operands.uint();
  operands.end();
  if (restart > 1) operands.fail('Unknown source checkpoint mode');
  return {restart: restart === 1};
}

export function decodeSystem(instruction) {
  const operands = new Operands(instruction), type = operands.uint(), code = operands.uint();
  operands.end();
  if (type > 2) operands.fail('Unknown source system command');
  return {type, code};
}

export function decodeLink(i) {
  const r = new Operands(i), mode = r.uint();
  if (i.code === 0x70) {
    const clauses = condition(r, {literal: 0x70, variable: 0x71, unconditional: true});
    const target = r.target(), field = r.uint(2), flag = r.flag(r.signed16());
    r.flag(flag + 0x44c); r.end();
    return {mode, clauses, target, field, flag};
  }
  if (![0x6c, 0x74, 0x78].includes(i.code)) r.fail('Unknown link kind');
  const field = r.uint(2), extra = i.code === 0x78 ? r.uint(2) : null;
  const target = r.target(); r.end();
  return {mode, field, extra, target};
}

// 0x088983f0's restricted dispatcher is used while composing choice labels.
// Branches and writes outside this list are deliberately not executed there.
export const CHOICE_RENDER_CODES = new Set([0x2d,1,0x1b,0x5e,0x4c,0x28,0x0e,0x3b,0x1c,0x22,
  0x5f,0x0f,0x31,0x45,0x46,0x47,0x2b,0x2c,0x23,0xbc,0x43,0xc0]);
// 0x0886d874 uses this source code point as a suppressible half-width space.
// Keep the recovered CP932 string and raw bytes intact; normalize display only.
export const source428StoryText=text=>text.replaceAll('\u4edd',' ');
export function choiceText(script, offset) {
  const index = script.tokens.findIndex(t => t.offset === offset);
  if (index < 0) throw Error('Choice target outside decoded source');
  let text = '', ruby = false, recommended = false;
  for (let n = index; n < script.tokens.length && n < index + 2000; n++) {
    const t = script.tokens[n];
    if (ruby) { if (t.code === 0x1d) ruby = false; continue; }
    if (!CHOICE_RENDER_CODES.has(t.code)) continue;
    if (t.code === 0x1c) { ruby = true; continue; }
    if (t.code === 1) { text += source428StoryText(t.text); continue; }
    if (t.code === 0x1b) { text += '\n'; continue; }
    if (t.code === 0xbc) { recommended = true; continue; }
    if (t.code === 0x5e) return {text: text.trimEnd(), recommended};
    if (t.code === 0xc0) {
      const system = decodeSystem(t);
      if (system.type === 1 && system.code === 3) continue;
    }
    // Known menu text styling/delimiters. Native tutorials require their own UI.
    if ([0x2d,0x22,0x23,0x28,0x0f,0x31,0x3b,0x43].includes(t.code)) continue;
    throw Error(`${t.id}: Unsupported choice presentation command 0x${t.code.toString(16)}`);
  }
  throw Error('Choice label did not reach its source terminator');
}

export function validateControl(scripts) {
  const errors = [], counts = {branches: 0, choices: 0, options: 0, links: 0, threads: 0, targets: 0, checkpoints: 0, systems: 0};
  function target(t, i) {
    if (!scripts[t.script]?.labels[t.label]) throw Error(`${i.id}: Missing source label`);
    counts.targets++;
  }
  for (const script of Object.values(scripts)) for (const i of script.tokens) {
    try {
      if (i.code === 0x22) {
        decodeCheckpoint(i); counts.checkpoints++;
      } else if (i.code === 0xc0) {
        decodeSystem(i); counts.systems++;
      } else if ([0x52,0x56,0x59,0x5a].includes(i.code)) {
        const r = new Operands(i); target(r.target(), i); r.end();
      } else if (i.code === 0x57) {
        const branch = decodeBranch(i); target(branch.target, i); counts.branches++;
      } else if ([0x53,0x54,0x55].includes(i.code)) {
        const choice = decodeChoice(i); counts.choices++;
        if (choice.restartLabel) {
          const matches=Object.values(scripts).filter(s=>s.labels[choice.restartLabel]);
          if(matches.length!==1)throw Error(`${i.id}: Missing/ambiguous choice restart label`);
          counts.targets++;
        }
        for (const option of choice.options) {
          target(option, i);
          choiceText(scripts[option.script], scripts[option.script].labels[option.label].offset);
          counts.options++;
        }
      } else if ([0x6c,0x70,0x74,0x78].includes(i.code)) {
        target(decodeLink(i).target,i); counts.links++;
      } else if ([0xa1,0xa2,0xa3].includes(i.code)) {
        const r=new Operands(i);target(r.target(),i);
        if(i.code===0xa1)r.uint();r.end();counts.threads++;
      } else if ([0x5c,0x5d].includes(i.code)) {
        const r = new Operands(i); r.flag(r.uint(2)); r.end();
      }
    } catch (error) { errors.push({id: i.id, message: error.message}); }
  }
  return {counts, errors};
}

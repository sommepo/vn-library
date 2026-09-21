/* Original SCRP interpreter for SLPS-25222 v1.04. See docs/pia-vm.md.
 * Source data is supplied by the private import. No commercial script is bundled.
 */

export const PIA_VM_VERSION = 1;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const copy = value => structuredClone(value);
const canonical = name => {
  const value = String(name).toUpperCase();
  if (!/^[A-Z0-9_-]+(?:\.SPC)?$/.test(value)) throw new Error(`Unsafe SCRP name: ${name}`);
  return value.endsWith('.SPC') ? value : `${value}.SPC`;
};

export class PiaVMError extends Error {
  constructor(message, instruction, script, pc) {
    const source = instruction?.id ?? `${script}:code:${Number(pc).toString(16).padStart(8, '0')}`;
    super(`${message} [${source}${instruction?.offset == null ? '' : `; file+0x${instruction.offset.toString(16)}`} ]`);
    this.name = 'PiaVMError';
    this.source = source;
    this.fileOffset = instruction?.offset;
  }
}

/** Small adapter-local VM. Native presentation and game state are external callbacks. */
export class PiaVM {
  constructor(scripts = {}, {entry = 'OPEN01.SPC', native, state} = {}) {
    this.scripts = new Map();
    this.native = native;
    for (const [name, parsed] of scripts instanceof Map ? scripts : Object.entries(scripts)) this.addScript(parsed, name);
    this.state = {
      format: 'vnkit.pia-scrp-state', version: PIA_VM_VERSION,
      entry: canonical(entry), frame: null, parents: [], nextFrameId: 1,
      globals: {number: {}, string: {}}, native: {}, pending: null,
      pendingNative: null, ended: false, fault: null, steps: 0,
    };
    if (state) this.restore(state);
    else this.startScript(entry);
  }

  fail(message) {
    throw new PiaVMError(message, this._instruction, this.state.frame?.script, this.state.frame?.pc);
  }

  addScript(parsed, suppliedName = parsed?.source) {
    const name = canonical(suppliedName);
    if (!parsed || !Array.isArray(parsed.instructions) || !Array.isArray(parsed.strings) || parsed.failures?.length)
      throw new Error(`Cannot execute invalid static SCRP import: ${name}`);
    if (canonical(parsed.source) !== name) throw new Error(`SCRP source identity mismatch: ${name}`);
    const previous = this.scripts.get(name);
    if (previous) {
      if (!parsed.sha256 || previous.parsed.sha256 !== parsed.sha256) throw new Error(`Conflicting SCRP source: ${name}`);
      return;
    }
    const instructions = new Map();
    for (const instruction of parsed.instructions) {
      if (!Number.isSafeInteger(instruction.code_offset) || !Number.isSafeInteger(instruction.size) || instruction.size < 1 || instructions.has(instruction.code_offset))
        throw new Error(`Invalid SCRP instruction address: ${name}`);
      instructions.set(instruction.code_offset, instruction);
    }
    const strings = new Map(parsed.strings.map(string => [string.code_offset, string]));
    const relocations = {number: new Map(), string: new Map()};
    for (const chunk of parsed.chunks ?? []) {
      const kind = chunk.kind === 'NVAR' ? 'number' : chunk.kind === 'SVAR' ? 'string' : null;
      if (!kind) continue;
      for (const entry of chunk.entries) for (const offset of entry.offsets) {
        if (relocations[kind].has(offset)) throw new Error(`Duplicate SCRP variable relocation: ${name}+${offset}`);
        relocations[kind].set(offset, entry.name);
      }
    }
    this.scripts.set(name, {parsed, instructions, strings, relocations});
  }

  startScript(name, parsed, mode = 'chain') {
    name = canonical(name);
    if (parsed) this.addScript(parsed, name);
    if (!['chain', 'exec'].includes(mode)) this.fail(`Unknown script-load mode ${mode}`);
    const script = this.scripts.get(name);
    if (!script) {
      this.state.pending = {kind: 'chain', script: name, mode};
      this.state.pendingNative = null;
      return false;
    }
    if (mode === 'exec' && this.state.frame) this.state.parents.push(this.state.frame);
    else this.state.parents = [];
    const data = script.parsed;
    if (!Number.isSafeInteger(data.stack_bytes) || data.stack_bytes < 4 || !Number.isSafeInteger(data.code_size)) this.fail(`Invalid stack dimensions for ${name}`);
    const registers = Array(16).fill(0);
    registers[15] = data.code_size + data.stack_bytes;
    this.state.frame = {
      id: this.state.nextFrameId++, script: name, sourceSha256: data.sha256,
      pc: 0, registers, stack: {}, calls: [],
      locals: {number: Array.from({length: data.local_number_variables}, () => []), string: Array.from({length: data.local_string_variables}, () => [])},
      interruptVectors: Array(8).fill(0), interruptFlags: 0, interruptPending: 0,
    };
    this.state.pending = null;
    this.state.pendingNative = null;
    this.state.ended = false;
    this.state.fault = null;
    return true;
  }

  loadScript(name, options = {}) { return this.startScript(name, undefined, options.mode ?? 'chain'); }
  chain(name) { return this.startScript(name, undefined, 'chain'); }
  exec(name) { return this.startScript(name, undefined, 'exec'); }
  /** _CALL writes its result before entering __scr_exec, including a lazy load. */
  replaceNativeResult(value) {
    const {top}=this.nativeArguments();
    this.state.frame.stack[top]=typeof value==='number'?this.number(value):copy(value);
  }
  /** ScrReset for the current root scenario; native/global state survives. */
  restartScenario() {
    if(this.state.parents.length)this.fail('Root scenario reset requested with an active parent');
    return this.startScript(this.state.frame.script);
  }
  /** _ChangeMessage/_ScReturn delete frames then replace the caller result word. */
  returnToScenario(value,{skipParent=false}={}) {
    if(!this.state.parents.length)this.fail('Scenario return has no parent');
    this.state.frame=this.state.parents.pop();
    if(skipParent&&this.state.parents.length)this.state.frame=this.state.parents.pop();
    this.pop();this.push(value);
    this.state.pending=null;this.state.pendingNative=null;this.state.ended=false;
  }
  get currentInstruction() { return this._instruction ?? this.scripts.get(this.state.frame?.script)?.instructions.get(this.state.frame?.pc); }
  get current() { return this.state.pending; }
  get pc() { return this.state.frame?.pc; }
  get script() { return this.state.frame?.script; }

  number(value) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < -2147483648 || value > 4294967295)
      this.fail('Expected a 32-bit numeric value; pointer arithmetic is unsupported');
    return value | 0;
  }

  index(value) {
    const result = this.number(value);
    if (result < 0 || result > 1048575) this.fail(`Variable index outside bounded interpreter range: ${result}`);
    return result;
  }

  variableArray(pointer) {
    const {scope, type, name, index} = pointer;
    if (!['number', 'string'].includes(type)) this.fail('Invalid variable pointer type');
    this.index(index);
    let array;
    if (scope === 'global') {
      if (typeof name !== 'string' || !name || ['__proto__', 'prototype', 'constructor'].includes(name)) this.fail('Invalid global variable name');
      const variables = this.state.globals[type];
      if (!own(variables, name)) variables[name] = [];
      array = variables[name];
    } else if (scope === 'local') {
      const frame = [this.state.frame, ...this.state.parents].find(frame => frame?.id === pointer.frame);
      if (!frame || !Number.isInteger(name) || name < 0 || name >= frame.locals[type].length) this.fail('Dangling or invalid local variable pointer');
      array = frame.locals[type][name];
    } else this.fail('Unknown variable pointer scope');
    while (array.length <= index) array.push(0);
    return array;
  }

  getGlobal(name, index = 0, type = 'number') {
    const pointer = {kind: 'variable', scope: 'global', type, name, index};
    return this.variableArray(pointer)[index];
  }
  setGlobal(name, value, index = 0, type = 'number') {
    const pointer = {kind: 'variable', scope: 'global', type, name, index};
    this.variableArray(pointer)[index] = typeof value === 'number' ? this.number(value) : copy(value);
  }

  registerCell(operand) {
    if (!Number.isInteger(operand) || operand < 0 || operand > 255 || (operand & 127) > 15) this.fail(`Invalid register operand: ${operand}`);
    const register = operand & 127;
    if (!(operand & 128)) return {array: this.state.frame.registers, index: register};
    const pointer = this.state.frame.registers[register];
    if (pointer?.kind !== 'variable') this.fail(`Cannot dereference R${register}; expected a variable pointer`);
    return {array: this.variableArray(pointer), index: pointer.index};
  }
  readRegister(operand) { const cell = this.registerCell(operand); return cell.array[cell.index]; }
  writeRegister(operand, value) {
    const cell = this.registerCell(operand);
    cell.array[cell.index] = typeof value === 'number' ? this.number(value) : copy(value);
    if (!(operand & 128) && operand === 15) this.checkStackPointer();
  }

  checkStackPointer(offset = this.state.frame.registers[15], occupied = false) {
    const parsed = this.scripts.get(this.state.frame.script).parsed;
    const end = parsed.code_size + parsed.stack_bytes;
    if (!Number.isInteger(offset) || offset < parsed.code_size || offset > end - (occupied ? 4 : 0) || (end - offset) % 4)
      this.fail(`Invalid or overflowing SCRP stack pointer: ${offset}`);
    return offset;
  }
  push(value) {
    const frame = this.state.frame;
    const offset = this.checkStackPointer(frame.registers[15] - 4, true);
    frame.registers[15] = offset;
    frame.stack[offset] = typeof value === 'number' ? this.number(value) : copy(value);
  }
  pop() {
    const frame = this.state.frame;
    const offset = this.checkStackPointer(undefined, true);
    if (!own(frame.stack, offset)) this.fail('SCRP stack reads an unwritten word');
    const value = frame.stack[offset];
    frame.registers[15] += 4;
    return value;
  }

  stringInfo(value) {
    if (value?.kind !== 'string') return null;
    const script = this.scripts.get(value.script);
    const string = script?.strings.get(value.offset);
    if (!string) this.fail(`Unresolved source string at ${value.script}+0x${Number(value.offset).toString(16)}`);
    return string;
  }
  readString(value) {
    if (value === 0) return '';
    if (typeof value === 'string') return value;
    const info = this.stringInfo(value);
    if (!info) this.fail('Native expected a string pointer');
    return info.text;
  }

  jump(target) {
    if (!this.scripts.get(this.state.frame.script).instructions.has(target)) this.fail(`Unresolved control-flow target 0x${Number(target).toString(16)}`);
    this.state.frame.pc = target;
  }

  nativeArguments() {
    const frame = this.state.frame;
    const top = this.checkStackPointer(undefined, true);
    if (!own(frame.stack, top)) this.fail('Missing FUNC argument count');
    const count = this.index(frame.stack[top]);
    if (count > 256) this.fail(`Excessive native argument count: ${count}`);
    const args = [];
    for (let index = count; index > 0; --index) {
      const offset = this.checkStackPointer(top + index * 4, true);
      if (!own(frame.stack, offset)) this.fail('Missing FUNC argument');
      args.push(frame.stack[offset]);
    }
    return {args, top};
  }

  /** A failed native/opcode remains stopped on rerender or repeated run calls. */
  run(maxSteps = 100000) {
    if (this.state.fault) throw new Error(this.state.fault.message);
    try { return this.runUntilBoundary(maxSteps); }
    catch (error) {
      this.state.fault = {message: String(error.message ?? error), source: this.currentInstruction?.id ?? null};
      // A retry must never step past the instruction that failed.
      const instruction = this._instruction;
      if (instruction && instruction.id.startsWith(`${this.state.frame?.script}:`)) this.state.frame.pc = instruction.code_offset;
      throw error;
    }
  }

  /** Run only until a real presentation/native pause, exit, load request or failure. */
  runUntilBoundary(maxSteps) {
    const effects = [];
    if (this.state.pending || this.state.ended) return {pending: this.state.pending, effects, ended: this.state.ended};
    for (let steps = 0; steps < maxSteps; steps++) {
      if (this.state.pending || this.state.ended) return {pending: this.state.pending, effects, ended: this.state.ended};
      const frame = this.state.frame;
      const loaded = this.scripts.get(frame.script);
      const instruction = loaded.instructions.get(frame.pc);
      this._instruction = instruction;
      if (!instruction) this.fail(`No instruction at CODE+0x${frame.pc.toString(16)}`);
      if (frame.interruptPending && !(frame.interruptFlags & 1)) this.fail('Asynchronous interrupt scheduling is not implemented');
      const [a, b] = instruction.args;
      frame.pc += instruction.size;
      this.state.steps++;
      const read = operand => this.readRegister(operand);
      const numeric = operand => this.number(read(operand));
      const write = value => this.writeRegister(a, value);
      switch (instruction.op) {
        case 'SKIP': break;
        case 'JUMP': this.jump(a); break;
        case 'JUMPZ': if (read(a) === 0) this.jump(b); break;
        case 'SWITCH': {
          const value = this.number(read(a));
          const branch = instruction.cases.find(branch => (branch.value | 0) === value);
          if (branch) this.jump(branch.target);
          break;
        }
        case 'CALL': this.push(frame.pc); frame.calls.push({source: instruction.id, returnPc: frame.pc}); this.jump(a); break;
        case 'RET': {
          const target = this.number(this.pop());
          if (frame.calls.length) frame.calls.pop();
          this.jump(target); break;
        }
        case 'MOV': write(read(b)); break;
        case 'MOVI': write(b); break;
        case 'MOVA': {
          if (!loaded.strings.has(b)) this.fail(`MOVA points outside a recovered string: CODE+0x${b.toString(16)}`);
          write({kind: 'string', script: frame.script, offset: b}); break;
        }
        case 'PUSH': this.push(read(a)); break;
        case 'PUSHI': this.push(a); break;
        case 'POP': {
          // __uRegMem resolves the destination before __scrPopStack changes SP.
          const destination = this.registerCell(a), value = this.pop();
          destination.array[destination.index] = copy(value);
          if (a === 15) this.checkStackPointer();
          break;
        }
        case 'ADD': write(numeric(a) + numeric(b) | 0); break;
        case 'ADDI': write(numeric(a) + (b | 0) | 0); break;
        case 'SUB': write(numeric(a) - numeric(b) | 0); break;
        case 'SUBI': write(numeric(a) - (b | 0) | 0); break;
        case 'MUL': write(Math.imul(numeric(a), numeric(b))); break;
        case 'MULI': write(Math.imul(numeric(a), b | 0)); break;
        case 'DIV': case 'DIVI': case 'SUR': case 'SURI': {
          const denominator = instruction.op.endsWith('I') ? b | 0 : numeric(b);
          if (!denominator) this.fail('Division by zero (original handler returns an execution error)');
          const numerator = numeric(a);
          write(instruction.op.startsWith('DIV') ? Math.trunc(numerator / denominator) | 0 : numerator % denominator | 0);
          break;
        }
        case 'INC': write(numeric(a) + 1 | 0); break;
        case 'DEC': write(numeric(a) - 1 | 0); break;
        case 'NEG': write(-numeric(a) | 0); break;
        case 'AND': write(numeric(a) & numeric(b)); break;
        case 'ANDI': write(numeric(a) & b); break;
        case 'OR': write(numeric(a) | numeric(b)); break;
        case 'ORI': write(numeric(a) | b); break;
        case 'XOR': write(numeric(a) ^ numeric(b)); break;
        case 'XORI': write(numeric(a) ^ b); break;
        case 'NOT': write(~numeric(a)); break;
        case 'LAND': write(Number(read(a) !== 0 && read(b) !== 0)); break;
        case 'LANDI': write(Number(read(a) !== 0 && b !== 0)); break;
        case 'LOR': write(Number(read(a) !== 0 || read(b) !== 0)); break;
        case 'LORI': write(Number(read(a) !== 0 || b !== 0)); break;
        case 'LNOT': write(Number(read(a) === 0)); break;
        case 'LT': write(Number(numeric(a) < 0)); break;
        case 'LE': write(Number(numeric(a) <= 0)); break;
        case 'GT': write(Number(numeric(a) > 0)); break;
        case 'GE': write(Number(numeric(a) >= 0)); break;
        case 'EQ': write(Number(read(a) === 0)); break;
        case 'NE': write(Number(read(a) !== 0)); break;
        case 'LDGNVAR': case 'LDGSVAR': case 'LDLNVAR': case 'LDLSVAR': {
          const global = instruction.op.startsWith('LDG');
          const type = instruction.op.includes('NVAR') ? 'number' : 'string';
          const name = global ? loaded.relocations[type].get(instruction.code_offset + 1) : a;
          if (name == null) this.fail('Unresolved global variable relocation');
          const pointer = {kind: 'variable', scope: global ? 'global' : 'local', type, name, index: this.index(read(b))};
          if (!global) pointer.frame = frame.id;
          this.variableArray(pointer);
          this.writeRegister(b, pointer);
          break;
        }
        case 'STRADD': write(this.readString(read(a)) + this.readString(read(b))); break;
        case 'STRFREE': write(0); break;
        case 'INTVECT':
          if (a < 0 || a > 7) this.fail(`Invalid interrupt vector ${a}`);
          if (b && !loaded.instructions.has(b)) this.fail('Invalid interrupt handler target');
          frame.interruptVectors[a] = b; break;
        case 'INTON': frame.interruptFlags &= 65534; break;
        case 'INTOFF': frame.interruptFlags |= 1; break;
        case 'INT': case 'RESUME': this.fail(`Unsupported ${instruction.op} context switching`); break;
        case 'FUNC': {
          if (!instruction.native || typeof this.native !== 'function') this.fail(`Unsupported native ${instruction.native ?? '<unresolved>'}`);
          const {args, top} = this.nativeArguments();
          const returned = this.native(instruction.native, args, this, instruction);
          if (returned?.then) this.fail('Native callbacks must be synchronous; return a serializable pending event');
          if (returned?.effects) effects.push(...returned.effects);
          if (this.state.frame?.id === frame.id && !this.state.pending?.mode) {
            if (returned && own(returned, 'result')) frame.stack[top] = copy(returned.result);
            if (returned?.pending) {
              this.state.pending = copy(returned.pending);
              this.state.pendingNative = {frame: frame.id, stackOffset: top, source: instruction.id};
            }
          }
          break;
        }
        case 'EXIT':
          if (this.state.parents.length) this.state.frame = this.state.parents.pop();
          else { this.state.ended = true; this.state.pending = null; }
          break;
        default: this.fail(`Unsupported SCRP opcode ${instruction.op} (0x${instruction.opcode.toString(16)})`);
      }
    }
    this.fail(`SCRP instruction limit (${maxSteps}) reached without a presentation boundary`);
  }

  resume(result) {
    if (this.state.fault) throw new Error(this.state.fault.message);
    if (!this.state.pending) this.fail('Cannot resume a VM which is not waiting');
    if (this.state.pending.kind === 'chain') {
      const {script, mode} = this.state.pending;
      if (!this.scripts.has(script)) this.fail(`Script must be loaded before resume: ${script}`);
      this.startScript(script, undefined, mode);
      return;
    }
    if (result !== undefined) {
      const destination = this.state.pendingNative;
      if (!destination || destination.frame !== this.state.frame?.id) this.fail('Native result destination is not available');
      this.state.frame.stack[destination.stackOffset] = typeof result === 'number' ? this.number(result) : copy(result);
    }
    this.state.pending = null;
    this.state.pendingNative = null;
  }
  advance(result) { this.resume(result); return this.run(); }
  exportState() { return copy(this.state); }
  export() { return this.exportState(); }

  restore(saved) {
    if (!saved || saved.format !== 'vnkit.pia-scrp-state' || saved.version !== PIA_VM_VERSION || saved.entry !== this.state.entry)
      throw new Error('Incompatible Pia SCRP state');
    const candidate = copy(saved);
    if (!candidate.globals || !candidate.native || !Array.isArray(candidate.parents) || candidate.parents.length > 256)
      throw new Error('Malformed Pia SCRP state');
    for (const frame of [candidate.frame, ...candidate.parents]) {
      if (!frame) throw new Error('Missing saved SCRP frame');
      const script = this.scripts.get(canonical(frame.script));
      if (!script) throw new Error(`Saved script needs loading: ${frame.script}`);
      if (script.parsed.sha256 !== frame.sourceSha256 || !Array.isArray(frame.registers) || frame.registers.length !== 16 || !frame.locals || !frame.stack)
        throw new Error(`Saved SCRP source/state mismatch: ${frame.script}`);
      if (!candidate.ended && !script.instructions.has(frame.pc)) throw new Error(`Invalid saved SCRP PC: ${frame.script}+${frame.pc}`);
    }
    this.state = candidate;
    this._instruction = undefined;
    this.checkStackPointer();
    return this;
  }
}

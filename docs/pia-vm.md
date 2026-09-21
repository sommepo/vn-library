# Pia PS2 SCRP execution

`web/adapters/pia-vm.mjs` is an original interpreter for the register bytecode
recovered from SLPS-25222, executable version 1.04. It consumes the existing
static parser's private JSON output. Native game functions are implemented
separately in `pia-natives.mjs`; the reusable browser reader does not contain
these opcodes or the game's filenames.

This is an edition-specific implementation. A successful VM run does not prove
native presentation, audio or complete routes. See `pia-natives.md` and the
compatibility report for those boundaries.

## Source evidence

The supplied ELF retains sized function symbols. No executable was run to obtain
these semantics. The read-only `python3 -m vnkit.elf` command prints the named
function and address evidence; keep its output private.

| Evidence | Meaning implemented |
| --- | --- |
| `__uRegMem` at `0x00125c20` | Sixteen 32-bit register cells begin at context + `0x4c`. A register operand's high bit means dereference the pointer stored in its low-seven-bit register. |
| `ScrReset` at `0x00128800`, especially `0x0012897c`–`0x001289bc` | PC, registers and interrupt state reset to zero. R15, at context + `0x88`, is the stack offset and starts at CODE size + declared stack bytes. Local variable arrays are cleared. |
| `__scrPushStack` / `__scrPopStack` at `0x00125b60` / `0x00125bc0` | Stack grows down four bytes per word, in the same allocation after CODE. Push/pop and arithmetic on R15 share the same state. |
| `__scrCmdMOVA` at `0x001260d0` | Produces a pointer into the current CODE buffer, including embedded string payloads skipped by SKIP. |
| `__scrCmdFUNC` at `0x00127790` | Top stack word is argument count. The callback receives arguments in their original push order and a pointer to that top word for its result. It does not pop arguments. |
| `_EnterScenario` at `0x00145ad0`; `_GetSysGameClear` at `0x001481e0` | The C function's return is the scheduler result, distinct from the script value. Some natives never write the result slot, leaving its original argument count intact; others explicitly overwrite it. |
| `_scrGetVarPtr` at `0x00121e20`; LD*VAR handlers at `0x00127370`–`0x0012758c` | Variables are zero-initialized dynamically grown arrays. LD*VAR uses the destination register's current value as an array index, then replaces that register with a pointer to the selected cell. |
| `__scrReadNVar` at `0x00127c70`, `__scrReadSVar` at `0x00127ef0` | Global-variable operand placeholders are relocated by name. Unpatched numeric operand zero is not a global identifier. |
| Comparison handlers at `0x00126f50`–`0x00127188` | LT/LE/GT/GE/EQ/NE are unary tests against zero, typically following a SUBI; signed comparisons use signed 32-bit values. |
| DIV/SUR handlers at `0x00126550`–`0x00126804` | Signed division truncates toward zero; remainder has the numerator's sign. Zero denominator is an execution error. |
| `__scrCmdSTRADD` / `__scrCmdSTRFREE` at `0x00127590` / `0x00127710` | Concatenate string values, treating a null pointer as empty; free clears the destination to zero. |
| `__scr_chain` at `0x00129310`; `__scr_exec` at `0x001293a0`; `__scrCmdEXIT` at `0x001278c0` | Chain deletes all script frames before loading; exec nests a script; EXIT deletes the current script, permitting the previous frame to resume. Global and native game state are separate. |

R5900 `por rd, rs, zero` instructions establish register moves;
ordinary loads, stores, branches and calls supply the relationships above.
The disassembler is not an emulator or a general decompiler.

## Runtime interface

```js
import {PiaVM} from './web/adapters/pia-vm.mjs';

const vm = new PiaVM({'OPEN01.SPC': parsedOpening}, {
  entry: 'OPEN01.SPC',
  native(name, args, vm, instruction) {
    return nativeBridge.invoke(name, args, vm, instruction);
  },
});
let {pending, effects, ended} = vm.run();
// Resolve a real text/choice/native presentation boundary, then:
vm.resume();
({pending, effects, ended} = vm.run());
```

The synchronous native callback returns `{result?, pending?, effects?}`. Omitting
`result` preserves the native return slot's existing value. A provided result
replaces that slot; subsequent script POP/ADDI instructions perform cleanup.
Returning `pending` pauses after invoking the native exactly once. Calling
`run()` repeatedly while pending returns that pending event without replaying
effects or invoking the native again. `resume(result?)` optionally supplies a
delayed native result, then permits execution to continue. The native adapter
must apply a choice's real state changes before resuming.

`vm.readString(value)` resolves a source string pointer or a concatenated string;
`vm.stringInfo(value)` exposes its preserved source record where available.
Original strings use serializable `{kind:'string', script, offset}` pointers.
Array-cell pointers preserve scope, variable name/index and local frame identity.
Unsupported pointer arithmetic fails, rather than coercing pointers to numbers.

`getGlobal(name,index=0,type='number')` and
`setGlobal(name,value,index=0,type='number')` use named global arrays. `type` may
also be `string`. The native adapter stores all its persistent execution state in
`vm.state.native`; effects and DOM nodes do not belong there.

Scripts may be loaded on demand. `chain(name)` or `exec(name)` runs a loaded
script immediately or produces `{kind:'chain',script,mode}` as a pending event.
Fetch the declared private script asset, call `addScript(parsed)`, then `resume()`.
Alternatively use `startScript(name,parsed,mode='chain')`. Chain resets per-script
registers, locals and stack while retaining global/native state. Exec preserves
the parent frame. Names are normalized to uppercase `.SPC` basenames; paths and
conflicting source fingerprints are rejected.

`exportState()` returns format `vnkit.pia-scrp-state`, version 1. It includes
frames, registers, variable arrays, stack words, pending native result location,
pending presentation, global and native state. `restore(state)` checks the
format, entry identity, source fingerprints and control-flow locations. Scripts
referenced by saved frames must be loaded first. The containing reader save must
also validate game/content identity and preserve its media state. Restoring VM
state does not publish text or modify study history.

## Coverage and limits

The complete static instruction census of this supplied image finds 29 distinct
opcodes, all implemented by this core. Native function support is a separate
coverage dimension. No CALL, RET, INTVECT, INT, RESUME, INTON or INTOFF instruction
occurs in the supplied script census. CALL/RET and vector/enable registration are
implemented from the handlers but lack real-script coverage. Interrupt context
switching and external interrupt scheduling fail explicitly. A future game using
those operations requires additional work.

Every MOVA in the supplied census corresponds to a recovered embedded string.
Pointers into other CODE data, byte-level string pointer arithmetic, unknown
instructions, unresolved relocations and missing native handlers fail with their
script ID and file offset. Dynamic array indices are bounded at 1,048,575 and a
single run stops with an error after 100,000 instructions without a presentation
boundary. These are interpreter resource bounds, not original-game semantics.
Execution errors are latched in the saved VM state and retain the failing PC;
rerendering or retrying `run()` cannot step past an unknown native or instruction.

`node tests/pia-vm.test.mjs` runs six original instruction fixtures covering the
native stack ABI, signed division/remainder, local/global references, branch
restoration, lazy chain state, source compatibility and failures. They contain
no commercial dialogue and do not count toward real-game coverage. Actual
private integration results belong in `private/evidence/` and are reported
separately by the game adapter/reader smoke checks.

## Private actual-game smoke

The distributable harness contains no commercial dialogue. Supply a completed
private runtime import:

```sh
node tests/pia-real-smoke.mjs private/library/pia-runtime --max-segments 150 --all-scripts --report private/evidence/real-smoke.json
```

Reports contain source IDs, counts and presentation/state digests, never dialogue
or images. An existing report is not overwritten. The main path chooses its first
available choice; the first encountered choice is also checked separately along
each available option. Save checks compare eight subsequent presentation and
execution-state digests before/after restoring that choice. The reported native
call totals include those branch/save exercises. Text-segment totals describe
the successive main path only.

`--all-scripts` validates every declared script, source identity, instruction
target, MOVA string, global relocation and FUNC relocation, and checks registered
resource files. It distinguishes static resolution from actual native execution.
The supplied image census is 1,118 scripts, 1,039,001 instructions, 117,781 string
records, 29 used opcode kinds and 119 named native functions. Those counts do not
mean every native or route has been implemented.

The headless harness does not play media. Ordinary sound/wait completion is
simulated and counted. It stops at movies by default. For explicitly labelled
control-flow investigation beyond an unconverted movie, add
`--diagnostic-skip-movie`; this substitutes only a movie-completion boundary,
records every source location, and reports pages before the first substitution
separately. It is not movie, timing or presentation coverage. No unknown state or
control instruction is skipped. Execution failures produce exit code 3 and keep
their precise source location. Browser/media comparisons remain separate checks.

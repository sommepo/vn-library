/* Decision portion of native system selector 0x08877ec0. This is not the
 * controller, tutorial renderer or acknowledgement path. Effects remain
 * explicit requests; selecting a tutorial never marks it seen. */
import {FLAG_COUNT} from './shibuya428-control.mjs';
const byte = value => Number.isInteger(value) && value >= 0 && value <= 255;

export function plan428System(command, {flags, character, tutorialsEnabled}) {
  if (!command || !byte(command.type) || command.type > 2 || !byte(command.code))
    throw Error('428 system: invalid source command');
  if (!Array.isArray(flags) || flags.length !== FLAG_COUNT || !Array.from(flags).every(byte) ||
      !Number.isInteger(character) || character < 0 || character > 10 || typeof tutorialsEnabled !== 'boolean')
    throw Error('428 system: source context, byte flags and tutorial preference required');
  const result = {...command, yield: true, request: null, active: false, callbacks: []};
  const seen = code => flags[0x440 + code] !== 0;
  if (command.type === 0) {
    result.active = true;
    result.callbacks.push('resetPresentation');
  } else if (command.type === 1) {
    if (command.code === 4 || command.code === 255) result.request = 62;
    else if (command.code !== 3) throw Error(`428 system: Unsupported native controller command 1:${command.code}`);
  } else if (!tutorialsEnabled) {
    if (command.code === 6) Object.assign(result, {type: 0, code: 1, active: true});
    else result.yield = false;
  } else if (command.code === 20) {
    if (!(flags[300] && flags[301])) {
      if (character === 0) result.code = 19;
      else if (character === 1) result.code = flags[34] ? 42 : 18;
    }
    if (!seen(result.code)) result.request = 62;
    // This branch yields even if the selected tutorial was already seen.
  } else if (command.code === 9 || command.code === 14) {
    if (!seen(command.code)) result.request = 62;
    else if (seen(17) || (command.code === 9 && seen(13))) result.yield = false;
    else {
      result.callbacks.push('resetMessage');
      result.request = 63;
    }
  } else if (command.code === 6 && seen(6)) {
    Object.assign(result, {type: 0, code: 1, active: true});
  } else if (!seen(command.code)) result.request = 62;
  else result.yield = false;
  return result;
}

export function needs428SystemController(plan) {
  return plan.request !== null || plan.active || plan.callbacks.length !== 0;
}

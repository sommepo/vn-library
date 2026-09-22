/* Small reader/adapter boundary. Game instructions remain in adapters. */
import { Engine, validateContent } from './engine.mjs';
export async function createEngine(content, options = {}) {
  if (!content.runtime) return new Engine(content, options);
  if (content.runtime.id === 'never7-ps2-oscr') {
    const {Never7Engine} = await import('./adapters/never7-engine.mjs');
    return Never7Engine.create(content, options);
  }
  if (content.runtime.id === 'remember11-ps2-kid') {
    const {Remember11Engine} = await import('./adapters/remember11-engine.mjs');
    return Remember11Engine.create(content, options);
  }
  if (content.runtime.id === 'clannad-ps2-hunex') {
    const {ClannadEngine} = await import('./adapters/clannad-engine.mjs');
    return ClannadEngine.create(content, options);
  }
  if (content.runtime.id !== 'pia-ps2-scrp') throw new Error(`Unsupported runtime ${content.runtime.id}`);
  const { PiaEngine } = await import('./adapters/pia-engine.mjs');
  return PiaEngine.create(content, options);
}
export async function validateReaderContent(content) {
  if (!content.runtime) return validateContent(content);
  if (content.runtime.id === 'never7-ps2-oscr') {
    const {validateNever7Content} = await import('./adapters/never7-engine.mjs');
    return validateNever7Content(content);
  }
  if (content.runtime.id === 'remember11-ps2-kid') {
    const {validateRemember11Content} = await import('./adapters/remember11-engine.mjs');
    return validateRemember11Content(content);
  }
  if (content.runtime.id === 'clannad-ps2-hunex') {
    const {validateClannadContent} = await import('./adapters/clannad-engine.mjs');
    return validateClannadContent(content);
  }
  if (content.runtime.id !== 'pia-ps2-scrp') return [`Unsupported runtime ${content.runtime.id}`];
  const { validatePiaContent } = await import('./adapters/pia-engine.mjs');
  return validatePiaContent(content);
}

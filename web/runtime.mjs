/* Small reader/adapter boundary. Game instructions remain in adapters. */
import { Engine, validateContent } from './engine.mjs';
export async function createEngine(content, options = {}) {
  if (!content.runtime) return new Engine(content, options);
  if (content.runtime.id === 'gs2-gba-native') {
    const {GS2NativeEngine} = await import('./adapters/gs2-native.mjs');
    return GS2NativeEngine.create(content, options);
  }
  if (content.runtime.id === 'gs1-gba-native') {
    const {GS1NativeEngine} = await import('./adapters/gs1-native.mjs');
    return GS1NativeEngine.create(content, options);
  }
  if (content.runtime.id === 'gs3-gba-native') {
    const {GS3NativeEngine} = await import('./adapters/gs3-native.mjs');
    return GS3NativeEngine.create(content, options);
  }
  if (content.runtime.id === 'gs2-gba') {
    const {GS2Engine} = await import('./adapters/gs2-engine.mjs');
    return GS2Engine.create(content, options);
  }
  if (content.runtime.id === 'kamaitachi-ps1') {
    const {KamaitachiEngine} = await import('./adapters/kamaitachi-engine.mjs');
    return KamaitachiEngine.create(content, options);
  }
  if (content.runtime.id === 'otogirisou-ps1') {
    const {OtogirisouEngine} = await import('./adapters/otogirisou-engine.mjs');
    return OtogirisouEngine.create(content, options);
  }
  if (content.runtime.id === 'memoriesoff-ps1') {
    const {MemoriesOffEngine} = await import('./adapters/memoriesoff-engine.mjs');
    return MemoriesOffEngine.create(content, options);
  }
  if (content.runtime.id === 'higurashi-ps2-shin') {
    const {HigurashiEngine} = await import('./adapters/higurashi-engine.mjs');
    return HigurashiEngine.create(content, options);
  }
  if (content.runtime.id === 'cartagra-ps2-sc3') {
    const {CartagraEngine} = await import('./adapters/cartagra-engine.mjs');
    return CartagraEngine.create(content, options);
  }
  if (content.runtime.id === 'ever17-ps2-kid') {
    const {Ever17Engine} = await import('./adapters/ever17-engine.mjs');
    return Ever17Engine.create(content, options);
  }
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
  if (content.runtime.id === 'gs2-gba-native') {
    const {validateGS2NativeContent} = await import('./adapters/gs2-native.mjs');
    return validateGS2NativeContent(content);
  }
  if (content.runtime.id === 'gs1-gba-native') {
    const {validateGS1NativeContent} = await import('./adapters/gs1-native.mjs');
    return validateGS1NativeContent(content);
  }
  if (content.runtime.id === 'gs3-gba-native') {
    const {validateGS3NativeContent} = await import('./adapters/gs3-native.mjs');
    return validateGS3NativeContent(content);
  }
  if (content.runtime.id === 'gs2-gba') {
    const {validateGS2Content} = await import('./adapters/gs2-engine.mjs');
    return validateGS2Content(content);
  }
  if (content.runtime.id === 'kamaitachi-ps1') {
    const {validateKamaitachiContent} = await import('./adapters/kamaitachi-engine.mjs');
    return validateKamaitachiContent(content);
  }
  if (content.runtime.id === 'otogirisou-ps1') {
    const {validateOtogirisouContent} = await import('./adapters/otogirisou-engine.mjs');
    return validateOtogirisouContent(content);
  }
  if (content.runtime.id === 'memoriesoff-ps1') {
    const {validateMemoriesOffContent} = await import('./adapters/memoriesoff-engine.mjs');
    return validateMemoriesOffContent(content);
  }
  if (content.runtime.id === 'higurashi-ps2-shin') {
    const {validateHigurashiContent} = await import('./adapters/higurashi-engine.mjs');
    return validateHigurashiContent(content);
  }
  if (content.runtime.id === 'cartagra-ps2-sc3') {
    const {validateCartagraContent} = await import('./adapters/cartagra-engine.mjs');
    return validateCartagraContent(content);
  }
  if (content.runtime.id === 'ever17-ps2-kid') {
    const {validateEver17Content} = await import('./adapters/ever17-engine.mjs');
    return validateEver17Content(content);
  }
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

import { PLATFORMS, PLATFORM_KEY, storedPlatform, platformId, platformGames } from './platforms.mjs';
import { libraryAccordion } from './library-accordion.mjs';
import { MenuMusic } from './menu-music.mjs';
import { visibleLibrary } from './library.mjs';
import { Engine, plainText, characterCount, randomId } from './engine.mjs';
import { importPanel } from './import-ui.mjs';
import { LineHistory } from './rewind.mjs';
import { GlobalPause } from './global-pause.mjs';
import { isRead } from './read-status.mjs';
import { Activity, validateActivity } from './statistics.mjs';
import { Store } from './storage.mjs';
import { SaveStore, SAVE_SLOTS } from './save-storage.mjs';
import { createEngine } from './runtime.mjs';
import { seekNextChoice, NavigationCancelled } from './navigation.mjs';
import { decodeSceneImages } from './scene-images.mjs';
import { CRTDisplay } from './crt.mjs';
import { THEME_DEFAULTS, applyTheme } from './theme.mjs';
import { ReaderLayout } from './layout.mjs';
import { CRT_PRESETS, CRT_RANGES, crtPreset } from './crt-settings.mjs';
import { applyLoop, snapshotLoop, isOneShot, releaseLoop } from './audio-loop.mjs';

const $ = id => document.getElementById(id);
const defaults = { readColour: '#ff7979', speed: 0, autoDelay: 1600, fontSize: 26, lineHeight: 1.9, opacity: .68, music: .35, voice: .9, sound: .65, autoCopy: false, includeSpeaker: false, ruby: 'base', inactivity: 300, websocket: false, dimSurroundings: false, ...THEME_DEFAULTS };
let settings;
try { settings = { ...defaults, ...JSON.parse(localStorage.getItem('vnkit.settings') || '{}') }; } catch { settings = { ...defaults }; }
const store = new SaveStore(new Store());
const layout = new ReaderLayout($('gameArea'),$('stage'));
let engine, activity, contentBase, game, busy = false, auto = false, skip = false, typeTimer, autoTimer, waitTimer, waitDeadline = null, heartbeat = 0, typing = false, typeStarted = 0, token, library = [], currentDialog = '', restoredMedia = null;
const music = new Audio(), voice = new Audio();
let scriptMedia = null;
let sceneVisualKey = null;
let sceneCleanup = null;
let musicAsset = null, voiceAsset = null;
let pausedVoiceCue = false;
let gameLease = null;
let deletedAutosaveEngine = null;
let choiceSeek = null;
let loadingGame = false, panelCleanup = null, changingSaveLocation = false;
const tabId = randomId();
let selectedPlatform=storedPlatform(localStorage);
const crt = new CRTDisplay($('art'), () => {const view=engine?.presentationViewport||engine?.content.viewport;return view?[view.width,view.height]:[640,448];});
function setPlatform(id) {
  if(!PLATFORMS.some(p=>p.id===id))throw new Error('This platform environment is not supported yet.');
  selectedPlatform=id;document.body.dataset.platform=id;crt.setPlatform(id);layout.setPlatform(id);
  try{localStorage.setItem(PLATFORM_KEY,id);}catch{}
  document.querySelectorAll('.platform-navigation').forEach(n=>n.remove());

}
async function acquireGame(id) {
  if (gameLease?.id === id) return gameLease;
  if (navigator.locks?.request) {
    return new Promise((resolve, reject) => {
      navigator.locks.request(`vnkit-reader:${id}`, { ifAvailable: true }, async lock => {
        if (!lock) { reject(new Error('This game is already open in another reader tab. Close that reader before continuing here.')); return; }
        await new Promise(release => resolve({ id, release, owned: () => true }));
      }).catch(reject);
    });
  }
  const leaseKey = `vnkit.lease:${id}`;
  const readLease = () => { try { return JSON.parse(localStorage.getItem(leaseKey)); } catch { return null; } };
  const existing = readLease();
  if (existing && existing.until > Date.now() && existing.tab !== tabId) throw new Error('This game is already active in another reader tab.');
  localStorage.setItem(leaseKey, JSON.stringify({ tab: tabId, until: Date.now() + 10000 }));
  await new Promise(resolve => setTimeout(resolve, 80));
  if (readLease()?.tab !== tabId) throw new Error('Another reader tab acquired this game.');
  const refresh = setInterval(() => { if (readLease()?.tab === tabId) localStorage.setItem(leaseKey, JSON.stringify({ tab: tabId, until: Date.now() + 10000 })); }, 2500);
  return { id, owned: () => readLease()?.tab === tabId, release: () => { clearInterval(refresh); if (readLease()?.tab === tabId) localStorage.removeItem(leaseKey); } };
}
const effects = new Set();
const globalPause = new GlobalPause();
const menuMusic = new MenuMusic(new Audio(),localStorage);
let libraryMode=false;
const menuSuspended=new Set();
function leaveLibrary(){libraryMode=false;if(game)setPlatform(platformId(game));for(const a of menuSuspended)if(!a.ended)play(a);menuSuspended.clear();syncMenuMusic();}
function syncMenuMusic(){menuMusic.sync((!engine||libraryMode)&&!loadingGame&&currentDialog!=='sound-test'&&!globalPause.paused&&!document.hidden);}
for(const event of ['pointerdown','keydown'])document.addEventListener(event,syncMenuMusic);
document.addEventListener('visibilitychange',syncMenuMusic);
const lineHistory = new LineHistory();
let typePausedAt = null;
const activeMedia = () => [...new Set([music,voice,...effects,...document.querySelectorAll('audio,video')])];
document.addEventListener('play',event=>{if(globalPause.paused&&event.target instanceof HTMLMediaElement)globalPause.request(event.target);},true);
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vnkit-text-v1') : null;
const status = (message, error = false) => {
  for (const node of [$('status'), ...($('panel').open ? [$('panelStatus')] : [])]) {
    node.textContent = message; node.classList.toggle('error', error);
  }
};
crt.onError=message=>status(message,true);
store.progress=id=>game?.id===id?engine?.progressSnapshot?.():null;
store.onStatus=(id,message,error)=>{
  if(game?.id!==id)return;
  $('saveLocationStatus').textContent=message;$('saveLocationStatus').classList.toggle('error',Boolean(error));
  if(error){auto=skip=false;pauseWait();clearTimers();advanceButton();modeButtons();status(error.message,true);}
};
const guard = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(e => { auto = skip = false; modeButtons(); status(e.message, true); });
const key = name => `${game.id}:${name}`;
const selected = () => Boolean(window.getSelection()?.toString());
const currentReadable = () => { const p=engine?.current; return p?.presentation || (p?.kind==='text'?p:['pause','wait'].includes(p?.kind)&&p.display?{kind:'text',...p.display}:null); };
const seconds = ms => `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m`;
const download = (name, value, type = 'application/json') => {
  const url = URL.createObjectURL(new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function button(text, action) { const b = document.createElement('button'); b.textContent = text; b.addEventListener('click', guard(action)); return b; }
function paragraph(text, className = 'muted') { const p = document.createElement('p'); p.className = className; p.textContent = text; return p; }
function row(...children) { const e = document.createElement('div'); e.className = 'row'; e.append(...children); return e; }
export function renderText(container, value, limit = Infinity) {
  container.replaceChildren();
  const runs = typeof value === 'string' ? [value] : value;
  for (const run of runs) {
    if (limit <= 0) break;
    const base = typeof run === 'string' ? run : run.base;
    const points = [...base], shown = points.slice(0, limit).join(''); limit -= points.length;
    if (typeof run === 'string' || !run.reading || shown !== base) {
      const glyphs = engine?.content.glyphs || {};
      let ordinary = '';
      for (const char of shown) {
        if (!glyphs[char]) {ordinary += char; continue;}
        if (ordinary) {container.append(document.createTextNode(ordinary)); ordinary = '';}
        const glyph = document.createElement('span'); glyph.className = 'source-glyph'; glyph.textContent = char;
        glyph.style.backgroundImage = `url("${mediaURL(glyphs[char])}")`; container.append(glyph);
      }
      if (ordinary) container.append(document.createTextNode(ordinary));
    }
    else { const ruby = document.createElement('ruby'); ruby.append(document.createTextNode(base)); const rt = document.createElement('rt'); rt.textContent = run.reading; ruby.append(rt); container.append(ruby); }
  }
}
function exportSentence(p) { if(p.sourceGlyphs)throw Error('This preview uses original font images. Copying requires verified Unicode text.');return (p.dialogue||[p]).map(part=>`${settings.includeSpeaker && part.speaker ? `${part.speaker}：` : ''}${plainText(part.text, settings.ruby)}`).join('\n'); }
async function copyText(text, automatic = false) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); status(automatic ? 'Automatic copy: latest segment copied on this device.' : 'Copied on this device.'); return true; }
    catch { if (automatic) { status('Automatic copy unavailable: browser permission or user interaction required. Use Copy or Live text.', true); return false; } }
  } else if (automatic) { status('Automatic copy needs localhost or HTTPS on this device. Use Copy or Live text.', true); return false; }
  const temporary = document.createElement('textarea'); temporary.value = text; temporary.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01'; document.body.append(temporary); temporary.focus(); temporary.select();
  let success = false;
  try { success = document.execCommand('copy'); } catch {}
  temporary.remove();
  status(success ? 'Copied on this device.' : 'Browser denied clipboard access. Select and copy the Japanese text, or open Live text.', !success);
  return success;
}
async function publish(record, navigation) {
  const event = { format: 'vnkit.text-event', version: 1, type: record.kind, gameId: game.id, gameTitle: game.title, sessionId: activity.session.id, segmentId: record.id, occurrenceId: record.occurrenceId, speaker: record.speaker, sentence: exportSentence(record), timestamp: record.timestamp, flags: { skip: record.skipped, navigation, restored: false }, ruby: settings.ruby, speakerIncluded: settings.includeSpeaker };
  channel?.postMessage(event);
  if (settings.autoCopy && record.kind === 'text' && !record.skipped) await copyText(event.sentence, true);
  if (!settings.websocket) return;
  try {
    if (!token) { const response = await fetch('/api/session', { credentials: 'same-origin' }); if (!response.ok) throw new Error('Text relay unavailable'); token = (await response.json()).token; }
    const response = await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, event }), credentials: 'same-origin' });
    if (!response.ok) throw new Error(`Text relay rejected event (${response.status})`);
  } catch (e) { status(`${e.message}. Live text in this browser remains available.`, true); }
}
function mediaURL(id) { return new URL(engine.content.assets[id].url, contentBase).href; }
function play(audio) { if(!globalPause.request(audio))return;const promise = audio.play(); promise?.catch(error => {if (error.name !== 'AbortError') status('Browser paused audio. Use “Enable audio” in settings.');}); }
function volumes() { music.volume = Number(settings.music) * (engine?.state.scene.musicGain ?? 1); voice.volume = Number(settings.voice); for (const sound of effects) sound.volume = Number(settings.sound); }
function mediaSnapshot() {
  if (waitDeadline !== null && engine.current?.kind === 'wait') engine.current.remainingMs = Math.max(0, waitDeadline - performance.now());
  return { music: { asset: musicAsset, time: music.currentTime || 0, paused: (!menuSuspended.has(music)&&globalPause.savedPaused(music)) }, voice: { asset: voiceAsset, time: voice.currentTime || 0, paused: (!menuSuspended.has(voice)&&globalPause.savedPaused(voice)) }, scriptMedia: scriptMedia ? {asset: engine.current.asset, time: scriptMedia.currentTime || 0, paused: (!menuSuspended.has(scriptMedia)&&globalPause.savedPaused(scriptMedia))} : null, effects: [...effects].filter(audio => !audio.ended).map(audio => ({ asset: audio.vnAsset, ...(audio.vnChannel?{channel:audio.vnChannel}:{}), time: audio.currentTime || 0, paused: (!menuSuspended.has(audio)&&globalPause.savedPaused(audio)), loop: snapshotLoop(audio) })) };
}
function seek(audio, time) {
  if (!Number.isFinite(time) || time <= 0) return;
  const apply = () => { try { audio.currentTime = Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time); } catch {} };
  if (audio.readyState) apply(); else audio.addEventListener('loadedmetadata', apply, { once: true });
}
function configureAudio(audio, assetId, loop = false, sourceEngine=engine) {
  applyLoop(audio, sourceEngine.content.assets[assetId], loop, play);
}
async function renderScene(effectsToPlay = [], restoring = false) {
  const scene = engine.state.scene, visibleArt = $('art'), overlays=engine.sceneOverlays?.()||[];
  const visualKey = JSON.stringify([scene.background, scene.sprites, scene.layers, scene.task?.id, scene.task?.source, scene.task?.phase,overlays]);
  if (sceneVisualKey !== visualKey) {
  const art=document.createElement('div');
  if (scene.background) { const img = new Image(); img.className = 'background'; img.src = mediaURL(scene.background); img.alt = ''; img.onerror = () => status(`Background unavailable: ${scene.background}`, true); art.append(img); }
  for (const sprite of Object.values(scene.sprites)) {
    const img = new Image(); img.className = 'sprite'; img.src = mediaURL(sprite.asset); img.alt = '';
    img.style.cssText = `left:${sprite.x}%;top:${sprite.y}%;z-index:${sprite.z};transform:translate(-50%,-100%) scale(${sprite.scale})`; img.onerror = () => status(`Sprite unavailable: ${sprite.asset}`, true); art.append(img);
  }
  for (const [index, layer] of (scene.layers || []).entries()) {
    const crop = document.createElement('div'); crop.className = 'scene-layer';
    crop.style.cssText = `left:${layer.x}%;top:${layer.y}%;width:${layer.width}%;height:${layer.height}%;z-index:${index + 1};opacity:${layer.opacity??1}`;
    if(layer.colour){crop.style.backgroundColor=layer.colour;art.append(crop);continue;}
    const img = new Image(); img.src = mediaURL(layer.asset); img.alt = '';
    img.style.cssText = `width:100%;height:${(layer.atlasFrames || 1) * 100}%;position:absolute;top:${-(layer.frame || 0) * 100}%;left:0`;
    if (layer.alphaScale) img.style.filter = 'url(#source-alpha)';
    if(layer.tint)img.dataset.tint=JSON.stringify(layer.tint);
    crop.append(img); art.append(crop);
  }
  for(const overlay of overlays){const img=new Image();img.src=mediaURL(overlay.asset);img.alt='';img.className=`game-overlay ${overlay.role||''}`;img.style.cssText=`position:absolute;left:${overlay.x}%;top:${overlay.y}%;width:${overlay.width}%;height:${overlay.height}%;z-index:60;pointer-events:none`;art.append(img);}
  const nextCleanup=engine.mountScene?.(art,mediaURL,playSceneEffect)||null;
  let notice=setTimeout(()=>{$('loadNotice').hidden=false;},200);
  try {
    await Promise.all([decodeSceneImages(art),nextCleanup?.ready]);
    sceneCleanup?.();sceneCleanup=nextCleanup;
    visibleArt.replaceChildren(...art.childNodes);sceneVisualKey=visualKey;crt.refresh();
  } catch(error){nextCleanup?.();throw error;}
  finally{clearTimeout(notice);if(!loadingGame)$('loadNotice').hidden=true;}
  }
  if (scene.music?.asset !== musicAsset) { music.pause(); musicAsset = scene.music?.asset || null; if (musicAsset) { music.src = mediaURL(musicAsset); configureAudio(music, musicAsset, scene.music.loop); play(music); } else {releaseLoop(music); music.removeAttribute('src');} }
  if (restoring && restoredMedia?.music?.asset === musicAsset) { seek(music, restoredMedia.music.time); if (restoredMedia.music.paused) music.pause(); else if (musicAsset) play(music); }
  if (restoring) {
    for (const audio of effects) { audio.pause(); releaseLoop(audio); } effects.clear();
    for (const saved of restoredMedia?.effects || []) {
      if (!engine.content.assets[saved.asset]) throw new Error(`Saved effect unavailable: ${saved.asset}`);
      const audio = new Audio(mediaURL(saved.asset)); audio.vnAsset = saved.asset; audio.vnChannel = saved.channel; configureAudio(audio, saved.asset, saved.loop); audio.volume = settings.sound; effects.add(audio); seek(audio, saved.time); if (isOneShot(saved.loop)) audio.addEventListener('ended', () => effects.delete(audio), { once: true }); if (!saved.paused) play(audio);
    }
  }
  if(restoring&&engine.state.immediateVoice&&restoredMedia?.voice?.asset===engine.state.immediateVoice.asset){voiceAsset=restoredMedia.voice.asset;voice.src=mediaURL(voiceAsset);configureAudio(voice,voiceAsset);seek(voice,restoredMedia.voice.time);if(!restoredMedia.voice.paused)play(voice);}
  for (const effect of effectsToPlay) playSceneEffect(effect);
  volumes();
}
function playSceneEffect(effect) {
   if (effect.op === 'voice') {voice.pause();voiceAsset=effect.asset;voice.src=mediaURL(effect.asset);configureAudio(voice,effect.asset);voice.volume=Number(settings.voice);play(voice);}
   if (effect.op === 'sound') {
    const audio = new Audio(mediaURL(effect.asset)); audio.vnAsset = effect.asset; audio.vnChannel = effect.channel; configureAudio(audio, effect.asset, effect.loop === true); audio.volume = settings.sound; effects.add(audio); if (isOneShot(effect.loop)) audio.addEventListener('ended', () => effects.delete(audio), { once: true }); play(audio);
   }
   if (effect.op === 'stopSound') for (const audio of effects) if (effect.channel === 'effects' || (effect.channel && audio.vnChannel === effect.channel) || audio.vnAsset === effect.asset) {audio.pause(); releaseLoop(audio); effects.delete(audio);}
}
function pauseWait() { if (waitDeadline !== null && engine?.current?.kind === 'wait') engine.current.remainingMs = Math.max(0, waitDeadline - performance.now()); sceneCleanup?.pause?.(); clearTimeout(waitTimer); waitDeadline = null;
  if ((engine?.current?.voiceUntilMs != null || engine?.current?.presentation?.voice || engine?.state.immediateVoice) && !voice.paused && !voice.ended) {voice.pause(); pausedVoiceCue = true;}
}
function clearTimers() { clearInterval(typeTimer); clearTimeout(autoTimer); clearTimeout(waitTimer); waitDeadline = null; typing = false; }
function advanceButton() { $('nextButton').disabled = globalPause.paused || busy || store.blocked(game?.id) || !engine?.current || ['choice', 'end', 'wait', 'setup', 'movie', 'sound'].includes(engine.current.kind); }
function modeButtons() {
  $('previousButton').disabled=!lineHistory.length||!engine||busy||globalPause.paused||Boolean(choiceSeek)||store.blocked(game?.id);
  $('pauseButton').textContent=globalPause.paused?'▶ Resume':'⏸ Pause';
  $('pauseButton').setAttribute('aria-pressed',String(globalPause.paused));
  $('pauseButton').disabled=!engine||busy||loadingGame||Boolean(choiceSeek);
  $('autoButton').disabled=$('skipButton').disabled=globalPause.paused;
  $('autoButton').setAttribute('aria-pressed', String(auto)); $('skipButton').setAttribute('aria-pressed', String(skip));
  $('choiceButton').textContent = choiceSeek ? 'Cancel jump' : 'Next choice »';
  $('choiceButton').setAttribute('aria-pressed', String(Boolean(choiceSeek)));
  $('choiceButton').disabled = !choiceSeek && (globalPause.paused || busy || store.blocked(game?.id) || !engine || !['text', 'pause', 'wait'].includes(engine.current?.kind));
}
function toggleGlobalPause() {
  if(!engine||busy||loadingGame||choiceSeek)return;
  if(!globalPause.paused){
    globalPause.suspend(activeMedia());
    if(typing)typePausedAt=performance.now();
    pauseWait();clearTimeout(autoTimer);
  }else{
    if(typePausedAt!==null){typeStarted+=performance.now()-typePausedAt;typePausedAt=null;}
    globalPause.resume(activeMedia(),play);
    activity.lastTick=Date.now();activity.interact();
  }
  document.body.classList.toggle('global-paused',globalPause.paused);
  advanceButton();modeButtons();
  status(globalPause.paused?'Paused · media, story playback and activity timer stopped.':'Playback resumed.');
  if(!globalPause.paused){if(scriptMedia?.ended)guard(()=>advance('media'))();else schedule();}
}
function schedule() {
  clearTimeout(autoTimer);
  if (globalPause.paused || !engine || busy || loadingGame || choiceSeek || store.blocked(game?.id) || $('panel').open || document.hidden || activity?.paused) return;
  sceneCleanup?.resume?.();
  if (pausedVoiceCue) {pausedVoiceCue = false; if (engine.current?.voiceUntilMs != null || engine.current?.presentation?.voice || engine.state.immediateVoice) play(voice);}
  if (engine.current?.kind === 'wait') {
    const soundWait=engine.current.soundWait;
    if(soundWait&&[...effects].some(a=>a.vnAsset===soundWait.asset&&a.vnChannel===soundWait.channel&&!a.ended&&!a.error)){
      clearTimeout(waitTimer);waitDeadline=null;waitTimer=setTimeout(schedule,100);return;
    }
    if(engine.current.voiceWait&&voiceAsset===engine.state.immediateVoice?.asset&&!voice.error){
      if(voice.ended)engine.current.remainingMs=0;
      else{clearTimeout(waitTimer);waitDeadline=null;waitTimer=setTimeout(schedule,100);return;}
    }
    if (waitDeadline === null) { sceneCleanup?.resume?.(); waitDeadline = performance.now() + engine.current.remainingMs; waitTimer = setTimeout(guard(() => { waitDeadline = null; return advance('timing'); }), engine.current.remainingMs); }
    return;
  }
  if (typing) return;
  if (engine.current?.kind === 'pause') {
    if (auto || skip) autoTimer = setTimeout(guard(() => {
      if(auto&&voiceAsset&&!voice.ended&&!voice.paused){schedule();return;}
      return advance(auto ? 'auto' : 'skip');
    }), 250);
    return;
  }
  if (engine.current?.kind !== 'text') return;
  if (skip) { autoTimer = setTimeout(guard(() => advance('skip')), 75); return; }
  if (engine.current.voiceUntilMs != null && voiceAsset && (!voice.paused || voice.ended)) {
    autoTimer = setTimeout(guard(async () => {
      if (selected()) { schedule(); return; }
      if (voice.ended || voice.currentTime * 1000 >= engine.current.voiceUntilMs) await advance('timing');
      else schedule();
    }), 50);
    return;
  }
  if (auto) {
    const delay = Math.max(Number(settings.autoDelay), characterCount(engine.current.text) * 65);
    autoTimer = setTimeout(guard(async () => {
      if (voiceAsset && !voice.ended && !voice.paused) { schedule(); return; }
      await advance('auto');
    }), delay);
  }
}
function showText(p, restoring = false) {
  $('sentence').classList.toggle('read-text',isRead(activity,engine,p.id));
  $('speaker').textContent = p.speaker;
  const visibleText = p.displayText ?? p.text;
  const count = [...plainText(visibleText)].length;
  const prefixCount = p.displayText == null ? 0 : Math.max(0, count - [...plainText(p.text)].length);
  if(p.sourceGlyphs){engine.renderSourceText($('sentence'),p);engine.renderSourceText($('speaker'),p,'speaker');}
  else if (settings.speed > 0 && !skip && !restoring) {
    typing = true; typeStarted = performance.now();typePausedAt=globalPause.paused?typeStarted:null; renderText($('sentence'), visibleText, prefixCount);
    typeTimer = setInterval(() => {
      if (globalPause.paused || selected()) return;
      const shown = prefixCount + Math.floor((performance.now() - typeStarted) * Number(settings.speed) / 1000);
      renderText($('sentence'), visibleText, shown);
      if (shown >= count) { clearInterval(typeTimer); typing = false; schedule(); }
    }, 35);
  } else renderText($('sentence'), visibleText);
  // Source-timed continuations append text while the same audio clip keeps playing.
  if(engine.state.immediateVoice&&!p.voice&&voiceAsset===engine.state.immediateVoice.asset)return;
  if (!restoring && p.continueVoice && voiceAsset === p.voice) return;
  pausedVoiceCue = false; voice.pause(); voiceAsset = p.voice;
  if (voiceAsset) {
    voice.src = mediaURL(voiceAsset);
    voice.playbackRate = engine.content.assets[voiceAsset].playbackRate || 1;
    if (restoring) {
      if (restoredMedia?.voice?.asset === voiceAsset) { seek(voice, restoredMedia.voice.time); if (!restoredMedia.voice.paused) play(voice); }
    } else if (!skip) play(voice);
  }
}
async function present(result, { restoring = false, restoreMedia = false, navigation = 'advance' } = {}) {
  clearTimers();
  deletedAutosaveEngine = null;
  const view=engine.presentationViewport || engine.content.viewport;
  layout.setViewport(view);
  if(view){$('stage').style.setProperty('--game-aspect',`${view.width}/${view.height}`);$('stage').style.setProperty('--game-ratio',view.width/view.height);}
  scriptMedia?.pause(); scriptMedia?.remove(); scriptMedia = null;
  await renderScene(result.effects, restoring || restoreMedia || navigation === 'next-choice');
  const p = result.pending;
  $('choices').replaceChildren();
  if(!['wait','pause'].includes(p?.kind))$('sentence').classList.remove('read-text');
  advanceButton();
  $('textbox').hidden = p?.kind === 'movie' || p?.hideText === true;
  if (p?.kind === 'setup') {
    $('speaker').textContent = ''; $('sentence').textContent = '';
    const form = document.createElement('form'); form.className = 'startup-form';
    form.append(paragraph('New game · original name and uniform settings'));
    for (const [field, label] of [['familyName', 'Family name'], ['firstName', 'Given name']]) {
      const input = document.createElement('input'); input.name = field; input.value = p.defaults[field]; input.maxLength = 6; input.required = true;
      const heading = document.createElement('label'); heading.textContent = label; heading.append(input); form.append(heading);
    }
    const uniform = document.createElement('select'); uniform.name = 'uniformType';
    for (let number = 1; number <= 3; number++) {const option = new Option(`Uniform ${number}`, String(number)); option.selected = number === p.defaults.uniformType; uniform.append(option);}
    const label = document.createElement('label'); label.textContent = 'Original uniform selection'; label.append(uniform); form.append(label);
    const start = document.createElement('button'); start.type = 'submit'; start.textContent = 'Start'; form.append(start);
    form.addEventListener('submit', event => {event.preventDefault();if(globalPause.paused)return; guard(async () => {busy = true; try {await present(await engine.advance(Object.fromEntries(new FormData(form))), {navigation: 'start'});} finally {busy = false;advanceButton();modeButtons();schedule();}})();});
    $('choices').append(form); $('position').textContent = 'Defaults recovered from this release';
  }
  else if (p?.kind === 'text') {
    const willSkip = skip && isRead(activity, engine, p.id);
    if (skip && !willSkip) { skip = false; status('Skip stopped at unread text.'); }
    showText(p, restoring);
    engine.recordPresentation?.(p,{restoring,skipped:willSkip});
    if (!restoring) {
      const record = p.sourceGlyphs ? null : activity.present(p, { skip: willSkip });
      await Promise.all([store.put(key('activity'), activity.data), store.put(key('autosave'), engine.save(mediaSnapshot()))]);
      if (record) await publish(record, navigation);
    }
    $('position').textContent = '';
  } else if (p?.kind === 'choice') {
    auto = skip = false; voice.pause();
    $('speaker').textContent = ''; $('sentence').textContent = '選択してください。';
    if(p.promptAsset){const img=new Image();img.src=mediaURL(p.promptAsset);img.className='choice-prompt';img.alt='';$('choices').append(img);}
    for (const option of p.options) {
      const b = button('', async () => { if (selected()) return; await advance('choice', option.id); });
      if(option.asset){const img=new Image();img.src=mediaURL(option.asset);img.alt='';img.style.cssText='width:72px;max-height:100px;object-fit:contain;display:block;margin:auto';b.append(img);const label=document.createElement('span');renderText(label,option.text);b.append(label);}
      else if(option.sourceGlyphs)engine.renderSourceText(b,option);else renderText(b, option.text); $('choices').append(b);
    }
    if (!restoring) {
      const text = p.options.flatMap((o, index) => [...(index ? ['\n'] : []), ...(typeof o.text === 'string' ? [o.text] : o.text)]);
      const record = p.sourceGlyphs || p.auxiliary ? null : activity.present({ ...p, text, speaker: '', voice: null });
      await Promise.all([store.put(key('activity'), activity.data), store.put(key('autosave'), engine.save(mediaSnapshot()))]);
      if (record) await publish(record, navigation === 'next-choice' ? navigation : 'choice-presentation');
    }
    $('position').textContent = '';
  } else if (p?.kind === 'pause') {
    $('speaker').textContent = p.display?.speaker || '';
    renderText($('sentence'), p.display?.text || '');
    if(p.presentation){
      const willSkip=skip&&isRead(activity,engine,p.presentation.id);
      if(skip&&!willSkip){skip=false;status('Unread text reached. Skip stopped.');}
      showText(p.presentation,restoring);
      if(!restoring){const record=activity.present(p.presentation,{skip:willSkip});await store.put(key('activity'),activity.data);if(record)await publish(record,navigation);}
    }else if (restoring && restoredMedia?.voice?.asset) showText({ ...p.display, voice: restoredMedia.voice.asset }, true);
    $('position').textContent = '';
    if (!restoring) await store.put(key('autosave'), engine.save(mediaSnapshot()));
  } else if (p?.kind === 'wait') {
    if (p.presentation) {
      const willSkip=skip&&isRead(activity,engine,p.presentation.id);
      if(skip&&!willSkip){skip=false;status('Unread text reached. Skip stopped.');}
      showText(p.presentation, restoring);
      if (!restoring) {
        const record=activity.present(p.presentation,{skip:willSkip});
        await Promise.all([store.put(key('activity'),activity.data),store.put(key('autosave'),engine.save(mediaSnapshot()))]);
        if(record)await publish(record,navigation);
      }
    } else if ((restoring || restoreMedia) && p.display) { showText({ ...p.display, voice:restoredMedia?.voice?.asset||null },true); }
    $('position').textContent = 'まってください';
  } else if (p && ['movie', 'sound'].includes(p.kind)) {
    auto = skip = false; voice.pause(); $('speaker').textContent = ''; $('sentence').textContent = '';
    scriptMedia = document.createElement(p.kind === 'movie' ? 'video' : 'audio');
    scriptMedia.controls = true; scriptMedia.className = 'script-media';
    const sources = engine.content.assets[p.asset].sources;
    if (sources?.length) {
      for (const source of sources) {const item = document.createElement('source'); item.src = new URL(source.url, contentBase).href; item.type = source.type; scriptMedia.append(item);}
    } else scriptMedia.src = mediaURL(p.asset);
    scriptMedia.volume = p.kind === 'movie' ? Number(settings.voice) : Number(settings.sound);
    scriptMedia.addEventListener('ended', guard(() => {if (!document.hidden) return advance('media');}), {once: true});
    scriptMedia.addEventListener('error', () => status('Original media could not be decoded by this browser. The script is paused here.', true));
    (p.kind === 'movie' ? $('art') : $('choices')).append(scriptMedia);crt.refresh();
    if (restoring && restoredMedia?.scriptMedia?.asset === p.asset) {seek(scriptMedia, restoredMedia.scriptMedia.time); if (!restoredMedia.scriptMedia.paused) play(scriptMedia);}
    else play(scriptMedia);
    $('position').textContent = p.kind === 'movie' ? 'Original movie' : 'Original sound · dialogue follows when playback completes';
    if (!restoring) await store.put(key('autosave'), engine.save(mediaSnapshot()));
  } else if (p?.kind === 'end') {
    auto = skip = false; $('position').textContent = ''; music.pause();voice.pause();for(const audio of effects)audio.pause();
    engine.finishEnding?.();
    if (!restoring) await store.put(key('autosave'), engine.save(mediaSnapshot()));
  }
  if(engine.progressSnapshot)await store.put(key('progress'),engine.progressSnapshot());
  if(p?.kind==='end')await libraryPanel(true);
  if(globalPause.paused)pauseWait();
  modeButtons(); schedule(); restoredMedia = null;
}
async function advance(navigation = 'advance', optionId) {
  if (globalPause.paused || !engine || busy || $('panel').open || selected()) return;
  if(store.blocked(game.id))throw new Error('Shared saving is paused. Open Saves → Save location to reload or use local saves.');
  if (!gameLease?.owned()) throw new Error('Reader ownership moved to another tab. Reload to safely resume.');
  if (engine.current?.kind === 'wait' && navigation !== 'timing') return;
  if (['movie', 'sound'].includes(engine.current?.kind) && navigation !== 'media') return;
  activity.interact();
  if (typing && navigation !== 'timing') { clearInterval(typeTimer); typing = false; const p=currentReadable();renderText($('sentence'), p.displayText ?? p.text); schedule(); return; }
  if (engine.current?.kind === 'choice' && !optionId) return;
  const previousId=currentReadable()?.id;
  const checkpoint=engine.save(mediaSnapshot()),option=engine.current?.options?.find(o=>o.id===optionId);
  busy = true; advanceButton(); modeButtons();
  try {
    let result;
    try { result=await engine.advance(optionId); }
    catch(error){
      auto=skip=false;await engine.restore(checkpoint);restoredMedia=checkpoint.media;sceneVisualKey=null;
      await present({pending:engine.current,effects:[]},{restoring:true});
      pauseWait();clearTimers();
      throw error;
    }
    if(option&&!checkpoint.state.presentation?.auxiliary&&!checkpoint.state.pending?.auxiliary)activity.choice(option.text);
    try {await present(result,{navigation});if(previousId&&previousId!==currentReadable()?.id)lineHistory.push(checkpoint,previousId);}
    catch(error){await engine.restore(checkpoint);restoredMedia=checkpoint.media;sceneVisualKey=null;await present({pending:engine.current,effects:[]},{restoring:true});pauseWait();clearTimers();throw error;}
  } finally { busy = false; advanceButton(); modeButtons(); schedule(); }
}
async function persistCurrent() {
  if (changingSaveLocation || !engine || !gameLease?.owned()) return;
  if(store.blocked(game.id)){await store.local.put(key('activity'),activity.data);return;}
  // Deleting autosave must remain effective while viewing menus/closing the
  // tab. A new presentation or explicit restore resumes ordinary autosaving.
  if(deletedAutosaveEngine===engine){await store.put(key('activity'),activity.data);return;}
  // Reload/closing mid-seek resumes the visible starting position, never a
  // transient unpresented line or half-executed instruction.
  await Promise.all([store.put(key('autosave'), choiceSeek?.checkpoint || engine.save(mediaSnapshot()), choiceSeek?{progress:choiceSeek.progress}:{}), store.put(key('activity'), activity.data)]);
}
async function nextChoice() {
  if (choiceSeek) { choiceSeek.cancelled = true; return; }
  if (globalPause.paused || !engine || busy || $('panel').open || selected() || !['text', 'pause', 'wait'].includes(engine.current?.kind)) return;
  if (!gameLease?.owned()) throw new Error('Reader ownership moved to another tab. Reload to safely resume.');
  const checkpoint = engine.save(mediaSnapshot());
  const checkpointProgress=engine.progressSnapshot?.(),previousId=currentReadable()?.id;
  choiceSeek = { checkpoint, progress:checkpointProgress, cancelled: false }; busy = true; auto = skip = false;
  activity.tick({ reading: false }); pauseWait(); clearTimers();
  music.pause(); voice.pause(); for (const audio of effects) audio.pause();
  const controls = [...document.querySelectorAll('.toolbar button,.controls button,#nextButton')]
    .filter(b => !['choiceButton', 'dimButton', 'fullscreenButton'].includes(b.id))
    .map(b => [b, b.disabled]);
  for (const [b] of controls) b.disabled = true;
  $('stage').setAttribute('aria-busy', 'true'); $('seekNotice').hidden = false; modeButtons();
  status('Moving to the next choice. Unread dialogue is skipped. Cancel jump or Esc returns to your starting position.');
  try {
    await store.put(key('before next choice'), checkpoint);
    await store.put(key('autosave'), checkpoint);
    const result = await seekNextChoice(engine, {
      loops: checkpoint.media.effects,
      cancelled: () => choiceSeek.cancelled || document.hidden || !gameLease?.owned(),
      onProgress: ({ skippedSegments }) => { $('seekProgress').textContent = `${skippedSegments.toLocaleString()} dialogue segments passed`; },
    });
    // The VM has applied all scene/control changes. Resume only music and
    // persistent ambient effects at the destination, without skipped voices.
    restoredMedia = { effects: result.loops, music: { asset: engine.state.scene.music?.asset || null, time: 0, paused: false } };
    if (musicAsset) music.currentTime = 0;
    sceneVisualKey = null;
    await present(result, { navigation: 'next-choice' });
    choiceSeek.checkpoint = engine.save(mediaSnapshot());
    choiceSeek.progress=engine.progressSnapshot?.();
    activity.skipUnpresented(result.skippedSegments);
    await store.put(key('activity'), activity.data);
    await store.put(key('autosave'), choiceSeek.checkpoint);
    if(previousId)lineHistory.push(checkpoint,previousId);
    const destination = result.pending.kind === 'choice' ? 'Next choice reached' : result.pending.kind === 'end' ? 'End reached before another choice' : `Stopped at ${result.pending.kind}; continue it normally`;
    status(`${destination}. ${result.skippedSegments.toLocaleString()} dialogue segments skipped, with no reading credit. Saves → before next choice returns to your previous position.`);
  } catch (error) {
    choiceSeek.progress=checkpointProgress;
    await engine.restore(checkpoint); restoredMedia = checkpoint.media; sceneVisualKey = null;
    await present({ pending: engine.current, effects: [] }, { restoring: true });
    await store.put(key('autosave'), checkpoint);
    if (error instanceof NavigationCancelled) status('Jump cancelled. Your starting position has been restored.');
    else throw new Error(`${error.message} — returned to the position before Next choice.`);
  } finally {
    choiceSeek = null; busy = false;
    for (const [b, disabled] of controls) b.disabled = disabled;
    advanceButton();
    $('stage').removeAttribute('aria-busy'); $('seekNotice').hidden = true; $('seekProgress').textContent = '';
    activity.tick({ reading: false }); activity.interact(); modeButtons(); schedule();
  }
}
async function loadGame(item, resume = true, entry = 'start') {
  if(globalPause.paused)throw new Error('Resume playback before starting or loading a game.');
  if (choiceSeek) throw new Error('Cancel the current jump before opening a game.');
  if (loadingGame || busy) {status('Please wait for the current operation to finish.');return;}
  loadingGame=true;syncMenuMusic();busy=true;auto=skip=false;pauseWait();clearTimers();
  panelCleanup?.();panelCleanup=null;
  const previous={engine,activity,contentBase,game,lease:gameLease,media:engine?mediaSnapshot():null};
  const controls=[...$('panel').querySelectorAll('button')].map(b=>[b,b.disabled]);
  controls.forEach(([b])=>b.disabled=true);$('panelBody').setAttribute('aria-busy','true');
  $('loadNotice').hidden=false;
  status(resume?'Loading saved game…':'Starting a new playthrough…');advanceButton();modeButtons();
  let nextLease,committed=false;
  try {
    await persistCurrent();music.pause();voice.pause();for(const audio of effects)audio.pause();
    const response=await fetch(item.url,{signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error(`Cannot load content (${response.status})`);
    const content=await response.json(),base=new URL(item.url,location.href);
    const candidate=await createEngine(content,{baseURL:base.href});
    nextLease=await acquireGame(content.id);
    await store.prepare(content.id,candidate.signature);
    const [saved,progress,history]=await Promise.all([resume?store.get(`${content.id}:autosave`):null,store.get(`${content.id}:progress`),store.get(`${content.id}:activity`)]);
    let result,retained=false;
    if(saved){await candidate.restore(saved);candidate.applyProgress?.(progress);retained=Boolean(candidate.current);result=retained?{pending:candidate.current,effects:[]}:await candidate.run();}
    else result=candidate.startNew?await candidate.startNew(progress,entry):await candidate.run();
    libraryMode=false;menuSuspended.clear();engine=candidate;document.body.classList.remove('reader-idle');game={...item,id:content.id,title:content.title,platform:content.platform||item.platform};setPlatform(platformId(game));gameLease=nextLease;contentBase=base;
    store.onStatus(game.id,store.mode(game.id)==='shared'?'Shared saves · connected':'Local saves');
    await engine.loadReadPaths?.();activity=await loadActivity(game.id,history);sceneVisualKey=null;musicAsset=voiceAsset=null;effects.clear();
    restoredMedia=saved?.media||null;closePanel(false);
    $('gameTitle').textContent=game.title;$('gameBadge').textContent=content.synthetic?'Original test fixture':candidate.previewNotice||'';
    await present(result,{restoring:retained,restoreMedia:Boolean(saved)&&!retained,navigation:saved?'resume':'start'});
    await store.put(key('autosave'),engine.save(mediaSnapshot()));
    lineHistory.clear();committed=true;if(previous.lease&&previous.lease!==nextLease)previous.lease.release();
    localStorage.setItem('vnkit.lastGame',game.id);
    status(engine.current?.kind==='end'?'Ending reached. Progress saved; choose Start again for another route.':saved?'Saved game resumed.':'New playthrough started.');
  } catch(error) {
    if(nextLease&&nextLease!==previous.lease)nextLease.release();
    if(!committed){
      engine=previous.engine;document.body.classList.toggle('reader-idle',!engine);activity=previous.activity;contentBase=previous.contentBase;game=previous.game;gameLease=previous.lease;
      if(engine){restoredMedia=previous.media;sceneVisualKey=null;musicAsset=voiceAsset=null;try{await present({pending:engine.current,effects:[]},{restoring:true});}catch{} }
      await libraryPanel();
    }
    throw new Error(`${error.name==='TimeoutError'?'Loading timed out. Check your connection and try again.':error.message} Your existing save slots have been kept.`);
  } finally {
    loadingGame=false;syncMenuMusic();busy=false;controls.forEach(([b,disabled])=>b.disabled=disabled);$('closePanel').disabled=false;
    $('panelBody').removeAttribute('aria-busy');$('loadNotice').hidden=true;advanceButton();modeButtons();schedule();
  }
}
function openPanel(title,id){$('panelBody').classList.remove('statistics-panel');panelCleanup?.();panelCleanup=null;clearTimeout(autoTimer);pauseWait();currentDialog=id;syncMenuMusic();$('panel').classList.toggle('console-library',selectedPlatform==='ps2'&&['library','import'].includes(id));$('panel').classList.toggle('console-import',selectedPlatform==='ps2'&&id==='import');$('panelTitle').textContent=title;$('panelStatus').textContent='';$('panelBody').replaceChildren();if(!$('panel').open)$('panel').showModal();return $('panelBody');}
function closePanel(resume=true){if(changingSaveLocation)return;panelCleanup?.();panelCleanup=null;$('panel').close();currentDialog='';leaveLibrary();activity?.interact();if(resume)schedule();}
async function libraryPanel(ending = false, platform = null) {
  setPlatform(platform||(!libraryMode&&game?platformId(game):selectedPlatform));
  libraryMode=true;for(const a of [music,voice,scriptMedia,...effects])if(a&&!a.paused&&!a.ended){menuSuspended.add(a);a.pause();}
  const body = openPanel(ending ? 'Ending reached · Main menu' : 'Main menu', 'library');
  if(ending)body.append(paragraph('Your progress has been saved. Start again to follow another route; your saves and reading history are kept.', 'notice'));
  const titles=platformGames(library,selectedPlatform);
  const atmosphere=document.createElement('div');atmosphere.className='console-atmosphere';atmosphere.setAttribute('aria-hidden','true');
  atmosphere.innerHTML='<div class="console-orbit">'+Array.from({length:8},(_,i)=>`<i style="--n:${i}"></i>`).join('')+'</div><div class="console-towers">'+Array.from({length:7},(_,i)=>`<i style="--n:${i}"></i>`).join('')+'</div>';
  body.append(atmosphere);
  const catalogue=document.createElement('div');catalogue.className='console-catalogue';body.append(catalogue);
  if (!titles.length) body.append(paragraph('No games imported yet. Choose Add game / Import media to get started.', 'notice'));
  for (const item of titles) {
    const card = document.createElement('article'); card.className = 'game-card'; const title = document.createElement('h2'); title.textContent = item.title;
    const disclosure=document.createElement('details');disclosure.className='console-title';const heading=document.createElement('summary');heading.append(title);disclosure.append(heading);card.append(disclosure);
    const blocked = ['blocked', 'unsupported', 'extraction-only'].includes(item.compatibility?.status);
    const disc=document.createElement('span');disc.className='console-disc';disc.textContent=String(titles.indexOf(item)+1).padStart(2,'0');disc.setAttribute('aria-label',`Disc ${disc.textContent}`);heading.prepend(disc);
    const actions=document.createElement('div');actions.className='console-menu-actions';disclosure.append(actions);
    if (!blocked) { actions.append(button('Read / resume', () => loadGame(item)), button('Start again', () => loadGame(item, false))); }
    if(!blocked&&item.id===game?.id){
      appendNewGameEntries(actions,engine,item);
      const completed=engine.routeProgress?.().filter(r=>r.complete&&!r.extra)||[];
      if(completed.length){const details=document.createElement('details');details.className='console-progress';const summary=document.createElement('summary');summary.textContent=`${completed.length} completed · Progress saved`;details.append(summary,paragraph('Completed: '+completed.map(r=>r.label+(r.manual?' (manual)':'')).join(' · ')));disclosure.append(details);}
      else if(ending)card.append(paragraph('This ending did not award a route-completion flag. Try different choices in a new playthrough.'));
      actions.append(button('Load game',savesPanel));
      
    }
    if(!blocked){
      actions.append(button('Sound test',async()=>soundTestPanel(await libraryContext(item))));
      actions.append(button('Route progress / debug…',async()=>progressPanel(await libraryContext(item))));
    }
    if(blocked) disclosure.append(paragraph('Story execution is unavailable for this import. Extracted resources are not a faithful game port.', 'notice'));
    const info=document.createElement('details');info.className='console-import-info';const summary=document.createElement('summary');summary.textContent='Disc information';info.append(summary,paragraph(item.compatibility?.summary||'Local import.'));
    if (item.compatibility?.reportUrl) { const a = document.createElement('a'); a.href = item.compatibility.reportUrl; a.textContent = 'Compatibility report'; info.append(a); }disclosure.append(info);
    if(!blocked)actions.append(button('Save location',()=>saveLocationPanel(item)));
    catalogue.append(card);
  }
  panelCleanup=libraryAccordion(catalogue);
  const system=document.createElement('div');system.className='console-system';system.append(button('Add game / Import media',showImportPanel),button('Display / CRT',crtPanel),button('Reading settings',settingsPanel));catalogue.append(system);
  appendMenuMusic(body);
  const footer=document.createElement('div');footer.className='console-footer';footer.innerHTML='<span>LOCAL MEMORY <i></i></span>';body.append(footer);
  catalogue.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key)||e.altKey||e.ctrlKey||e.metaKey)return;const buttons=[...catalogue.querySelectorAll('summary,button:not(:disabled)')].filter(el=>{if(el.closest('[inert]'))return false;for(let parent=el.parentElement;parent&&parent!==catalogue;parent=parent.parentElement){if(parent.tagName==='DETAILS'&&!parent.open&&parent.firstElementChild!==el)return false;}return el.getClientRects().length;});if(!buttons.length)return;e.preventDefault();const at=buttons.indexOf(document.activeElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();});
  requestAnimationFrame(()=>{if(currentDialog==='library')catalogue.querySelector('summary')?.focus({preventScroll:true});});
}
function appendMenuMusic(body){
  if(!engine||libraryMode){
    const controls=document.createElement('div');controls.className='menu-music-controls';
    const update=()=>{mute.textContent=menuMusic.muted?'♪̸':menuMusic.blocked?'▷':'♪';mute.setAttribute('aria-pressed',String(menuMusic.muted));mute.title=menuMusic.muted?'Unmute menu music':menuMusic.blocked?'Play menu music':'Mute menu music';mute.setAttribute('aria-label',mute.title);};
    const mute=button('♪',()=>{if(menuMusic.blocked&&!menuMusic.muted)syncMenuMusic();else menuMusic.setMuted(!menuMusic.muted);update();});
    menuMusic.onChange=update;update();
    const label=document.createElement('label');label.setAttribute('aria-label','Menu music volume');
    const slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=100;slider.step=1;slider.value=Math.round(menuMusic.volume*100);slider.setAttribute('aria-label','Menu music volume');
    const value=document.createElement('output');value.textContent=slider.value+'%';
    slider.oninput=()=>{menuMusic.setVolume(Number(slider.value)/100);value.textContent=slider.value+'%';};label.append(slider,value);
    const credit=paragraph('Nova Mistero — virabelo · ');
    const source=document.createElement('a');source.href='https://freemusicarchive.org/music/virabelo/nova-mistero';source.textContent='Free Music Archive';source.target='_blank';source.rel='noopener';
    const license=document.createElement('a');license.href='https://creativecommons.org/licenses/by/4.0/';license.textContent='CC BY 4.0';license.target='_blank';license.rel='noopener';
    credit.append(source,document.createTextNode(' · '),license);const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Music credit';details.append(summary,credit);controls.append(mute,label,details);body.append(controls);
  }
}
async function refreshLibrary() {
  const response=await fetch('/api/library');if(!response.ok)throw new Error('Library unavailable');
  library=(await response.json()).games||[];
  library=visibleLibrary(library,location.search);
  const superseded=new Set(library.flatMap(item=>item.replaces||[]));library=library.filter(item=>!superseded.has(item.id));
}
async function showImportPanel() {
  const body=openPanel('Add game / Import media','import');
  const cleanup=await importPanel(body,{platform:selectedPlatform,refreshLibrary,openGame:async id=>{const item=library.find(g=>g.id===id);if(!item)throw new Error('Import is not in the library yet');await loadGame(item);}});
  if(currentDialog==='import'){panelCleanup=cleanup;appendMenuMusic(body);}else cleanup();
}
function applySettings() {
  document.documentElement.style.setProperty('--read-colour',/^#[0-9a-f]{6}$/i.test(settings.readColour)?settings.readColour:defaults.readColour);
  Object.assign(settings,applyTheme(settings));
  document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
  document.documentElement.style.setProperty('--line-height', settings.lineHeight);
  settings.opacity=Number.isFinite(settings.opacity)?Math.max(0,Math.min(1,settings.opacity)):defaults.opacity;
  document.documentElement.style.setProperty('--textbox-opacity', settings.opacity);
  document.documentElement.style.setProperty('--pane-opacity', settings.opacity * settings.uiOpacity);
  $('dimButton').setAttribute('aria-pressed', String(settings.dimSurroundings));
  $('dimButton').innerHTML=settings.dimSurroundings?'☀ <span>Light</span>':'☾ <span>Dim</span>';
  $('dimButton').title=$('dimButton').ariaLabel=settings.dimSurroundings?'Light surroundings':'Dim surroundings';
  localStorage.setItem('vnkit.settings', JSON.stringify(settings)); volumes();
}
async function libraryContext(item) {
  if(item.id===game?.id)return {engine,game,contentBase,active:true};
  status('Opening game menu…');
  const response=await fetch(item.url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Cannot load game menu (${response.status})`);
  const content=await response.json(),base=new URL(item.url,location.href);
  const candidate=await createEngine(content,{baseURL:base.href});
  await store.prepare(content.id,candidate.signature);
  candidate.applyProgress?.(await store.get(`${content.id}:progress`));
  await candidate.loadReadPaths?.();
  return {engine:candidate,game:{...item,id:content.id},contentBase:base,active:false};
}
async function progressPanel(context={engine,game,contentBase,active:true}) {
  const {engine,game}=context,key=name=>`${game.id}:${name}`;
  if(!engine?.routeProgress)throw new Error('This import does not provide route progress controls.');
  const body=openPanel('Route progress / debug', 'progress');
  body.append(paragraph('Manual completion is for progress earned elsewhere. It changes persistent unlocks, never reading statistics or saved story positions. Start a new playthrough to use the updated progress. Route names below may reveal future content.','notice'));
  body.append(paragraph(engine.isInheritedRead?'Completed routes with a verified path use that fixed path for red text and Skip read. Alternate branches remain unread; study counts stay unchanged.':'Read status follows text encountered on this device. Completed-route read paths are not available for this game yet.')); 
  if(engine.readPathWarning)body.append(paragraph(engine.readPathWarning,'notice'));
  if(engine.progressNotice)body.append(paragraph(engine.progressNotice()));
  appendNewGameEntries(body,engine,game);
  body.append(row(button('Export global progress',()=>download(`${game.id}-progress.json`,engine.progressSnapshot())),button('Back to main menu',()=>libraryPanel())));
  for(const route of engine.routeProgress()){
    const line=document.createElement('div');line.className='slot route-progress';line.dataset.route=route.id;
    line.append(paragraph(`${route.label} · ${route.complete?(route.manual?'Complete (manual)':'Complete'):'Not complete'}`));
    if(route.complete)line.append(paragraph(engine.readPaths?.[route.id]?'Fixed read path available.':'No verified read path yet; only normally encountered text counts as read.'));
    const mark=button('Mark complete',async()=>{
      const before=engine.progressSnapshot();
      await store.put(key('progress-before-debug'),before);
      try{engine.markRouteComplete(route.id);await store.put(key('progress'),engine.progressSnapshot());if(context.active)await persistCurrent();}
      catch(error){engine.applyProgress(before);throw error;}
      await progressPanel(context);status(`${route.label} marked complete manually. A progress backup was kept before the change.`);
    });mark.disabled=route.complete;line.append(mark);body.append(line);
  }
  if(await store.get(key('progress-before-debug')))body.append(row(button('Export progress before last manual change',async()=>download(`${game.id}-before-debug.json`,await store.get(key('progress-before-debug'))))));
}
function appendNewGameEntries(parent,engine,item){
  const groups=new Map();
  for(const entry of engine.newGameEntries?.()||[]){
    if(entry.id==='start')continue;
    let container=parent;
    if(entry.group){
      if(!groups.has(entry.group)){
        const details=document.createElement('details'),summary=document.createElement('summary');
        details.className='console-extra-stories';summary.textContent=entry.group;details.append(summary);parent.append(details);groups.set(entry.group,details);
      }
      container=groups.get(entry.group);
    }
    container.append(button(entry.label,()=>loadGame(item,false,entry.id)));
  }
}
async function soundTestPanel(context={engine,game,contentBase,active:true}) {
  const {engine,contentBase}=context;
  if(!engine)return;
  const wasPlaying=[music,voice,scriptMedia,...effects].filter(a=>a&&!a.paused&&!a.ended);
  const body=openPanel('Sound test','sound-test');
  wasPlaying.forEach(a=>a.pause());
  const tracks=engine.soundtrack?.()||Object.entries(engine.content.assets).filter(([,a])=>a.type==='music').map(([asset])=>({asset,label:asset}));
  const now=paragraph('Choose a track.'),player=document.createElement('audio');player.controls=true;player.className='sound-test-player';player.volume=Number(settings.music);player.preload='metadata';
  const loop=document.createElement('input');loop.type='checkbox';loop.checked=true;const label=document.createElement('label');label.append(loop,document.createTextNode(' Loop track'));let current=null;
  loop.onchange=()=>{if(current)configureAudio(player,current,loop.checked,engine);};
  player.onerror=()=>status('This track could not be loaded or decoded. Try another track or check your connection.',true);
  body.append(now,player,row(label,button('Stop',()=>{player.pause();player.currentTime=0;}),button('Main menu',()=>libraryPanel())));
  for(const [n,track] of tracks.entries()){
    const b=button(`${String(n+1).padStart(2,'0')} · ${track.label}`,async()=>{
      player.pause();current=track.asset;player.src=new URL(engine.content.assets[track.asset].url,contentBase).href;configureAudio(player,current,loop.checked,engine);
      now.textContent=track.label;status('Loading track…');
      try{await player.play();status(`Playing ${track.label}`);}catch(e){if(e.name!=='AbortError')throw new Error('Playback unavailable. Use the audio play button or check your connection.');}
    });b.className='sound-track';b.dataset.asset=track.asset;body.append(b);
  }
  panelCleanup=()=>{player.pause();player.removeAttribute('src');player.load();for(const a of wasPlaying)if(!a.ended)play(a);};
}
function crtPanel() {
  const body=openPanel('CRT display', 'crt');
  body.append(paragraph('An optional tube-screen treatment for the original artwork. Movies use their original player. Preferences are saved on this device.'));
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.id='crt-enabled';enabled.checked=crt.settings.enabled;
  const enabledLabel=document.createElement('label');enabledLabel.htmlFor=enabled.id;enabledLabel.append(enabled,document.createTextNode(' Enable CRT display'));
  enabled.onchange=()=>{crt.set({enabled:enabled.checked});$('crtButton').setAttribute('aria-pressed',String(enabled.checked));};
  body.append(row(enabledLabel));
  const preset=document.createElement('select');preset.id='crt-preset';
  for(const [id,p]of Object.entries(CRT_PRESETS))preset.append(new Option(p.label,id));preset.append(new Option('Custom tuning','custom'));preset.value=crt.settings.preset;
  const presetLabel=document.createElement('label');presetLabel.textContent='Screen preset';presetLabel.htmlFor=preset.id;
  const presetRow=row(presetLabel,preset);presetRow.classList.add('crt-presets');body.append(presetRow);
  const state=paragraph('', 'crt-state');state.id='crt-state';state.setAttribute('role','status');body.append(state);
  const preview=document.createElement('canvas');preview.className='crt-preview';preview.setAttribute('aria-label','Live artwork preview, without text');body.append(preview,paragraph('This preview is scaled. Close the panel to judge fine phosphor detail at full size.'));
  const fields=new Map();
  const update=values=>{crt.set({...values,preset:'custom'});preset.value='custom';};
  const group=title=>{const details=document.createElement('details');details.className='crt-options';const summary=document.createElement('summary');summary.textContent=title;details.append(summary);body.append(details);return details;};
  const range=(parent,name,label)=>{
    const [min,max,step]=CRT_RANGES[name],text=document.createElement('label'),input=document.createElement('input'),output=document.createElement('output');
    input.id='crt-'+name;input.type='range';input.min=min;input.max=max;input.step=step;text.htmlFor=input.id;text.textContent=label;output.htmlFor=input.id;
    const sync=()=>{input.value=crt.settings[name];output.textContent=Number(crt.settings[name].toFixed(3));};sync();fields.set(name,sync);
    input.oninput=()=>{update({[name]:Number(input.value)});sync();};parent.append(row(text,input,output));
  };
  const select=(parent,name,label,options)=>{
    const input=document.createElement('select'),text=document.createElement('label');input.id='crt-'+name;text.htmlFor=input.id;text.textContent=label;
    for(const [value,description]of options)input.append(new Option(description,value));
    const sync=()=>{input.value=crt.settings[name];};sync();fields.set(name,sync);
    input.onchange=()=>update({[name]:name==='maskType'?Number(input.value):input.value});parent.append(row(text,input));
  };
  const beam=group('Electron beam & phosphors');beam.open=true;
  select(beam,'maskType','Phosphor mask',[[0,'None'],[1,'RGB aperture grille'],[2,'Staggered slot mask'],[3,'Shadow mask']]);
  for(const [name,label]of [['scanlines','Scanline strength'],['rows','Scanline count'],['beam','Beam width'],['maskStrength','Mask strength'],['maskPitch','RGB triad pitch · pixels']])range(beam,name,label);
  const light=group('Light & colour');
  for(const [name,label]of [['bloom','Bloom'],['halation','Phosphor halation'],['glowRadius','Glow radius'],['convergence','RGB convergence · source pixels'],['sharpness','Sharpness'],['inputGamma','Input gamma'],['outputGamma','Output gamma'],['brightness','Brightness'],['saturation','Saturation'],['warmth','Warm / cool balance']])range(light,name,label);
  const geometry=group('Glass & geometry');
  for(const [name,label]of [['curvature','Screen curvature'],['overscan','Overscan (crops edges)'],['vignette','Edge shading'],['corners','Rounded glass corners'],['grain','Static fine grain']])range(geometry,name,label);
  const quality=group('Resolution & compatibility');
  select(quality,'quality','Output resolution', [['1080','Up to 1080p · lower GPU cost'],['1440','Up to 1440p · balanced'],['native','Display pixels · up to 4K']]);
  quality.append(paragraph('Fine masks need enough physical screen pixels. The renderer follows device pixel density and limits its framebuffer to 4096 pixels wide / 2160 high. A small preview or mobile window cannot show the detail of a full 4K screen. GPU cost varies; try 1080p if motion slows down. Scanlines soften automatically when the window is too small.'));
  quality.append(paragraph('Original three-pass WebGL 2 renderer, inspired by CRT shader features. This is not a port of CRT-Royale or a MiSTer display core. It does not simulate a composite cable, true interlacing or a monitor’s HDR response. WebGL failure restores the original artwork.'));
  preset.onchange=()=>{if(preset.value==='custom')return;crt.set(crtPreset(preset.value,crt.settings));for(const sync of fields.values())sync();};
  body.append(row(button('Reset this preset',()=>{crt.set(crtPreset(preset.value==='custom'?'soft':preset.value,crt.settings));preset.value=crt.settings.preset;for(const sync of fields.values())sync();}),button('Back to main menu',()=>libraryPanel())));
  const unsubscribe=crt.subscribe(message=>{state.textContent=message;}),detach=crt.attachPreview(preview);
  panelCleanup=()=>{unsubscribe();detach();};
}
async function settingsPanel() {
  const body = openPanel('Reading settings', 'settings');
  body.append(row(button('Display / CRT',crtPanel)));
  const colour=document.createElement('input'),colourLabel=document.createElement('label');colour.type='color';colour.id='setting-readColour';colour.value=settings.readColour;colourLabel.htmlFor=colour.id;colourLabel.textContent='Previously read text colour';colour.oninput=()=>{settings.readColour=colour.value;applySettings();};body.append(row(colourLabel,colour));
  const range = (label, name, min, max, step, format = value => value) => {
    const text = document.createElement('label'), input = document.createElement('input'), output = document.createElement('output');
    text.textContent = label; text.htmlFor = `setting-${name}`; input.id = text.htmlFor; input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = settings[name]; output.textContent = format(settings[name]);
    input.oninput = () => { settings[name] = Number(input.value); output.textContent = format(settings[name]); applySettings(); }; body.append(row(text, input, output));
  };
  range('UI colour', 'uiHue', 0, 360, 1, v => `${v}°`);
  range('UI colour strength', 'uiSaturation', 0, 100, 1, v => `${v}%`);
  range('UI opacity', 'uiOpacity', 0, 1, .05, v => `${Math.round(v*100)}%`);
  body.append(row(button('Reset UI colours',()=>{for(const k of ['uiHue','uiSaturation','uiOpacity'])settings[k]=defaults[k];applySettings();settingsPanel();})));
  range('Text speed', 'speed', 0, 100, 5, v => v === 0 ? 'Instant' : `${v}/s`);
  range('Minimum auto delay', 'autoDelay', 500, 6000, 250, v => `${v / 1000}s`);
  range('Japanese font size', 'fontSize', 16, 42, 1, v => `${v}px`);
  range('Line spacing', 'lineHeight', 1.3, 2.5, .1);
  range('Textbox opacity', 'opacity', 0, 1, .05, v => `${Math.round(v * 100)}%`);
  for (const [label, name] of [['Music volume', 'music'], ['Voice volume', 'voice'], ['Effects volume', 'sound']]) range(label, name, 0, 1, .05, v => `${Math.round(v * 100)}%`);
  range('Pause after inactivity', 'inactivity', 60, 1200, 30, v => `${v / 60} min`);
  const check = (label, name) => { const text = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = settings[name]; input.onchange = () => { settings[name] = input.checked; applySettings(); if (name === 'websocket') guard(settingsPanel)(); }; text.append(input, document.createTextNode(` ${label}`)); body.append(row(text)); };
  check('Darken the area surrounding the game', 'dimSurroundings');
  check('Automatically copy new narrative text on this device', 'autoCopy');
  check('Include speaker name in copied and streamed text', 'includeSpeaker');
  check('Publish newly presented text to the local WebSocket relay', 'websocket');
  const rubyLabel = document.createElement('label'); rubyLabel.textContent = 'Ruby in text output'; rubyLabel.htmlFor = 'rubyExport'; const select = document.createElement('select'); select.id = 'rubyExport';
  for (const [value, text] of [['base', 'Base spelling only'], ['reading', 'Reading instead of base'], ['both', 'Base（reading）']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); } select.value = settings.ruby; select.onchange = () => { settings.ruby = select.value; applySettings(); }; body.append(row(rubyLabel, select));
  body.append(row(button('Test clipboard', () => copyText('日本語のコピー確認')), button('Enable audio', () => { if (musicAsset) play(music); if (voiceAsset && !voice.ended) play(voice); status('Audio playback requested on this device.'); })));
  body.append(paragraph(`${window.isSecureContext ? 'Secure context available.' : 'This is not a secure context: automatic clipboard requires HTTPS or localhost.'} Explicit Copy falls back to browser copy where available. Clipboard permissions are controlled by the reading device.`));
  body.append(paragraph('Keys: Space / Enter / → advance; Alt+C copy current line; Alt+← previous line; Alt+N next choice; Esc cancel jump. Next choice skips unread dialogue without reading credit and keeps a restore point in Saves.'));
  if (settings.websocket) {
    try { const response = await fetch('/api/session'); const session = await response.json(); token = session.token; const p = paragraph('Private receiver URL (keep its token private): '); const code = document.createElement('code'); code.textContent = session.wsUrl || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(token)}&format=sentence`; p.append(code); body.append(p); }
    catch { body.append(paragraph('Relay session unavailable. Verify the toolkit server is running.')); }
  }
}
async function backlogPanel() {
  if (!activity) return;
  if(engine.previewNotice){const body=openPanel('Encountered text','backlog');body.append(paragraph('The original-font preview does not yet have a searchable text backlog. Previous line and saves retain your place.'));return;}
  const body = openPanel('Encountered text', 'backlog'), search = document.createElement('input'), entries = document.createElement('div'); search.className = 'search'; search.placeholder = 'Search encountered Japanese or speaker'; search.setAttribute('aria-label', 'Search backlog');
  body.append(search, row(button('Bookmark current position', async () => { activity.data.bookmarks.push({ id: randomId(), label: plainText(engine.current?.text || '').slice(0, 45), savedAt: new Date().toISOString(), save: engine.save(mediaSnapshot()) }); await store.put(key('activity'), activity.data); status('Bookmark saved with execution state.'); }), button('Bookmarks', bookmarkPanel)), entries);
  let limit = 100;
  const render = () => {
    entries.replaceChildren(); const query = search.value.trim().toLocaleLowerCase();
    const matches = activity.data.backlog.filter(p => `${p.speaker} ${plainText(p.text)}`.toLocaleLowerCase().includes(query));
    entries.append(paragraph(`${matches.length.toLocaleString()} encountered occurrences; showing newest ${Math.min(limit, matches.length)}. Future text is never searched.`));
    for (const p of matches.slice(-limit).reverse()) {
      const article = document.createElement('article'); article.className = 'entry'; const head = document.createElement('div'); head.className = 'entry-head'; head.textContent = p.speaker || 'Narration'; const time = document.createElement('small'); time.textContent = `${new Date(p.timestamp).toLocaleString()}${p.skipped ? ' · skipped' : ''}`; head.append(time);
      const text = document.createElement('div'); text.className = 'entry-text'; text.lang = 'ja'; text.classList.toggle('read-text',isRead(activity,engine,p.id));renderText(text, p.text); article.append(head, text, row(button('Copy', () => copyText(exportSentence(p)))));
      if (p.voice) article.lastChild.append(button('Replay voice', () => { const audio = new Audio(mediaURL(p.voice)); audio.volume = settings.voice; play(audio); }));
      entries.append(article);
    }
    if (matches.length > limit) entries.append(button('Show 100 more', () => { limit += 100; render(); }));
  };
  search.oninput = () => { limit = 100; render(); }; render();
}
async function bookmarkPanel() {
  const body = openPanel('Visited bookmarks', 'bookmarks');
  if (!activity.data.bookmarks.length) body.append(paragraph('Bookmark a position from the backlog. Only your visited positions appear here.'));
  for (const b of activity.data.bookmarks) body.append(row(paragraph(b.label || b.savedAt), button('Load', () => restore(b.save))));
}
async function saveSlot(slot) { if (!engine || choiceSeek || busy) return; await store.put(key(slot), engine.save(mediaSnapshot())); status(`${slot === 'quicksave' ? 'Quicksave' : slot} saved ${store.mode(game.id)==='shared'?'on your home server':'in this browser'}.`); }
async function presentSavedState(save) {
  pauseWait();await engine.restore(save);restoredMedia=save.media;auto=skip=false;closePanel();sceneVisualKey=null;
  // Earlier builds could autosave at an unknown instruction with no active
  // presentation. Execute that saved PC once it is supported; no prior text is
  // republished. Newly reached dialogue is a new presentation, not a restore.
  engine.applyProgress?.(await store.get(key('progress')));
  const retained=Boolean(engine.current);
  const result=retained?{pending:engine.current,effects:[]}:await engine.run();
  await present(result,{restoring:retained,restoreMedia:!retained,navigation:retained?'advance':'resume'});
  await store.put(key('autosave'),engine.save(mediaSnapshot()));
  return retained;
}
async function restore(save, {rewinding=false}={}) {
  if(globalPause.paused)throw new Error('Resume playback before loading a save.');
  if (choiceSeek || busy) throw new Error('Wait for the current operation before loading a save.');
  if (!save) throw new Error('This save slot is empty');
  if(store.blocked(game.id))throw new Error('Shared saving is paused. Reload or switch to local saves first.');
  if(!gameLease?.owned())throw new Error('Reader ownership moved to another tab. Reload to safely resume.');
  const before=engine.save(mediaSnapshot());busy=true;advanceButton();modeButtons();status('Loading save…');
  try{
    const retained=await presentSavedState(save);
    if(!rewinding)lineHistory.clear();
    status(retained?'Execution restored. Reading history is preserved; restored text was not counted or emitted again.':'Continued from a previously stopped source instruction. Reading history is preserved.');
  }catch(error){await engine.restore(before);restoredMedia=before.media;sceneVisualKey=null;try{await present({pending:engine.current,effects:[]},{restoring:true});}catch{}throw error;}
  finally{busy=false;advanceButton();modeButtons();schedule();}
}
async function previousLine() {
  if(!engine||busy||choiceSeek||globalPause.paused||selected())return;
  const save=lineHistory.peek();
  if(!save){status('No earlier line in this reading session.');return;}
  await restore(save,{rewinding:true});
  lineHistory.pop();modeButtons();
  status('Previous line restored. Study history and route progress are kept.');
}
async function saveLocationPanel(item=game) {
  if(!item)return;
  const body=openPanel('Save location','save-location'),id=item.id;
  const current=store.mode(id);
  body.append(paragraph(`Current location: ${current==='shared'?'Home server (shared)':'This device only'}`,'notice'));
  body.append(paragraph('Choose where this game keeps its 15 slots, quicksave, autosave and route-unlock progress. Local and shared banks stay separate. Switching resumes the selected bank; it never deletes the other one. Reading history, read-text marks, bookmarks and display preferences stay on this device.'));
  const switchTo=async(mode,seed,bank,signature)=>{
    if(busy||choiceSeek)throw new Error('Wait for the current operation before changing save location.');
    const controls=[...body.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
    try{
      await persistCurrent().catch(error=>{if(!store.blocked(id))throw error;});await store.flush(id).catch(error=>{if(!store.blocked(id))throw error;});
      if(seed)await store.seed(id,signature,bank);
      if(mode==='shared'&&!seed)await store.dismissRecovery(id);
      store.setMode(id,mode);
      // New document owns a fresh server revision. Never persist the old engine
      // into the selected bank while switching or retrying a failed connection.
      gameLease?.release();gameLease=null;
      const target=new URL(location.href);target.searchParams.set('game',id);location.assign(target.href);
    }catch(error){controls.forEach(b=>b.disabled=false);throw error;}
  };
  const local=document.createElement('section');local.className='save-location-box';const localTitle=document.createElement('h2');localTitle.textContent='This device';local.append(localTitle,paragraph('Stored in this browser. Existing local slots stay here when you use shared saves elsewhere.'));
  const localButton=button('Use local saves',()=>switchTo('local'));localButton.disabled=current==='local';local.append(localButton);body.append(local);
  const shared=document.createElement('section');shared.className='save-location-box';const title=document.createElement('h2');title.textContent='Home server · shared';const detail=paragraph('Checking shared saves…');shared.append(title,detail);body.append(shared);
  body.append(paragraph('Shared saves stay on your own server, available through the same private reader address. Devices using shared mode use one save bank. Simultaneous writers are detected and paused before overwriting newer progress. Close the reader on your previous device before continuing on another.'));
  const recovery=await store.recovery(id)||await store.local.get(`${id}:shared-recovery`);
  if(recovery)body.append(row(button('Export unsynced recovery',()=>download(`${id}-shared-recovery.json`,recovery)),...(recovery.records.autosave?[button('Export recovery position',()=>download(`${id}-recovery-save.json`,recovery.records.autosave))]:[])));
  const cache=await store.local.get(`${id}:shared-cache`);
  if(cache)body.append(row(button('Export last shared backup on this device',()=>download(`${id}-shared-cache.json`,cache))));
  for(const destination of ['local','shared']){
    const backup=await store.local.get(`${id}:before-copy-${destination}`);
    if(backup)body.append(button(`Export ${destination} backup from before last copy`,()=>download(`${id}-before-copy-${destination}.json`,backup)));
  }
  body.append(button('Back to main menu',()=>libraryPanel()));
  try{
    let signature=engine&&game?.id===id?engine.signature:null;
    if(!signature){const response=await fetch(item.url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Cannot read game compatibility (${response.status})`);signature=(await createEngine(await response.json(),{baseURL:new URL(item.url,location.href).href})).signature;}
    if(recovery&&!recovery.resolved){
      shared.append(paragraph('An unsynced save is preserved on this device. Retry keeps its original revision and will refuse to overwrite newer progress. Reload shared saves uses the server position instead; your recovery export remains available.','notice'));
      shared.append(button('Retry unsynced save',async()=>{
        if(busy||choiceSeek)throw new Error('Wait for the current operation before retrying.');
        const controls=[...body.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
        try{
          await store.recover(id,signature);
          store.setMode(id,'shared');gameLease?.release();gameLease=null;
          const target=new URL(location.href);target.searchParams.set('game',id);location.assign(target.href);
        }catch(error){controls.forEach(b=>b.disabled=false);throw error;}
      }));
    }
    const bank=await store.fetchBank(id,signature);
    if(currentDialog!=='save-location'||!body.contains(shared))return;
    const occupied=SAVE_SLOTS.filter(name=>bank.records[name]).length;
    detail.textContent=occupied?`${occupied} saved positions · last updated ${new Date(bank.updatedAt).toLocaleString()}`:'No shared saved positions yet.';
    if(Object.keys(bank.records).length){
      shared.append(button(current==='shared'?'Reload shared saves':'Use shared saves',()=>switchTo('shared',false)),button('Export shared save bank',()=>download(`${id}-shared-saves.json`,bank)));
    }else{
      shared.append(button('Copy local saves to server & use shared',()=>switchTo('shared',true,bank,signature)));
      shared.append(paragraph('Copies the local slots and route progress into the empty server bank. Your local originals remain intact.'));
    }
    const copies=document.createElement('section');copies.className='save-location-box';
    const heading=document.createElement('h2');heading.textContent='Copy saves';
    copies.append(heading,paragraph('Replace all saves and route progress in one location with the other. The source stays unchanged. A backup of the destination is kept on this device; reading activity is not copied or reset.'));
    const copy=async destination=>{
      if(busy||choiceSeek||changingSaveLocation)throw new Error('Wait for the current operation before copying saves.');
      const controls=[...$('panel').querySelectorAll('button')].map(b=>[b,b.disabled]);controls.forEach(([b])=>b.disabled=true);
      let lease,completed=false;
      try{
        lease=await acquireGame(id);
        await persistCurrent();changingSaveLocation=true;
        await store.flush(id);
        if(await store.recovery(id))throw new Error('Resolve the unsynced save first: retry it or choose the server position.');
        const localBank=await store.localBank(id,signature),sharedBank=await store.fetchBank(id,signature);
        const source=destination==='local'?sharedBank:localBank,previous=destination==='local'?localBank:sharedBank;
        const count=value=>SAVE_SLOTS.filter(name=>value.records[name]).length;
        const from=destination==='local'?'shared':'local';
        if(!confirm(`${item.title}\n\nReplace ${destination} saves (${count(previous)} positions) with ${from} saves (${count(source)} positions)?\n\nAll destination slots and route progress will match the source, including empty slots. A backup will be kept on this device. Reading activity stays unchanged.`))return;
        await store.replaceBank(id,signature,destination,source,previous);
        // Do not allow pagehide/heartbeat to write the old engine over the copy.
        gameLease?.release();gameLease=null;lease.release();lease=null;
        store.setMode(id,destination);completed=true;
        const target=new URL(location.href);target.searchParams.set('game',id);location.assign(target.href);
      }finally{
        if(lease&&lease!==gameLease)lease.release();
        if(!completed){changingSaveLocation=false;controls.forEach(([b,disabled])=>b.disabled=disabled);}
      }
    };
    copies.append(button('Replace local saves with shared',()=>copy('local')),button('Replace shared saves with local',()=>copy('shared')));
    shared.after(copies);
  }catch(error){detail.textContent=error.message;detail.classList.add('error');}
}
async function savesPanel() {
  if (!engine) return; const body = openPanel('Save & resume', 'saves');
  body.append(paragraph('Saves include story variables, call stack, scene and media position. Activity history is independent of these saves.'));
  body.append(row(paragraph(`Save location: ${store.mode(game.id)==='shared'?'Home server · shared across your devices':'This device only'}`),button('Save location',()=>saveLocationPanel(game))));
  for (const slot of SAVE_SLOTS) {
    const save = await store.get(key(slot)); const line = document.createElement('div'); line.className = 'slot'; const info = document.createElement('span'); info.textContent = `${slot} · ${save ? new Date(save.savedAt).toLocaleString() : 'Empty'}`; line.append(info);
    if (!['autosave', 'before next choice'].includes(slot)) line.append(button('Save', async () => { await saveSlot(slot); await savesPanel(); }));
    if (save) {
      const remove=button('Delete',async()=>{remove.disabled=true;try{await deleteSaveSlot(slot);}finally{remove.disabled=false;}});
      line.append(button('Load', () => restore(save)), button('Export', () => download(`${game.id}-${slot.replace(' ', '-')}.json`, save)),remove);
    }
    body.append(line);
  }
  if(engine.progressSnapshot)body.append(row(button('Export global progress',()=>download(`${game.id}-progress.json`,engine.progressSnapshot())),button('Import global progress…',()=>$('progressFile').click())));
  body.append(row(button('Export current state', () => download(`${game.id}-save.json`, engine.save(mediaSnapshot()))), button('Import save…', () => $('saveFile').click())));
}
async function deleteSaveSlot(slot) {
  if(!engine||busy||choiceSeek||!gameLease?.owned())throw new Error('Wait for the current operation, or reload this reader if another tab owns it.');
  const owner=engine,id=game.id,shared=store.mode(id)==='shared';
  const destination=shared?'the home server (all devices using shared saves)':'this device';
  const autoNote=slot==='autosave'?' Autosave will be created again when you continue the story.':'';
  if(!confirm(`Delete ${slot} from ${destination}? Your current story, route progress and activity are kept.${autoNote}`))return;
  if(slot==='autosave')deletedAutosaveEngine=owner;
  try{await store.delete(`${id}:${slot}`);}
  catch(error){if(slot==='autosave'&&deletedAutosaveEngine===owner)deletedAutosaveEngine=null;throw error;}
  if(engine!==owner)return;
  if(currentDialog==='saves')await savesPanel();
  status(`${slot} deleted from ${shared?'shared saves':'this device'}.${autoNote}`);
}
async function loadActivity(id, history) {
  if(history?.version===1&&!await store.get(`${id}:activity-before-session-upgrade`))await store.put(`${id}:activity-before-session-upgrade`,structuredClone(history));
  const result=new Activity(id,history);
  await store.put(`${id}:activity`,result.data);
  return result;
}
async function changeSession(action) {
  const target=activity,before=structuredClone(target.data),id=target.session.id;
  action(target);
  try { await store.put(key('activity'),target.data); }
  catch(error){target.data=before;target.session=before.sessions.find(s=>s.id===id);throw error;}
  if(activity===target&&currentDialog==='stats')await statsPanel();
}
async function deleteActivitySession(id) {
  if(!activity||busy||choiceSeek||!gameLease?.owned())throw new Error('Wait for the current operation, or reload this reader if another tab owns it.');
  if(!confirm('Delete this session and subtract its counters from daily and overall totals? Saves, read markers and backlog are kept.'))return;
  await changeSession(target=>target.deleteSession(id));
  status('Session deleted. Saves and encountered text are kept.');
}
async function resetCurrentSession() {
  if(!activity||busy||choiceSeek||!gameLease?.owned())throw new Error('Wait for the current operation, or reload this reader if another tab owns it.');
  if(!confirm('Clear this session’s activity back to zero? Its time, characters and other counters will be removed from daily and overall totals. Earlier sessions, read markers, backlog, bookmarks and saves are kept.'))return;
  await changeSession(target=>target.resetSession());
  status('Current session cleared. Earlier sessions and encountered text are kept.');
}
function metric(value, label) { const e = document.createElement('div'); e.className = 'metric'; const n = document.createElement('strong'); n.textContent = value; const l = document.createElement('small'); l.textContent = label; e.append(n, l); return e; }
async function statsPanel() {
  if (!activity) return; const body = openPanel('Reading activity', 'stats'), totals = activity.totals(), session = activity.session, daily = activity.daily();
  body.classList.add('statistics-panel');
  const compact = value => new Intl.NumberFormat('en', {notation:value>=10000?'compact':'standard',maximumFractionDigits:1}).format(value);
  const rate = value => value.activeMs >= 1000 ? compact(Math.round(value.characters * 3600000 / value.activeMs)) : '—';
  const hours = ms => `${(ms / 3600000).toFixed(1)}h`;
  const clock = at => at ? new Date(at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—';
  const group = (title, name, values) => {
    const section=document.createElement('section'),heading=document.createElement('h2'),grid=document.createElement('div');
    heading.textContent=title;grid.className=`metrics ${name}-metrics`;section.dataset.statistics=name;
    for(const [value,label,detail,isTime] of values){
      const card=metric(value,label);card.title=detail||String(value);
      if(isTime){const time=document.createElement('time');time.textContent=value;if(detail)time.dateTime=detail;card.querySelector('strong').replaceChildren(time);}
      grid.append(card);
    }
    section.append(heading,grid);body.append(section);
  };
  group('Today’s reading','today',[[compact(daily.characters),'Today’s characters',`${daily.characters.toLocaleString()} narrative characters · day begins at 04:01 local time`]]);
  group('Overall game statistics','overall',[
    [compact(totals.characters),'Characters',`${totals.characters.toLocaleString()} narrative characters`],
    [rate(totals),'Chars / hour','Narrative characters divided by total active hours'],
    [hours(totals.activeMs),'Time spent',seconds(totals.activeMs)],
  ]);
  group('Current session statistics','session',[
    [hours(session.activeMs),'Session hours',seconds(session.activeMs)],
    [compact(session.characters),'Session chars',`${session.characters.toLocaleString()} narrative characters`],
    [clock(session.startedAt),'Started',session.startedAt,true],
    [clock(session.endedAt),'Ended',session.endedAt||'',true],
    [rate(session),'Session chars / hour','Narrative characters divided by this session’s active hours'],
  ]);
  body.append(paragraph(`${globalPause.paused?'Global pause is active. ':''}${activity.paused?'Timer manually paused.':'Timer pauses while this panel is open.'} An open session has no end time. Totals are reading-activity estimates on this device.`, 'muted activity-note'));
  const reset=button('Clear current session',async()=>{reset.disabled=true;try{await resetCurrentSession();}finally{reset.disabled=false;}});
  body.append(row(reset,paragraph('Resets this session’s counters and its contribution to totals. Earlier sessions and encountered text are kept.')));
  const breakdown=document.createElement('details'),breakdownTitle=document.createElement('summary');breakdownTitle.textContent='Today, unique text & rereading';
  breakdown.append(breakdownTitle,paragraph(`Today: ${daily.characters.toLocaleString()} characters · ${seconds(daily.activeMs)} active. Unique source characters: ${totals.uniqueCharacters.toLocaleString()}. Rereading: ${totals.rereadCharacters.toLocaleString()}. Selected-choice characters: ${totals.choiceCharacters.toLocaleString()} (separate). Skipped segments: ${totals.skippedSegments.toLocaleString()}.`));body.append(breakdown);
  body.append(row(button(activity.paused ? 'Resume activity timer' : 'Pause activity timer', () => { activity.paused = !activity.paused; activity.interact(); statsPanel(); }), button('Export activity JSON', () => download(`${game.id}-activity.json`, activity.data)), button('Export sessions CSV', () => download(`${game.id}-sessions.csv`, activity.exportCSV(), 'text/csv')), button('Restore activity backup…', () => $('activityFile').click())));
  const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Counting and inactivity policy'; details.append(summary, paragraph('Each complete narrative segment contributes Unicode code points excluding whitespace. Japanese punctuation counts; speaker names, UI labels, markup and duplicate ruby readings do not. Unique text uses stable source IDs, rereading uses new presentation occurrence IDs. Skip contributes zero reading characters. Selected choices are counted separately. Reload and save restoration do not replay events or counts. History is stored separately from saves. Only this reader tab runs a timer; companion pages do not. Hidden tabs, open panels, manual pause and inactivity stop active time; a five-minute default allows dictionary use. A heartbeat gap contributes at most five seconds. Sessions continue across reloads and breaks shorter than four hours; a gap of four hours starts another session. Reading days begin at 04:01 in this browser’s local time (04:00 belongs to the previous day).')), body.append(details);
  if(activity.data.sessions.some(s=>s.dayEstimated))body.append(paragraph('Older sessions keep their original totals and grouping. Their daily totals are approximately assigned to the day they started because older records had no daily ledger.','muted'));
  if(await store.get(key('activity-before-session-upgrade')))body.append(button('Export pre-upgrade activity',async()=>download(`${game.id}-activity-before-upgrade.json`,await store.get(key('activity-before-session-upgrade')))));
  const table = document.createElement('table'); const head = document.createElement('tr'); for (const t of ['Session started', 'Active', 'Characters', '']) { const th = document.createElement('th'); th.textContent = t; head.append(th); } table.append(head);
  for (const s of activity.data.sessions.slice().reverse()) { const tr = document.createElement('tr'); for (const value of [new Date(s.startedAt).toLocaleString(), seconds(s.activeMs), s.characters.toLocaleString()]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); } const actions=document.createElement('td');actions.append(button('Delete session',()=>deleteActivitySession(s.id)));tr.append(actions);tr.dataset.sessionId=s.id;table.append(tr); } const history=document.createElement('div');history.className='session-history';history.append(table);body.append(history);
}

$('crtButton').onclick=guard(crtPanel);$('crtButton').setAttribute('aria-pressed',String(crt.settings.enabled));
$('libraryButton').onclick = guard(()=>libraryPanel()); $('settingsButton').onclick = guard(settingsPanel); $('closePanel').onclick = closePanel;
$('panel').addEventListener('cancel', e => {if(loadingGame||changingSaveLocation){e.preventDefault();return;}panelCleanup?.();panelCleanup=null;currentDialog='';leaveLibrary();setTimeout(schedule);});
$('nextButton').onclick = guard(() => advance());
$('choiceButton').onclick = guard(nextChoice);
$('dimButton').onclick = () => { settings.dimSurroundings = !settings.dimSurroundings; applySettings(); };
let pointerStart;
$('stage').addEventListener('pointerdown', e => { pointerStart = { x: e.clientX, y: e.clientY, hadSelection: selected() }; });
$('stage').addEventListener('click', guard(e => { if (!pointerStart || pointerStart.hadSelection || e.target.closest('.textbox,.choices,button,a,input') || Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 6 || selected()) return; return advance(); }));
document.addEventListener('copy', event => {
  const selection = window.getSelection();
  const anchor = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement;
  if (!event.clipboardData || !selection?.rangeCount || !anchor?.closest('.sentence,.entry-text,.choices')) return;
  const fragment = selection.getRangeAt(0).cloneContents();
  for (const element of fragment.querySelectorAll('rt,.entry-head,.row')) element.remove();
  for (const element of fragment.querySelectorAll('.entry-text,p,br')) element.append(document.createTextNode('\n'));
  event.clipboardData.setData('text/plain', fragment.textContent.replace(/\n{3,}/g, '\n\n'));
  event.preventDefault();
});
$('copyButton').onclick = guard(() => { const p=currentReadable(); if(p)return copyText(exportSentence(p)); });
$('backlogButton').onclick = guard(backlogPanel); $('savesButton').onclick = guard(savesPanel); $('statsButton').onclick = guard(statsPanel);
$('previousButton').onclick = guard(previousLine);
$('pauseButton').onclick = toggleGlobalPause;
$('autoButton').onclick = () => { if (!engine || engine.current?.kind !== 'text') return; auto = !auto; skip = false; modeButtons(); schedule(); };
$('skipButton').onclick = () => { if (!engine || engine.current?.kind !== 'text') return; skip = !skip; auto = false; if (skip && !isRead(activity,engine,engine.current.id)) skip = false; modeButtons(); schedule(); };
$('fullscreenMenu').onclick=guard(()=>{
  const body=openPanel('Reader controls','fullscreen-controls'),actions=document.createElement('div');actions.className='fullscreen-actions';
  for(const [label,id] of [[globalPause.paused?'Resume playback':'Pause playback','pauseButton'],['Previous line','previousButton'],['Backlog','backlogButton'],['Copy line','copyButton'],['Saves','savesButton'],['Activity','statsButton'],['Auto','autoButton'],['Skip read','skipButton'],['Next choice »','choiceButton'],['Reading settings','settingsButton'],['CRT display','crtButton'],['Library','libraryButton'],['Exit fullscreen','fullscreenButton']]){
    const source=$(id),control=button(label,()=>{closePanel();source.click();});control.disabled=source.disabled;
    if(source.hasAttribute('aria-pressed'))control.setAttribute('aria-pressed',source.getAttribute('aria-pressed'));
    actions.append(control);
  }
  body.append(actions);
});
$('fullscreenButton').onclick = guard(async () => { if (document.fullscreenElement) await document.exitFullscreen(); else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({navigationUI:'hide'}); else status('Fullscreen is unavailable in this browser.'); });
$('saveFile').onchange = guard(async e => { const file = e.target.files[0]; if (file) await restore(JSON.parse(await file.text())); e.target.value = ''; });
$('progressFile').onchange=guard(async e=>{const file=e.target.files[0];if(!file||!engine.applyProgress)return;const data=JSON.parse(await file.text());const before=engine.progressSnapshot();engine.applyProgress(data);engine.applyProgress(before);if(!confirm('Replace this game’s persistent route progress with this backup? Reading history stays unchanged.'))return;engine.applyProgress(data);await store.put(key('progress'),engine.progressSnapshot());await persistCurrent();status('Global progress restored.');e.target.value='';});
$('activityFile').onchange = guard(async e => { const file = e.target.files[0]; if (!file) return; const data = JSON.parse(await file.text()); if (!validateActivity(data, game.id)) throw new Error('Invalid activity backup or wrong game'); if (!confirm('Replace this game’s activity history with the selected backup? Game saves remain separate.')) return; activity = await loadActivity(game.id, data); await store.put(key('activity'), activity.data); await statsPanel(); e.target.value = ''; });
document.addEventListener('keydown', guard(async e => {
  if (choiceSeek) { if (e.code === 'Escape' || (e.altKey && e.code === 'KeyN')) { e.preventDefault(); choiceSeek.cancelled = true; } return; }
  if (e.target.closest('input,textarea,select,[contenteditable=true]') || $('panel').open) return;
  if (e.altKey && e.code === 'KeyN' && !e.repeat) { e.preventDefault(); await nextChoice(); return; }
  if (e.altKey && e.code === 'KeyC') { e.preventDefault(); const p=currentReadable(); if(p)await copyText(exportSentence(p)); return; }
  if(e.altKey&&e.code==='ArrowLeft'&&!e.repeat){e.preventDefault();await previousLine();return;}
  if (!e.ctrlKey && !e.altKey && !e.metaKey && !selected() && ['Space', 'Enter', 'ArrowRight'].includes(e.code) && !e.repeat && !e.target.closest('button,a')) { e.preventDefault(); await advance(); }
}));
for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(event, () => activity?.interact(), { passive: true });
document.addEventListener('selectionchange', () => { if (selected()) { clearTimeout(autoTimer); pauseWait(); } else schedule(); });
document.addEventListener('visibilitychange', guard(async () => { if (document.hidden) { clearTimeout(autoTimer); pauseWait(); await persistCurrent(); } else { if (activity) { activity.lastTick = Date.now(); activity.interact(); } if (scriptMedia?.ended) await advance('media'); else schedule(); } }));
window.addEventListener('pagehide', () => { persistCurrent().catch(() => {}); });
setInterval(guard(async () => { if (!activity || !gameLease?.owned()) return; activity.tick({ visible: !document.hidden, reading: !globalPause.paused && !busy && !choiceSeek && !$('panel').open && Boolean(currentReadable()?.text) && !skip, inactivityMs: settings.inactivity * 1000 }); if (++heartbeat % 15 === 0) await persistCurrent(); }), 1000);
voice.addEventListener('ended', schedule);

await guard(async () => {
  await store.open(); applySettings();setPlatform(selectedPlatform);
  const response = await fetch('/api/library'); if (!response.ok) throw new Error(`Library unavailable (${response.status}); launch with the toolkit server.`);
  library = (await response.json()).games || [];
  library = visibleLibrary(library,location.search);
  const superseded = new Set(library.flatMap(item => item.replaces || []));
  library = library.filter(item => !superseded.has(item.id));
  const requested = new URLSearchParams(location.search).get('game');
  const item = requested && library.find(item => item.id === requested);
  if (item && !['blocked', 'unsupported', 'extraction-only'].includes(item.compatibility?.status)) await loadGame(item);
  else await libraryPanel();
  // Library stays explicit: a synthetic fixture must never masquerade as a real import.
})();

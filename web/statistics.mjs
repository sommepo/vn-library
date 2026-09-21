import { characterCount, randomId } from './engine.mjs';
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const SESSION_GAP = 4 * 60 * 60 * 1000;
export function readingDay(at) {
  const date = new Date(at);
  if (date.getHours() * 60 + date.getMinutes() < 241) date.setDate(date.getDate() - 1);
  return dayKey(date);
}
const ownValue = (object, key, value) => Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
const emptyTotals = () => ({ activeMs: 0, characters: 0, uniqueCharacters: 0, rereadCharacters: 0, segments: 0, skippedSegments: 0, choiceCharacters: 0 });
export function validateActivity(data, gameId) {
  if (!data || data.format !== 'vnkit.activity' || ![1, 2].includes(data.version) || data.gameId !== gameId) return false;
  if (![data.seen, data.occurrences, data.days].every(v => v && typeof v === 'object' && !Array.isArray(v))) return false;
  if (![data.sessions, data.backlog, data.bookmarks].every(Array.isArray)) return false;
  const metrics = ['activeMs', 'characters', 'uniqueCharacters', 'rereadCharacters', 'segments', 'skippedSegments', 'choiceCharacters'];
  if (data.sessions.some(s => !s || typeof s.id !== 'string' || !Number.isFinite(Date.parse(s.startedAt)) || metrics.some(k => !Number.isFinite(s[k]) || s[k] < 0))) return false;
  if (Object.values(data.days).some(s => !s || metrics.some(k => !Number.isFinite(s[k]) || s[k] < 0))) return false;
  if (new Set(data.sessions.map(s => s.id)).size !== data.sessions.length) return false;
  if (data.version === 2 && data.sessions.some(s => !Number.isFinite(s.lastActivityAt) || !s.days || typeof s.days !== 'object' || Array.isArray(s.days) || Object.values(s.days).some(d => !d || metrics.some(k => !Number.isFinite(d[k]) || d[k] < 0)) || metrics.some(k => Math.abs(Object.values(s.days).reduce((n,d) => n+d[k],0)-s[k]) > 0.001))) return false;
  if (data.version === 2) {
    const expected = {};
    for (const session of data.sessions) for (const [day, values] of Object.entries(session.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
      const total = expected[day] ||= emptyTotals();
      for (const k of metrics) total[k] += values[k];
    }
    for (const day of new Set([...Object.keys(expected), ...Object.keys(data.days)])) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !data.days[day] || metrics.some(k => Math.abs(data.days[day][k] - (expected[day]?.[k] || 0)) > 0.001)) return false;
    }
  }
  if (Object.values(data.seen).some(value => value !== true)) return false;
  if (Object.values(data.occurrences).some(o => !o || typeof o.id !== 'string' || !Number.isFinite(o.at) || typeof o.skipped !== 'boolean')) return false;
  try {
    for (const p of data.backlog) {
      if (!p || !['text', 'choice'].includes(p.kind) || typeof p.id !== 'string' || typeof p.occurrenceId !== 'string' || typeof p.speaker !== 'string' || !Number.isFinite(Date.parse(p.timestamp))) return false;
      characterCount(p.text);
      if(p.dialogue!=null){
        if(!Array.isArray(p.dialogue)||!p.dialogue.length||p.dialogue.length>100)return false;
        for(const part of p.dialogue){if(!part||typeof part.speaker!=='string')return false;characterCount(part.text);}
      }
    }
  } catch { return false; }
  if (data.bookmarks.some(b => !b || typeof b.id !== 'string' || typeof b.label !== 'string' || b.save?.format !== 'vnkit.save' || b.save.gameId !== gameId)) return false;
  return true;
}
export class Activity {
  constructor(gameId, existing, options = {}) {
    this.gameId = gameId;
    this.now = options.now || (() => Date.now());
    this.makeId = options.makeId || randomId;
    if (existing && !validateActivity(existing, gameId)) throw new Error('Incompatible or malformed activity history');
    this.data = existing || { format: 'vnkit.activity', version: 2, gameId, seen: {}, occurrences: {}, sessions: [], days: {}, backlog: [], bookmarks: [] };
    if (this.data.version === 1) {
      // Old backups contain no session/day ledger. Preserve totals, explicitly
      // estimate historical attribution by start date, never replay backlog.
      this.data.days = {};
      for (const session of this.data.sessions) {
        session.lastActivityAt = Number.isFinite(Date.parse(session.updatedAt)) ? Date.parse(session.updatedAt) : Date.parse(session.startedAt);
        session.days = { [readingDay(Date.parse(session.startedAt))]: Object.fromEntries(Object.keys(emptyTotals()).map(k => [k, session[k]])) };
        session.dayEstimated = true;
        for (const [day, values] of Object.entries(session.days)) {
          const totals = this.data.days[day] ||= emptyTotals();
          for (const k of Object.keys(totals)) totals[k] += values[k];
        }
      }
      this.data.version = 2;
    }
    this.session = this.data.sessions.at(-1);
    this.paused = false;
    this.ensureSession();
    this.lastInteraction = this.now();
    this.lastTick = this.now();
  }
  get sessionDays() { return this.session.days; }
  ensureSession() {
    const now = this.now();
    if (!this.session || now - this.session.lastActivityAt >= SESSION_GAP) {
      if (this.session) this.session.endedAt = new Date(this.session.lastActivityAt).toISOString();
      this.session = { id: this.makeId(), startedAt: new Date(now).toISOString(), lastActivityAt: now, days: {}, ...emptyTotals() };
      this.data.sessions.push(this.session);
      this.lastTick = now;
    }
  }
  daily(at = this.now()) {
    return this.data.days[readingDay(at)] ||= emptyTotals();
  }
  add(values, at = this.now()) {
    this.ensureSession();
    this.session.lastActivityAt = at;
    this.session.updatedAt = new Date(at).toISOString();
    const contribution = this.session.days[readingDay(at)] ||= emptyTotals();
    for (const totals of [this.session, this.daily(at), contribution]) {
      for (const [key, value] of Object.entries(values)) totals[key] += value;
    }
  }
  subtractSession(session) {
    for (const [day, values] of Object.entries(session.days)) {
      for (const [key, value] of Object.entries(values)) this.data.days[day][key] = Math.max(0, this.data.days[day][key] - value);
    }
  }
  deleteSession(id) {
    const session = this.data.sessions.find(s => s.id === id);
    if (!session) throw new Error('Session no longer exists');
    this.subtractSession(session);
    this.data.sessions = this.data.sessions.filter(s => s !== session);
    if (session === this.session) { this.session = null; this.ensureSession(); }
  }
  resetSession() {
    this.subtractSession(this.session);
    const now = this.now();
    Object.assign(this.session, emptyTotals(), { days: {}, dayEstimated: false, lastActivityAt: now, startedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
    this.lastTick = this.lastInteraction = now;
    // Keep pause, occurrence/seen IDs, bookmarks and backlog.
  }
  interact() {
    this.ensureSession();
    this.lastInteraction = this.session.lastActivityAt = this.now();
    this.session.updatedAt = new Date(this.now()).toISOString();
  }
  tick({ visible = true, reading = true, inactivityMs = 300000 } = {}) {
    const now = this.now(), elapsed = Math.max(0, Math.min(now - this.lastTick, 5000));
    this.lastTick = now;
    const active = visible && reading && !this.paused && now - this.lastInteraction <= inactivityMs;
    if (active) this.add({ activeMs: elapsed }, now);
    return active;
  }
  present(pending, { skip = false } = {}) {
    if (!['text', 'choice'].includes(pending.kind) || Object.hasOwn(this.data.occurrences, pending.occurrenceId)) return null;
    this.ensureSession();
    this.session.lastActivityAt = this.now();
    const at = this.now(), count = pending.dialogue ? pending.dialogue.reduce((n,p)=>n+characterCount(p.text),0) : characterCount(pending.text), unique = !Object.hasOwn(this.data.seen, pending.id);
    ownValue(this.data.occurrences, pending.occurrenceId, { id: pending.id, at, skipped: skip });
    const record = { ...pending, timestamp: new Date(at).toISOString(), skipped: skip, sessionId: this.session.id };
    this.data.backlog.push(record);
    if (pending.kind === 'choice') return record;
    if (skip) { this.add({ skippedSegments: 1 }, at); return record; }
    ownValue(this.data.seen, pending.id, true);
    this.add({ characters: count, [unique ? 'uniqueCharacters' : 'rereadCharacters']: count, segments: 1 }, at);
    return record;
  }
  choice(text) { this.add({ choiceCharacters: characterCount(text) }); }
  // Seeking traverses these segments without displaying them. Retain an
  // aggregate only: no unread text in backlog, seen IDs, exports or occurrences.
  skipUnpresented(count) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid skipped-segment count');
    this.add({ skippedSegments: count });
  }
  totals() {
    return this.data.sessions.reduce((a, s) => { for (const k of Object.keys(a)) a[k] += s[k] || 0; return a; }, { activeMs: 0, characters: 0, uniqueCharacters: 0, rereadCharacters: 0, segments: 0, skippedSegments: 0, choiceCharacters: 0 });
  }
  exportCSV() {
    const keys = ['id', 'startedAt', 'updatedAt', 'activeMs', 'characters', 'uniqueCharacters', 'rereadCharacters', 'segments', 'skippedSegments', 'choiceCharacters'];
    return [keys.join(','), ...this.data.sessions.map(s => keys.map(k => JSON.stringify(s[k] ?? '')).join(','))].join('\r\n');
  }
}

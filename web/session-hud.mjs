// Optional compact overlay for the current reading session. Display only:
// it reads Activity totals and never changes the ledger.
const grouped = new Intl.NumberFormat('en');
const compact = new Intl.NumberFormat('en', {notation:'compact',maximumFractionDigits:1});
export function formatDuration(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000), hours = Math.floor(minutes / 60);
  return hours ? `${hours}:${String(minutes % 60).padStart(2, '0')}h` : `${minutes}m`;
}
// Rates need a minute of reading time; earlier values swing wildly.
export function formatRate({activeMs, characters}) {
  return activeMs >= 60000 ? `${compact.format(Math.round(characters * 3600000 / activeMs)).toLowerCase()}/h` : '—/h';
}
export function sessionHudParts(session) {
  return [formatDuration(session.activeMs), `${grouped.format(session.characters)}字`, formatRate(session)];
}
export function renderSessionHud(element, session, visible) {
  element.hidden = !visible || !session;
  if (element.hidden) return;
  const parts = sessionHudParts(session), text = parts.join(' · ');
  if (element.textContent !== text) {
    element.replaceChildren(...parts.flatMap((part, index) => { const span = document.createElement('span'); span.textContent = part; return index ? [document.createTextNode(' · '), span] : [span]; }));
    element.title = `This session: ${parts[0]} reading, ${parts[1]} read, ${parts[2].replace('/h', ' characters per hour')}`;
  }
}

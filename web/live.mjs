import {applyTheme} from './theme.mjs';
function refreshTheme(){try{applyTheme(JSON.parse(localStorage.getItem('vnkit.settings')||'{}')||{});}catch{applyTheme();}}
refreshTheme();
window.addEventListener('storage',event=>{if(event.key==='vnkit.settings')refreshTheme();});
const entries = document.getElementById('liveEntries'), status = document.getElementById('liveStatus');
const seen = new Set();
function receive(event) {
  if (event?.format !== 'vnkit.text-event' || !event.occurrenceId || seen.has(event.occurrenceId) || typeof event.sentence !== 'string') return;
  seen.add(event.occurrenceId);
  const article = document.createElement('article'); article.className = 'entry';
  const head = document.createElement('div'); head.className = 'entry-head'; head.textContent = `${event.gameTitle || event.gameId}${event.speaker && !event.speakerIncluded ? ` · ${event.speaker}` : ''}`;
  const text = document.createElement('div'); text.className = 'entry-text'; text.textContent = event.sentence; article.append(head, text); entries.append(article);
  while (entries.children.length > 300) entries.firstElementChild.remove();
  status.textContent = `${new Date(event.timestamp).toLocaleTimeString()} · receiving newly presented segments${event.flags?.skip ? ' · skipped' : ''}`;
}
if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('vnkit-text-v1'); channel.onmessage = message => receive(message.data); }
let connection, retry;
async function connect() {
  try {
    const response = await fetch('/api/session'); if (!response.ok) return;
    const session = await response.json(), url = new URL(session.structuredWsUrl || session.wsUrl);
    url.searchParams.set('format', 'json');
    connection = new WebSocket(url);
    connection.onmessage = message => { try { receive(JSON.parse(message.data)); } catch {} };
    connection.onclose = () => { retry = setTimeout(connect, 3000); };
    connection.onerror = () => connection.close();
  } catch { retry = setTimeout(connect, 5000); }
}
document.getElementById('clear').onclick = () => entries.replaceChildren();
window.addEventListener('pagehide', () => { clearTimeout(retry); if (connection) { connection.onclose = null; connection.close(); } });
connect();

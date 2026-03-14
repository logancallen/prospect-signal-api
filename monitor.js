// LL Ventures — Site Monitor
// Scans every 30 min via Railway cron
// Texts +19406319545 max once per day per issue

const TWILIO_SID = process.env.TWILIO_SID;
const TWILIO_TOKEN = process.env.TWILIO_TOKEN;
const FROM = process.env.TWILIO_FROM;
const TO = process.env.NOTIFY_PHONE;

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9waXR6aGNmYW9vbW1jc2poY3dvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNjE3NzQsImV4cCI6MjA4ODgzNzc3NH0.hOYves6YRHkewh5bdK-O9hzXKyb8RmXaVmn_snPJSEQ';

const CHECKS = [
  { name: 'ProspectSignal — Supabase ps_wells', url: 'https://opitzhcfaoommcsjhcwo.supabase.co/rest/v1/ps_wells?select=count&limit=1', headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY } },
  { name: 'ProspectSignal — Site', url: 'https://prospect-signal.netlify.app' },
  { name: 'FloorTrack — Site', url: 'https://floortracker.netlify.app' }
];

const SB_URL = 'https://opitzhcfaoommcsjhcwo.supabase.co';
const SB_HEADERS = { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };

function todayUTC() { return new Date().toISOString().slice(0, 10); }

async function wasAlertedToday(key) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/monitor_alerts?key=eq.${encodeURIComponent(key)}&select=alerted_date`, { headers: SB_HEADERS });
    const rows = await r.json();
    if (rows && rows.length > 0 && rows[0].alerted_date === todayUTC()) return true;
  } catch (e) { console.warn('Could not check alert log:', e.message); }
  return false;
}

async function markAlerted(key) {
  try {
    await fetch(`${SB_URL}/rest/v1/monitor_alerts`, {
      method: 'POST', headers: SB_HEADERS,
      body: JSON.stringify({ key, alerted_date: todayUTC() })
    });
  } catch (e) { console.warn('Could not write alert log:', e.message); }
}

async function notify(msg, key) {
  if (await wasAlertedToday(key)) { console.log(`[SUPPRESSED] Already alerted today for: ${key}`); return; }
  await markAlerted(key);
  console.error('[ALERT]', msg);
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const body = new URLSearchParams({ To: TO, From: FROM, Body: `[LL Ventures Monitor]\n${msg}` });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  if (!res.ok) console.error('[TWILIO ERROR]', await res.text());
  else console.log('[SMS SENT]', msg);
}

async function runChecks() {
  console.log(`[${new Date().toISOString()}] Starting monitor run...`);
  for (const check of CHECKS) {
    try {
      const start = Date.now();
      const r = await fetch(check.url, { headers: check.headers || {}, signal: AbortSignal.timeout(10000) });
      const ms = Date.now() - start;
      if (!r.ok) { const msg = `DOWN: ${check.name} — HTTP ${r.status} (${ms}ms)`; console.error(msg); await notify(msg, check.name); }
      else if (ms > 5000) { const msg = `SLOW: ${check.name} — ${ms}ms`; console.warn(msg); await notify(msg, check.name + '_slow'); }
      else console.log(`OK: ${check.name} — ${ms}ms`);
    } catch(e) { const msg = `ERROR: ${check.name} — ${e.message}`; console.error(msg); await notify(msg, check.name); }
  }
  console.log(`[${new Date().toISOString()}] Done.`);
}

runChecks().catch(e => { console.error('Monitor crashed:', e); process.exit(1); });

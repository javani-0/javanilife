const fs = require('fs');
function loadEnv(f) {
  const env = {};
  if (!fs.existsSync(f)) return env;
  for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    if (!l || l.trim().startsWith('#') || !l.includes('=')) continue;
    const i = l.indexOf('=');
    env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return env;
}
const env = { ...loadEnv('.env'), ...loadEnv('.env.local'), ...loadEnv('.env.vercel') };
const token = env.DELIVERY_ONE_API_TOKEN || env.DELHIVERY_API_TOKEN || '';
console.log('token len:', token.length);
const pickupId = '289756434';
const base = 'https://track.delhivery.com';
const endpoints = [
  { url: base + '/fm/request/cancel/', body: { pickup_id: pickupId } },
  { url: base + '/api/fm/request/cancel/', body: { pickup_id: pickupId } },
  { url: base + '/api/fm/request/cancel/', body: { id: pickupId } },
  { url: base + '/api/v1/pickup-cancel/', body: { pickup_id: pickupId } },
  { url: base + '/api/b2b/pickup/cancel/', body: { pickup_id: pickupId } },
  { url: base + '/api/cmu/pickup/cancel/', body: { pickup_id: pickupId } },
  { url: base + '/api/pickup/cancel/', body: { pickup_id: pickupId } },
];
(async () => {
  for (const e of endpoints) {
    const res = await fetch(e.url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Token ' + token },
      body: JSON.stringify(e.body)
    });
    const text = await res.text();
    console.log('HTTP', res.status, e.url.replace(base, ''), '->', text.slice(0, 200).replace(/\s+/g, ' '));
  }
})().catch(e => console.error(e.message));

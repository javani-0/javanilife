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
console.log('token len:', token.length, 'prefix:', token.slice(0, 8));
const pickupId = '289756434';
(async () => {
  const endpoints = [
    'https://one.delhivery.com/api/v3/pickup-requests/' + pickupId + '/cancel/',
    'https://one.delhivery.com/api/v3/pickup-requests/' + pickupId + '/cancel',
    'https://one.delhivery.com/web/api/forward_orders/pickup-requests/' + pickupId + '/cancel/',
    'https://one.delhivery.com/web/api/fm/pickup-requests/' + pickupId + '/cancel/',
  ];
  for (const url of endpoints) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Token ' + token },
      body: '{}',
      redirect: 'manual'
    });
    const text = await res.text();
    console.log('HTTP', res.status, url.replace('https://', ''), '->', text.slice(0, 300).replace(/\s+/g, ' '));
  }
})().catch(e => console.error(e.message));

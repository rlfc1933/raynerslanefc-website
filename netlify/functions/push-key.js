// Rayners Lane FC — returns the public VAPID key so the browser can subscribe
// to match-alert push notifications. Public by design (it's a public key).
// Returns { enabled:false } until VAPID_PUBLIC_KEY is set, so the front-end can
// degrade gracefully ("alerts aren't switched on yet").
exports.handler = async function () {
  var key = process.env.VAPID_PUBLIC_KEY || '';
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ enabled: !!key, key: key }),
  };
};

// TEMPORARY reconnaissance helper — fetch a fulltime.thefa.com URL from Netlify's
// cloud (which can reach it, unlike the dev sandbox) so we can find the data
// endpoint the Full-Time widget uses, then import real fixtures. Host-locked to
// fulltime.thefa.com. DELETE after the fixtures sync is built.
exports.handler = async function (event) {
  var url = (event.queryStringParameters && event.queryStringParameters.url) || 'https://fulltime.thefa.com/client/api/cs1.js';
  if (!/^https:\/\/fulltime\.thefa\.com\//.test(url)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'host not allowed' }) };
  }
  try {
    var r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': '*/*'
      },
      signal: AbortSignal.timeout(18000),
    });
    var t = await r.text();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, status: r.status, contentType: r.headers.get('content-type'), length: t.length, body: t.slice(0, 12000) }),
    };
  } catch (e) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: String(e && (e.message || e)) }) };
  }
};

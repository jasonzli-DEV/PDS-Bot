const { URL } = require('url');

const defaultHost = process.env.PDS_HOST || 'providenceday.myschoolapp.com';

function decodeToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

async function verifySession(host, cookies, expectedUserId) {
  try {
    const url = `https://${host}/api/webapp/context`;
    const res = await fetch(url, {
      headers: {
        Cookie: cookies,
        Accept: 'application/json, text/javascript, */*; q=0.01'
      }
    });

    if (!res.ok) return { ok: false, status: res.status };

    const json = await res.json();
    const userId = json?.UserInfo?.UserId || json?.UserInfo?.UserId;
    if (expectedUserId && Number(expectedUserId) !== Number(userId)) {
      return { ok: false, status: 403, json };
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function mergeCookies(oldCookies = '', setCookieHeader) {
  if (!setCookieHeader) return oldCookies;
  // setCookieHeader may contain multiple cookies separated by comma in some environments
  const parts = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const newPairs = {};
  parts.forEach(sc => {
    const first = sc.split(';')[0].trim();
    const [k, v] = first.split('=');
    if (k && v !== undefined) newPairs[k] = v;
  });

  const oldPairs = {};
  oldCookies.split(';').map(s => s.trim()).filter(Boolean).forEach(pair => {
    const [k, v] = pair.split('=');
    if (k && v !== undefined) oldPairs[k] = v;
  });

  const merged = { ...oldPairs, ...newPairs };
  return Object.entries(merged).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function renewSession(cookies) {
  try {
    const renewUrl = 'https://sts-sso.myschoolapp.com/session/renew';
    const res = await fetch(renewUrl, {
      method: 'POST',
      headers: {
        Cookie: cookies,
        Accept: 'application/json, text/plain, */*'
      },
      // empty body is fine for this endpoint in most cases
      body: ''
    });

    // Try to read set-cookie header(s)
    let setCookie = null;
    try {
      // Some fetch implementations expose raw headers
      setCookie = res.headers.get('set-cookie');
    } catch (e) {
      // ignore
    }

    const newCookies = mergeCookies(cookies, setCookie);

    // Verify by hitting webapp context (use configured host)
    const hostToVerify = process.env.PDS_HOST || defaultHost;
    const verify = await verifySession(hostToVerify, newCookies);
    if (verify.ok) {
      return { ok: true, cookies: newCookies, json: verify.json };
    }
    return { ok: false, status: res.status };
  } catch (err) {
    return { ok: false, error: err };
  }
}

module.exports = { decodeToken, verifySession, renewSession, mergeCookies, defaultHost };

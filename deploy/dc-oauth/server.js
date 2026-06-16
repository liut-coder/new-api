'use strict';

const http = require('http');
const crypto = require('crypto');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 18092);
const MISSKEY_ORIGIN = (process.env.MISSKEY_ORIGIN || 'https://dc.hhhl.cc').replace(/\/$/, '');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://example.com/dc-oauth').replace(/\/$/, '');
const APP_SECRET = process.env.APP_SECRET || '';
const DEFAULT_PUBLIC_TOKEN = process.env.DEFAULT_PUBLIC_TOKEN || '';
const STATE_TTL_MS = Number(process.env.STATE_TTL_MS || 10 * 60 * 1000);

const states = new Map();
const codes = new Map();
const now = () => Date.now();
const token = (n = 24) => crypto.randomBytes(n).toString('base64url');

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function text(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function cleanup() {
  const cutoff = now() - STATE_TTL_MS;
  for (const [key, value] of states) {
    if (value.createdAt < cutoff) states.delete(key);
  }
  for (const [key, value] of codes) {
    if (value.createdAt < cutoff) codes.delete(key);
  }
}

function getParam(url, name) {
  return url.searchParams.get(name) || '';
}

function normalizeUser(user) {
  const id = user.id || user.username || user.name;
  const rawUsername = user.username || user.usernyame || user.preferred_username || id;
  const rawName = user.name || user.displayName || user.display_nyame || rawUsername;
  return {
    id: String(id),
    sub: String(id),
    usernyame: String(rawName),
    username: String(rawName),
    preferred_username: String(rawName),
    display_nyame: String(rawUsername),
    displayName: String(rawUsername),
    name: String(rawUsername),
    raw_username: String(rawUsername),
    raw_name: String(rawName),
    picture: user.avatarUrl || user.picture || '',
    profile: user.url || user.profile || '',
  };
}

function validateRedirectUri(raw) {
  try {
    const url = new URL(raw);
    if (!url.pathname.startsWith('/oauth/')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function params(req, url) {
  if (req.method === 'GET') return url.searchParams;
  const body = await readBody(req);
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    const object = body ? JSON.parse(body) : {};
    return new URLSearchParams(Object.entries(object).map(([key, value]) => [key, String(value)]));
  }
  return new URLSearchParams(body);
}

async function misskeyApi(endpoint, payload) {
  const response = await fetch(`${MISSKEY_ORIGIN}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${endpoint} HTTP ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function handleAuthorize(req, res, url) {
  cleanup();
  if (!APP_SECRET) return text(res, 500, 'missing APP_SECRET');
  const rawRedirect = getParam(url, 'redirect_uri');
  const oauthState = getParam(url, 'state') || token(12);
  if (!rawRedirect) return text(res, 400, 'missing redirect_uri');
  const redirectUri = validateRedirectUri(rawRedirect);
  if (!redirectUri) return text(res, 400, 'invalid redirect_uri');

  let session;
  try {
    session = await misskeyApi('auth/session/generate', { appSecret: APP_SECRET });
  } catch (error) {
    console.error(error);
    return text(res, 502, String(error.message || error));
  }

  states.set(session.token, { redirectUri, state: oauthState, createdAt: now() });
  return redirect(res, session.url);
}

async function handleCallback(req, res, url) {
  cleanup();
  const sessionToken = getParam(url, 'token') || getParam(url, 'session');
  const item = states.get(sessionToken);
  if (!item) return text(res, 400, 'state/session expired or not found');

  let data;
  try {
    data = await misskeyApi('auth/session/userkey', {
      appSecret: APP_SECRET,
      token: sessionToken,
    });
  } catch (error) {
    console.error(error);
    return text(res, 502, String(error.message || error));
  }

  const codeForNewApi = token(24);
  codes.set(codeForNewApi, {
    user: normalizeUser(data.user),
    accessToken: data.accessToken,
    createdAt: now(),
  });
  states.delete(sessionToken);

  const back = new URL(item.redirectUri);
  back.searchParams.set('code', codeForNewApi);
  back.searchParams.set('state', item.state);
  return redirect(res, back.toString());
}

async function handleToken(req, res, url) {
  cleanup();
  const requestParams = await params(req, url);
  const code = requestParams.get('code') || '';
  const item = codes.get(code);
  if (!item) return json(res, 400, { error: 'invalid_grant' });

  codes.delete(code);
  const accessToken = token(32);
  codes.set(accessToken, {
    user: item.user,
    misskeyAccessToken: item.accessToken,
    createdAt: now(),
  });
  return json(res, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: Math.floor(STATE_TTL_MS / 1000),
    scope: 'read:account',
  });
}

async function handleUserinfo(req, res) {
  cleanup();
  const auth = req.headers.authorization || '';
  const accessToken = auth.replace(/^Bearer\s+/i, '').trim();
  const item = codes.get(accessToken);
  if (!item) return json(res, 401, { error: 'invalid_token' });
  return json(res, 200, item.user);
}

async function router(req, res) {
  try {
    const url = new URL(req.url, PUBLIC_BASE_URL);
    const path = url.pathname.replace(/^\/dc-oauth/, '') || '/';
    if (req.method === 'OPTIONS') return json(res, 200, {});
    if (path === '/' || path === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'dc-oauth-v2-app-auth',
        misskey: MISSKEY_ORIGIN,
        publicBase: PUBLIC_BASE_URL,
        hasAppSecret: Boolean(APP_SECRET),
        has_public_token: Boolean(DEFAULT_PUBLIC_TOKEN),
      });
    }
    if (path === '/authorize' && req.method === 'GET') return handleAuthorize(req, res, url);
    if (path === '/callback' && req.method === 'GET') return handleCallback(req, res, url);
    if (path === '/token' && (req.method === 'POST' || req.method === 'GET')) {
      return handleToken(req, res, url);
    }
    if (path === '/userinfo' && req.method === 'GET') return handleUserinfo(req, res);
    return text(res, 404, 'not found');
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'server_error', message: String(error.message || error) });
  }
}

http.createServer(router).listen(PORT, HOST, () => {
  console.log(`dc-oauth-v2-app-auth listening on http://${HOST}:${PORT}`);
  console.log(`public base: ${PUBLIC_BASE_URL}`);
});

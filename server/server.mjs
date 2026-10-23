// Zero-dependency Node backend: REST API + static hosting. Run: node server/server.mjs
// Shares data.js and validate.js with the browser, so provider data and validation rules have one source of truth.
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PROVIDERS } from '../js/data.js';
import { validateEnquiry, cleanEnquiry } from '../js/validate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'server', 'db.json');
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_KEY = (process.env.ADMIN_KEY || 'ABHI-112').trim(); // default admin password; set the ADMIN_KEY environment variable to use a different one. This file is never served to browsers.
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ORIGINS = new Set(['http://localhost:5500', 'http://127.0.0.1:5500', ...(process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)]);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

/* JSON file store with serialized, atomic writes (swap in a real database later) */
let queue = Promise.resolve();
const readDb = async () => { try { const d = JSON.parse(await readFile(DB, 'utf8')); return Array.isArray(d.enquiries) ? d : { enquiries: [] }; } catch { return { enquiries: [] }; } };
function withDb(fn) {
  const run = queue.then(async () => { const db = await readDb(); const out = await fn(db); await writeFile(DB + '.tmp', JSON.stringify(db, null, 2)); await rename(DB + '.tmp', DB); return out; });
  queue = run.catch(() => {});
  return run;
}

const STATUSES = new Set(['saved-not-sent', 'contacted', 'confirmed', 'completed', 'cancelled']);
const badKeys = new Map(); // wrong admin keys: 10 tries / 10 min / IP
function adminOnly(req) {
  const ip = req.socket.remoteAddress, now = Date.now(), recent = (badKeys.get(ip) || []).filter((t) => now - t < 6e5);
  if (recent.length >= 10) throw fail(429, 'Too many wrong keys. Try again in 10 minutes.');
  const key = Buffer.from(String(req.headers['x-admin-key'] || '')), want = Buffer.from(ADMIN_KEY);
  if (!ADMIN_KEY || key.length !== want.length || !crypto.timingSafeEqual(key, want)) { recent.push(now); badKeys.set(ip, recent); throw fail(401, 'Unauthorized'); }
}
const SESS = new Map(), authTries = new Map();
const hits = new Map(); // naive in-memory rate limit: 10 enquiries / 10 min / IP
const limited = (ip) => { const now = Date.now(), a = (hits.get(ip) || []).filter((t) => now - t < 6e5); a.push(now); hits.set(ip, a); return a.length > 10; };
const fail = (code, message) => Object.assign(new Error(message), { status: code });
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve, reject) => {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reject(fail(415, 'Send JSON'));
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 10_000) { reject(fail(413, 'Request too large')); req.destroy(); } });
  req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { reject(fail(400, 'Invalid JSON')); } });
});

async function api(req, res, url) {
  const [a, b] = url.pathname.split('/').filter(Boolean).slice(1); // '/api/providers/p101' -> ['providers','p101']
  if (req.method === 'GET' && a === 'health') return json(res, 200, { ok: true, auth: true });
  if (req.method === 'GET' && a === 'providers') {
    if (!b) return json(res, 200, { providers: PROVIDERS });
    const p = PROVIDERS.find((x) => x.id === b);
    return p ? json(res, 200, { provider: p }) : json(res, 404, { error: 'Provider not found' });
  }
  if (a === 'auth') { // customer accounts: scrypt-hashed passwords, random session tokens (kept in memory; a server restart logs everyone out)
    const token = String(req.headers['x-user-token'] || '');
    if (req.method === 'GET' && b === 'me') {
      const sess = SESS.get(token), u = sess && sess.exp > Date.now() && ((await readDb()).users || []).find((x) => x.id === sess.id);
      if (!u) throw fail(401, 'Please log in again.');
      return json(res, 200, { user: { name: u.name, phone: u.phone } });
    }
    if (req.method === 'POST' && b === 'logout') { SESS.delete(token); return json(res, 200, { ok: true }); }
    if (req.method === 'POST' && (b === 'login' || b === 'register')) {
      const ip = req.socket.remoteAddress, now = Date.now(), recent = (authTries.get(ip) || []).filter((t) => now - t < 6e5);
      if (recent.length >= 20) throw fail(429, 'Too many attempts. Try again in 10 minutes.');
      recent.push(now); authTries.set(ip, recent);
      const body = await readBody(req), phone = String(body.phone || '').replace(/[\s-]/g, ''), pw = String(body.password || '');
      if (!/^[6-9]\d{9}$/.test(phone)) throw fail(400, 'Enter a valid 10-digit mobile number.');
      if (pw.length < 1 || pw.length > 100) throw fail(400, 'Enter your password.');
      let user;
      if (b === 'register') {
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        if (name.length < 2 || name.length > 60) throw fail(400, 'Enter your name.');
        if (pw.length < 8) throw fail(400, 'Password must be at least 8 characters.');
        const salt = crypto.randomBytes(16).toString('hex');
        user = { id: crypto.randomBytes(8).toString('hex'), name, phone, salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex'), createdAt: new Date().toISOString() };
        await withDb((db) => { db.users ||= []; if (db.users.some((x) => x.phone === phone)) throw fail(409, 'An account with this number already exists. Please log in.'); db.users.push(user); });
      } else {
        user = ((await readDb()).users || []).find((x) => x.phone === phone);
        const ok = user && crypto.timingSafeEqual(Buffer.from(user.hash, 'hex'), crypto.scryptSync(pw, user.salt, 64));
        if (!ok) throw fail(401, 'Wrong mobile number or password.');
      }
      const t = crypto.randomBytes(24).toString('hex'); SESS.set(t, { id: user.id, exp: Date.now() + 7 * 864e5 });
      return json(res, b === 'register' ? 201 : 200, { token: t, user: { name: user.name, phone: user.phone } });
    }
    return json(res, 404, { error: 'Not found' });
  }
  if (a === 'enquiries') {
    if (req.method === 'POST' && !b) {
      const admin = req.headers['x-admin-key'] !== undefined; // admin "Add enquiry": needs the key, skips the public rate limit
      if (admin) adminOnly(req); else if (limited(req.socket.remoteAddress)) return json(res, 429, { error: 'Too many enquiries. Try again later.' });
      const body = await readBody(req);
      if (admin) body.consent = true;
      const errors = validateEnquiry(body, PROVIDERS);
      if (Object.keys(errors).length) return json(res, 400, { errors });
      const rec = { ref: 'LSF-' + crypto.randomBytes(4).toString('hex').toUpperCase(), ...cleanEnquiry(body), status: admin && STATUSES.has(body.status) ? body.status : 'saved-not-sent', ...(admin && { source: 'admin', adminNote: String(body.note ?? '').trim().slice(0, 300) }), createdAt: new Date().toISOString() };
      await withDb((db) => {
        const dup = db.enquiries.some((x) => x.providerId === rec.providerId && x.phone === rec.phone && x.description === rec.description && Date.now() - Date.parse(x.createdAt) < 6e4);
        if (dup) throw fail(409, 'This enquiry was already submitted a moment ago.');
        db.enquiries.push(rec);
      });
      return json(res, 201, { ref: rec.ref, status: rec.status, createdAt: rec.createdAt, ...(admin && { enquiry: rec }) });
    }
    if (req.method === 'PATCH' && b) { // admin: change status and/or private note
      adminOnly(req);
      const body = await readBody(req), upd = {};
      if (body.status !== undefined) { if (!STATUSES.has(body.status)) throw fail(400, 'Unknown status'); upd.status = body.status; }
      if (body.note !== undefined) upd.adminNote = String(body.note).trim().slice(0, 300);
      const edit = ['providerId', 'name', 'phone', 'description', 'locality', 'when'].filter((k) => body[k] !== undefined);
      let out = null, errs = null;
      await withDb((db) => {
        const r = db.enquiries.find((x) => x.ref === b); if (!r) throw fail(404, 'Enquiry not found');
        if (edit.length) { // admin edits: same rules as a new enquiry, but old (past) bookings can still be corrected
          const merged = { ...r }; edit.forEach((k) => { merged[k] = body[k]; });
          const w = Date.parse(merged.when);
          const e = validateEnquiry({ ...merged, consent: true }, PROVIDERS, new Date(Math.min(Date.now(), (Number.isNaN(w) ? Date.now() : w) - 36e5)));
          if (Object.keys(e).length) { errs = e; return; }
          const c = cleanEnquiry({ ...merged, consent: true }); edit.forEach((k) => { r[k] = c[k]; });
        }
        Object.assign(r, upd, { updatedAt: new Date().toISOString() }); out = r;
      });
      if (errs) return json(res, 400, { errors: errs });
      return json(res, 200, { enquiry: out });
    }
    if (req.method === 'DELETE' && b) { // admin: remove an enquiry
      adminOnly(req);
      await withDb((db) => { const i = db.enquiries.findIndex((x) => x.ref === b); if (i < 0) throw fail(404, 'Enquiry not found'); db.enquiries.splice(i, 1); });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && b) { // public lookup returns no personal data
      const r = (await readDb()).enquiries.find((x) => x.ref === b);
      return r ? json(res, 200, { ref: r.ref, status: r.status, createdAt: r.createdAt }) : json(res, 404, { error: 'Enquiry not found' });
    }
    if (req.method === 'GET') {
      adminOnly(req);
      return json(res, 200, { enquiries: (await readDb()).enquiries });
    }
  }
  if (a === 'admin' && b === 'users') { // admin: list / delete customer accounts. Never returns salts or password hashes.
    adminOnly(req);
    const uid = url.pathname.split('/').filter(Boolean)[3];
    if (req.method === 'GET' && !uid) return json(res, 200, { users: ((await readDb()).users || []).map(({ id, name, phone, createdAt }) => ({ id, name, phone, createdAt })) });
    if (req.method === 'DELETE' && uid) {
      await withDb((db) => { const i = (db.users || []).findIndex((x) => x.id === uid); if (i < 0) throw fail(404, 'Customer not found'); db.users.splice(i, 1); });
      for (const [t, sess] of SESS) if (sess.id === uid) SESS.delete(t); // sign them out
      return json(res, 200, { ok: true });
    }
  }
  json(res, 404, { error: 'Not found' });
}

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(ROOT, rel);
  const blocked = !file.startsWith(ROOT + path.sep) || /\/(server|node_modules|\.)/.test(rel) || /package(-lock)?\.json$/.test(rel);
  try {
    if (blocked) throw new Error('blocked');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); // OpenStreetMap tiles are refused when no Referer is sent
  const origin = req.headers.origin;
  if (origin && (ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin))) { // any localhost port (Live Server may use 5501, 5502...)
    res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-User-Token'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url); else await serveStatic(res, url.pathname);
  } catch (e) { json(res, e.status || 500, { error: e.status ? e.message : 'Server error' }); }
}).on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use. Close the other server window, or use another port (PORT=3001 npm start).` : e.message);
  process.exit(1);
}).listen(PORT, () => {
  console.log(`Local Finder running at http://localhost:${PORT}`);
  console.log(ADMIN_KEY ? `Admin panel: http://localhost:${PORT}/admin.html` : 'Admin panel is OFF. Set the ADMIN_KEY environment variable to turn it on.');
});

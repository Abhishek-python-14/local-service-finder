// Customer login / sign-up.
// With the Node server running, accounts are real: passwords are hashed with scrypt on the server and sessions use random tokens.
// Without it, a DEMO fallback keeps accounts in this browser only. That fallback is NOT secure authentication and is labelled as such.
import { $, renderShell, refreshIcons, toast, openDialog, closeDialog } from './app.js';
renderShell();
const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);
let override = null; try { override = localStorage.getItem('lsf_api'); } catch { /* ignore */ }
const API = override || (location.port === '3000' ? '/api' : isLocal ? 'http://localhost:3000/api' : null);
const KEY = 'lsf_user', UKEY = 'lsf_users', RKEY = 'lsf_remember';
const getUser = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const setUser = (u) => { try { u ? localStorage.setItem(KEY, JSON.stringify(u)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } };
let signup = location.hash === '#signup', serverUp = null;

async function api(path, body, token, ms = 4000) {
  if (!API) return { status: 0 };
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + path, { method: body ? 'POST' : 'GET', signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(token && { 'X-User-Token': token }) }, body: body && JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch { return { status: 0 }; } finally { clearTimeout(t); }
}

/* ---------- DEMO fallback: accounts kept in this browser only (PBKDF2-hashed, never plain text). Not a substitute for a server. ---------- */
const readUsers = () => { try { return JSON.parse(localStorage.getItem(UKEY) || '[]'); } catch { return []; } };
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hashPw(pw, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((x) => parseInt(x, 16)));
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, k, 256));
}
async function localAuth({ name, phone, password }) {
  const users = readUsers();
  if (signup) {
    if (users.some((u) => u.phone === phone)) return { error: 'An account with this number already exists. Please log in.' };
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    users.push({ name, phone, salt, hash: await hashPw(password, salt) });
    try { localStorage.setItem(UKEY, JSON.stringify(users)); } catch { return { error: 'This browser blocks storage, so the account cannot be saved.' }; }
    return { user: { name, phone } };
  }
  const u = users.find((x) => x.phone === phone);
  if (!u || (await hashPw(password, u.salt)) !== u.hash) return { error: 'Wrong mobile number or password (accounts made with the server are not available offline).' };
  return { user: { name: u.name, phone: u.phone } };
}

/* ---------- inline validation (accessible: aria-invalid + aria-describedby + role=alert messages) ---------- */
const FIELDS = { name: 'e-name', phone: 'e-phone', pw: 'e-pw' };
function fieldError(id, msg) {
  const input = $('#' + id), p = $('#' + FIELDS[id]);
  p.textContent = msg || ''; input.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (!msg) input.removeAttribute('aria-invalid');
  return msg;
}
const rules = {
  name: () => signup && $('#name').value.trim().length < 2 ? 'Enter your name (at least 2 letters).' : '',
  phone: () => /^[6-9]\d{9}$/.test($('#phone').value.replace(/[\s-]/g, '')) ? '' : 'Enter a valid 10-digit Indian mobile number starting with 6–9.',
  pw: () => !$('#pw').value ? 'Enter your password.' : signup && $('#pw').value.length < 8 ? 'Password must be at least 8 characters.' : '',
};
for (const id of Object.keys(rules)) {
  $('#' + id).addEventListener('blur', () => { if ($('#' + id).value || $('#' + id).getAttribute('aria-invalid')) fieldError(id, rules[id]()); });
  $('#' + id).addEventListener('input', () => { if ($('#' + id).getAttribute('aria-invalid')) fieldError(id, rules[id]()); });
}
const err = (m) => { const n = $('#auth-err'); n.textContent = m || ''; n.hidden = !m; };
const busy = (on) => { const b = $('#auth-submit'); b.disabled = on; b.setAttribute('aria-busy', String(on)); };
const label = () => (signup ? 'Create account' : 'Login');

function render() {
  const u = getUser();
  $('#guest-view').hidden = Boolean(u); $('#user-view').hidden = !u;
  if (u) { $('#u-name').textContent = u.name; $('#u-phone').textContent = u.phone; $('#u-local').hidden = !u.local; }
  $('#auth-title').textContent = signup ? 'Create account' : 'Login';
  $('#auth-sub').textContent = signup ? 'Create a free account to prefill your name and number when you book.' : 'Sign in with your mobile number to prefill your details when you send an enquiry.';
  $('#auth-submit .lbl').textContent = label();
  $('#auth-switch').textContent = signup ? 'Already have an account? Login' : 'New here? Create an account';
  $('#f-name').hidden = !signup; $('#pw-hint').hidden = !signup;
  $('#pw').autocomplete = signup ? 'new-password' : 'current-password';
  document.title = `${label()} | Service Local Finder`;
  refreshIcons();
}
function modeBadge() {
  const b = $('#mode-badge');
  if (serverUp) { b.className = 'mode-badge ok'; b.textContent = 'Server login: passwords are hashed on the server'; }
  else { b.className = 'mode-badge demo'; b.textContent = 'Demo mode: no server found. Accounts stay in this browser only, not secure'; }
}

$('#auth-switch').addEventListener('click', () => { signup = !signup; err(''); Object.keys(FIELDS).forEach((i) => fieldError(i, '')); history.replaceState(null, '', signup ? '#signup' : location.pathname); render(); });
$('#pw-toggle').addEventListener('click', (e) => {
  const show = $('#pw').type === 'password'; $('#pw').type = show ? 'text' : 'password';
  const b = e.currentTarget; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  b.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}" aria-hidden="true"></i>`; refreshIcons();
});
const fg = $('#forgot-dialog');
$('#forgot').addEventListener('click', () => openDialog(fg));
$('#fg-close').addEventListener('click', () => closeDialog(fg)); $('#fg-ok').addEventListener('click', () => closeDialog(fg));

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault(); err('');
  const bad = Object.keys(rules).filter((id) => fieldError(id, rules[id]()));
  if (bad.length) { $('#' + bad[0]).focus(); $('.auth-card').classList.remove('shake'); void $('.auth-card').offsetWidth; $('.auth-card').classList.add('shake'); return; }
  const phone = $('#phone').value.replace(/[\s-]/g, ''), password = $('#pw').value, name = $('#name').value.trim();
  busy(true);
  try {
    const r = await api(signup ? '/auth/register' : '/auth/login', signup ? { name, phone, password } : { phone, password });
    let user = null;
    if (r.status === 200 || r.status === 201) user = { token: r.body.token, name: r.body.user.name, phone: r.body.user.phone };
    else if (r.status !== 0 && r.status !== 404) { err(r.body.error || 'Something went wrong. Try again.'); toast(r.body.error || 'Login failed.', 'error'); return; } // real answer from a login-capable server
    else {
      if (!crypto?.subtle) { err('Login needs the server here. Start it with npm start and open http://localhost:3000/login.html.'); return; }
      const l = await localAuth({ name, phone, password });
      if (l.error) { err(l.error); toast(l.error, 'error'); return; }
      user = { token: 'local', local: true, ...l.user };
    }
    try { $('#remember').checked ? localStorage.setItem(RKEY, phone) : localStorage.removeItem(RKEY); } catch { /* ignore */ }
    setUser(user); $('#pw').value = ''; render();
    toast(signup ? `Account created. Welcome, ${user.name.split(' ')[0]}!` : `Welcome back, ${user.name.split(' ')[0]}!`, 'success');
  } finally { busy(false); }
});
$('#logout').addEventListener('click', () => { const u = getUser(); setUser(null); render(); toast('You have been logged out.', 'info'); if (u && !u.local) api('/auth/logout', {}, u.token); });

// init: prefill remembered number, check server health, drop a stale server session (browser-only accounts stay)
try { const r = localStorage.getItem(RKEY); if (r) { $('#phone').value = r; $('#remember').checked = true; } } catch { /* ignore */ }
(async () => {
  const h = await api('/health', null, null, 1500); serverUp = h.status === 200 && Boolean(h.body.auth); modeBadge();
  const u = getUser(); if (!u || u.local) return;
  const r = await api('/auth/me', null, u.token); if (r.status === 401) { setUser(null); render(); toast('Your session expired. Please log in again.', 'info'); }
})();
render();

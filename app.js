// Shared helpers: DOM builder, header/footer, provider card, and the data/API layer. Visual effects live in fx.js.
import { CATEGORIES, LOCALITIES, PROVIDERS, TEST_PHONE } from './data.js';
import { cleanEnquiry, hoursOf, inHours } from './validate.js';
import { initFx, tilt, toast, openDialog, closeDialog } from './fx.js';
export { tilt, toast, openDialog, closeDialog };

/* ---------- DOM helpers (textContent only, so user strings are never parsed as HTML) ---------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
export const icon = (name) => h('i', { 'data-lucide': name, 'aria-hidden': 'true' });
export const refreshIcons = () => window.lucide?.createIcons();
export const params = () => new URLSearchParams(location.search);
export const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
export const catLabel = (id) => (CATEGORIES.find((c) => c.id === id)?.label ?? id).replace(/s$/, '');
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Location helpers ---------- */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const r = (x) => (x * Math.PI) / 180, a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}
export const mapsLink = (p) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
export const pin = (latlng, color = '#f4a300') => L.circleMarker(latlng, { radius: 9, color: '#0a525e', weight: 2, fillColor: color, fillOpacity: 1 });
export function makeMap(el) { // Leaflet + OpenStreetMap; returns null (with a message) if the library could not load
  if (!window.L) { el.replaceWith(h('p', { class: 'notice' }, 'The map could not load. Check your internet connection and reload the page.')); return null; }
  // One-finger drag scrolls the page on phones (two fingers move the map); the mouse wheel zooms only after the map is clicked.
  const map = L.map(el, { scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false }).setView([28.48, 77.50], 12);
  map.on('focus', () => map.scrollWheelZoom.enable()); map.on('blur', () => map.scrollWheelZoom.disable());
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  }).addTo(map);
  let loaded = 0, failed = 0, note = null;
  tiles.on('tileload', () => { loaded++; note?.remove(); note = null; });
  tiles.on('tileerror', () => {
    failed++;
    if (loaded || failed < 3 || note) return;
    note = h('p', { class: 'notice', role: 'status' }, location.protocol === 'file:'
      ? 'Map tiles need the site to be served over http. Open it with VS Code Live Server or npm start instead of double-clicking the file.'
      : 'Map tiles could not load. Check your internet connection; the pins will still appear once the tiles return.');
    el.insertAdjacentElement('afterend', note);
  });
  // Leaflet needs a real size: re-measure when the layout changes (fonts, rotation, sidebar, tab switch)
  if ('ResizeObserver' in window) new ResizeObserver(() => map.invalidateSize()).observe(el);
  addEventListener('load', () => map.invalidateSize(), { once: true });
  return map;
}

/* ---------- Avatar with fallback ---------- */
function fallbackAvatar(name) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  return 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f6b7a"/><text x="50" y="63" font-size="38" text-anchor="middle" fill="#fff" font-family="sans-serif">${initials}</text></svg>`);
}
export function avatar(p, size = 64) {
  const img = h('img', { src: `https://i.pravatar.cc/320?img=${p.photo}`, alt: `Photo of ${p.name}`, width: size, height: size, loading: 'lazy' });
  img.addEventListener('error', () => { img.src = fallbackAvatar(p.name); }, { once: true });
  return img;
}

/* ---------- Shell: header, mobile menu, footer ---------- */
export function renderShell() {
  if (document.body.dataset.shell) return; // app.js and each page script both call this; build the header/footer only once
  document.body.dataset.shell = '1';
  const here = location.pathname.split('/').pop() || 'index.html';
  const links = [['index.html', 'Home'], ['providers.html', 'Providers'], ['enquiry.html', 'Enquiry'], ['track.html', 'Track']];
  const nav = h('nav', { id: 'site-nav', 'aria-label': 'Main' },
    links.map(([href, t]) => h('a', { href, 'aria-current': here === href ? 'page' : null }, t)),
    h('a', { href: 'login.html', 'aria-current': here === 'login.html' ? 'page' : null }, (() => { try { const u = JSON.parse(localStorage.getItem('lsf_user') || 'null'); return u ? 'Hi, ' + String(u.name).split(' ')[0] : 'Login'; } catch { return 'Login'; } })()),
    h('a', { class: 'btn btn-primary', href: 'providers.html' }, 'Find a Service'));
  const btn = h('button', { class: 'menu-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'site-nav', 'aria-label': 'Open menu' }, icon('menu'));
  const setOpen = (o) => { nav.classList.toggle('open', o); btn.setAttribute('aria-expanded', String(o)); btn.setAttribute('aria-label', o ? 'Close menu' : 'Open menu'); };
  btn.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
  $('#site-header')?.append(
    h('div', { class: 'wrap bar' }, h('a', { class: 'logo', href: 'index.html' }, icon('map-pinned'), 'Service Local ', h('b', {}, 'Finder')), btn, nav));
  $('#site-footer')?.append(h('div', { class: 'wrap foot' },
    h('div', {}, h('a', { class: 'logo', href: 'index.html' }, icon('map-pinned'), 'Service Local ', h('b', {}, 'Finder')),
      h('p', {}, 'Find local electricians, plumbers, tutors and repair technicians in one place.')),
    h('div', {}, h('h3', {}, 'Explore'), ...CATEGORIES.map((c) => h('a', { href: `providers.html?cat=${c.id}` }, c.label))),
    h('div', {}, h('h3', {}, 'Pages'), ...[['index.html', 'Home'], ['providers.html', 'All providers'], ['enquiry.html', 'Book a slot'], ['track.html', 'Track an enquiry'], ['login.html', 'Login or sign up']].map(([href, t]) => h('a', { href }, t))),
    h('div', {}, h('h3', {}, 'Contact'), h('a', { href: 'mailto:support@servicelocalfinder.example' }, 'support@servicelocalfinder.example'),
      h('p', {}, 'Greater Noida, Uttar Pradesh'),
      h('p', { class: 'small' }, 'Provider listings, ratings and reviews are sample data. Enquiries are stored in your own browser (or the optional server), not a shared database.'))));
  refreshIcons();
}

/* ---------- Contact actions and provider card ---------- */
// Number used for Call/WhatsApp: your TEST_PHONE if set, else a real provider's own number. Sample (fictional) providers never get dialled.
export const contactNumber = (p) => (/^[6-9]\d{9}$/.test(TEST_PHONE) ? TEST_PHONE : p.demo ? '' : p.phone);
export const isLive = (p) => Boolean(contactNumber(p));
const demoNote = () => toast('Sample listing: calling and WhatsApp are switched off. Open js/data.js and set TEST_PHONE to your own 10-digit number to test them, or add real providers.', 'info', 8000);
export const waLink = (p, text) => `https://wa.me/${isLive(p) ? '91' + contactNumber(p) : ''}?text=${encodeURIComponent(text)}`;
export function contactBtns(p, labels = true) {
  const mk = (cls, ic, label, href, extra = {}) => !isLive(p)
    ? h('button', { class: `btn ${cls}`, type: 'button', 'aria-label': `${label} ${p.name}`, onclick: demoNote }, icon(ic), labels && label)
    : h('a', { class: `btn ${cls}`, href, 'aria-label': `${label} ${p.name}`, ...extra }, icon(ic), labels && label);
  return [mk('btn-ghost', 'phone', 'Call', `tel:+91${contactNumber(p)}`),
    mk('btn-wa', 'message-circle', 'WhatsApp', waLink(p, `Hi ${p.name}, I found you on Service Local Finder and would like to enquire about your service.`), { target: '_blank', rel: 'noopener noreferrer' })];
}
export const openChip = (p) => { const o = inHours(hoursOf(p.availability), new Date()); return h('span', { class: 'chip ' + (o ? 'open' : 'closed'), title: 'Based on the listed hours' }, o ? 'Open now' : 'Closed now'); };

export function providerCard(p) {
  return h('article', { class: 'pcard', 'data-tilt': '' },
    h('div', { class: 'pc-top' }, avatar(p, 64), h('div', {}, h('h3', {}, p.name), h('p', { class: 'muted' }, p.title))),
    h('div', { class: 'chips' }, h('span', { class: 'chip' }, catLabel(p.category)), openChip(p)),
    h('ul', { class: 'meta' },
      h('li', {}, icon('map-pin'), p.locality),
      h('li', {}, icon('briefcase'), `${p.experience} years`),
      p._km != null && h('li', {}, icon('navigation'), `${p._km.toFixed(1)} km from you (straight line)`),
      h('li', { class: 'rate' }, icon('star'), `${p.rating.toFixed(1)} (${p.reviews} reviews)`)),
    h('p', { class: 'price' }, 'From ', h('b', {}, money(p.price)), ` per ${p.unit}`),
    h('div', { class: 'actions' },
      h('a', { class: 'btn btn-primary', href: `provider.html?id=${encodeURIComponent(p.id)}` }, 'View Profile'), ...contactBtns(p, false)));
}

/* ---------- Data / API layer: uses the Node backend when reachable, otherwise local demo data ---------- */
const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const isLocalHost = ['localhost', '127.0.0.1', ''].includes(location.hostname);
// Set localStorage.lsf_api = 'https://your-api.example/api' to point a deployed frontend at a hosted backend.
const API = safeGet('lsf_api') || (location.port === '3000' ? '/api' : isLocalHost ? 'http://localhost:3000/api' : null);

async function call(path, opts = {}) {
  if (!API) return null;
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 1500);
  try {
    const r = await fetch(API + path, { ...opts, signal: ctl.signal, headers: { 'Content-Type': 'application/json' } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch { return null; } finally { clearTimeout(t); }
}
export async function getProviders() {
  const r = await call('/providers');
  return r?.status === 200 && Array.isArray(r.body.providers) ? r.body.providers : PROVIDERS;
}
export async function getProvider(id) {
  const r = await call('/providers/' + encodeURIComponent(id));
  if (r?.status === 200) return r.body.provider;
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

/* LocalStorage enquiries (demo persistence) */
const KEY = 'lsf_enquiries';
export function readLocalEnquiries() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { list: [] };
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('not a list');
    return { list: data.filter((r) => r && typeof r.ref === 'string' && typeof r.providerId === 'string') };
  } catch {
    try { const raw = localStorage.getItem(KEY); if (raw) { localStorage.setItem(KEY + '_corrupt_backup', raw); localStorage.removeItem(KEY); } } catch { /* storage unavailable */ }
    return { list: [], problem: true };
  }
}
const writeLocal = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } };
function makeRef() {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return 'LSF-' + Date.now().toString(36).toUpperCase().slice(-4) + [...b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export async function saveEnquiry(values) {
  const clean = cleanEnquiry(values), { list } = readLocalEnquiries();
  const same = (r) => r.providerId === clean.providerId && r.phone === clean.phone && r.description === clean.description;
  if (list.some((r) => same(r) && Date.now() - Date.parse(r.createdAt) < 6e4))
    return { error: 'You already sent this enquiry a moment ago. Wait a minute before sending it again.' };
  const res = await call('/enquiries', { method: 'POST', body: JSON.stringify(clean) });
  let rec, mode;
  if (res?.status === 201) { rec = { ...clean, ref: res.body.ref, createdAt: res.body.createdAt }; mode = 'server'; }
  else if (res?.status === 400) return { errors: res.body.errors ?? {} };
  else if (res) return { error: res.body.error || 'The server could not save this enquiry.' };
  else { rec = { ...clean, ref: makeRef(), createdAt: new Date().toISOString() }; mode = 'local'; }
  const stored = writeLocal([{ ...rec, mode, status: 'saved' }, ...list].slice(0, 50));
  if (mode === 'local' && !stored) return { error: 'Your browser blocked storage, so this enquiry could not be saved. Allow site data and try again.' };
  return { ref: rec.ref, mode };
}

export async function findEnquiry(ref) { // this browser first, then the backend (which returns no personal data)
  const local = readLocalEnquiries().list.find((r) => r.ref === ref);
  if (local) return local;
  const r = await call('/enquiries/' + encodeURIComponent(ref));
  return r?.status === 200 ? { ...r.body, remote: true } : null;
}
export function markWhatsapp(ref) {
  const { list } = readLocalEnquiries(), i = list.findIndex((r) => r.ref === ref);
  if (i >= 0) { list[i] = { ...list[i], status: 'whatsapp-opened', waAt: new Date().toISOString() }; writeLocal(list); }
}

/* ---------- Home page ---------- */
function openCat(c) {
  const ps = PROVIDERS.filter((p) => p.category === c.id).sort((a, b) => b.rating - a.rating);
  const avg = ps.length ? (ps.reduce((t, p) => t + p.rating, 0) / ps.length).toFixed(1) : '–';
  $('#cd-title').textContent = c.label; $('#cd-blurb').textContent = c.blurb;
  $('#cd-kv').replaceChildren(h('span', { class: 'chip' }, `${ps.length} sample providers`), h('span', { class: 'chip' }, `From ${money(Math.min(...ps.map((p) => p.price)))} per ${ps[0]?.unit ?? 'visit'}`),
    h('span', { class: 'chip' }, `Average rating ${avg}`), h('span', { class: 'chip' }, `${new Set(ps.map((p) => p.locality)).size} localities`));
  $('#cd-list').replaceChildren(...ps.slice(0, 3).map((p) => h('li', {}, h('a', { href: `provider.html?id=${encodeURIComponent(p.id)}` }, p.name), h('span', { class: 'muted small' }, `${p.locality} · ${p.rating.toFixed(1)} ★ · ${money(p.price)}`))));
  $('#cd-all').href = `providers.html?cat=${encodeURIComponent(c.id)}`;
  $('#cd-all').lastChild.textContent = `See all ${c.label.toLowerCase()}`;
  openDialog($('#cat-dialog')); refreshIcons();
}
function initHome() {
  $('#locality-list')?.append(...LOCALITIES.map((l) => h('option', { value: l })));
  $('#featured')?.replaceChildren(...[...PROVIDERS].sort((a, b) => b.rating - a.rating).slice(0, 3).map((p) => { const c = providerCard(p); c.dataset.reveal = ''; return c; }));
  const avg = (PROVIDERS.reduce((t, p) => t + p.rating, 0) / PROVIDERS.length).toFixed(1);
  $('#stats-strip')?.replaceChildren(
    ...[[PROVIDERS.length, 'Sample providers'], [CATEGORIES.length, 'Service categories'], [LOCALITIES.length, 'Localities covered']].map(([n, t]) => h('div', { class: 'stat' }, h('b', { 'data-count': n }, '0'), h('span', {}, t))),
    h('div', { class: 'stat' }, h('b', {}, avg + ' ★'), h('span', {}, 'Average sample rating')));
  $('#cat-grid')?.replaceChildren(...CATEGORIES.map((c) => {
    const ps = PROVIDERS.filter((p) => p.category === c.id);
    return h('button', { class: 'cat3d', type: 'button', 'data-tilt': '6', 'data-reveal': '', 'aria-haspopup': 'dialog', onclick: () => openCat(c) },
      h('span', { class: 'ico' }, icon(c.icon)), h('h3', {}, c.label), h('p', {}, c.blurb),
      h('span', { class: 'cat-more' }, h('span', {}, `${ps.length} providers · from ${money(Math.min(...ps.map((p) => p.price)))}`), icon('arrow-up-right')));
  }));
  $('#reviews')?.replaceChildren(...CATEGORIES.map((c) => {
    const p = PROVIDERS.filter((x) => x.category === c.id).sort((a, b) => b.rating - a.rating)[0], r = p?.sampleReviews?.[0]; if (!r) return null;
    return h('figure', { class: 'card rev', 'data-reveal': '', 'data-tilt': '4', style: 'margin:0' },
      h('div', { class: 'stars', role: 'img', 'aria-label': `${r.stars} out of 5 stars` }, Array.from({ length: r.stars }, () => icon('star'))),
      h('blockquote', {}, `“${r.text}”`),
      h('figcaption', { class: 'small muted' }, `${r.by} on ${p.name} (${catLabel(p.category)}) `, h('span', { class: 'demo-tag' }, 'Demo review')));
  }).filter(Boolean));
  const dlg = $('#cat-dialog');
  $('#cd-close')?.addEventListener('click', () => closeDialog(dlg)); $('#cd-close2')?.addEventListener('click', () => closeDialog(dlg));
}

renderShell();
if ($('#home-search')) initHome();
refreshIcons();
initFx(); refreshIcons();

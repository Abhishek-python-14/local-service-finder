// Admin dashboard. Real data comes from the Node backend (ADMIN_KEY protected) or, in "local demo mode", from this browser's saved enquiries.
// The "Sample data" switch fills the dashboard with clearly labelled fictional records in memory only. Nothing sample is ever saved or sent.
import { PROVIDERS, CATEGORIES, LOCALITIES } from './data.js';
import { validateEnquiry, cleanEnquiry } from './validate.js';
import { $, $$, h, icon, refreshIcons, renderShell, money, avatar, toast, openDialog, closeDialog, tilt } from './app.js';
import { countUp } from './fx.js';
import { donut, bars, hbars } from './charts.js';
renderShell();

/* ---------- constants and small helpers ---------- */
const STATUS = [['saved-not-sent', 'New'], ['contacted', 'Contacted'], ['confirmed', 'Confirmed'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
const LOCAL = { saved: 'New', 'whatsapp-opened': 'WhatsApp opened' };
const norm = (s) => (s === 'saved' ? 'saved-not-sent' : s);
const label = (s) => STATUS.find((x) => x[0] === norm(s))?.[1] ?? LOCAL[s] ?? s;
const PL = () => (sampleOn ? S.providers : PROVIDERS), CL = () => (sampleOn ? S.categories : CATEGORIES);
const prov = (id) => PL().find((p) => p.id === id);
const provName = (id) => prov(id)?.name ?? 'Unknown provider';
const provCat = (id) => prov(id)?.category;
const catName = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
const fmt = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '');
const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));
const store = { get: () => { try { return sessionStorage.getItem('lsf_admin') || ''; } catch { return ''; } }, set: (v) => { try { v ? sessionStorage.setItem('lsf_admin', v) : sessionStorage.removeItem('lsf_admin'); } catch { /* storage blocked */ } } };
const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);
let override = null; try { override = localStorage.getItem('lsf_api'); } catch { /* ignore */ }
const API = override || (location.port === '3000' ? '/api' : isLocal ? 'http://localhost:3000/api' : null);

/* ---------- state ---------- */
let key = store.get(), realMode = 'server', sampleOn = false, current = 'overview';
const R = { list: [], users: [], usersErr: '' }, S = { list: [], users: [], providers: [], categories: [], made: false };
const D = () => (sampleOn ? S : R);
const mem = () => sampleOn || realMode === 'local'; // operations that stay in this browser
const kpiPrev = {};

/* ---------- storage-backed layers (local demo + sample) ---------- */
const LKEY = 'lsf_enquiries', UKEY = 'lsf_users';
const readLS = () => { try { const d = JSON.parse(localStorage.getItem(LKEY) || '[]'); return Array.isArray(d) ? d.filter((r) => r && typeof r.ref === 'string') : []; } catch { return []; } };
const writeLS = (l) => { try { localStorage.setItem(LKEY, JSON.stringify(l)); return true; } catch { return false; } };
const readAll = () => (sampleOn ? S.list : readLS());
const writeAll = (l) => { if (sampleOn) { S.list = l; return true; } return writeLS(l); };
const syncList = () => { if (mem()) D().list = readAll(); };
const FIELDS = ['providerId', 'name', 'phone', 'description', 'locality', 'when'];
const IST = 5.5 * 36e5;
const checkFields = (v) => { const w = Date.parse(v.when); return validateEnquiry({ ...v, consent: true }, PROVIDERS, new Date(Math.min(Date.now(), (Number.isNaN(w) ? Date.now() : w) - 36e5))); };

async function api(path, opts = {}) {
  if (!API) return { status: 0 };
  try {
    const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch { return { status: 0 }; }
}
async function createEnq(v) {
  if (!mem()) return api('/enquiries', { method: 'POST', body: JSON.stringify(v) });
  const errs = validateEnquiry({ ...v, consent: true }, PROVIDERS);
  if (Object.keys(errs).length) return { status: 400, body: { errors: errs } };
  const b = crypto.getRandomValues(new Uint8Array(4));
  const rec = { ...cleanEnquiry({ ...v, consent: true }), ref: (sampleOn ? 'SMP-' : 'LSF-') + [...b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase(), createdAt: new Date().toISOString(),
    status: v.status || 'saved-not-sent', adminNote: String(v.note ?? '').trim().slice(0, 300), mode: 'local', source: 'admin' };
  return writeAll([rec, ...readAll()]) ? { status: 201, body: { enquiry: rec } } : { status: 500, body: { error: 'Browser storage is blocked.' } };
}
async function patchEnq(ref, body) {
  if (!mem()) return api('/enquiries/' + encodeURIComponent(ref), { method: 'PATCH', body: JSON.stringify(body) });
  const l = readAll(), i = l.findIndex((r) => r.ref === ref);
  if (i < 0) return { status: 404, body: { error: 'Enquiry not found in this browser.' } };
  const edit = FIELDS.filter((k) => body[k] !== undefined);
  if (edit.length) {
    const merged = { ...l[i] }; edit.forEach((k) => { merged[k] = body[k]; });
    const errs = checkFields(merged);
    if (Object.keys(errs).length) return { status: 400, body: { errors: errs } };
    const c = cleanEnquiry({ ...merged, consent: true }); edit.forEach((k) => { l[i][k] = c[k]; });
  }
  if (body.status !== undefined) l[i].status = body.status;
  if (body.note !== undefined) l[i].adminNote = String(body.note).trim().slice(0, 300);
  return writeAll(l) ? { status: 200, body: { enquiry: l[i] } } : { status: 500, body: { error: 'Browser storage is blocked.' } };
}
async function delEnq(ref) {
  if (!mem()) return api('/enquiries/' + encodeURIComponent(ref), { method: 'DELETE' });
  return writeAll(readAll().filter((r) => r.ref !== ref)) ? { status: 200, body: {} } : { status: 500, body: { error: 'Browser storage is blocked.' } };
}
async function loadUsers() {
  if (sampleOn) return render();
  if (realMode === 'local') {
    let u = []; try { u = JSON.parse(localStorage.getItem(UKEY) || '[]'); } catch { /* ignore */ }
    R.users = u.map((x) => ({ id: x.phone, name: x.name, phone: x.phone, createdAt: '' })); R.usersErr = '';
  } else {
    const r = await api('/admin/users');
    if (r.status === 200) { R.users = r.body.users ?? []; R.usersErr = ''; }
    else { R.users = []; R.usersErr = r.status === 404 ? 'Restart the server to enable customer management (this endpoint is new in this version).' : r.status === 0 ? 'The server is not reachable.' : 'Customers could not be loaded.'; }
  }
  render();
}
async function delUser(u) {
  if (sampleOn) { S.users = S.users.filter((x) => x.id !== u.id); return { status: 200 }; }
  if (realMode === 'local') { try { localStorage.setItem(UKEY, JSON.stringify(JSON.parse(localStorage.getItem(UKEY) || '[]').filter((x) => x.phone !== u.phone))); return { status: 200 }; } catch { return { status: 500, body: { error: 'Browser storage is blocked.' } }; } }
  return api('/admin/users/' + encodeURIComponent(u.id), { method: 'DELETE' });
}

/* ---------- sample data (fictional, in memory only) ---------- */
function makeSample() {
  let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff, pick = (a) => a[Math.floor(rnd() * a.length)], hex = () => Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0').toUpperCase();
  const names = ['Aarav Mehta', 'Diya Sharma', 'Rohan Verma', 'Ishita Singh', 'Kabir Malhotra', 'Ananya Gupta', 'Vivaan Joshi', 'Meera Nair', 'Arjun Rao', 'Sana Khan', 'Yash Patel', 'Tara Bose'];
  const jobs = { electrician: ['Replace a faulty switchboard', 'Fit two ceiling fans in the hall'], plumber: ['Fix a leaking kitchen tap', 'Fit a new geyser in the bathroom'], tutor: ['Maths tuition for class 9, three days a week', 'Spoken English practice, evenings'], repair: ['AC not cooling, needs servicing', 'Washing machine drum not spinning'] };
  const sts = ['saved-not-sent', 'saved-not-sent', 'contacted', 'confirmed', 'confirmed', 'completed', 'completed', 'completed', 'cancelled'];
  S.list = Array.from({ length: 30 }, () => {
    const p = pick(PROVIDERS), created = Date.now() - rnd() * 6.9 * 864e5;
    return { ref: 'SMP-' + hex(), providerId: p.id, name: pick(names), phone: '90001' + String(10000 + Math.floor(rnd() * 89999)), description: pick(jobs[p.category]), locality: pick(LOCALITIES),
      when: new Date(created + (1 + rnd() * 6) * 864e5).toISOString(), status: pick(sts), createdAt: new Date(created).toISOString(), adminNote: '', mode: 'sample' };
  }).sort(byNewest);
  S.users = names.slice(0, 9).map((n, i) => ({ id: 'smp' + i, name: n, phone: '90002' + String(10000 + i * 3711), createdAt: new Date(Date.now() - (i + 1) * 2.3 * 864e5).toISOString() }));
  S.providers = PROVIDERS.map((x) => ({ ...x })); S.categories = CATEGORIES.map((x) => ({ ...x }));
  S.made = true;
}

/* ---------- generic table with sorting + pagination (rows become labelled cards on phones) ---------- */
function dataTable({ cols, rows, st, size = 8, empty }) {
  if (!rows.length) return empty;
  const list = [...rows], sc = cols.find((c) => c.key === st.sort?.key);
  if (sc) { const d = st.sort.dir === 'asc' ? 1 : -1; list.sort((a, b) => { const x = sc.val(a), y = sc.val(b); return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * d; }); }
  const pages = Math.max(1, Math.ceil(list.length / size)); st.page = Math.min(Math.max(1, st.page || 1), pages);
  const from = (st.page - 1) * size, slice = list.slice(from, from + size);
  const head = cols.map((c) => h('th', { scope: 'col', 'aria-sort': c === sc ? (st.sort.dir === 'asc' ? 'ascending' : 'descending') : null },
    c.sort ? h('button', { type: 'button', onclick: () => { st.sort = { key: c.key, dir: st.sort?.key === c.key && st.sort.dir === 'desc' ? 'asc' : 'desc' }; st.page = 1; st.redraw(); } }, c.label, icon(c === sc ? (st.sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down')) : c.label));
  const body = slice.map((r) => h('tr', {}, cols.map((c) => h('td', { 'data-label': c.label, class: c.cls }, c.render(r)))));
  const go = (n) => { st.page = n; st.redraw(); };
  return h('div', {},
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, head)), h('tbody', {}, body))),
    h('div', { class: 'pager' }, h('span', { role: 'status' }, `Showing ${from + 1}–${from + slice.length} of ${list.length}`),
      pages > 1 && h('div', { class: 'actions-row', style: 'margin:0' },
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: st.page === 1, 'aria-label': 'Previous page', onclick: () => go(st.page - 1) }, icon('chevron-left'), 'Prev'),
        h('span', { style: 'align-self:center' }, `Page ${st.page} of ${pages}`),
        h('button', { class: 'btn btn-ghost', type: 'button', disabled: st.page === pages, 'aria-label': 'Next page', onclick: () => go(st.page + 1) }, 'Next', icon('chevron-right')))));
}
const emptyState = (ic, title, text, action) => h('div', { class: 'state' }, icon(ic), h('h2', {}, title), h('p', { class: 'muted' }, text), action);
const skeleton = () => h('div', { class: 'tbl-skel', 'aria-hidden': 'true' }, [1, 2, 3, 4].map(() => h('div', { class: 'sk' })));
const draw = (target, node) => { target.replaceChildren(node); refreshIcons(); };

/* ---------- dialogs: details view and confirmation ---------- */
const vw = $('#view-dialog'), cfd = $('#confirm-dialog');
function openView(title, ...nodes) { $('#vw-title').textContent = title; $('#vw-body').replaceChildren(...nodes); openDialog(vw); refreshIcons(); }
$('#vw-x').addEventListener('click', () => closeDialog(vw));
function confirmBox({ title, message, yes = 'Delete' }) {
  return new Promise((resolve) => {
    $('#cf-title').textContent = title; $('#cf-msg').textContent = message; $('#cf-yes').textContent = yes;
    let done = false;
    const fin = (v) => { if (done) return; done = true; $('#cf-yes').removeEventListener('click', ok); $('#cf-no').removeEventListener('click', no); cfd.removeEventListener('close', no); closeDialog(cfd); resolve(v); };
    const ok = () => fin(true), no = () => fin(false);
    $('#cf-yes').addEventListener('click', ok); $('#cf-no').addEventListener('click', no); cfd.addEventListener('close', no);
    openDialog(cfd); $('#cf-no').focus();
  });
}
const dl = (pairs) => h('dl', { class: 'review-list' }, pairs.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

/* ---------- enquiries ---------- */
const stEnq = { sort: { key: 'created', dir: 'desc' }, page: 1, redraw: () => renderEnq() };
const stRecent = { page: 1, redraw: () => renderOverview() };
function statusSelect(r) {
  const opts = [...(STATUS.some((s) => s[0] === norm(r.status)) ? [] : [[r.status, label(r.status)]]), ...STATUS];
  const sel = h('select', { class: 'st-sel s-' + norm(r.status), 'aria-label': `Status for ${r.ref}` }, opts.map(([v, t]) => h('option', { value: v, selected: v === norm(r.status) }, t)));
  sel.addEventListener('change', async () => {
    const prev = norm(r.status); sel.disabled = true;
    const x = await patchEnq(r.ref, { status: sel.value }); sel.disabled = false;
    if (x.status === 200) { Object.assign(r, x.body.enquiry); syncList(); toast(`${r.ref} is now ${label(sel.value)}.`, 'success'); render(); }
    else { sel.value = prev; toast(x.status === 0 ? 'Server not reachable.' : (x.body?.error || 'Could not update the status.'), 'error'); }
  });
  return sel;
}
const pill = (r) => h('span', { class: 'pill s-' + norm(r.status) }, label(r.status));
const ib = (ic, text, fn, cls = '') => h('button', { class: 'ib ' + cls, type: 'button', 'aria-label': text, title: text, onclick: fn }, icon(ic));
const enqCols = (full) => [
  { key: 'ref', label: 'Reference', sort: true, val: (r) => r.ref, render: (r) => h('span', { class: 'ref-sm' }, r.ref) },
  { key: 'cust', label: 'Customer', sort: true, val: (r) => r.name, render: (r) => h('span', { class: 'cell-main' }, h('b', {}, r.name), h('small', {}, r.phone)) },
  { key: 'prov', label: 'Provider', sort: true, val: (r) => provName(r.providerId), render: (r) => provName(r.providerId) },
  { key: 'when', label: 'Wanted for', sort: true, val: (r) => Date.parse(r.when) || 0, render: (r) => fmt(r.when) },
  { key: 'status', label: 'Status', sort: true, val: (r) => label(r.status), render: (r) => (full ? statusSelect(r) : pill(r)) },
  { key: 'created', label: 'Saved', sort: true, val: (r) => Date.parse(r.createdAt) || 0, render: (r) => fmt(r.createdAt) },
  { key: 'act', label: 'Actions', cls: 'c-act', render: (r) => h('div', { class: 'row-acts' }, ib('eye', `View ${r.ref}`, () => showEnquiry(r)), full && ib('pencil', `Edit ${r.ref}`, () => openForm(r)), full && ib('trash-2', `Delete ${r.ref}`, () => removeEnquiry(r), 'del')) },
];
function renderEnq() {
  const L = D().list, q = $('#f-q').value.trim().toLowerCase(), st = $('#f-status').value, pv = $('#f-prov').value;
  const rows = L.filter((r) => (!st || norm(r.status) === st) && (!pv || r.providerId === pv) && (!q || [r.ref, r.name, r.phone, r.description, r.locality, provName(r.providerId)].join(' ').toLowerCase().includes(q)));
  $('#adm-count').textContent = `${rows.length} of ${L.length} enquir${L.length === 1 ? 'y' : 'ies'}`;
  draw($('#t-enq'), dataTable({ cols: enqCols(true), rows, st: stEnq, empty: emptyState('inbox', L.length ? 'No enquiries match' : 'No enquiries yet', L.length ? 'Clear the search or filters.' : 'Enquiries saved through the website will appear here. You can also add one, or turn on Sample data to preview the dashboard.', L.length ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: resetEnqFilters }, 'Reset filters') : null) }));
}
function resetEnqFilters() { $('#f-q').value = ''; $('#f-status').value = ''; $('#f-prov').value = ''; stEnq.page = 1; renderEnq(); }
function showEnquiry(r) {
  const note = h('textarea', { rows: 2, maxlength: 300, 'aria-label': `Private note for ${r.ref}`, placeholder: 'Private note (only you see this)' }); note.value = r.adminNote ?? '';
  const hi = encodeURIComponent(`Hi ${r.name}, this is about your enquiry ${r.ref} on Service Local Finder.`);
  const real = !sampleOn && !String(r.ref).startsWith('SMP-');
  openView(r.ref, h('div', { class: 'adm-top' }, pill(r), h('span', { class: 'small muted' }, `Saved ${fmt(r.createdAt)} IST`)),
    dl([['Provider', provName(r.providerId)], ['Customer', `${r.name} · ${r.phone}`], ['Job', r.description], ['Address', r.locality], ['Wanted for', `${fmt(r.when)} IST`]]),
    h('div', { class: 'field' }, h('label', {}, 'Private note'), note),
    h('div', { class: 'actions-row', style: 'margin:0' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { const x = await patchEnq(r.ref, { note: note.value }); if (x.status === 200) { Object.assign(r, x.body.enquiry); syncList(); toast('Note saved.', 'success'); } else toast(x.body?.error || 'Could not save the note.', 'error'); } }, icon('save'), 'Save note'),
      real && h('a', { class: 'btn btn-wa', href: `https://wa.me/91${r.phone}?text=${hi}`, target: '_blank', rel: 'noopener noreferrer' }, icon('message-circle'), 'WhatsApp'),
      real && h('a', { class: 'btn btn-ghost', href: `tel:+91${r.phone}` }, icon('phone'), 'Call'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { closeDialog(vw); setTimeout(() => openForm(r), 230); } }, icon('pencil'), 'Edit'),
      h('button', { class: 'btn btn-ghost danger', type: 'button', onclick: () => { closeDialog(vw); setTimeout(() => removeEnquiry(r), 230); } }, icon('trash-2'), 'Delete')));
}
async function removeEnquiry(r) {
  if (!await confirmBox({ title: `Delete ${r.ref}?`, message: `The enquiry from ${r.name} will be removed. This cannot be undone.` })) return;
  const x = await delEnq(r.ref);
  if (x.status === 200) { D().list = D().list.filter((e) => e.ref !== r.ref); syncList(); toast(`Deleted ${r.ref}.`, 'success'); render(); }
  else toast(x.status === 0 ? 'Server not reachable.' : (x.body?.error || 'Could not delete.'), 'error');
}

/* add / edit dialog */
const dlg = $('#adm-dialog'), fm = $('#adm-form'); let editing = null;
function openForm(r) {
  editing = r || null;
  $('#fm-title').textContent = r ? `Edit ${r.ref}` : 'Add enquiry'; $('#fm-err').hidden = true;
  $('#fm-provider').value = r?.providerId ?? ''; $('#fm-name').value = r?.name ?? ''; $('#fm-phone').value = r?.phone ?? '';
  $('#fm-desc').value = r?.description ?? ''; $('#fm-loc').value = r?.locality ?? ''; $('#fm-note').value = r?.adminNote ?? '';
  $('#fm-status').value = STATUS.some((s) => s[0] === norm(r?.status)) ? norm(r.status) : 'saved-not-sent';
  $('#fm-when').value = r?.when ? new Date(Date.parse(r.when) + IST).toISOString().slice(0, 16) : '';
  openDialog(dlg); $('#fm-provider').focus();
}
$('#add').addEventListener('click', () => openForm(null));
$('#fm-cancel').addEventListener('click', () => closeDialog(dlg)); $('#fm-x').addEventListener('click', () => closeDialog(dlg));
fm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#fm-save'), w = $('#fm-when').value;
  const v = { providerId: $('#fm-provider').value, name: $('#fm-name').value, phone: $('#fm-phone').value, description: $('#fm-desc').value, locality: $('#fm-loc').value,
    when: w ? new Date(w + ':00+05:30').toISOString() : '', status: $('#fm-status').value, note: $('#fm-note').value };
  btn.disabled = true;
  const x = editing ? await patchEnq(editing.ref, v) : await createEnq(v);
  btn.disabled = false;
  if (x.status === 200 || x.status === 201) {
    if (editing) Object.assign(editing, x.body.enquiry); else if (!mem()) D().list.unshift(x.body.enquiry);
    syncList(); closeDialog(dlg); toast(editing ? 'Enquiry updated.' : 'Enquiry added.', 'success'); render(); return;
  }
  const msgs = x.body?.errors ? Object.values(x.body.errors) : [x.status === 0 ? 'Server not reachable.' : (x.body?.error || 'Could not save.')];
  const n = $('#fm-err'); n.replaceChildren(...msgs.map((m) => h('div', {}, m))); n.hidden = false;
});

/* CSV export (cells starting with = + - @ are prefixed so spreadsheets never run them as formulas) */
const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
$('#export').addEventListener('click', () => {
  const L = D().list; if (!L.length) return toast('There are no enquiries to export.', 'info');
  const cols = ['ref', 'createdAt', 'status', 'provider', 'name', 'phone', 'locality', 'when', 'description', 'adminNote'];
  const rows = L.map((r) => [r.ref, r.createdAt, label(r.status), provName(r.providerId), r.name, r.phone, r.locality, r.when, r.description, r.adminNote]);
  const csv = '\ufeff' + [cols, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `${sampleOn ? 'SAMPLE-' : ''}enquiries-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${L.length} enquir${L.length === 1 ? 'y' : 'ies'}${sampleOn ? ' (sample data)' : ''}.`, 'success');
});
$('#refresh').addEventListener('click', async () => { draw($('#t-enq'), skeleton()); await load(false); await loadUsers(); toast('Data refreshed.', 'info'); });
$('#adm-filters').addEventListener('input', () => { stEnq.page = 1; renderEnq(); });
$('#adm-filters').addEventListener('submit', (e) => e.preventDefault());
$('#f-reset').addEventListener('click', resetEnqFilters);

/* ---------- overview: KPIs, charts, recent ---------- */
function renderOverview() {
  const L = D().list, n = (s) => L.filter((r) => norm(r.status) === s).length;
  const custN = D().users.length, custOk = sampleOn || !R.usersErr;
  const items = [['Total enquiries', L.length, 'calendar-check', ''], ...STATUS.map(([v, t], i) => [t, n(v), ['sparkles', 'phone-call', 'badge-check', 'circle-check-big', 'circle-x'][i], v]),
    ['Providers listed', PROVIDERS.length, 'hard-hat', 'p'], ['Customers', custOk ? custN : null, 'users', 'u']];
  $('#kpis').replaceChildren(...items.map(([t, v, ic, tag], i) => {
    const num = h('b', {}, v == null ? '–' : '0');
    if (v != null) { if (kpiPrev[t] === v) num.textContent = v.toLocaleString('en-IN'); else countUp(num, v); kpiPrev[t] = v; }
    const go2 = () => { if (STATUS.some((s) => s[0] === tag)) { resetEnqFilters(); $('#f-status').value = tag; renderEnq(); go('enquiries'); } else go(tag === 'p' ? 'providers' : tag === 'u' ? 'users' : 'enquiries'); };
    return h('button', { class: 'kpi', type: 'button', 'data-tilt': '8', 'aria-label': `${t}: ${v ?? 'unavailable'}. Open details`, onclick: go2, style: `animation-delay:${i * 40}ms` }, h('span', { class: 'k-ico' }, icon(ic)), num, h('span', {}, t));
  }));
  tilt($('#kpis'));
  const none = h('div', { class: 'empty-chart' }, 'No enquiries yet. Turn on Sample data to preview this chart.');
  const total = L.length;
  // by category
  const cat = CATEGORIES.map((c) => ({ label: c.label, value: L.filter((r) => provCat(r.providerId) === c.id).length }));
  if (total) $('#ch-cat').innerHTML = donut(cat, 'Enquiries by category') || ''; else $('#ch-cat').replaceChildren(none.cloneNode(true));
  // last 7 days
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5); return { key: d.toLocaleDateString('en-CA'), label: d.toLocaleDateString('en-IN', { weekday: 'short' }), value: 0 }; });
  L.forEach((r) => { const d = days.find((x) => x.key === new Date(r.createdAt).toLocaleDateString('en-CA')); if (d) d.value++; });
  if (days.some((d) => d.value)) $('#ch-days').innerHTML = bars(days, 'Enquiries per day, last 7 days'); else $('#ch-days').replaceChildren(none.cloneNode(true));
  // provider performance
  const per = PROVIDERS.map((p) => ({ label: p.name, value: L.filter((r) => r.providerId === p.id).length, sub: `${catName(p.category)} · rating ${p.rating.toFixed(1)} (sample)` })).filter((x) => x.value).sort((a, b) => b.value - a.value).slice(0, 5);
  if (per.length) $('#ch-prov').innerHTML = hbars(per, 'Enquiries per provider'); else $('#ch-prov').replaceChildren(none.cloneNode(true));
  const rows = [...L].sort(byNewest).slice(0, 5);
  draw($('#t-recent'), dataTable({ cols: enqCols(false).filter((c) => c.key !== 'when').map((c) => ({ ...c, sort: false })), rows, st: stRecent, size: 5, empty: emptyState('inbox', 'No enquiries yet', 'New enquiries appear here as customers send them.') }));
}

/* ---------- providers (read-only: data lives in js/data.js) ---------- */
const stProv = { sort: { key: 'rating', dir: 'desc' }, page: 1, redraw: () => renderProviders() };
function renderProviders() {
  $('#prov-add').hidden = !sampleOn; $('#prov-note').lastChild.textContent = sampleOn ? 'Sample mode: you can add, edit and delete fictional providers here. Changes live in this browser tab only and are lost on refresh.' : 'Providers come from js/data.js (fictional sample data), the same file the website and server use, so they are view-only here. Turn on Sample data to try add, edit and delete.';
  const L = D().list, q = $('#p-q').value.trim().toLowerCase(), c = $('#p-cat').value;
  const rows = PL().filter((p) => (!c || p.category === c) && (!q || [p.name, p.title, p.locality, catName(p.category)].join(' ').toLowerCase().includes(q)));
  const cols = [
    { key: 'name', label: 'Provider', sort: true, val: (p) => p.name, render: (p) => h('span', { class: 'cell-person' }, avatar(p, 38), h('span', { class: 'cell-main' }, h('b', {}, p.name), h('small', {}, p.title))) },
    { key: 'cat', label: 'Category', sort: true, val: (p) => catName(p.category), render: (p) => h('span', { class: 'chip' }, catName(p.category)) },
    { key: 'loc', label: 'Locality', sort: true, val: (p) => p.locality, render: (p) => p.locality },
    { key: 'rating', label: 'Rating (sample)', sort: true, val: (p) => p.rating, render: (p) => `${p.rating.toFixed(1)} ★` },
    { key: 'price', label: 'From', sort: true, val: (p) => p.price, render: (p) => `${money(p.price)} / ${p.unit}` },
    { key: 'enq', label: 'Enquiries', sort: true, val: (p) => L.filter((r) => r.providerId === p.id).length, render: (p) => String(L.filter((r) => r.providerId === p.id).length) },
    { key: 'act', label: 'Actions', cls: 'c-act', render: (p) => h('div', { class: 'row-acts' }, ib('eye', `View ${p.name}`, () => showProvider(p)), sampleOn && ib('pencil', `Edit ${p.name}`, () => editProvider(p)), sampleOn && ib('trash-2', `Delete ${p.name}`, () => removeProvider(p), 'del')) },
  ];
  draw($('#t-prov'), dataTable({ cols, rows, st: stProv, empty: emptyState('search-x', 'No providers match', 'Try a different search or category.', h('button', { class: 'btn btn-ghost', type: 'button', onclick: resetProv }, 'Reset filters')) }));
}
function resetProv() { $('#p-q').value = ''; $('#p-cat').value = ''; stProv.page = 1; renderProviders(); }
function showProvider(p) {
  const count = D().list.filter((r) => r.providerId === p.id).length;
  openView(p.name, h('div', { class: 'vw-head' }, avatar(p, 72), h('div', {}, h('span', { class: 'chip' }, catName(p.category)), h('p', { class: 'muted', style: 'margin:.3rem 0 0' }, p.title))),
    h('p', { style: 'margin:0' }, p.description),
    dl([['Locality', p.locality], ['Experience', `${p.experience} years`], ['Rating (sample)', `${p.rating.toFixed(1)} from ${p.reviews} sample reviews`], ['Starting price', `${money(p.price)} per ${p.unit}`], ['Hours (IST)', p.availability], ['Languages', p.languages.join(', ')], ['Enquiries here', String(count)]]),
    h('div', { class: 'actions-row', style: 'margin:0' }, h('a', { class: 'btn btn-primary', href: `provider.html?id=${encodeURIComponent(p.id)}` }, icon('external-link'), 'Open public profile')));
}
$('#prov-filters').addEventListener('input', () => { stProv.page = 1; renderProviders(); }); $('#prov-filters').addEventListener('submit', (e) => e.preventDefault()); $('#p-reset').addEventListener('click', resetProv);

/* ---------- users ---------- */
const stUsr = { sort: { key: 'joined', dir: 'desc' }, page: 1, redraw: () => renderUsers() };
function renderUsers() {
  const err = !sampleOn && R.usersErr, q = $('#u-q').value.trim().toLowerCase();
  $('#usr-note').lastChild.textContent = sampleOn ? 'Sample customers (fictional). Real accounts are created on the login page; passwords are never shown or sent to this panel.' : 'Customer accounts created on the login page. Passwords are never shown or sent to this panel.';
  if (err) return draw($('#t-usr'), emptyState('server-off', 'Customers unavailable', R.usersErr, h('button', { class: 'btn btn-ghost', type: 'button', onclick: loadUsers }, 'Try again')));
  const L = D().list, rows = D().users.filter((u) => !q || `${u.name} ${u.phone}`.toLowerCase().includes(q));
  const cols = [
    { key: 'name', label: 'Customer', sort: true, val: (u) => u.name, render: (u) => h('span', { class: 'cell-person' }, h('span', { class: 'av', 'aria-hidden': 'true' }, (u.name[0] || '?').toUpperCase()), h('b', {}, u.name)) },
    { key: 'phone', label: 'Mobile', sort: true, val: (u) => u.phone, render: (u) => u.phone },
    { key: 'enq', label: 'Enquiries', sort: true, val: (u) => L.filter((r) => r.phone === u.phone).length, render: (u) => String(L.filter((r) => r.phone === u.phone).length) },
    { key: 'joined', label: 'Joined', sort: true, val: (u) => Date.parse(u.createdAt) || 0, render: (u) => fmt(u.createdAt) || '–' },
    { key: 'act', label: 'Actions', cls: 'c-act', render: (u) => h('div', { class: 'row-acts' }, ib('eye', `View ${u.name}`, () => showUser(u)), ib('trash-2', `Delete ${u.name}`, () => removeUser(u), 'del')) },
  ];
  draw($('#t-usr'), dataTable({ cols, rows, st: stUsr, empty: emptyState('users', D().users.length ? 'No customers match' : 'No customers yet', D().users.length ? 'Clear the search.' : 'Accounts appear here after someone signs up on the login page.') }));
}
function showUser(u) {
  const mine = D().list.filter((r) => r.phone === u.phone);
  openView(u.name, dl([['Mobile', u.phone], ['Joined', fmt(u.createdAt) || 'Unknown'], ['Enquiries sent', String(mine.length)]]),
    mine.length ? h('ul', { class: 'mini-list' }, mine.slice(0, 5).map((r) => h('li', {}, h('span', {}, `${r.ref} · ${provName(r.providerId)}`), pill(r)))) : h('p', { class: 'muted', style: 'margin:0' }, 'No enquiries from this number yet.'));
}
async function removeUser(u) {
  if (!await confirmBox({ title: `Delete ${u.name}?`, message: 'Their account will be removed and they will be signed out. Their enquiries are kept.' })) return;
  const x = await delUser(u);
  if (x.status === 200) { toast(`Deleted ${u.name}.`, 'success'); await loadUsers(); } else toast(x.status === 0 ? 'Server not reachable.' : (x.body?.error || 'Could not delete the customer.'), 'error');
}
$('#usr-filters').addEventListener('input', () => { stUsr.page = 1; renderUsers(); }); $('#usr-filters').addEventListener('submit', (e) => e.preventDefault()); $('#u-reset').addEventListener('click', () => { $('#u-q').value = ''; stUsr.page = 1; renderUsers(); });

/* ---------- categories (read-only) ---------- */
const stCat = { sort: { key: 'enq', dir: 'desc' }, page: 1, redraw: () => renderCategories() };
function renderCategories() {
  $('#cat-add').hidden = !sampleOn; $('#cat-note').lastChild.textContent = sampleOn ? 'Sample mode: add, edit and delete fictional categories. Changes live in this browser tab only.' : 'Categories are defined in js/data.js and shown read-only. Turn on Sample data to try add, edit and delete.';
  const L = D().list;
  const stats = (c) => { const ps = PL().filter((p) => p.category === c.id); return { ps, avg: ps.reduce((t, p) => t + p.rating, 0) / (ps.length || 1), from: Math.min(...ps.map((p) => p.price)), enq: L.filter((r) => provCat(r.providerId) === c.id).length }; };
  const cols = [
    { key: 'name', label: 'Category', sort: true, val: (c) => c.label, render: (c) => h('span', { class: 'cell-person' }, h('span', { class: 'ico', style: 'width:38px;height:38px;margin:0;border-radius:12px' }, icon(c.icon)), h('span', { class: 'cell-main' }, h('b', {}, c.label), h('small', {}, c.blurb))) },
    { key: 'n', label: 'Providers', sort: true, val: (c) => stats(c).ps.length, render: (c) => String(stats(c).ps.length) },
    { key: 'avg', label: 'Avg rating (sample)', sort: true, val: (c) => stats(c).avg, render: (c) => `${stats(c).avg.toFixed(1)} ★` },
    { key: 'from', label: 'Prices from', sort: true, val: (c) => stats(c).from, render: (c) => money(stats(c).from) },
    { key: 'enq', label: 'Enquiries', sort: true, val: (c) => stats(c).enq, render: (c) => String(stats(c).enq) },
    { key: 'act', label: 'Actions', cls: 'c-act', render: (c) => h('div', { class: 'row-acts' }, ib('eye', `View ${c.label}`, () => showCategory(c)), sampleOn && ib('pencil', `Edit ${c.label}`, () => editCategory(c)), sampleOn && ib('trash-2', `Delete ${c.label}`, () => removeCategory(c), 'del')) },
  ];
  draw($('#t-cat'), dataTable({ cols, rows: CL(), st: stCat, empty: emptyState('layers', 'No categories', 'Add categories in js/data.js.') }));
}
function showCategory(c) {
  const ps = PL().filter((p) => p.category === c.id).sort((a, b) => b.rating - a.rating);
  openView(c.label, h('p', { class: 'muted', style: 'margin:0' }, c.blurb),
    h('ul', { class: 'mini-list' }, ps.map((p) => h('li', {}, h('a', { href: `provider.html?id=${encodeURIComponent(p.id)}` }, p.name), h('span', { class: 'muted small' }, `${p.locality} · ${p.rating.toFixed(1)} ★ · ${money(p.price)}`)))),
    h('div', { class: 'actions-row', style: 'margin:0' }, h('a', { class: 'btn btn-primary', href: `providers.html?cat=${encodeURIComponent(c.id)}` }, icon('external-link'), 'See on the website')));
}

/* ---------- sample-mode management: add, edit, delete providers and categories (in memory only) ---------- */
const LOCS = LOCALITIES, ICONS = ['zap', 'droplets', 'graduation-cap', 'wrench', 'hammer', 'sparkles', 'wind', 'paintbrush', 'truck', 'scissors'];
function field(id, text, control, hint) { return h('div', { class: 'field' }, h('label', { for: id }, text), control, h('p', { class: 'err', id: id + '-e', role: 'alert' }), hint && h('p', { class: 'small muted' }, hint)); }
function entityForm({ title, fields, onSave }) {
  const err = h('p', { class: 'notice bad', role: 'alert', hidden: true });
  const form = h('form', { class: 'form', novalidate: true, style: 'margin:0' }, fields.map((f) => f.node), err,
    h('div', { class: 'step-nav' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => closeDialog(vw) }, 'Cancel'), h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save')));
  form.addEventListener('submit', (e) => {
    e.preventDefault(); let bad = null;
    fields.forEach((f) => { const m = f.check(); f.node.querySelector('.err').textContent = m || ''; f.input.setAttribute('aria-invalid', m ? 'true' : 'false'); if (m && !bad) bad = f.input; });
    if (bad) { err.textContent = 'Fix the highlighted fields and try again.'; err.hidden = false; bad.focus(); return; }
    onSave(); closeDialog(vw);
  });
  openView(title, form); fields[0].input.focus();
}
const fld = (id, label, input, check, hint) => ({ input, check, node: field(id, label, input, hint) });
const txt = (id, v, max = 80) => h('input', { id, value: v ?? '', maxlength: max, autocomplete: 'off', required: true });
const sel = (id, opts, v) => h('select', { id, required: true }, h('option', { value: '' }, 'Select'), opts.map(([val, text]) => h('option', { value: val, selected: val === v }, text)));
const need = (i, name) => () => (i.value.trim() ? '' : `Enter ${name}.`);

function editProvider(p) {
  const adding = !p;
  const name = txt('ep-name', p?.name), title = txt('ep-title', p?.title, 100), cat = sel('ep-cat', CL().map((c) => [c.id, c.label]), p?.category), loc = sel('ep-loc', LOCS.map((l) => [l, l]), p?.locality);
  const price = h('input', { id: 'ep-price', type: 'number', min: 50, max: 100000, step: 10, value: p?.price ?? '', required: true }), exp = h('input', { id: 'ep-exp', type: 'number', min: 0, max: 60, value: p?.experience ?? '', required: true });
  entityForm({
    title: adding ? 'Add sample provider' : `Edit ${p.name}`,
    fields: [fld('ep-name', 'Name', name, need(name, 'a name')), fld('ep-title', 'What they do', title, need(title, 'a short title')), fld('ep-cat', 'Category', cat, need(cat, 'a category')), fld('ep-loc', 'Locality', loc, need(loc, 'a locality')),
      fld('ep-price', 'Starting price (₹)', price, () => (Number(price.value) >= 50 && Number(price.value) <= 100000 ? '' : 'Enter a price from 50 to 100000.')), fld('ep-exp', 'Years of experience', exp, () => (exp.value !== '' && Number(exp.value) >= 0 && Number(exp.value) <= 60 ? '' : 'Enter 0 to 60 years.'))],
    onSave() {
      const v = { name: name.value.trim(), title: title.value.trim(), category: cat.value, locality: loc.value, price: Number(price.value), experience: Number(exp.value) };
      if (adding) { const id = 'p' + (Math.max(900, ...S.providers.map((x) => Number(x.id.slice(1)) || 0)) + 1); S.providers.unshift({ id, unit: 'visit', rating: 0, reviews: 0, photo: 1, description: 'Sample provider added in the admin demo.', languages: ['Hindi'], availability: 'Daily, 9 AM – 6 PM', services: [], sampleReviews: [], demo: true, ...v }); }
      else Object.assign(p, v);
      toast(adding ? `Added ${v.name} (sample).` : `Saved changes to ${v.name} (sample).`, 'success'); render();
    },
  });
}
async function removeProvider(p) {
  const n = S.list.filter((r) => r.providerId === p.id).length;
  if (!await confirmBox({ title: `Delete ${p.name}?`, message: n ? `This sample provider has ${n} sample enquir${n === 1 ? 'y' : 'ies'}; they will show as "Unknown provider". Nothing is saved, so refreshing restores everything.` : 'This only changes the sample data in this browser tab.' })) return;
  S.providers = S.providers.filter((x) => x.id !== p.id); toast(`Deleted ${p.name} (sample).`, 'success'); render();
}
function editCategory(c) {
  const adding = !c;
  const label = txt('ec-name', c?.label, 40), blurb = txt('ec-blurb', c?.blurb, 90), ic = sel('ec-icon', ICONS.map((i) => [i, i]), c?.icon);
  entityForm({
    title: adding ? 'Add sample category' : `Edit ${c.label}`,
    fields: [fld('ec-name', 'Category name', label, () => (!label.value.trim() ? 'Enter a name.' : S.categories.some((x) => x !== c && x.label.toLowerCase() === label.value.trim().toLowerCase()) ? 'That name already exists.' : '')), fld('ec-blurb', 'One-line description', blurb, need(blurb, 'a description')), fld('ec-icon', 'Icon', ic, need(ic, 'an icon'))],
    onSave() {
      const v = { label: label.value.trim(), blurb: blurb.value.trim(), icon: ic.value };
      if (adding) S.categories.push({ id: v.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat' + Date.now(), ...v }); else Object.assign(c, v);
      toast(adding ? `Added ${v.label} (sample).` : `Saved changes to ${v.label} (sample).`, 'success'); render();
    },
  });
}
async function removeCategory(c) {
  const n = S.providers.filter((p) => p.category === c.id).length;
  if (n) { toast(`${c.label} still has ${n} provider${n === 1 ? '' : 's'}. Move or delete them first.`, 'error'); return; }
  if (!await confirmBox({ title: `Delete ${c.label}?`, message: 'This only changes the sample data in this browser tab.' })) return;
  S.categories = S.categories.filter((x) => x.id !== c.id); toast(`Deleted ${c.label} (sample).`, 'success'); render();
}
$('#prov-add').addEventListener('click', () => editProvider(null)); $('#cat-add').addEventListener('click', () => editCategory(null));

/* ---------- navigation, counts, notifications ---------- */
const TITLES = { overview: 'Overview', enquiries: 'Enquiries and bookings', providers: 'Service providers', users: 'Customers', categories: 'Service categories' };
function go(name, focus = false) {
  if (!TITLES[name]) name = 'overview';
  current = name;
  $$('[data-panel]').forEach((s) => { s.hidden = s.dataset.panel !== name; });
  $$('#sb-nav button').forEach((b) => { b.dataset.view === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
  $('#view-title').textContent = TITLES[name]; document.title = `${TITLES[name]} | Admin | Service Local Finder`;
  try { history.replaceState(null, '', '#' + name); } catch { /* ignore */ }
  render(); if (focus) $('#view-title').focus();
  if (mq.matches) setNav(false);
}
function render() {
  const L = D().list;
  $('#n-enq').textContent = L.length || ''; $('#n-prov').textContent = PL().length; fillCat(); $('#n-usr').textContent = (sampleOn || !R.usersErr) && D().users.length ? D().users.length : '';
  renderBell();
  ({ overview: renderOverview, enquiries: renderEnq, providers: renderProviders, users: renderUsers, categories: renderCategories })[current]();
}
$$('#sb-nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.view, true)));
$$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go, true)));

const menus = [[$('#bell'), $('#bell-menu')], [$('#profile-btn'), $('#profile-menu')]];
const closeMenus = (except) => menus.forEach(([b, m]) => { if (m !== except) { m.hidden = true; b.setAttribute('aria-expanded', 'false'); } });
menus.forEach(([b, m]) => b.addEventListener('click', (e) => { e.stopPropagation(); const open = m.hidden; closeMenus(m); m.hidden = !open; b.setAttribute('aria-expanded', String(open)); }));
document.addEventListener('click', (e) => { if (!e.target.closest('.dd')) closeMenus(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const open = menus.find(([, m]) => !m.hidden); closeMenus(); open?.[0].focus(); if (mq.matches) setNav(false); } });
function renderBell() {
  const fresh = D().list.filter((r) => norm(r.status) === 'saved-not-sent').sort(byNewest), badge = $('#bell-n');
  badge.hidden = !fresh.length; badge.textContent = fresh.length > 9 ? '9+' : String(fresh.length);
  $('#bell').setAttribute('aria-label', fresh.length ? `Notifications: ${fresh.length} new enquir${fresh.length === 1 ? 'y' : 'ies'}` : 'Notifications: none');
  $('#bell-menu').replaceChildren(h('div', { class: 'm-head' }, fresh.length ? `${fresh.length} new enquir${fresh.length === 1 ? 'y' : 'ies'}` : 'Notifications'),
    ...(fresh.length ? fresh.slice(0, 5).map((r) => h('button', { type: 'button', class: 'm-item', onclick: () => { closeMenus(); showEnquiry(r); } }, h('b', {}, `${r.name} · ${provName(r.providerId)}`), h('small', {}, `${r.ref} · ${fmt(r.createdAt)}`))) : [h('div', { class: 'm-empty' }, 'No new enquiries.')]),
    fresh.length ? h('button', { type: 'button', onclick: () => { closeMenus(); resetEnqFilters(); $('#f-status').value = 'saved-not-sent'; go('enquiries', true); } }, icon('list'), 'View all new enquiries') : null);
  refreshIcons();
}

/* sidebar: collapses on desktop, slides in on mobile */
const shell = $('#admin-view'), sb = $('#sidebar'), mq = matchMedia('(max-width: 900px)');
function setNav(open) {
  const t = $('#sb-toggle');
  if (mq.matches) { shell.classList.toggle('nav-open', open); sb.inert = !open; t.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); }
  else { shell.classList.toggle('collapsed', !open); sb.inert = false; t.setAttribute('aria-label', open ? 'Collapse sidebar' : 'Expand sidebar'); try { localStorage.setItem('lsf_sb', open ? '1' : '0'); } catch { /* ignore */ } }
  t.setAttribute('aria-expanded', String(open));
}
$('#sb-toggle').addEventListener('click', () => setNav(mq.matches ? !shell.classList.contains('nav-open') : shell.classList.contains('collapsed')));
$('#sb-scrim').addEventListener('click', () => setNav(false));
mq.addEventListener('change', () => { shell.classList.remove('nav-open'); setNav(!mq.matches && (() => { try { return localStorage.getItem('lsf_sb') !== '0'; } catch { return true; } })()); });
setNav(!mq.matches && (() => { try { return localStorage.getItem('lsf_sb') !== '0'; } catch { return true; } })());

/* ---------- sample data switch ---------- */
$('#sample-btn').addEventListener('click', () => {
  sampleOn = !sampleOn; if (sampleOn && !S.made) makeSample();
  $('#sample-btn').setAttribute('aria-pressed', String(sampleOn)); $('#sample-banner').hidden = !sampleOn; $('#local-banner').hidden = realMode !== 'local' || sampleOn;
  [stEnq, stProv, stUsr, stCat, stRecent].forEach((s) => { s.page = 1; });
  toast(sampleOn ? 'Showing fictional sample data. Nothing is saved.' : 'Back to your real data.', 'info'); render();
});

/* ---------- sign in / out ---------- */
function loginError(msg) { const n = $('#login-err'); n.textContent = msg || ''; n.hidden = !msg; }
function showAdmin() {
  $('#login-view').hidden = true; $('#admin-view').hidden = false; $('#skip').setAttribute('href', '#main-admin');
  $('#local-banner').hidden = realMode !== 'local' || sampleOn;
  const hash = location.hash.slice(1); go(TITLES[hash] ? hash : current); refreshIcons();
}
async function load(fromLogin) {
  if (realMode === 'local') { R.list = readLS(); showAdmin(); return; }
  const r = await api('/enquiries');
  if (r.status === 200) { R.list = r.body.enquiries ?? []; store.set(key); realMode = 'server'; showAdmin(); return; }
  key = ''; store.set('');
  $('#admin-view').hidden = true; $('#login-view').hidden = false; $('#skip').setAttribute('href', '#main');
  if (!fromLogin) return;
  $('#local-btn').hidden = r.status !== 0;
  loginError(r.status === 0 ? (location.protocol === 'file:' ? 'You opened this file directly. Start the server (npm start or start-windows.bat), then open http://localhost:3000/admin.html in the browser.' : `Cannot reach the server at ${API || 'any address'}. Start it with npm start (or start-windows.bat) and keep that window open, then open http://localhost:3000/admin.html.`)
    : r.status === 429 ? (r.body.error || 'Too many wrong keys. Try again in 10 minutes.')
    : 'Wrong admin key, or ADMIN_KEY is not set on the server.');
}
$('#login').addEventListener('submit', async (e) => {
  e.preventDefault(); loginError(''); key = $('#key').value.trim();
  if (!key) { $('#key').setAttribute('aria-invalid', 'true'); return loginError('Enter the admin key.'); }
  $('#key').removeAttribute('aria-invalid');
  const b = $('#login-btn'); b.disabled = true; b.setAttribute('aria-busy', 'true');
  realMode = 'server'; await load(true); b.disabled = false; b.setAttribute('aria-busy', 'false');
  if (!$('#admin-view').hidden) { toast('Signed in as admin.', 'success'); draw($('#t-usr'), skeleton()); loadUsers(); $('#key').value = ''; }
  else { toast('Could not sign in.', 'error'); $('.auth-card').classList.remove('shake'); void $('.auth-card').offsetWidth; $('.auth-card').classList.add('shake'); }
});
$('#key-toggle').addEventListener('click', (e) => {
  const show = $('#key').type === 'password'; $('#key').type = show ? 'text' : 'password';
  const b = e.currentTarget; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide admin key' : 'Show admin key'); b.innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}" aria-hidden="true"></i>`; refreshIcons();
});
$('#local-btn').addEventListener('click', () => { realMode = 'local'; R.list = readLS(); showAdmin(); loadUsers(); toast('Local demo mode: only this browser’s enquiries are shown.', 'info'); });
$$('.js-logout').forEach((b) => b.addEventListener('click', () => {
  key = ''; store.set(''); R.list = []; R.users = []; sampleOn = false; realMode = 'server'; closeMenus();
  $('#sample-btn').setAttribute('aria-pressed', 'false'); $('#sample-banner').hidden = true;
  $('#local-btn').hidden = true; $('#key').value = ''; $('#admin-view').hidden = true; $('#login-view').hidden = false; $('#skip').setAttribute('href', '#main');
  history.replaceState(null, '', location.pathname); document.title = 'Admin | Service Local Finder'; toast('Signed out.', 'info');
}));

/* ---------- init ---------- */
$('#f-status').append(...STATUS.map(([v, t]) => h('option', { value: v }, t)));
$('#f-prov').append(...PROVIDERS.map((p) => h('option', { value: p.id }, p.name)));
const fillCat = () => { const v = $('#p-cat').value; $('#p-cat').replaceChildren(h('option', { value: '' }, 'All'), ...CL().map((c) => h('option', { value: c.id }, c.label))); $('#p-cat').value = CL().some((c) => c.id === v) ? v : ''; };
fillCat();
$('#fm-provider').append(...PROVIDERS.map((p) => h('option', { value: p.id }, p.name)));
$('#fm-status').append(...STATUS.map(([v, t]) => h('option', { value: v }, t)));
if (key) load(false).then(() => { if (!$('#admin-view').hidden) loadUsers(); });
refreshIcons();

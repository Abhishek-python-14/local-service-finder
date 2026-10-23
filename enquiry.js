import { $, h, icon, waLink, isLive, markWhatsapp, refreshIcons, renderShell, getProviders, saveEnquiry, readLocalEnquiries, catLabel, params, avatar, openChip, money } from './app.js';
import { validateEnquiry } from './validate.js';

renderShell();

/* ---------- State ---------- */
const IST = 5.5 * 36e5;                       // all slots are in India time
const STEPS = ['Job', 'Time', 'Details', 'Review'];
const STEP_FIELDS = { 1: ['providerId', 'service'], 2: ['when'], 3: ['name', 'phone', 'locality', 'description', 'consent'], 4: [] };
const INPUT = { providerId: '#provider', name: '#name', phone: '#phone', description: '#notes', locality: '#locality', consent: '#consent' };
let providers = [], step = 1, busy = false;
const sel = { service: null, dayKey: null, ts: null };   // chosen job, day (UTC-midnight ms of the IST date) and slot start (epoch ms)

const provider = () => providers.find((p) => p.id === $('#provider').value) ?? null;
const servicesOf = (p) => (p.services?.length ? p.services : [{ name: 'General visit', price: p.price }]);
const fmtDay = (key) => new Date(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const fmtFull = (ts) => new Date(ts).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';

/* ---------- Slot maths (matches validate.js inSlot) ---------- */
function workingDays(p) { // next 14 days (IST) on which the provider works
  const n = new Date(Date.now() + IST), out = [];
  for (let i = 0; i < 14; i++) {
    const d = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + i);
    if (p.slot.days.includes(new Date(d).getUTCDay())) out.push(d);
  }
  return out;
}
const slotsOn = (p, dayKey) => {
  const out = [];
  for (let hr = p.slot.from; hr < p.slot.to; hr++) { const ts = dayKey + hr * 36e5 - IST; out.push({ ts, free: ts > Date.now() + 30 * 6e4 }); }
  return out;
};

/* ---------- Values and errors ---------- */
function values() {
  const notes = $('#notes').value.trim();
  return {
    providerId: $('#provider').value, name: $('#name').value, phone: $('#phone').value,
    description: sel.service ? `Service: ${sel.service.name}.${notes ? ' Notes: ' + notes : ''}` : '',
    locality: $('#locality').value, when: sel.ts ? new Date(sel.ts).toISOString() : '', consent: $('#consent').checked,
  };
}
function setErr(field, msg) {
  const n = $('#e-' + (field === 'service' ? 'service' : field)); if (n) n.textContent = msg || '';
  const i = INPUT[field] && $(INPUT[field]); if (i) i.setAttribute('aria-invalid', String(Boolean(msg)));
}
function showErrors(errs, only) {
  const fields = ['providerId', 'service', 'when', 'name', 'phone', 'locality', 'description', 'consent'];
  fields.forEach((f) => { if (!only || only.includes(f)) setErr(f, errs[f]); });
  const bad = (only ?? fields).find((f) => errs[f]);
  if (bad && INPUT[bad]) $(INPUT[bad]).focus();
  return Boolean(bad);
}
function errorsFor(v) {
  const e = validateEnquiry(v, providers);
  if (!sel.service) e.service = 'Choose what you need done.';
  if (e.description && sel.service) e.description = 'Keep your notes under 350 characters.';
  else if (!sel.service) delete e.description;
  return e;
}
function formError(msg) { const n = $('#form-error'); n.textContent = msg || ''; n.hidden = !msg; }

/* ---------- Rendering ---------- */
function renderStepper() {
  $('#stepper').replaceChildren(...STEPS.map((t, i) => {
    const n = i + 1, state = n < step ? 'done' : n === step ? 'now' : 'todo';
    return h('li', {}, h('button', { type: 'button', class: 'st ' + state, 'aria-current': n === step ? 'step' : null, 'aria-label': `Step ${n}: ${t}`, onclick: () => jump(n) },
      h('span', { class: 'dot' }, n < step ? icon('check') : String(n)), h('span', { class: 'st-t' }, t)));
  }));
  refreshIcons();
}
// Tap any step to move between steps. Going back is always allowed; going forward needs the steps in between to be valid.
function jump(n) {
  if (n === step) return;
  if (n < step) { go(n); return; }
  for (let s = step; s < n; s++) {
    const errs = errorsFor(values());
    if (STEP_FIELDS[s].some((f) => errs[f])) { if (s !== step) go(s, false); showErrors(errs, STEP_FIELDS[s]); return; }
  }
  go(n);
}
function renderServices() {
  const p = provider(), box = $('#service-box');
  box.hidden = !p; if (!p) return;
  $('#services').replaceChildren(...servicesOf(p).map((s) => {
    const on = sel.service?.name === s.name;
    return h('label', { class: 'opt' + (on ? ' on' : '') },
      h('input', { type: 'radio', name: 'service', value: s.name, checked: on, onchange: () => { sel.service = s; setErr('service', ''); renderServices(); renderSummary(); } }),
      h('span', { class: 'opt-name' }, s.name), h('b', {}, 'from ' + money(s.price)));
  }));
}
function renderDays() {
  const p = provider(); if (!p) return;
  $('#hours-note').textContent = `${p.name} works ${p.availability} (India time). Only these days are shown.`;
  const days = workingDays(p).filter((d) => slotsOn(p, d).some((s) => s.free));
  if (!days.some((d) => d === sel.dayKey)) { sel.dayKey = days[0] ?? null; sel.ts = null; }
  $('#days').replaceChildren(...days.map((d) => h('button', { type: 'button', class: 'pick' + (d === sel.dayKey ? ' on' : ''), 'aria-pressed': String(d === sel.dayKey),
    onclick: () => { sel.dayKey = d; sel.ts = null; renderDays(); renderSummary(); } }, fmtDay(d))));
  renderTimes();
}
function renderTimes() {
  const p = provider(); if (!p || sel.dayKey == null) { $('#times').replaceChildren(h('p', { class: 'muted' }, 'No open slots in the next 14 days.')); return; }
  $('#times').replaceChildren(...slotsOn(p, sel.dayKey).map(({ ts, free }) => h('button', { type: 'button', class: 'pick slot' + (ts === sel.ts ? ' on' : ''), disabled: !free, 'aria-pressed': String(ts === sel.ts),
    onclick: () => { sel.ts = ts; setErr('when', ''); renderTimes(); renderSummary(); } }, fmtTime(ts))));
}
function renderSummary() {
  const p = provider(), box = $('#summary');
  if (!p) { box.replaceChildren(h('h2', { class: 'h-sm' }, 'Your booking'), h('p', { class: 'muted' }, 'Choose a provider to start.')); return; }
  const row = (k, v, ok = true) => h('li', { class: ok ? '' : 'todo' }, h('span', {}, k), h('b', {}, v));
  box.replaceChildren(
    h('div', { class: 'pc-top' }, avatar(p, 56), h('div', {}, h('h2', { class: 'h-sm' }, p.name), h('p', { class: 'muted small' }, `${catLabel(p.category)} · ${p.locality}`))),
    h('div', { class: 'chips' }, openChip(p), h('span', { class: 'chip' }, `★ ${p.rating.toFixed(1)} (${p.reviews})`)),
    h('ul', { class: 'sum-rows' },
      row('Job', sel.service?.name ?? 'Not chosen yet', Boolean(sel.service)),
      row('When', sel.ts ? fmtFull(sel.ts) : 'Not chosen yet', Boolean(sel.ts)),
      row('Starting price', sel.service ? `${money(sel.service.price)} (indicative)` : `${money(p.price)} per ${p.unit}`)),
    h('p', { class: 'small muted' }, 'The provider confirms the final price after seeing the job. No payment is taken here.'));
}
function renderReview() {
  const p = provider(), v = values(), rows = [
    ['Provider', `${p.name} (${catLabel(p.category)})`], ['Job', sel.service.name], ['When', fmtFull(sel.ts)],
    ['Name', v.name.trim()], ['Mobile', v.phone.replace(/\D/g, '').slice(-10)], ['Visit address', v.locality.trim()], ['Notes', $('#notes').value.trim() || 'None'],
    ['Starting price', `${money(sel.service.price)} (indicative)`]];
  $('#review').replaceChildren(...rows.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)]));
}

/* ---------- Step navigation ---------- */
function go(n, focus = true) {
  step = n; formError('');
  $$steps().forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
  $('#back').hidden = n === 1; $('#next').hidden = n === 4; $('#submit').hidden = n !== 4;
  if (n === 2) renderDays();
  if (n === 4) renderReview();
  renderStepper();
  if (focus) { $(`.step[data-step="${n}"] h2`).focus(); scrollTo({ top: 0, behavior: 'smooth' }); }
}
const $$steps = () => [...document.querySelectorAll('.step')];
function next() {
  const errs = errorsFor(values());
  if (showErrors(errs, STEP_FIELDS[step])) return;
  go(step + 1);
}
$('#next').addEventListener('click', next);
$('#back').addEventListener('click', () => go(step - 1));
$('#provider').addEventListener('change', () => { sel.service = null; sel.dayKey = null; sel.ts = null; setErr('providerId', ''); renderServices(); renderSummary(); });

/* ---------- Save ---------- */
$('#enq-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  if (step < 4) { next(); return; }
  formError('');
  const v = values(), errs = errorsFor(v);
  if (Object.keys(errs).length) { // send the person back to the first step that has a problem
    const bad = Object.keys(STEP_FIELDS).find((s) => STEP_FIELDS[s].some((f) => errs[f]));
    go(Number(bad), false); showErrors(errs, STEP_FIELDS[bad]); return;
  }
  busy = true; $('#submit').disabled = true; $('#submit').textContent = 'Saving…';
  try {
    const r = await saveEnquiry(v);
    if (r.errors) { const bad = Object.keys(STEP_FIELDS).find((s) => STEP_FIELDS[s].some((f) => r.errors[f])) ?? 1; go(Number(bad), false); showErrors(r.errors, STEP_FIELDS[bad]); }
    else if (r.error) formError(r.error);
    else showDone(r, v);
  } catch { formError('Something went wrong. Please try again.'); }
  finally { busy = false; $('#submit').disabled = false; $('#submit').textContent = 'Save booking request'; }
});

function showDone(r, v) {
  const p = provider();
  $('#form-view').hidden = true; $('#done-view').hidden = false; $('#ref').textContent = r.ref;
  $('#done-text').textContent = (r.mode === 'server' ? 'Your request is saved on our server.' : 'Your request is saved in this browser only.')
    + ' It has not been sent to the provider, and no booking is confirmed. Next step: send it to the provider yourself using the button below.';
  $('#done-summary').replaceChildren(...[['Provider', p.name], ['Job', sel.service.name], ['When', fmtFull(sel.ts)]].flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)]));
  const msg = `Hi ${p.name}, I'm ${v.name.trim()} (${v.phone.replace(/\D/g, '').slice(-10)}). I'd like to book: ${sel.service.name}. Time: ${fmtFull(sel.ts)}. Address: ${v.locality.trim()}.${$('#notes').value.trim() ? ' Notes: ' + $('#notes').value.trim() + '.' : ''} Ref: ${r.ref}`;
  $('#done-actions').replaceChildren(
    h('a', { class: 'btn btn-wa', href: waLink(p, msg), target: '_blank', rel: 'noopener noreferrer', onclick: () => markWhatsapp(r.ref) }, icon('message-circle'), isLive(p) ? 'Send on WhatsApp' : 'Open WhatsApp with this message'),
    h('a', { class: 'btn btn-primary', href: `track.html?ref=${encodeURIComponent(r.ref)}` }, icon('list-checks'), 'Track this request'));
  if (!isLive(p)) $('#done-actions').append(h('p', { class: 'small muted' }, 'Sample listing: WhatsApp opens without a recipient. Set TEST_PHONE in js/data.js to send to your own number.'));
  refreshIcons(); $('#done-view h2').focus(); renderRecent(); scrollTo({ top: 0 });
}
$('#another').addEventListener('click', () => { location.href = 'enquiry.html'; });

/* ---------- Recent list ---------- */
const nameOf = (id) => providers.find((p) => p.id === id)?.name ?? 'Unknown provider';
function renderRecent() {
  const { list, problem } = readLocalEnquiries(), note = $('#storage-note');
  note.hidden = !problem;
  note.textContent = problem ? 'Browser storage is unavailable or held unreadable data, so earlier requests may not be shown.' : '';
  $('#recent-list').replaceChildren(...(list.length
    ? list.slice(0, 5).map((r) => h('li', {}, h('b', {}, r.ref), ` · ${nameOf(r.providerId)} · ${new Date(r.createdAt).toLocaleDateString('en-IN')}`))
    : [h('li', { class: 'muted' }, 'Nothing saved yet.')]));
}

/* ---------- Init ---------- */
getProviders().then((list) => {
  providers = list;
  $('#provider').replaceChildren(h('option', { value: '' }, 'Select a provider'),
    ...list.map((p) => h('option', { value: p.id }, `${p.name} (${catLabel(p.category)}, ${p.locality})`)));
  const pre = params().get('provider');
  if (pre && list.some((p) => p.id === pre)) $('#provider').value = pre;
  renderServices(); renderSummary(); renderRecent();
});
go(1, false); renderSummary(); refreshIcons();
try { const u = JSON.parse(localStorage.getItem('lsf_user') || 'null'); if (u) { if (!$('#name').value) $('#name').value = u.name; if (!$('#phone').value) $('#phone').value = u.phone; } } catch { /* no saved login */ }

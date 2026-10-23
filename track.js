import { $, h, icon, refreshIcons, renderShell, params, findEnquiry, getProviders, catLabel } from './app.js';
renderShell();
const out = $('#track-out'), input = $('#ref');
const step = (ok, text) => h('li', { class: ok ? 'done-step' : 'todo-step' }, icon(ok ? 'circle-check' : 'circle'), text);
const when = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

async function lookup(raw) {
  const ref = raw.trim().toUpperCase();
  if (!ref) { out.replaceChildren(h('p', { class: 'notice bad' }, 'Enter your enquiry reference first.')); return; }
  out.replaceChildren(h('p', { class: 'muted' }, 'Looking it up…'));
  const r = await findEnquiry(ref);
  if (!r) {
    out.replaceChildren(h('div', { class: 'state' }, h('h2', {}, 'No enquiry found'),
      h('p', { class: 'muted' }, 'Check the reference, which looks like LSF-1A2B3C4D. Enquiries saved in another browser are only found if the server saved them.')));
    return;
  }
  const p = r.providerId ? (await getProviders()).find((x) => x.id === r.providerId) : null;
  out.replaceChildren(h('div', { class: 'card done' }, h('h2', {}, r.ref),
    p && h('p', {}, `${p.name} (${catLabel(p.category)}), ${p.locality}`),
    r.when && h('p', {}, `Preferred time: ${when(r.when)}`),
    h('ol', { class: 'timeline' }, step(true, `Saved on ${when(r.createdAt)}`),
      step(r.status === 'whatsapp-opened', r.waAt ? `Opened in WhatsApp by you on ${when(r.waAt)}` : 'Opened in WhatsApp by you'),
      step(false, 'Provider reply (not tracked here)')),
    h('p', { class: 'small muted' }, 'Nothing here means the provider has seen or accepted the enquiry.')));
  refreshIcons();
}
$('#track-form').addEventListener('submit', (e) => { e.preventDefault(); history.replaceState(null, '', '?ref=' + encodeURIComponent(input.value.trim())); lookup(input.value); });
const initial = params().get('ref'); if (initial) { input.value = initial; lookup(initial); }
refreshIcons();

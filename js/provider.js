import { SERVICE_MENU, SAMPLE_REVIEWS } from './data.js';
import { $, h, icon, contactBtns, openChip, refreshIcons, renderShell, avatar, makeMap, mapsLink, pin, getProvider, params, money, catLabel, tilt } from './app.js';

renderShell();
const root = $('#profile');
const id = params().get('id');

function notFound() {
  document.title = 'Provider not found | Service Local Finder';
  root.replaceChildren(h('div', { class: 'state' }, icon('search-x'), h('h1', {}, 'Provider not found'),
    h('p', { class: 'muted' }, id ? `We could not find a provider with ID “${id}”.` : 'No provider ID was given in the link.'),
    h('a', { class: 'btn btn-primary', href: 'providers.html' }, 'Browse all providers')));
  refreshIcons();
}
const fact = (ic, label, value) => h('div', { class: 'fact' }, icon(ic), h('dt', {}, label), h('dd', {}, value));

function show(p) {
  document.title = `${p.name}, ${catLabel(p.category)} | Service Local Finder`;
  root.replaceChildren(h('div', { class: 'profile' },
    h('div', { class: 'card p-main' },
      h('div', { class: 'p-head' }, avatar(p, 120), h('div', {},
        h('div', { class: 'chips' }, h('span', { class: 'chip' }, catLabel(p.category)), openChip(p)), h('h1', {}, p.name), h('p', { class: 'muted' }, p.title))),
      h('h2', {}, 'About this provider'), h('p', {}, p.description),
      h('h2', { class: 'mt' }, 'Typical jobs and indicative prices'),
      h('ul', { class: 'services' }, (SERVICE_MENU[p.category] ?? []).map(([n, pr]) => h('li', {}, h('span', {}, n), h('b', {}, pr)))),
      h('p', { class: 'small muted' }, 'Indicative estimates. The provider confirms the final price after seeing the job.'),
      h('dl', { class: 'facts' },
        fact('map-pin', 'Service area', `${p.locality}, Greater Noida`),
        fact('briefcase', 'Experience', `${p.experience} years`),
        fact('clock', 'Availability', p.availability || 'Ask the provider'),
        fact('indian-rupee', 'Indicative starting price', `${money(p.price)} per ${p.unit}`),
        fact('star', 'Rating', `${p.rating.toFixed(1)} out of 5 from ${p.reviews} reviews`)),
      h('h2', { class: 'mt' }, 'Sample reviews (fictional)'),
      ...(SAMPLE_REVIEWS[p.category] ?? []).map(([who, txt]) => h('blockquote', { class: 'review' }, h('p', {}, txt), h('footer', {}, who))),
      h('h2', { class: 'mt' }, 'Location'), h('div', { id: 'pmap', class: 'map', role: 'region', 'aria-label': `Map showing ${p.locality}` }),
      h('p', { class: 'small muted' }, 'Approximate location, not an exact address.')),
    h('aside', { class: 'card p-side', 'data-tilt': '' },
      h('p', { class: 'big-price' }, h('b', {}, money(p.price)), ` per ${p.unit}`),
      h('p', { class: 'small muted' }, 'Indicative price. The final amount depends on the work.'),
      h('a', { class: 'btn btn-primary', href: `enquiry.html?provider=${encodeURIComponent(p.id)}` }, icon('calendar-check'), 'Enquire Now'),
      ...contactBtns(p),
      h('a', { class: 'btn btn-ghost', href: mapsLink(p), target: '_blank', rel: 'noopener noreferrer' }, icon('map'), 'Open in Maps'),
      h('p', { class: 'small muted' }, 'Provider details have not been independently verified.'))));
  refreshIcons(); tilt(root);
  const map = makeMap($('#pmap'));
  if (map) { map.setView([p.lat, p.lng], 15); pin([p.lat, p.lng]).addTo(map); }
}
if (!id) notFound(); else getProvider(id).then((p) => (p ? show(p) : notFound())).catch(notFound);

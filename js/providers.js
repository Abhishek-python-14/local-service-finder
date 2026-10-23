import { $, h, icon, refreshIcons, providerCard, tilt, getProviders, params, renderShell, makeMap, pin, haversineKm, money } from './app.js';
import { CATEGORIES, LOCALITIES } from './data.js';
import { matches, matchesLocality, suggestLocality } from './search.js';

const ids = ['q', 'cat', 'loc', 'rating', 'price', 'unit', 'sort'];
const els = Object.fromEntries(ids.map((i) => [i, $('#' + i)]));
const DEFAULTS = { q: '', cat: 'all', loc: '', rating: '0', price: '', unit: 'any', sort: 'rating' };
const catName = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? id;
let all = [], userPos = null; // user location lives only in memory; it is never saved or put in the URL
const map = makeMap($('#map')), layer = map && L.layerGroup().addTo(map);

els.cat.append(...CATEGORIES.map((c) => h('option', { value: c.id }, c.label)));
$('#locality-list').append(...LOCALITIES.map((l) => h('option', { value: l })));

const readControls = () => Object.fromEntries(ids.map((i) => [i, els[i].value]));
function writeControls(s) {
  ids.forEach((i) => { els[i].value = s[i]; });
  if (els.cat.value !== s.cat) els.cat.value = 'all'; // ignore unknown category in URL
}
function syncUrl(s) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) if (v.trim() !== DEFAULTS[k] && v !== 'nearest') p.set(k, v.trim());
  history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
}

const sorters = {
  rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews,
  price: (a, b) => a.price - b.price,
  experience: (a, b) => b.experience - a.experience,
  nearest: (a, b) => a._km - b._km,
};

function unitInfo(s) { // the price limit only compares like with like (per visit vs per hour)
  const unit = s.unit !== 'any' ? s.unit : s.cat === 'tutor' ? 'hour' : s.cat !== 'all' ? 'visit' : 'any';
  const max = s.price === '' || Number.isNaN(Number(s.price)) ? Infinity : Number(s.price);
  return { unit, max, needUnit: max !== Infinity && unit === 'any' };
}
function filterList(s, withLoc = true) {
  const { unit, max, needUnit } = unitInfo(s), min = Number(s.rating) || 0;
  return all.filter((p) => matches(p, s.q) && (s.cat === 'all' || p.category === s.cat) && matchesLocality(p, withLoc ? s.loc : '') &&
    p.rating >= min && (unit === 'any' || p.unit === unit) && (needUnit || p.price <= max))
    .sort(sorters[s.sort === 'nearest' && !userPos ? 'rating' : s.sort] ?? sorters.rating);
}
function renderLocs(s) { // every known area as a one-tap button, with how many providers match in it
  const base = filterList(s, false), cur = s.loc.trim().toLowerCase();
  const mk = (val, n) => { const on = cur === val.toLowerCase(); return h('button', { type: 'button', class: 'pick' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { els.loc.value = val; apply(); } }, `${val || 'All areas'} (${n})`); };
  $('#loc-chips').replaceChildren(mk('', base.length), ...LOCALITIES.map((l) => mk(l, base.filter((p) => p.locality === l).length)));
}
function apply() {
  const s = readControls(); syncUrl(s);
  $('#price-hint').textContent = unitInfo(s).needUnit ? 'Pick a category or price type to apply this limit.' : '';
  renderLocs(s); render(filterList(s), s);
}

function render(list, s = readControls()) {
  const out = $('#results');
  $('#count').textContent = `${list.length} provider${list.length === 1 ? '' : 's'} found`;
  if (!list.length) {
    const near = s.loc.trim() ? suggestLocality(s.loc, LOCALITIES) : null;
    const elsewhere = s.loc.trim() ? filterList(s, false).length : 0;
    const pick = (l) => h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { els.loc.value = l; apply(); } }, l);
    out.replaceChildren(h('div', { class: 'state' }, icon('search-x'), h('h2', {}, 'No providers match these filters'),
      h('p', { class: 'muted' }, near ? `Did you mean “${near}”?` : elsewhere ? `${elsewhere} provider${elsewhere === 1 ? ' matches' : 's match'} in other areas.` : 'Try a broader search, a lower minimum rating, or a higher price limit.'),
      h('div', { class: 'chips-row' }, near ? pick(near) : null,
        elsewhere ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { els.loc.value = ''; apply(); } }, 'Show all areas') : null,
        h('button', { class: 'btn btn-primary', type: 'button', onclick: clearAll }, 'Clear filters')),
      h('p', { class: 'small muted' }, 'We currently list providers in:'), h('div', { class: 'chips-row' }, LOCALITIES.map((l) => pick(l)))));
  } else out.replaceChildren(...list.map(providerCard));
  refreshIcons(); tilt(out); drawMap(list);
}
function drawMap(list) {
  if (!map) return;
  layer.clearLayers();
  const pts = list.map((p) => {
    pin([p.lat, p.lng]).addTo(layer).bindPopup(h('div', {}, h('strong', {}, p.name), h('br'), `${p.locality} · from ${money(p.price)}`, h('br'),
      h('a', { href: `provider.html?id=${encodeURIComponent(p.id)}` }, 'View Profile')));
    return [p.lat, p.lng];
  });
  if (userPos) { pin(userPos, '#2563eb').addTo(layer).bindTooltip('You are here'); pts.push(userPos); }
  if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
}
$('#locate').addEventListener('click', () => {
  const st = $('#geo-status');
  if (!navigator.geolocation) { st.textContent = 'Your browser does not support location.'; return; }
  st.textContent = 'Finding your location…';
  navigator.geolocation.getCurrentPosition((pos) => {
    userPos = [pos.coords.latitude, pos.coords.longitude];
    all.forEach((p) => { p._km = haversineKm(userPos[0], userPos[1], p.lat, p.lng); });
    $('#sort-near').disabled = false; els.sort.value = 'nearest';
    st.textContent = 'Sorted nearest first. Distances are straight-line estimates to the listed areas. Your location stays in this browser.';
    apply();
  }, (err) => {
    st.textContent = err.code === 1 ? 'Location permission was denied. You can still filter by locality.' : 'Could not get your location. Try again or filter by locality.';
  }, { timeout: 10000, maximumAge: 300000 });
});
function clearAll() { writeControls(DEFAULTS); apply(); els.q.focus(); }

$('#filters').addEventListener('input', apply);
$('#filters').addEventListener('submit', (e) => { e.preventDefault(); apply(); });
$('#clear').addEventListener('click', clearAll);

renderShell();
const url = params();
writeControls(Object.fromEntries(ids.map((i) => [i, url.get(i) ?? DEFAULTS[i]])));
$('#results').replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'sk' })));
getProviders().then((list) => { all = list; apply(); }).catch(() => {
  $('#results').replaceChildren(h('div', { class: 'state' }, h('h2', {}, 'Could not load providers'), h('p', { class: 'muted' }, 'Refresh the page to try again.')));
});

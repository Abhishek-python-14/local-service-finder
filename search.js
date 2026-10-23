import { CATEGORIES } from './data.js';
// Forgiving search: ignores filler words, understands synonyms (English, Hinglish, Hindi) and small typos.
const STOP = new Set(['in', 'near', 'nearby', 'me', 'my', 'for', 'a', 'an', 'the', 'and', 'of', 'at', 'to', 'need', 'want', 'find', 'best', 'good', 'top', 'local', 'around', 'service', 'services', 'wala', 'wale', 'ka', 'ki', 'ke', 'ko', 'chahiye', 'karne', 'ke', 'liye', 'ka', 'पास', 'में', 'चाहिए']);
const SYN = {
  tuition: ['tutor'], tution: ['tutor'], tuitions: ['tutor'], teacher: ['tutor'], teachers: ['tutor'], coaching: ['tutor'], class: ['tutor'], classes: ['tutor'], padhai: ['tutor'], math: ['maths'],
  bijli: ['electrician'], electrical: ['electrician'], wiring: ['electrician'], light: ['electrician'],
  nal: ['plumber'], plumbing: ['plumber'], pipe: ['plumber'], leak: ['plumber'], tap: ['plumber'],
  cooler: ['ac'], appliance: ['repair'], technician: ['repair'], mechanic: ['repair'], fridge: ['refrigerator'], freezer: ['refrigerator'],
  बिजली: ['electrician'], इलेक्ट्रीशियन: ['electrician'], नल: ['plumber'], प्लंबर: ['plumber'], पाइप: ['plumber'],
  टीचर: ['tutor'], ट्यूटर: ['tutor'], ट्यूशन: ['tutor'], पढ़ाई: ['tutor'], मरम्मत: ['repair'], रिपेयर: ['repair'], एसी: ['ac'], फ्रिज: ['refrigerator'],
};
const AREA_WORDS = ['noida', 'greater noida', 'gnoida', 'greater'];

export const tokens = (s) => String(s ?? '').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
export function lev(a, b) { // edit distance
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
  }
  return row[b.length];
}

const cache = new WeakMap();
const providerTokens = (p, catLabel) => {
  if (!cache.has(p)) cache.set(p, tokens([p.name, p.title, p.category, catLabel, p.locality, p.description, (p.services ?? []).map((s) => s.name).join(' ')].join(' ')));
  return cache.get(p);
};
// Short words (ac, 1) must match exactly; longer words match prefixes (fan → fans); 5+ letters tolerate typos.
const hit = (q, set) => [q, ...(SYN[q] ?? [])].some((c) => set.some((t) => t === c || (c.length >= 3 && t.startsWith(c)) || (c.length >= 5 && lev(t, c) <= (c.length >= 8 ? 2 : 1))));

export function matchesQuery(p, query, catLabel) {
  const words = tokens(query).filter((w) => !STOP.has(w));
  if (!words.length) return true;
  const set = providerTokens(p, catLabel);
  return words.every((w) => hit(w, set));
}
export function matchesLocality(p, text) {
  const n = String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!n || AREA_WORDS.includes(n)) return true; // everything listed is in Greater Noida
  const l = p.locality.toLowerCase();
  return l.includes(n) || lev(l, n) <= 2;
}
export const knownLocality = (text, localities) => localities.some((l) => matchesLocality({ locality: l }, text));

// Names used by providers.js
export const matches = (p, query) => matchesQuery(p, query, CATEGORIES.find((c) => c.id === p.category)?.label ?? p.category);
export function suggestLocality(text, localities) { // closest area name, or null when the text already matches one
  const n = String(text ?? '').trim().toLowerCase();
  if (!n || localities.some((l) => matchesLocality({ locality: l }, n))) return null;
  let best = null, bd = 4;
  for (const l of localities) { const d = lev(l.toLowerCase(), n); if (d < bd) { bd = d; best = l; } }
  return best;
}

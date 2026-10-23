// Tiny dependency-free SVG charts for the admin dashboard. All text is escaped; values are plain numbers.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const PALETTE = ['#5b9bff', '#8b5cf6', '#22d3ee', '#f472b6', '#fbbf24', '#34d399'];

// Donut: items = [{label, value}]. Returns '' when there is nothing to draw.
export function donut(items, title) {
  const total = items.reduce((t, i) => t + i.value, 0); if (!total) return '';
  const R = 62, C = 2 * Math.PI * R; let off = 0;
  const arcs = items.filter((i) => i.value).map((i) => {
    const idx = items.indexOf(i), len = (i.value / total) * C;
    const a = `<circle class="arc" cx="90" cy="90" r="${R}" fill="none" stroke="${PALETTE[idx % PALETTE.length]}" stroke-width="22" stroke-dasharray="${Math.max(len - 2, 0.1)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"><title>${esc(i.label)}: ${i.value}</title></circle>`;
    off += len; return a;
  }).join('');
  const legend = items.map((i, k) => `<li><i style="background:${PALETTE[k % PALETTE.length]}"></i>${esc(i.label)}<b>${i.value}</b></li>`).join('');
  const desc = items.map((i) => `${i.label} ${i.value}`).join(', ');
  return `<div class="donut-wrap"><svg viewBox="0 0 180 180" role="img" aria-label="${esc(title)}: ${esc(desc)}"><circle cx="90" cy="90" r="${R}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="22"/>${arcs}<text x="90" y="88" text-anchor="middle" class="c-big">${total}</text><text x="90" y="106" text-anchor="middle" class="c-sm">total</text></svg><ul class="legend">${legend}</ul></div>`;
}

// Vertical bars: items = [{label, value}]
export function bars(items, title) {
  const W = 420, H = 200, pad = 28, max = Math.max(1, ...items.map((i) => i.value)), n = items.length, slot = (W - pad * 2) / n, bw = Math.min(34, slot * 0.6);
  const body = items.map((i, k) => {
    const h = Math.round((i.value / max) * (H - pad * 2 - 14)), x = pad + slot * k + (slot - bw) / 2, y = H - pad - h;
    return `<g><rect class="bar" style="animation-delay:${k * 60}ms" x="${x}" y="${y}" width="${bw}" height="${h}" rx="7" fill="url(#gbar)"><title>${esc(i.label)}: ${i.value}</title></rect><text x="${x + bw / 2}" y="${y - 6}" text-anchor="middle" class="c-sm">${i.value}</text><text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" class="c-ax">${esc(i.label)}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}: ${esc(items.map((i) => `${i.label} ${i.value}`).join(', '))}"><defs><linearGradient id="gbar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#4f8cff"/></linearGradient></defs><line x1="${pad}" x2="${W - pad}" y1="${H - pad}" y2="${H - pad}" stroke="rgba(255,255,255,.12)"/>${body}</svg>`;
}

// Horizontal bars: items = [{label, value, sub}]
export function hbars(items, title) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const rows = items.map((i, k) => `<li><div class="hb-top"><span>${esc(i.label)}</span><b>${i.value}</b></div><div class="hb-track"><span class="hb-fill" style="width:${(i.value / max) * 100}%;animation-delay:${k * 70}ms;background:${PALETTE[k % PALETTE.length]}"></span></div>${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</li>`).join('');
  return `<ul class="hbars" role="img" aria-label="${esc(title)}: ${esc(items.map((i) => `${i.label} ${i.value}`).join(', '))}">${rows}</ul>`;
}

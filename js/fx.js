// Shared visual effects. No dependencies. Every effect is skipped for reduced-motion users,
// and cursor-based effects are skipped on touch devices (they get press feedback and scroll reveals instead).
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Toasts (theme-consistent notifications) ---------- */
export function toast(message, type = 'info', ms = 4200) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); box.setAttribute('aria-atomic', 'false'); document.body.append(box); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`; t.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const msg = document.createElement('span'); msg.textContent = message;
  const x = document.createElement('button'); x.type = 'button'; x.className = 'toast-x'; x.setAttribute('aria-label', 'Dismiss notification'); x.textContent = '×';
  const gone = () => { t.classList.add('out'); setTimeout(() => t.remove(), 260); };
  x.addEventListener('click', gone); t.append(msg, x); box.append(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(gone, ms);
}

/* ---------- Dialogs with enter and exit animation (native <dialog>, so focus trap and Esc come for free) ---------- */
export function openDialog(d) {
  if (!d.open) d.showModal();
  d.classList.remove('closing');
  if (!d._wired) {
    d._wired = true;
    d.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(d); });
    d.addEventListener('click', (e) => { if (e.target === d) closeDialog(d); }); // click on the backdrop
  }
}
export function closeDialog(d) {
  if (!d.open) return;
  if (reduce()) { d.close(); return; }
  d.classList.add('closing');
  setTimeout(() => { d.classList.remove('closing'); d.close(); }, 200);
}

/* ---------- Animated counters ---------- */
export function countUp(el, to, ms = 1100) {
  const fmt = (n) => Math.round(n).toLocaleString('en-IN') + (el.dataset.suffix || '');
  if (reduce() || !Number.isFinite(to)) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / ms); el.textContent = fmt(to * (1 - (1 - p) ** 3)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
export function counters(root = document) {
  const els = $$('[data-count]', root);
  if (!('IntersectionObserver' in window)) { els.forEach((e) => countUp(e, Number(e.dataset.count))); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); countUp(e.target, Number(e.target.dataset.count)); } }), { threshold: 0.4 });
  els.forEach((e) => io.observe(e));
}

/* ---------- 3D tilt + glare. Mouse and pen only; touch gets a CSS press effect instead ---------- */
export function tilt(root = document) {
  if (reduce()) return;
  $$('[data-tilt]', root).forEach((el) => {
    if (el._tilt) return; el._tilt = true;
    const max = Number(el.dataset.tilt) || 7;
    let raf = 0;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateY(-4px)`;
        el.style.setProperty('--gx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--gy', (y * 100).toFixed(1) + '%');
      });
    });
    el.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); el.style.transform = ''; });
  });
}

/* ---------- Scroll reveal ---------- */
export function reveal(root = document) {
  const els = $$('[data-reveal]:not(.in)', root);
  if (!els.length) return;
  if (reduce() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((e, i) => { e.style.setProperty('--d', (i % 4) * 80 + 'ms'); io.observe(e); });
}

/* ---------- Background: drifting gradient orbs + a light particle field + cursor spotlight ---------- */
function background() {
  if (document.querySelector('.bg-fx')) return;
  const bg = document.createElement('div'); bg.className = 'bg-fx'; bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = '<i class="orb o1"></i><i class="orb o2"></i><i class="orb o3"></i><i class="grid-fx"></i>';
  document.body.prepend(bg);
  if (reduce()) return;
  const cv = document.createElement('canvas'); cv.className = 'particles'; cv.setAttribute('aria-hidden', 'true'); bg.append(cv);
  const ctx = cv.getContext('2d'); if (!ctx) return;
  let w = 0, h = 0, dots = [], run = true;
  const size = () => { const d = Math.min(devicePixelRatio || 1, 1.5); w = innerWidth; h = innerHeight; cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const seed = () => { const n = innerWidth < 700 ? 18 : 42; dots = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.6 + 0.4, vx: (Math.random() - 0.5) * 0.18, vy: -Math.random() * 0.22 - 0.04, hue: Math.random() < 0.5 ? '125,211,252' : '167,139,250' })); };
  const tick = () => {
    if (!run) return;
    ctx.clearRect(0, 0, w, h);
    for (const p of dots) {
      p.x += p.vx; p.y += p.vy;
      if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; } if (p.x < -4) p.x = w + 4; if (p.x > w + 4) p.x = -4;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fillStyle = `rgba(${p.hue},.55)`; ctx.fill();
    }
    requestAnimationFrame(tick);
  };
  size(); seed(); tick();
  addEventListener('resize', () => { size(); seed(); });
  document.addEventListener('visibilitychange', () => { run = !document.hidden; if (run) tick(); });
}
function spotlight() {
  if (reduce() || !fine()) return;
  const root = document.documentElement; let raf = 0;
  addEventListener('pointermove', (e) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      root.style.setProperty('--cx', e.clientX + 'px'); root.style.setProperty('--cy', e.clientY + 'px');
      root.style.setProperty('--px', ((e.clientX / innerWidth - 0.5) * 2).toFixed(3)); root.style.setProperty('--py', ((e.clientY / innerHeight - 0.5) * 2).toFixed(3));
    });
  }, { passive: true });
  root.classList.add('has-spot');
}

/* ---------- Smooth page transitions between the site's own pages ---------- */
function pageTransitions() {
  addEventListener('pageshow', () => document.body.classList.remove('leaving')); // back button (bfcache)
  if (reduce()) return;
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
    e.preventDefault(); document.body.classList.add('leaving');
    setTimeout(() => { location.href = u.href; }, 170);
  });
}

export function initFx() {
  if (document.body.dataset.fx) return; document.body.dataset.fx = '1';
  background(); spotlight(); pageTransitions(); tilt(); reveal(); counters();
}

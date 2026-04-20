// Small extras: Konami debug mode + cursor trail.
// Both are opt-in by default: cursor trail disabled on touch + reduced-motion.

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];

function installKonami() {
  let i = 0;
  window.addEventListener('keydown', (e) => {
    const want = KONAMI[i];
    const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (got === want) {
      i++;
      if (i >= KONAMI.length) {
        i = 0;
        document.documentElement.classList.toggle('peel-debug');
        const on = document.documentElement.classList.contains('peel-debug');
        console.log(`%cafit · peel debug ${on ? 'ON' : 'OFF'}`,
          'font-family:monospace;background:#1f3cff;color:#fff;padding:4px 8px;border-radius:4px');
        if (on) {
          document.querySelectorAll<HTMLElement>('[data-peel]').forEach((el, idx) => {
            console.log(`  peel[${idx}] corner=${el.dataset.peelCorner} state=${el.dataset.peelState}`, el);
          });
        }
      }
    } else {
      i = got === KONAMI[0] ? 1 : 0;
    }
  });
}

function installCursorTrail() {
  // Respect reduced-motion + skip touch devices.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(hover: none)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:999;mix-blend-mode:multiply';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
  }
  resize();
  window.addEventListener('resize', resize);

  type Dot = { x: number; y: number; life: number };
  const dots: Dot[] = [];
  const MAX = 24;

  window.addEventListener('pointermove', (e) => {
    dots.push({ x: e.clientX * devicePixelRatio, y: e.clientY * devicePixelRatio, life: 1 });
    if (dots.length > MAX) dots.shift();
  });

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-1').trim() || '#d9663b';
    for (const d of dots) {
      d.life *= 0.9;
      ctx.fillStyle = color;
      ctx.globalAlpha = d.life * 0.35;
      ctx.beginPath();
      ctx.arc(d.x, d.y, 3 * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  tick();
}

function install() {
  installKonami();
  installCursorTrail();
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
}

export {};

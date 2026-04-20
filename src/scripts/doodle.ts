// Drawable margins. A full-viewport SVG overlay you can scribble on.
// Strokes are saved per-page path in localStorage and redrawn on load.
//
// Default: inactive (pointer-events: none, invisible). Toggled via a fixed
// pencil button (see ../components/DoodleToggle.astro) which flips the
// `.doodle-on` class on <html>.
//
// Under `prefers-reduced-motion` the feature still works — it's not an
// animation, it's just an input.

type Stroke = {
  color: string;
  width: number;
  points: [number, number][];  // normalized 0..1 against viewport at draw time
  w: number;                   // viewport w at draw time
  h: number;                   // viewport h at draw time
};

const KEY_PREFIX = 'afit-doodle:';
const LAYER_ID = 'afit-doodle-layer';

function pageKey(): string {
  return KEY_PREFIX + location.pathname;
}

function loadStrokes(): Stroke[] {
  try {
    const raw = localStorage.getItem(pageKey());
    return raw ? (JSON.parse(raw) as Stroke[]) : [];
  } catch {
    return [];
  }
}

function saveStrokes(strokes: Stroke[]) {
  try { localStorage.setItem(pageKey(), JSON.stringify(strokes)); } catch {}
}

function ensureLayer(): SVGSVGElement {
  let svg = document.getElementById(LAYER_ID) as SVGSVGElement | null;
  if (svg) return svg;
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = LAYER_ID;
  svg.setAttribute('aria-hidden', 'true');
  // Full viewport, fixed, above everything except maybe modal UIs.
  Object.assign(svg.style, {
    position: 'fixed',
    inset: '0',
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none',
    zIndex: '900',
  } as CSSStyleDeclaration);
  document.body.appendChild(svg);
  return svg;
}

function currentAccent(): string {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--accent-1').trim();
  return val || '#1f3cff';
}

function strokeToPath(s: Stroke): string {
  if (s.points.length === 0) return '';
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Denormalize from original draw viewport to current one. Strokes retain
  // their position in absolute px — so on resize, they don't stretch.
  const pts = s.points.map(([nx, ny]) => [nx * s.w, ny * s.h]);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0]} ${pts[i][1]}`;
  }
  return d;
}

function render(svg: SVGSVGElement, strokes: Stroke[]) {
  // wipe
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  for (const s of strokes) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', strokeToPath(s));
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', s.color);
    p.setAttribute('stroke-width', String(s.width));
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('opacity', '0.85');
    svg.appendChild(p);
  }
}

export function setDoodleActive(active: boolean) {
  const svg = ensureLayer();
  document.documentElement.classList.toggle('doodle-on', active);
  svg.style.pointerEvents = active ? 'auto' : 'none';
  // Visual cue: faint tint when active.
  svg.style.background = active ? 'rgba(255,255,255,0.001)' : 'transparent';
  // Show page-body cursor as a pencil crosshair while drawing mode is on.
  document.documentElement.style.cursor = active ? 'crosshair' : '';
}

export function clearDoodle() {
  saveStrokes([]);
  const svg = ensureLayer();
  render(svg, []);
}

export function initDoodle() {
  if (typeof window === 'undefined') return;
  if ((window as any).__afitDoodleInit) return;
  (window as any).__afitDoodleInit = true;

  let strokes = loadStrokes();
  const svg = ensureLayer();
  render(svg, strokes);

  // Redraw whenever the layer's storage was updated on another tab.
  window.addEventListener('storage', (e) => {
    if (e.key === pageKey()) {
      strokes = loadStrokes();
      render(svg, strokes);
    }
  });

  // Re-read strokes when navigating via view transitions (pathname changes).
  document.addEventListener('astro:after-swap', () => {
    strokes = loadStrokes();
    render(svg, strokes);
  });

  let drawing = false;
  let current: Stroke | null = null;
  let currentPath: SVGPathElement | null = null;

  const activeCheck = () => document.documentElement.classList.contains('doodle-on');

  function onDown(e: PointerEvent) {
    if (!activeCheck()) return;
    if ((e.target as HTMLElement | null)?.closest('[data-doodle-ui]')) return;
    drawing = true;
    svg.setPointerCapture?.(e.pointerId);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    current = {
      color: currentAccent(),
      width: 2.6,
      points: [[e.clientX / vw, e.clientY / vh]],
      w: vw,
      h: vh,
    };
    currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    currentPath.setAttribute('fill', 'none');
    currentPath.setAttribute('stroke', current.color);
    currentPath.setAttribute('stroke-width', String(current.width));
    currentPath.setAttribute('stroke-linecap', 'round');
    currentPath.setAttribute('stroke-linejoin', 'round');
    currentPath.setAttribute('opacity', '0.85');
    svg.appendChild(currentPath);
    e.preventDefault();
  }

  function onMove(e: PointerEvent) {
    if (!drawing || !current || !currentPath) return;
    const vw = current.w;
    const vh = current.h;
    current.points.push([e.clientX / vw, e.clientY / vh]);
    currentPath.setAttribute('d', strokeToPath(current));
  }

  function onUp() {
    if (!drawing) return;
    drawing = false;
    if (current && current.points.length > 1) {
      strokes.push(current);
      saveStrokes(strokes);
    } else if (currentPath && currentPath.parentNode === svg) {
      svg.removeChild(currentPath);
    }
    current = null;
    currentPath = null;
  }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('pointerleave', onUp);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDoodle);
  } else {
    initDoodle();
  }
  document.addEventListener('astro:page-load', initDoodle);
}

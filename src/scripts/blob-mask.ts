// Blob mask: a full-container SVG whose clip-path is an organic blob
// defined by N radial control points. Clicking anywhere on the blob picks
// the nearest control point; dragging moves that point, reshaping the
// blob in real time.
//
// The mask reveals a rich image (or any SVG content) behind the blob
// shape; everything outside the blob is transparent, letting the page's
// regular content show through.

const N = 20;

type Point = { angle: number; radius: number };

interface BlobState {
  cx: number;
  cy: number;
  pts: Point[];
}

function makeInitial(w: number, h: number): BlobState {
  const cx = w / 2;
  const cy = h / 2;
  // Cover a large portion of the container initially so the image reads
  // as "mostly filling the background" before the user interacts.
  const baseR = Math.min(w, h) * 0.48;
  const pts: Point[] = [];
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2;
    // Deterministic organic wobble — no Math.random so the shape is
    // stable across reloads.
    const wobble = 1
      + 0.09 * Math.sin(angle * 3 + 0.7)
      + 0.06 * Math.cos(angle * 2 + 1.3)
      + 0.04 * Math.sin(angle * 5 + 2.1);
    pts.push({ angle, radius: baseR * wobble });
  }
  return { cx, cy, pts };
}

function buildPath({ cx, cy, pts }: BlobState): string {
  const n = pts.length;
  const cart = pts.map((p) => [cx + p.radius * Math.cos(p.angle), cy + p.radius * Math.sin(p.angle)]);
  const get = (i: number) => cart[((i % n) + n) % n];
  let d = `M ${get(0)[0].toFixed(2)} ${get(0)[1].toFixed(2)}`;
  // Closed Catmull-Rom → cubic Bezier. Tension 1/6 gives a smooth natural
  // curve that's not too loose.
  for (let i = 0; i < n; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + ' Z';
}

function nearestIdx(state: BlobState, x: number, y: number): number {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < state.pts.length; i++) {
    const px = state.cx + state.pts[i].radius * Math.cos(state.pts[i].angle);
    const py = state.cy + state.pts[i].radius * Math.sin(state.pts[i].angle);
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

export function initBlobMask(root: HTMLElement) {
  const clipShape = root.querySelector('.blob-shape') as SVGPathElement | null;
  const hitShape = root.querySelector('.blob-shape-hit') as SVGPathElement | null;
  if (!clipShape || !hitShape) return () => {};

  let state: BlobState = makeInitial(root.clientWidth, root.clientHeight);
  let activeIdx: number | null = null;
  let renderRaf: number | null = null;

  function render() {
    const d = buildPath(state);
    clipShape!.setAttribute('d', d);
    hitShape!.setAttribute('d', d);
  }
  function scheduleRender() {
    if (renderRaf !== null) return;
    renderRaf = requestAnimationFrame(() => {
      renderRaf = null;
      render();
    });
  }

  function resizeToContainer() {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w === 0 || h === 0) return;
    // Re-seed from scratch on size change (MVP — user starts fresh when
    // viewport dimensions shift meaningfully).
    state = makeInitial(w, h);
    render();
  }

  render();

  function localCoords(e: PointerEvent): { x: number; y: number } {
    const rect = root.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  const maxAngleDelta = (Math.PI / state.pts.length) * 0.6; // how far a point can slide along the perimeter

  function onDown(e: PointerEvent) {
    const { x, y } = localCoords(e);
    activeIdx = nearestIdx(state, x, y);
    hitShape!.setPointerCapture(e.pointerId);
    root.setAttribute('data-dragging', '1');
    e.preventDefault();
  }

  function onMove(e: PointerEvent) {
    if (activeIdx === null) return;
    const { x, y } = localCoords(e);
    const dx = x - state.cx;
    const dy = y - state.cy;
    const r = Math.hypot(dx, dy);

    const rect = root.getBoundingClientRect();
    const minR = 24;
    const maxR = Math.hypot(rect.width, rect.height);
    state.pts[activeIdx].radius = Math.max(minR, Math.min(maxR, r));

    // Partial angle follow (clamped to fraction of point spacing so points
    // never cross and the path never self-intersects).
    const origAngle = (activeIdx / state.pts.length) * Math.PI * 2;
    let delta = Math.atan2(dy, dx) - origAngle;
    while (delta >  Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    delta = Math.max(-maxAngleDelta, Math.min(maxAngleDelta, delta));
    state.pts[activeIdx].angle = origAngle + delta;

    scheduleRender();
  }

  function onUp() {
    if (activeIdx === null) return;
    activeIdx = null;
    root.removeAttribute('data-dragging');
  }

  hitShape.addEventListener('pointerdown', onDown);
  hitShape.addEventListener('pointermove', onMove);
  hitShape.addEventListener('pointerup', onUp);
  hitShape.addEventListener('pointercancel', onUp);
  hitShape.addEventListener('lostpointercapture', onUp);

  let resizeRaf: number | null = null;
  const onResize = () => {
    if (resizeRaf !== null) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      resizeToContainer();
    });
  };
  window.addEventListener('resize', onResize);

  return () => {
    window.removeEventListener('resize', onResize);
    hitShape.removeEventListener('pointerdown', onDown);
    hitShape.removeEventListener('pointermove', onMove);
    hitShape.removeEventListener('pointerup', onUp);
    hitShape.removeEventListener('pointercancel', onUp);
    hitShape.removeEventListener('lostpointercapture', onUp);
  };
}

export function initAllBlobMasks() {
  document.querySelectorAll<HTMLElement>('[data-blob-mask]:not([data-blob-init])').forEach((el) => {
    el.setAttribute('data-blob-init', '');
    initBlobMask(el);
  });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllBlobMasks);
  } else {
    initAllBlobMasks();
  }
  document.addEventListener('astro:page-load', initAllBlobMasks);
}

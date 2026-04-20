// Unfold: every corner of an element is a drag handle. Pulling a corner
// resizes the element in that direction by exactly the drag distance (1:1).
// No snap on release — the element rests at whatever size the user dragged
// it to. The opposite corner stays anchored so the shape grows *away* from
// where you're pulling.
//
// Works for anything in the default slot: SVG shapes, videos, images, text.
//
// Accessibility:
//   • prefers-reduced-motion → drag disabled; corner handles become
//     +/- buttons that bump the size by a fixed step.
//   • Each corner handle is a real <button>.

import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';

gsap.registerPlugin(Draggable);

type Corner = 'tl' | 'tr' | 'bl' | 'br';

// Per-corner unit vector pointing "outward" (away from center).
// drag along this vector → element grows.
const CORNER_VEC: Record<Corner, { x: 1 | -1; y: 1 | -1 }> = {
  tl: { x: -1, y: -1 },
  tr: { x:  1, y: -1 },
  bl: { x: -1, y:  1 },
  br: { x:  1, y:  1 },
};

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

interface UnfoldOpts {
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
}

function readOpts(root: HTMLElement): UnfoldOpts {
  const cs = getComputedStyle(root);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const parseN = (v: string, fb: number) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fb;
  };
  return {
    minW: parseN(cs.getPropertyValue('--unfold-min-w'), 120),
    minH: parseN(cs.getPropertyValue('--unfold-min-h'), 90),
    maxW: parseN(cs.getPropertyValue('--unfold-max-w'), Math.round(vw * 0.95)),
    maxH: parseN(cs.getPropertyValue('--unfold-max-h'), Math.round(vh * 0.95)),
  };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function initUnfold(root: HTMLElement): () => void {
  const content = root.querySelector<HTMLElement>('.unfold-content');
  const handles = root.querySelectorAll<HTMLButtonElement>('.unfold-handle');
  if (!content || handles.length === 0) return () => {};

  const reduced = prefersReducedMotion();

  // Seed width/height from the initial rendered box so the first drag feels
  // continuous (no jump at onPress).
  const rect = content.getBoundingClientRect();
  let width = Math.round(rect.width);
  let height = Math.round(rect.height);

  const apply = () => {
    content.style.width = `${width}px`;
    content.style.height = `${height}px`;
  };
  apply();

  const draggables: Draggable[] = [];

  handles.forEach((handle) => {
    const corner = (handle.dataset.corner as Corner) || 'tr';
    const vec = CORNER_VEC[corner];
    handle.setAttribute('aria-label', handle.getAttribute('aria-label') || `Drag to unfold from ${corner}`);

    if (reduced) {
      // Click on a corner to bump +40px outward; shift-click to pull back.
      handle.addEventListener('click', (e) => {
        const opts = readOpts(root);
        const step = (e as MouseEvent).shiftKey ? -40 : 40;
        width = clamp(width + step, opts.minW, opts.maxW);
        height = clamp(height + step, opts.minH, opts.maxH);
        gsap.to(content, { width, height, duration: 0.3, ease: 'power2.out' });
      });
      return;
    }

    let startW = 0;
    let startH = 0;

    const d = new Draggable(handle, {
      type: 'x,y',
      inertia: false,
      cursor: 'grab',
      activeCursor: 'grabbing',
      allowContextMenu: true,
      onPress() {
        startW = width;
        startH = height;
        root.setAttribute('data-unfold-state', 'dragging');
      },
      onDrag() {
        const opts = readOpts(root);
        // 1:1 mapping — drag distance along corner's outward direction
        // directly sets the new width/height.
        const newW = startW + this.x * vec.x;
        const newH = startH + this.y * vec.y;
        width = clamp(newW, opts.minW, opts.maxW);
        height = clamp(newH, opts.minH, opts.maxH);
        apply();
      },
      onRelease() {
        // Snap the handle back to its anchored corner — the corner is
        // absolutely positioned so it naturally sits on the element's edge.
        // We only reset the transient transform from the drag.
        gsap.set(handle, { x: 0, y: 0 });
        root.setAttribute('data-unfold-state', 'idle');
      },
    });

    draggables.push(d);
  });

  root.setAttribute('data-unfold-state', 'idle');

  return () => {
    draggables.forEach((d) => d.kill());
  };
}

export function initAllUnfolds() {
  document.querySelectorAll<HTMLElement>('[data-unfold]:not([data-unfold-init])').forEach((el) => {
    el.setAttribute('data-unfold-init', '');
    initUnfold(el);
  });
}

// Auto-init + re-init after Astro view transitions.
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllUnfolds);
  } else {
    initAllUnfolds();
  }
  document.addEventListener('astro:page-load', initAllUnfolds);
}

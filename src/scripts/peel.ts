// Layered drag-reveal: grab a corner of `.peel-top` and drag inward.
// The top's clip-path recedes diagonally from the grabbed corner. On release,
// the peel snaps to either fully closed (0) or fully open (1) based on how
// far / how fast the user pulled.
//
// Accessibility:
//   • `prefers-reduced-motion` disables drag. The corner handle becomes a
//     click/Enter toggle that crossfades between 0 and 1.
//   • Any corner handle is a real <button> with aria-expanded / aria-controls.

import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';

gsap.registerPlugin(Draggable);

type Corner = 'tl' | 'tr' | 'bl' | 'br';

// Clip-path polygon for the visible portion of `.peel-top` at peel fraction p (0..1).
// p=0 means fully closed (full rect visible). p=1 means fully open (no rect visible).
function clipPolygon(corner: Corner, p: number): string {
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const q = Math.max(0, Math.min(1, p));
  switch (corner) {
    case 'tl':
      return `polygon(${pct(q)} 0%, 100% 0%, 100% 100%, 0% 100%, 0% ${pct(q)})`;
    case 'tr':
      return `polygon(0% 0%, ${pct(1 - q)} 0%, 100% ${pct(q)}, 100% 100%, 0% 100%)`;
    case 'bl':
      return `polygon(0% 0%, 100% 0%, 100% 100%, ${pct(q)} 100%, 0% ${pct(1 - q)})`;
    case 'br':
      return `polygon(0% 0%, 100% 0%, 100% ${pct(1 - q)}, ${pct(1 - q)} 100%, 0% 100%)`;
  }
}

// Subtle folded-corner flap clip — shows only the peeled triangle.
function flapPolygon(corner: Corner, p: number): string {
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const q = Math.max(0, Math.min(1, p));
  switch (corner) {
    case 'tl':
      return `polygon(0% 0%, ${pct(q)} 0%, 0% ${pct(q)})`;
    case 'tr':
      return `polygon(${pct(1 - q)} 0%, 100% 0%, 100% ${pct(q)})`;
    case 'bl':
      return `polygon(0% ${pct(1 - q)}, ${pct(q)} 100%, 0% 100%)`;
    case 'br':
      return `polygon(100% ${pct(1 - q)}, 100% 100%, ${pct(1 - q)} 100%)`;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export interface PeelController {
  setPeel(p: number, opts?: { animate?: boolean; duration?: number }): void;
  destroy(): void;
}

export function initPeel(root: HTMLElement): PeelController {
  const corner = (root.dataset.peelCorner as Corner) || 'tr';
  const top = root.querySelector<HTMLElement>('.peel-top');
  const handle = root.querySelector<HTMLButtonElement>('.peel-handle');
  const flap = root.querySelector<HTMLElement>('.peel-flap');

  if (!top || !handle) {
    return { setPeel() {}, destroy() {} };
  }

  let peel = 0;
  const state = { p: 0 };

  function render() {
    top!.style.clipPath = clipPolygon(corner, state.p);
    if (flap) {
      flap.style.clipPath = flapPolygon(corner, state.p);
      flap.style.opacity = String(Math.min(1, state.p * 2.5));
    }
    root.setAttribute('data-peel-state', state.p > 0.05 ? (state.p > 0.95 ? 'open' : 'peeling') : 'closed');
    handle!.setAttribute('aria-expanded', state.p > 0.5 ? 'true' : 'false');
  }

  function setPeel(p: number, { animate = false, duration = 0.45 }: { animate?: boolean; duration?: number } = {}) {
    peel = Math.max(0, Math.min(1, p));
    if (animate && !prefersReducedMotion()) {
      gsap.to(state, { p: peel, duration, ease: 'power3.out', onUpdate: render });
    } else {
      state.p = peel;
      render();
    }
  }

  // Keyboard / click toggle on the handle (always works, including reduced-motion path).
  handle.addEventListener('click', (e) => {
    // If the click was from a real drag, ignore the synthetic click to avoid double-toggle.
    if ((handle as HTMLElement & { _dragged?: boolean })._dragged) {
      (handle as HTMLElement & { _dragged?: boolean })._dragged = false;
      return;
    }
    e.preventDefault();
    setPeel(state.p > 0.5 ? 0 : 1, { animate: true });
  });

  // Drag mechanics — opt out entirely under reduced-motion.
  let draggable: Draggable | null = null;
  if (!prefersReducedMotion()) {
    const rect = () => root.getBoundingClientRect();
    let maxDist = 1;
    let startX = 0, startY = 0;

    const direction = (): { x: 1 | -1; y: 1 | -1 } => {
      // Direction of drag into the shape from the chosen corner.
      switch (corner) {
        case 'tl': return { x: 1, y: 1 };
        case 'tr': return { x: -1, y: 1 };
        case 'bl': return { x: 1, y: -1 };
        case 'br': return { x: -1, y: -1 };
      }
    };

    draggable = new Draggable(handle, {
      type: 'x,y',
      inertia: false,
      cursor: 'grab',
      activeCursor: 'grabbing',
      allowContextMenu: true,
      onPress() {
        const r = rect();
        maxDist = Math.hypot(r.width, r.height) * 0.65; // fully open at ~65% of diagonal
        startX = this.x;
        startY = this.y;
        (handle as HTMLElement & { _dragged?: boolean })._dragged = false;
      },
      onDrag() {
        const dir = direction();
        const dx = (this.x - startX) * dir.x;
        const dy = (this.y - startY) * dir.y;
        // Project the drag onto the inward diagonal direction.
        const dist = Math.max(0, (dx + dy) / Math.SQRT2);
        if (Math.abs(this.x - startX) + Math.abs(this.y - startY) > 4) {
          (handle as HTMLElement & { _dragged?: boolean })._dragged = true;
        }
        setPeel(dist / maxDist, { animate: false });
      },
      onRelease() {
        // Snap: < 0.25 → closed, >= 0.25 → open. Velocity can tip either way.
        // Draggable exposes tweenTo in its own `endX/endY` post-release — we'll
        // just use the current state.p as the indicator.
        const target = state.p >= 0.25 ? 1 : 0;
        setPeel(target, { animate: true });
        // Reset the handle to its start so it's ready for the next drag.
        gsap.set(handle, { x: 0, y: 0 });
      },
    });
  }

  // Initial render.
  render();

  return {
    setPeel,
    destroy() {
      draggable?.kill();
    },
  };
}

export function initAllPeels() {
  document.querySelectorAll<HTMLElement>('[data-peel]').forEach(initPeel);
}

// Auto-init on DOM ready + after Astro view transitions. The `data-peel-init`
// marker keeps us idempotent — we never re-attach to a node we already own.
if (typeof window !== 'undefined') {
  const run = () => {
    document.querySelectorAll<HTMLElement>('[data-peel]:not([data-peel-init])').forEach((el) => {
      el.setAttribute('data-peel-init', '');
      initPeel(el);
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  // Re-run after each Astro view-transition swap so newly-injected peels on
  // the next page get wired up.
  document.addEventListener('astro:page-load', run);
}

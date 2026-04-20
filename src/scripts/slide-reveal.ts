// Slide-reveal: an image masked by a rectangle. Each of the four edges
// (N/E/S/W) is a draggable handle that slides that edge of the mask
// inward or outward, revealing more or less of the image.
//
// State is stored on the root as four CSS custom properties
// (`--sr-inset-n`, `--sr-inset-e`, `--sr-inset-s`, `--sr-inset-w`) which
// drive the mask's `clip-path: inset(...)`. The handle positions read the
// same variables so they always sit on the current edge.
//
// Accessibility:
//   • Each handle is a real <button> with aria-label; arrow keys move
//     the edge in fixed steps (Shift = larger step). Focus ring in accent.

type Edge = 'n' | 'e' | 's' | 'w';

type Insets = { n: number; e: number; s: number; w: number };

function readInsets(root: HTMLElement): Insets {
  const cs = getComputedStyle(root);
  const parse = (name: string, fallback: number) => {
    const v = cs.getPropertyValue(name).trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    n: parse('--sr-inset-n', 18),
    e: parse('--sr-inset-e', 18),
    s: parse('--sr-inset-s', 18),
    w: parse('--sr-inset-w', 18),
  };
}

function applyInsets(root: HTMLElement, i: Insets) {
  root.style.setProperty('--sr-inset-n', `${i.n}%`);
  root.style.setProperty('--sr-inset-e', `${i.e}%`);
  root.style.setProperty('--sr-inset-s', `${i.s}%`);
  root.style.setProperty('--sr-inset-w', `${i.w}%`);
}

// Keep opposing edges from crossing: each pair must leave at least GAP% of
// the container unmasked.
const GAP = 8;
function clamp(i: Insets): Insets {
  const maxNS = Math.max(0, 100 - GAP);
  const maxEW = Math.max(0, 100 - GAP);
  const n = Math.max(0, Math.min(maxNS - i.s, i.n));
  const s = Math.max(0, Math.min(maxNS - n, i.s));
  const w = Math.max(0, Math.min(maxEW - i.e, i.w));
  const e = Math.max(0, Math.min(maxEW - w, i.e));
  return { n, e, s, w };
}

export function initSlideReveal(root: HTMLElement) {
  const handles = root.querySelectorAll<HTMLButtonElement>('[data-sr-edge]');
  if (handles.length === 0) return;

  let insets = clamp(readInsets(root));
  applyInsets(root, insets);

  handles.forEach((handle) => {
    const edge = handle.dataset.srEdge as Edge;
    let dragging = false;
    let startPointer = { x: 0, y: 0 };
    let startInsets: Insets = { ...insets };
    let rect = root.getBoundingClientRect();

    const onDown = (e: PointerEvent) => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      startPointer = { x: e.clientX, y: e.clientY };
      startInsets = { ...insets };
      rect = root.getBoundingClientRect();
      root.setAttribute('data-sr-dragging', edge);
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = ((e.clientX - startPointer.x) / rect.width) * 100;
      const dy = ((e.clientY - startPointer.y) / rect.height) * 100;
      const next = { ...insets };
      switch (edge) {
        case 'n': next.n = startInsets.n + dy; break; // drag down = hide more
        case 's': next.s = startInsets.s - dy; break; // drag down = reveal more
        case 'w': next.w = startInsets.w + dx; break; // drag right = hide more
        case 'e': next.e = startInsets.e - dx; break; // drag right = reveal more
      }
      insets = clamp(next);
      applyInsets(root, insets);
    };

    const stop = () => {
      if (!dragging) return;
      dragging = false;
      root.removeAttribute('data-sr-dragging');
    };

    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('lostpointercapture', stop);

    // Keyboard: arrows nudge this edge; Shift jumps 5% per press.
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      let changed = false;
      const k = e.key;
      // In each case, positive = reveal more, negative = hide more.
      const nudge = (amt: number) => {
        insets = clamp({ ...insets, [edge]: (insets as any)[edge] - amt });
        changed = true;
      };
      if ((edge === 'n' && k === 'ArrowUp')    || (edge === 's' && k === 'ArrowDown') ||
          (edge === 'w' && k === 'ArrowLeft')  || (edge === 'e' && k === 'ArrowRight')) {
        nudge(step);
      } else if ((edge === 'n' && k === 'ArrowDown')  || (edge === 's' && k === 'ArrowUp') ||
                 (edge === 'w' && k === 'ArrowRight') || (edge === 'e' && k === 'ArrowLeft')) {
        nudge(-step);
      }
      if (changed) {
        e.preventDefault();
        applyInsets(root, insets);
      }
    });
  });
}

export function initAllSlideReveals() {
  document.querySelectorAll<HTMLElement>('[data-slide-reveal]:not([data-sr-init])').forEach((el) => {
    el.setAttribute('data-sr-init', '');
    initSlideReveal(el);
  });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllSlideReveals);
  } else {
    initAllSlideReveals();
  }
  document.addEventListener('astro:page-load', initAllSlideReveals);
}

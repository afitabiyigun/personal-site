// Cassette deck: a shelf of draggable tapes that can be thrown around with
// Matter.js rigid-body physics. Drop one inside the deck's slot zone and the
// tape animates into the deck, lights come on, and the video loads into the
// screen. Eject pops the tape back onto the shelf.
//
// The shelf has gravity + wall collisions; tapes bump into each other. Hand-
// tuned friction/restitution so it feels like cassettes on a desk, not a
// pachinko machine.

import Matter from 'matter-js';
import { gsap } from 'gsap';
import { Draggable } from 'gsap/Draggable';

gsap.registerPlugin(Draggable);

type TapeMeta = {
  id: string;
  title: string;
  mood?: string;
  url: string;
  aspect?: string;
  description?: string;
  color: string;
};

interface DeckEls {
  shelf: HTMLElement;
  deck: HTMLElement;
  slot: HTMLElement;
  screen: HTMLElement;
  label: HTMLElement;
  eject: HTMLButtonElement;
  tapes: HTMLElement[];
}

function getEls(root: HTMLElement): DeckEls | null {
  const shelf = root.querySelector<HTMLElement>('[data-shelf]');
  const deck = root.querySelector<HTMLElement>('[data-deck]');
  const slot = root.querySelector<HTMLElement>('[data-slot]');
  const screen = root.querySelector<HTMLElement>('[data-screen]');
  const label = root.querySelector<HTMLElement>('[data-label]');
  const eject = root.querySelector<HTMLButtonElement>('[data-eject]');
  const tapes = Array.from(root.querySelectorAll<HTMLElement>('[data-tape]'));
  if (!shelf || !deck || !slot || !screen || !label || !eject) return null;
  return { shelf, deck, slot, screen, label, eject, tapes };
}

export function initCassetteDeck(root: HTMLElement) {
  const els = getEls(root);
  if (!els) return;

  // ------- State -------
  let loaded: HTMLElement | null = null;

  // ------- Matter.js world on the shelf -------
  const { Engine, World, Bodies, Body, Runner, Events } = Matter;
  const engine = Engine.create();
  engine.gravity.y = 1.0;
  const world = engine.world;

  // Build walls sized to the shelf.
  const WALL_THICK = 200; // thick walls so fast throws don't tunnel
  let shelfRect = els.shelf.getBoundingClientRect();
  const walls: Matter.Body[] = [];

  function buildWalls() {
    walls.forEach((w) => World.remove(world, w));
    walls.length = 0;
    const w = shelfRect.width;
    const h = shelfRect.height;
    const floor = Bodies.rectangle(w / 2, h + WALL_THICK / 2, w + WALL_THICK * 2, WALL_THICK, { isStatic: true, friction: 0.8 });
    const ceil  = Bodies.rectangle(w / 2, -WALL_THICK / 2, w + WALL_THICK * 2, WALL_THICK, { isStatic: true });
    const left  = Bodies.rectangle(-WALL_THICK / 2, h / 2, WALL_THICK, h + WALL_THICK * 2, { isStatic: true });
    const right = Bodies.rectangle(w + WALL_THICK / 2, h / 2, WALL_THICK, h + WALL_THICK * 2, { isStatic: true });
    walls.push(floor, ceil, left, right);
    World.add(world, walls);
  }
  buildWalls();

  // A body per tape on the shelf.
  type TapeBody = {
    el: HTMLElement;
    body: Matter.Body;
    draggable: Draggable;
    w: number;
    h: number;
    home: { x: number; y: number; rot: number };
  };
  const tapeBodies = new Map<string, TapeBody>();

  function makeTape(el: HTMLElement) {
    const id = el.dataset.tape!;
    const rect = el.getBoundingClientRect();
    const shelfBox = els!.shelf.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    // Place on shelf at its initial CSS-laid position.
    const startX = rect.left - shelfBox.left + w / 2;
    const startY = rect.top - shelfBox.top + h / 2;

    const body = Bodies.rectangle(startX, startY, w, h, {
      friction: 0.6,
      frictionAir: 0.02,
      restitution: 0.25,
      density: 0.002,
      angle: (Math.random() - 0.5) * 0.15,
    });
    World.add(world, body);

    // Absolutely position the DOM element; we'll drive transform from body.
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.margin = '0';

    const home = { x: startX, y: startY, rot: body.angle };

    // GSAP Draggable wraps the element and pumps positions into the body.
    // We use 'none' (no built-in move) so we can translate via the body.
    let dragging = false;
    let pointerLocal = { x: 0, y: 0 };

    const draggable = new Draggable(el, {
      type: 'x,y',
      cursor: 'grab',
      activeCursor: 'grabbing',
      allowContextMenu: true,
      onPress(e) {
        dragging = true;
        const sr = els!.shelf.getBoundingClientRect();
        const pe = (e as PointerEvent);
        pointerLocal.x = pe.clientX - sr.left;
        pointerLocal.y = pe.clientY - sr.top;
        Body.setStatic(body, true);
      },
      onDrag(e) {
        const sr = els!.shelf.getBoundingClientRect();
        const pe = (e as PointerEvent);
        pointerLocal.x = pe.clientX - sr.left;
        pointerLocal.y = pe.clientY - sr.top;
        Body.setPosition(body, { x: pointerLocal.x, y: pointerLocal.y });
      },
      onRelease() {
        dragging = false;
        Body.setStatic(body, false);
        // Impart a tiny toss from the draggable's velocity so releases feel alive.
        Body.setVelocity(body, {
          x: (this.deltaX || 0) * 0.5,
          y: (this.deltaY || 0) * 0.5,
        });
        // If dropped over the deck slot, load it.
        maybeLoadFromDrop(el);
      },
    });

    tapeBodies.set(id, { el, body, draggable, w, h, home });
  }

  els.tapes.forEach(makeTape);

  // Sync DOM transforms from physics each frame.
  function sync() {
    tapeBodies.forEach(({ el, body, w, h }) => {
      if (el === loaded) return; // loaded tape is GSAP-controlled, not physics
      const x = body.position.x - w / 2;
      const y = body.position.y - h / 2;
      el.style.transform = `translate(${x}px, ${y}px) rotate(${body.angle}rad)`;
    });
  }
  Events.on(engine, 'afterUpdate', sync);

  const runner = Runner.create();
  Runner.run(runner, engine);

  // Drop-onto-slot detection.
  function maybeLoadFromDrop(el: HTMLElement) {
    const tapeRect = el.getBoundingClientRect();
    const slotRect = els!.slot.getBoundingClientRect();
    const overlap =
      tapeRect.right > slotRect.left &&
      tapeRect.left < slotRect.right &&
      tapeRect.bottom > slotRect.top &&
      tapeRect.top < slotRect.bottom;
    if (overlap) loadTape(el);
  }

  // ------- Loading / ejecting -------

  function loadTape(el: HTMLElement) {
    if (loaded === el) return;
    if (loaded) ejectTape(false);

    loaded = el;
    const id = el.dataset.tape!;
    const entry = tapeBodies.get(id);
    if (!entry) return;

    // Freeze physics on this body so it doesn't fight GSAP.
    Body.setStatic(entry.body, true);

    // Animate the tape into the deck slot: it lifts, rotates upright, slides in.
    const slotRect = els!.slot.getBoundingClientRect();
    const shelfRect = els!.shelf.getBoundingClientRect();
    // The tape is positioned relative to the shelf; we need the slot's
    // position in shelf coords.
    const target = {
      x: slotRect.left - shelfRect.left + slotRect.width / 2 - entry.w / 2,
      y: slotRect.top - shelfRect.top + slotRect.height / 2 - entry.h / 2,
    };
    el.classList.add('is-loaded');

    gsap.to(el, {
      x: target.x,
      y: target.y,
      rotation: 0,
      duration: 0.55,
      ease: 'power3.inOut',
      onUpdate() {
        // Keep the body parked where GSAP is drawing the tape so collisions
        // don't yank it back.
        Body.setPosition(entry.body, {
          x: target.x + entry.w / 2,
          y: target.y + entry.h / 2,
        });
      },
      onComplete() {
        playOnScreen(el);
      },
    });
  }

  function ejectTape(animate = true) {
    if (!loaded) return;
    const el = loaded;
    const id = el.dataset.tape!;
    const entry = tapeBodies.get(id);
    if (!entry) return;
    loaded = null;

    el.classList.remove('is-loaded');
    stopScreen();

    Body.setStatic(entry.body, false);
    // Toss it back toward the shelf with an upward flick so it lands on the
    // floor instead of teleporting.
    const flickX = entry.home.x + (Math.random() - 0.5) * 60;
    const flickY = entry.home.y - 40;
    if (animate) {
      gsap.to(el, {
        duration: 0.35,
        ease: 'power2.out',
        onComplete() {
          Body.setPosition(entry.body, { x: flickX, y: flickY });
          Body.setVelocity(entry.body, { x: (Math.random() - 0.5) * 4, y: -6 });
          Body.setAngularVelocity(entry.body, (Math.random() - 0.5) * 0.2);
        },
      });
    } else {
      Body.setPosition(entry.body, { x: flickX, y: flickY });
      Body.setVelocity(entry.body, { x: 0, y: 0 });
    }
  }

  // Double-click a tape to load (in addition to drag-drop).
  els.tapes.forEach((el) => {
    el.addEventListener('dblclick', (e) => {
      e.preventDefault();
      loadTape(el);
    });
  });

  els.eject.addEventListener('click', () => ejectTape(true));

  // ------- Screen playback -------
  function playOnScreen(el: HTMLElement) {
    const url = el.dataset.url!;
    const title = el.dataset.title!;
    const mood = el.dataset.mood || '';
    els!.label.textContent = `▶ ${title}${mood ? ` · ${mood}` : ''}`;
    els!.screen.innerHTML = `
      <iframe
        src="${url}"
        title="${title}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
      ></iframe>
    `;
    els!.deck.classList.add('is-playing');
  }

  function stopScreen() {
    els!.label.textContent = '— no tape —';
    els!.screen.innerHTML = '';
    els!.deck.classList.remove('is-playing');
  }

  // ------- Resize handling -------
  const onResize = () => {
    shelfRect = els!.shelf.getBoundingClientRect();
    buildWalls();
  };
  window.addEventListener('resize', onResize);

  // Cleanup if the element gets removed (e.g. Astro view-transition to another page).
  const observer = new MutationObserver(() => {
    if (!document.body.contains(root)) {
      Runner.stop(runner);
      Events.off(engine, 'afterUpdate', sync);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function initAllDecks() {
  document.querySelectorAll<HTMLElement>('[data-cassette-deck]:not([data-deck-init])').forEach((el) => {
    el.setAttribute('data-deck-init', '');
    initCassetteDeck(el);
  });
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllDecks);
  } else {
    initAllDecks();
  }
  document.addEventListener('astro:page-load', initAllDecks);
}

/* Master GSAP timeline for the continuous production story.
   One timeline, 10 stages × 10 units. Driven only by ScrollTrigger scrub (see component).
   Every tween targets the SAME persistent objects created in production-world.ts. */
import type { gsap as GSAP } from 'gsap';
import {
  BELT_Y, BIN_X, CAVITY_X, COLORS, GRINDER_X, ING, LIFT, MIX_X, PACK_X, POWDER_X, SIEVE_X, SLICES, ST, TRAY_STAGE_X, TRAY_Y, type IngType,
} from './production-world';

export const UNIT = 10;
export const STAGE_COUNT = 10;
export const HOLD = 3;
export const TOTAL = STAGE_COUNT * UNIT + HOLD;

type Gsap = typeof GSAP;
const TYPES: IngType[] = ['carrot', 'amla', 'beet'];
const CUT_X = ST[2];
/** Washer / cutter queue: front (rightmost) item first, offsets behind it. */
const QUEUE: Record<string, number> = { c1: 0, c2: -125, c3: -250, a1: -355, a2: -430, b1: -515, b2: -600 };
const ORDER = ['c1', 'c2', 'c3', 'a1', 'a2', 'b1', 'b2'];
const restY = (t: IngType) => BELT_Y - LIFT[t];
const typeOf = (id: string) => ING.find((i) => i.id === id)!.type;

export function buildProductionTimeline(gsap: Gsap, root: Element, opts: { lite: boolean }) {
  const q = gsap.utils.selector(root);
  const one = (sel: string) => q(sel)[0];
  const tl = gsap.timeline({ defaults: { ease: 'none' } });
  const ingEl = (id: string) => one(`[data-ingredient="${id}"]`);
  const slicesOf = (id: string) => q(`[data-ingredient="${id}"] [data-slice]`);
  const slicesByType = (t: IngType) => ORDER.filter((id) => typeOf(id) === t).flatMap((id) => slicesOf(id).map((el) => ({ el, id })));

  // After cutting every ingredient group stays parked at (CUT_X, restY); slices then move in world coords.
  const local = (id: string, wx: number, wy: number) => ({ x: wx - CUT_X, y: wy - restY(typeOf(id)) });

  // ------------------------------------------------ camera
  const world = one('[data-k="world"]');
  const bg = one('[data-k="bg"]');
  const cam = one('[data-k="cam"]');
  /** Pan so world-x `wx` sits at viewport x=1000 (right of the copy on desktop, centre on mobile). */
  const camX = (wx: number, at: number, dur: number) => {
    // Soft sine ease + a minimum length so every camera move glides rather than snaps.
    const d = Math.max(dur, 2.2);
    tl.to(world, { x: 1000 - wx, duration: d, ease: 'sine.inOut' }, at);
    tl.to(bg, { x: (1000 - wx) * 0.35, duration: d, ease: 'sine.inOut' }, at);
  };
  const camTo = (i: number, at: number, dur: number) => camX(ST[i], at, dur);
  const zoom = (scale: number, at: number, dur: number, origin = '1070 465') => tl.to(cam, { scale, svgOrigin: origin, duration: Math.max(dur, 1.8), ease: 'sine.inOut' }, at);

  // Initial machine states that GSAP owns.
  gsap.set(one('[data-k="door"]'), { scaleX: 0.04, svgOrigin: '6268 0' });
  gsap.set(q('[data-k="mound"]'), { scaleY: 0.04, transformOrigin: '50% 100%' });
  if (opts.lite) q('[data-k="bubble"], [data-k="spark"], [data-k="fine"]').forEach((el, i) => i % 2 && gsap.set(el, { display: 'none' }));

  // Always-on (scroll-linked) conveyor motion.
  tl.fromTo(q('[data-k="belt-dash"]'), { strokeDashoffset: 0 }, { strokeDashoffset: -4200, duration: TOTAL }, 0);
  tl.to(q('[data-k="roller"]'), { rotation: 3600, svgOrigin: '0 0', duration: TOTAL }, 0);

  // ================================================= 1 · Fresh ingredients (0–10)
  zoom(1.07, 0, 8, '1000 560');
  zoom(1, 8.5, 2, '1000 560');
  q('[data-k="leaf"]').forEach((el, i) => tl.to(el, { x: 140 + (i % 3) * 70, y: 80 - (i % 4) * 50, rotation: 160 + i * 25, svgOrigin: '0 0', duration: 14 }, 0));
  ORDER.forEach((id, i) => {
    const t = typeOf(id);
    const el = ingEl(id);
    if (t === 'amla') tl.to(el, { rotation: i % 2 ? 22 : -18, transformOrigin: '50% 50%', duration: 4, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.5 + i * 0.2);
    else if (t === 'carrot') tl.to(el, { rotation: i % 2 ? -4 : 4, transformOrigin: '50% 50%', duration: 3.5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 0.3 + i * 0.3);
    else tl.to(el, { y: `-=8`, duration: 2, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 0.4 + i * 0.2);
  });

  // ================================================= 2 · Washing (10–20)
  camTo(1, 10, 4);
  ORDER.forEach((id, i) =>
    tl.to(ingEl(id), { x: 3100 + QUEUE[id], y: restY(typeOf(id)), rotation: 0, duration: 3.6, ease: 'power2.inOut' }, 10.2 + (6 - i) * 0.05),
  );
  tl.to(one('[data-k="wash-led"]'), { fill: '#3BE36B', duration: 0.2 }, 13.6);
  tl.to(q('[data-k="spray"]'), { opacity: 1, duration: 0.4 }, 13.8);
  tl.fromTo(q('[data-k="spray"]'), { strokeDashoffset: 0 }, { strokeDashoffset: -300, duration: 4.4 }, 13.8);
  tl.to(q('[data-k="spray"]'), { opacity: 0, duration: 0.4 }, 18);
  q('[data-k="bubble"]').forEach((b, i) => tl.fromTo(b, { y: 0, opacity: 0 }, { y: -50 - (i % 4) * 10, opacity: 0.9, duration: 0.9, yoyo: true, repeat: 3, ease: 'sine.out' }, 14 + (i % 6) * 0.25));
  ORDER.forEach((id, i) => {
    const t = typeOf(id);
    const el = ingEl(id);
    if (t === 'amla') tl.to(el, { rotation: 360, transformOrigin: '50% 50%', duration: 3.8, ease: 'sine.inOut' }, 14.1);
    else tl.to(el, { rotation: t === 'carrot' ? 8 : -12, transformOrigin: '50% 50%', duration: 0.95, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 14 + i * 0.05);
    tl.to(one(`[data-ingredient="${id}"] [data-sheen]`), { opacity: 1, duration: 0.6, yoyo: true, repeat: 1 }, 17.3 + i * 0.05);
  });
  ORDER.forEach((id) => tl.set(ingEl(id), { rotation: 0 }, 18));
  ORDER.forEach((id) => tl.to(ingEl(id), { x: 3900 + QUEUE[id], duration: 2, ease: 'power1.inOut' }, 18));

  // ================================================= 3 · Cutting & slicing (20–30)
  camTo(2, 19.4, 2.4);
  ORDER.forEach((id) => tl.to(ingEl(id), { x: CUT_X - 220 + QUEUE[id], duration: 1.4, ease: 'power1.inOut' }, 20));
  tl.to(one('[data-k="pill-cut"]'), { opacity: 1, duration: 0.6 }, 22);
  const blade = one('[data-k="blade"]');
  const staging: Record<IngType, (n: number) => [number, number]> = {
    carrot: (n) => [4775 + (n % 6) * 26, n < 6 ? 603 : 575],
    amla: (n) => [4950 + (n % 3) * 42, n < 3 ? 592 : 548],
    beet: (n) => [5092 + (n % 3) * 44, n < 3 ? 592 : 548],
  };
  const typeCounter: Record<IngType, number> = { carrot: 0, amla: 0, beet: 0 };
  ORDER.forEach((id, i) => {
    const t = typeOf(id);
    const at = 21.6 + i * 1.05;
    tl.to(ingEl(id), { x: CUT_X, duration: 0.3, ease: 'power1.inOut' }, at);
    ORDER.slice(i + 1).forEach((other) => tl.to(ingEl(other), { x: CUT_X - 220 + QUEUE[other] - QUEUE[ORDER[i + 1]], duration: 0.3, ease: 'power1.inOut' }, at));
    tl.to(blade, { y: 82, duration: 0.17, ease: 'power2.in' }, at + 0.3);
    tl.to(blade, { y: 0, duration: 0.22, ease: 'power2.out' }, at + 0.48);
    tl.to(one(`[data-ingredient="${id}"] [data-greens]`), { x: -330, y: 690 - restY(t), scale: 0.4, rotation: -80, opacity: 0, transformOrigin: '50% 50%', duration: 0.55, ease: 'power2.in' }, at + 0.32);
    const sl = slicesOf(id);
    const n = SLICES[t];
    const gap = t === 'carrot' ? 40 : 36;
    sl.forEach((s, k) => {
      const seg = s.querySelector('[data-seg]')!;
      const round = s.querySelector('[data-round]')!;
      tl.to(s, { x: (k - (n - 1) / 2) * gap, duration: 0.3, ease: 'power2.out' }, at + 0.38);
      tl.to(seg, { scaleX: 0.15, opacity: 0, transformOrigin: '50% 50%', duration: 0.3 }, at + 0.4);
      tl.fromTo(round, { scaleX: 0.15, opacity: 0 }, { scaleX: 1, opacity: 1, transformOrigin: '50% 50%', duration: 0.3, immediateRender: false }, at + 0.4);
      const [wx, wy] = staging[t](typeCounter[t]++);
      tl.to(s, { ...local(id, wx, wy), duration: 0.35, ease: 'power1.inOut' }, at + 0.72 + k * 0.03);
    });
  });

  // ================================================= 4 · Dehydration (30–40)
  camX(TRAY_STAGE_X + 200, 29.2, 2.4);
  camX(ST[3], 33, 2);
  const trayPos: Record<IngType, (n: number) => [number, number]> = {
    carrot: (n) => [TRAY_STAGE_X - 165 + n * 30, TRAY_Y[0] - 14],
    amla: (n) => [TRAY_STAGE_X - 150 + n * 60, TRAY_Y[1] - 24],
    beet: (n) => [TRAY_STAGE_X - 150 + n * 60, TRAY_Y[2] - 24],
  };
  const allSlices: { el: Element; id: string; t: IngType }[] = [];
  TYPES.forEach((t) =>
    slicesByType(t).forEach(({ el, id }, n) => {
      allSlices.push({ el, id, t });
      const [wx, wy] = trayPos[t](n);
      tl.to(el, { ...local(id, wx, wy), duration: 0.7, ease: 'power2.inOut' }, 31.2 + allSlices.length * 0.055);
    }),
  );
  const push = CAVITY_X - TRAY_STAGE_X;
  tl.to(q('[data-k="tray"]'), { x: CAVITY_X, duration: 1.2, ease: 'power2.inOut' }, 33.4);
  tl.to(allSlices.map((s) => s.el), { x: `+=${push}`, duration: 1.2, ease: 'power2.inOut' }, 33.4);
  tl.to(one('[data-k="door"]'), { scaleX: 1, svgOrigin: '6268 0', duration: 0.7, ease: 'power2.inOut' }, 34.6);
  tl.to(one('[data-k="led"]'), { fill: '#3BE36B', duration: 0.2 }, 35.3);
  const temp = one('[data-k="temp"]');
  const tv = { v: 28 };
  tl.to(tv, { v: 58, duration: 1.8, ease: 'power1.out', onUpdate: () => void (temp.textContent = `${Math.round(tv.v)}°C`) }, 35.3);
  tl.to(one('[data-k="fan"]'), { rotation: 1800, svgOrigin: '0 0', duration: 4.7 }, 35.3);
  q('[data-k="air"]').forEach((a, i) => {
    tl.to(a, { opacity: 0.85, duration: 0.4 }, 35.4 + i * 0.1);
    tl.fromTo(a, { strokeDashoffset: 0 }, { strokeDashoffset: -480, duration: 4.2 }, 35.4);
    tl.to(a, { opacity: 0, duration: 0.4 }, 39.4);
  });
  tl.to(one('[data-k="heat"]'), { opacity: 0.95, duration: 1.4, ease: 'sine.inOut' }, 35.5);
  tl.to(one('[data-k="heat"]'), { opacity: 0, duration: 0.6 }, 39.4);
  zoom(1.38, 35.4, 2);
  q('[data-k="steam"]').forEach((s, i) => tl.fromTo(s, { y: 0, opacity: 0 }, { y: -70, opacity: 0.85, duration: 0.8, yoyo: true, repeat: 2, ease: 'sine.out' }, 36.1 + i * 0.25));
  allSlices.forEach(({ el, t }, i) => {
    tl.to(el.querySelector('[data-face]'), { fill: COLORS.dried[t], duration: 3, ease: 'sine.inOut' }, 36 + (i % 6) * 0.05);
    tl.to(el.querySelector('[data-detail]'), { opacity: 0.3, duration: 3 }, 36);
    tl.to(el.querySelector('[data-round]'), { scale: 0.8, rotation: (i % 5) * 6 - 12, transformOrigin: '50% 50%', duration: 3, ease: 'sine.inOut' }, 36);
  });
  const moist = one('[data-k="moist"]');
  const mv = { v: 92 };
  tl.to(mv, { v: 6, duration: 3.2, ease: 'power1.inOut', onUpdate: () => void (moist.textContent = `${Math.round(mv.v)}%`) }, 36);
  tl.to(one('[data-k="pill-dry"]'), { opacity: 1, duration: 0.6 }, 36);
  zoom(1, 38.4, 1.8);

  // ================================================= 5 · Dried collection (40–50)
  tl.to(one('[data-k="door"]'), { scaleX: 0.04, svgOrigin: '6268 0', duration: 0.7, ease: 'power2.inOut' }, 40);
  tl.to(one('[data-k="trolley"]'), { opacity: 1, duration: 0.4 }, 40);
  const toTrolley = 7140 - CAVITY_X;
  tl.to(q('[data-k="tray"]'), { x: 7140, duration: 1.1, ease: 'power2.inOut' }, 40.8);
  tl.to(allSlices.map((s) => s.el), { x: `+=${toTrolley}`, duration: 1.1, ease: 'power2.inOut' }, 40.8);
  camX(ST[4] + 100, 42, 2.6);
  const roll = 960;
  tl.to(one('[data-k="trolley"]'), { x: 7140 + roll, duration: 2.6, ease: 'power2.inOut' }, 42);
  tl.to(q('[data-k="tray"]'), { x: 7140 + roll, duration: 2.6, ease: 'power2.inOut' }, 42);
  tl.to(allSlices.map((s) => s.el), { x: `+=${roll}`, duration: 2.6, ease: 'power2.inOut' }, 42);
  const pile = (binX: number, n: number): [number, number] => [binX + ((n % 5) - 2) * 22, 640 - Math.floor(n / 5) * 13];
  TYPES.forEach((t, b) =>
    slicesByType(t).forEach(({ el, id }, n) => {
      const [wx, wy] = pile(BIN_X[b], n);
      tl.to(el, { ...local(id, wx, wy), duration: 0.6, ease: 'power2.in' }, 44.8 + b * 0.8 + n * 0.05);
    }),
  );
  tl.to(one('[data-k="pill-collect"]'), { opacity: 1, duration: 0.6 }, 46.5);
  tl.to(one('[data-k="pill-collect"]'), { opacity: 0, duration: 0.6 }, 49.4);

  // ================================================= 6 · Grinding (50–60)
  camX(GRINDER_X + 70, 50, 2.4);
  const binShift = 9560 - BIN_X[0];
  q('[data-k="bin"]').forEach((bin, b) => tl.to(bin, { x: BIN_X[b] + binShift, duration: 2.4, ease: 'power2.inOut' }, 50));
  tl.to(allSlices.map((s) => s.el), { x: `+=${binShift}`, duration: 2.4, ease: 'power2.inOut' }, 50);
  tl.to(one('[data-k="rotor"]'), { rotation: 2880, svgOrigin: '0 0', duration: 7, ease: 'power1.in' }, 52.4);
  const rpm = one('[data-k="rpm"]');
  const rv = { v: 0 };
  tl.to(rv, { v: 2800, duration: 0.8, onUpdate: () => void (rpm.textContent = `RPM ${Math.round(rv.v)}`) }, 52.4);
  TYPES.forEach((t, b) => {
    const g = 52.6 + b * 2;
    slicesByType(t).forEach(({ el, id }, n) => {
      tl.to(el, { ...local(id, GRINDER_X - 30 + (n % 5) * 15, 238), duration: 0.42, ease: 'power1.inOut' }, g + n * 0.07);
      tl.to(el, { ...local(id, GRINDER_X, 338), scale: 0.3, opacity: 0, duration: 0.3, ease: 'power2.in' }, g + n * 0.07 + 0.42);
    });
    tl.fromTo(q(`[data-k="frag"][data-type="${t}"]`), { y: 0, opacity: 0 }, { y: 120, opacity: 1, duration: 0.5, stagger: 0.05, repeat: 1, ease: 'power1.in' }, g + 0.45);
    tl.set(q(`[data-k="frag"][data-type="${t}"]`), { opacity: 0 }, g + 1.9);
    const swirl = one(`[data-k="swirl"][data-type="${t}"]`);
    tl.to(swirl, { opacity: 1, duration: 0.3 }, g + 0.5);
    tl.to(swirl, { rotation: -540, svgOrigin: '0 0', duration: 1.5 }, g + 0.5);
    tl.to(swirl, { opacity: 0, duration: 0.25 }, g + 1.8);
    const stream = one(`[data-k="pstream"][data-type="${t}"]`);
    tl.to(stream, { opacity: 1, duration: 0.2 }, g + 0.7);
    tl.fromTo(stream, { strokeDashoffset: 0 }, { strokeDashoffset: -160, duration: 1.2 }, g + 0.7);
    tl.to(stream, { opacity: 0, duration: 0.2 }, g + 1.85);
    tl.to(one(`[data-k="jar-fill"][data-type="${t}"]`), { y: 28, duration: 1.2, ease: 'sine.out' }, g + 0.75);
  });
  tl.to(one('[data-k="pill-grind"]'), { opacity: 1, duration: 0.6 }, 55);
  tl.to(rv, { v: 0, duration: 0.6, onUpdate: () => void (rpm.textContent = `RPM ${Math.round(rv.v)}`) }, 59);

  // ================================================= 7 · Mixing (60–70)
  camTo(6, 60, 2.5);
  const jars = q('[data-k="jar"]');
  jars.forEach((jar, i) => tl.to(jar, { x: 11400 + i * 125, duration: 2.5, ease: 'power2.inOut' }, 60));
  TYPES.forEach((t, i) => {
    const p = 62.7 + i * 1.15;
    const jar = jars[i];
    tl.to(jar, { x: MIX_X - 70, y: -390, rotation: 115, transformOrigin: '50% 50%', duration: 0.5, ease: 'power2.inOut' }, p);
    const pour = one(`[data-k="pour"][data-type="${t}"]`);
    tl.to(pour, { opacity: 1, duration: 0.15 }, p + 0.45);
    tl.fromTo(pour, { strokeDashoffset: 0 }, { strokeDashoffset: -90, duration: 0.55 }, p + 0.45);
    tl.to(pour, { opacity: 0, duration: 0.15 }, p + 0.95);
    tl.to(one(`[data-k="jar-fill"][data-type="${t}"]`), { y: 120, duration: 0.5 }, p + 0.45);
    tl.to(one(`[data-k="band"][data-type="${t}"]`), { opacity: 1, duration: 0.5 }, p + 0.5);
    tl.to(jar, { x: 11400 + i * 125, y: 0, rotation: 0, duration: 0.5, ease: 'power2.inOut' }, p + 1.0);
  });
  tl.to(one('[data-k="ribbon"]'), { rotation: 0, scaleY: -1, transformOrigin: '50% 50%', duration: 0.6, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 63.2);
  tl.to(q('[data-k="band"]'), { fill: COLORS.abc, duration: 2.4, ease: 'sine.inOut' }, 65.6);
  tl.to(q('[data-k="band"]'), { y: (i: number) => (i - 1) * 6, duration: 0.4, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 65.4);
  tl.to(one('[data-k="mixfill"]'), { opacity: 1, duration: 0.6 }, 67.6);
  tl.to(q('[data-k="band"]'), { opacity: 0, duration: 0.6 }, 68);
  tl.to(one('[data-k="pill-mix"]'), { opacity: 1, duration: 0.6 }, 64);
  tl.to(one('[data-k="tote"]'), { opacity: 1, duration: 0.4 }, 68.2);
  tl.to(one('[data-k="mixout"]'), { opacity: 1, duration: 0.2 }, 68.4);
  tl.fromTo(one('[data-k="mixout"]'), { strokeDashoffset: 0 }, { strokeDashoffset: -90, duration: 1.4 }, 68.4);
  tl.to(one('[data-k="mixout"]'), { opacity: 0, duration: 0.2 }, 69.8);
  tl.to(one('[data-k="tote-fill"]'), { y: 18, duration: 1.3 }, 68.5);
  tl.to(one('[data-k="mixfill"]'), { y: 110, duration: 1.3 }, 68.5);

  // ================================================= 8 · Sieving & QC (70–80)
  camTo(7, 70, 2.6);
  const tote = one('[data-k="tote"]');
  tl.to(tote, { x: SIEVE_X - 300, duration: 2.6, ease: 'power2.inOut' }, 70);
  tl.to(tote, { x: SIEVE_X - 170, y: -360, rotation: 110, transformOrigin: '50% 50%', duration: 0.7, ease: 'power2.inOut' }, 72.6);
  tl.to(one('[data-k="tote-fill"]'), { y: 110, duration: 0.7 }, 73.1);
  tl.to(one('[data-k="sieve-powder"]'), { opacity: 1, duration: 0.6 }, 73.1);
  tl.to(q('[data-k="coarse"]'), { opacity: 1, duration: 0.6 }, 73.2);
  tl.to(tote, { opacity: 0, duration: 0.5 }, 73.9);
  tl.to(one('[data-k="sieve"]'), { x: 14, duration: 0.28, yoyo: true, repeat: 15, ease: 'sine.inOut' }, 73.6);
  q('[data-k="fine"]').forEach((f, i) => tl.fromTo(f, { y: 0, opacity: 0 }, { y: 250, opacity: 0.9, duration: 1, ease: 'power1.in', repeat: 3 }, 73.6 + (i % 12) * 0.08));
  tl.to(q('[data-k="mound"]'), { scaleY: 1, transformOrigin: '50% 100%', duration: 4.2, ease: 'sine.out' }, 73.7);
  tl.to(one('[data-k="sieve-powder"]'), { opacity: 0.2, duration: 3.6 }, 74.2);
  tl.to(q('[data-k="coarse"]'), { scale: 0.5, transformOrigin: '50% 50%', opacity: 0.5, duration: 3.6 }, 74.2);
  const mag = one('[data-k="mag"]');
  tl.to(mag, { opacity: 1, duration: 0.3 }, 76);
  tl.to(mag, { x: `+=340`, duration: 2.2, ease: 'sine.inOut' }, 76);
  tl.to(mag, { opacity: 0, duration: 0.3 }, 78.2);
  tl.to(q('[data-k="check"]'), { opacity: 1, stagger: 0.6, duration: 0.5 }, 76.2);
  tl.fromTo(one('[data-k="badge"]'), { scale: 2.2, opacity: 0, rotation: -25 }, { scale: 1, opacity: 1, rotation: 0, transformOrigin: '50% 50%', duration: 0.8, ease: 'back.out(2)', immediateRender: false }, 78.3);

  // ================================================= 9 · Packaging (80–90)
  camTo(8, 80, 2.6);
  const bowl = one('[data-k="bowl"]');
  tl.to(bowl, { x: PACK_X - 80, y: 70, scale: 0.42, transformOrigin: '50% 50%', duration: 2.6, ease: 'power2.inOut' }, 80);
  tl.to(bowl, { rotation: 60, transformOrigin: '50% 50%', duration: 0.6 }, 82.6);
  tl.to(q('[data-k="mound"]'), { scaleY: 0.04, duration: 0.8 }, 82.8);
  tl.to(bowl, { opacity: 0, duration: 0.4 }, 83.4);
  const fstream = one('[data-k="fstream"]');
  tl.to(fstream, { opacity: 1, duration: 0.2 }, 83.3);
  tl.to(one('[data-k="pfill"]'), { y: 40, duration: 2.4, ease: 'sine.inOut' }, 83.4);
  const netwt = one('[data-k="netwt"]');
  const nv = { v: 0 };
  tl.to(nv, { v: 250, duration: 2.4, onUpdate: () => void (netwt.textContent = `${Math.round(nv.v)} g`) }, 83.4);
  tl.to(fstream, { opacity: 0, duration: 0.2 }, 85.8);
  tl.to(one('[data-k="nozzle"]'), { y: -24, duration: 0.4 }, 85.8);
  tl.to(one('[data-k="jaw-l"]'), { x: PACK_X - 120, duration: 0.5, ease: 'power2.in' }, 86);
  tl.to(one('[data-k="jaw-r"]'), { x: PACK_X, duration: 0.5, ease: 'power2.in' }, 86);
  tl.to(one('[data-k="sealglow"]'), { opacity: 0.9, duration: 0.25, yoyo: true, repeat: 1 }, 86.5);
  tl.to(one('[data-k="jaw-l"]'), { x: PACK_X - 260, duration: 0.4 }, 87);
  tl.to(one('[data-k="jaw-r"]'), { x: PACK_X + 140, duration: 0.4 }, 87);
  tl.to(one('[data-k="pband"]'), { opacity: 1, duration: 0.3 }, 87);
  tl.fromTo(one('[data-k="plabel"]'), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, transformOrigin: '50% 50%', duration: 0.8, ease: 'back.out(1.8)', immediateRender: false }, 87.2);
  tl.to(one('[data-k="pill-pack"]'), { opacity: 1, duration: 0.5 }, 84);
  const pouch = one('[data-k="pouch-move"]');
  tl.to(pouch, { x: PACK_X + 420, duration: 1.8, ease: 'power1.inOut' }, 88.2);

  // ================================================= 10 · Final showcase (90–100)
  camTo(9, 90, 3.2);
  tl.to(pouch, { x: ST[9], y: 470, scale: 1.25, transformOrigin: '50% 50%', duration: 3.2, ease: 'power2.inOut' }, 90);
  tl.to(q('[data-k="ray"]'), { opacity: 0.07, stagger: 0.2, duration: 1.6 }, 91);
  tl.to(one('[data-k="show-decor"]'), { opacity: 1, duration: 1.2 }, 92.4);
  q('[data-k="spark"]').forEach((s, i) => tl.to(s, { opacity: 0.9, scale: 1.6, transformOrigin: '50% 50%', duration: 0.7, yoyo: true, repeat: 3 }, 93 + (i % 7) * 0.4));
  tl.to({}, { duration: HOLD }, STAGE_COUNT * UNIT);
  return tl;
}

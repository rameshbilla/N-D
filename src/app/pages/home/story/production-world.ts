/* ============================================================================
   N&D continuous production world — one SVG factory, laid out horizontally.

   The camera (see production-timeline.ts) pans from station to station while the
   SAME seven ingredient objects travel through every machine:
     3 carrots (c1–c3) · 2 amla (a1–a2) · 2 beetroots (b1–b2)

   Object continuity: every whole ingredient is literally built from its future
   slices. A carrot is 4 tapered segments; amla and beetroot are 3 clipped slabs.
   Cutting separates those exact pieces and turns each one face-on into a round
   slice; dehydration recolours/shrinks the same slices; grinding breaks them into
   particles of the same colour. Nothing is swapped for an unrelated image.

   All markup here is static, trusted art (no user input). Coordinates are world
   units: stations are centred at ST[i], the floor is at y=760, belt top at y=620.
   ========================================================================== */

export const ST = [1000, 2800, 4600, 6400, 8200, 10000, 11800, 13600, 15400, 17200] as const;
export const BELT_Y = 620;
export const WORLD_W = 18400;

export const ING = [
  { id: 'c1', type: 'carrot' as const, start: [790, 583] },
  { id: 'c2', type: 'carrot' as const, start: [925, 583] },
  { id: 'c3', type: 'carrot' as const, start: [858, 549] },
  { id: 'a1', type: 'amla' as const, start: [1055, 570] },
  { id: 'a2', type: 'amla' as const, start: [1120, 570] },
  { id: 'b1', type: 'beet' as const, start: [1195, 570] },
  { id: 'b2', type: 'beet' as const, start: [1262, 570] },
];
export type IngType = 'carrot' | 'amla' | 'beet';

/** Height of each ingredient's centre above the belt surface. */
export const LIFT: Record<IngType, number> = { carrot: 17, amla: 30, beet: 30 };
/** Slice count per ingredient. */
export const SLICES: Record<IngType, number> = { carrot: 4, amla: 3, beet: 3 };

export const COLORS = {
  fresh: { carrot: '#F28C28', amla: '#C9DC86', beet: '#B0124B' },
  dried: { carrot: '#B4501C', amla: '#8C8A42', beet: '#561029' },
  powder: { carrot: '#E8812A', amla: '#A9A55A', beet: '#8E1B3A' },
  abc: '#A3434A',
};

const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- defs
function defs(): string {
  const clips = ING.filter((i) => i.type !== 'carrot')
    .map((i) => [0, 1, 2].map((k) => `<clipPath id="cl-${i.id}-${k}"><rect x="-10.4" y="-34" width="20.8" height="68"/></clipPath>`).join(''))
    .join('');
  return `<defs>
<radialGradient id="g-amla" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#F4FBC8"/><stop offset="45%" stop-color="#C6DC72"/><stop offset="100%" stop-color="#7E9B2E"/></radialGradient>
<linearGradient id="g-carrot-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFB25E"/><stop offset="50%" stop-color="#F07A1A"/><stop offset="100%" stop-color="#C2500E"/></linearGradient>
<radialGradient id="g-beet" cx="35%" cy="35%" r="75%"><stop offset="0%" stop-color="#E0497E"/><stop offset="55%" stop-color="#9C1446"/><stop offset="100%" stop-color="#5A0727"/></radialGradient>
<linearGradient id="g-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6FCF57"/><stop offset="60%" stop-color="#2E8B3A"/><stop offset="100%" stop-color="#14592A"/></linearGradient>
<linearGradient id="g-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#B9C3C7"/><stop offset="18%" stop-color="#F4F7F8"/><stop offset="45%" stop-color="#CBD3D6"/><stop offset="70%" stop-color="#E9EEF0"/><stop offset="100%" stop-color="#9EA9AE"/></linearGradient>
<linearGradient id="g-steel-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#F2F5F6"/><stop offset="100%" stop-color="#A9B4B9"/></linearGradient>
<linearGradient id="g-steel-dark" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#5C6A70"/><stop offset="100%" stop-color="#2C363B"/></linearGradient>
<linearGradient id="g-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="45%" stop-color="#dff3ff" stop-opacity="0.14"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0.35"/></linearGradient>
<linearGradient id="g-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#BFE8F5" stop-opacity="0.85"/><stop offset="100%" stop-color="#5DB7D6" stop-opacity="0.9"/></linearGradient>
<linearGradient id="g-juice" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#E0436A"/><stop offset="100%" stop-color="#8E1B3A"/></linearGradient>
<radialGradient id="g-sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#FFF6C9" stop-opacity="0.95"/><stop offset="100%" stop-color="#FFF6C9" stop-opacity="0"/></radialGradient>
<radialGradient id="g-heat" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="#FFB547" stop-opacity="0.6"/><stop offset="100%" stop-color="#FF7A1A" stop-opacity="0"/></radialGradient>
<radialGradient id="g-spot" cx="50%" cy="0%" r="90%"><stop offset="0%" stop-color="#FFF3C4" stop-opacity="0.55"/><stop offset="100%" stop-color="#FFF3C4" stop-opacity="0"/></radialGradient>
<linearGradient id="g-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#E7C08E"/><stop offset="100%" stop-color="#B98552"/></linearGradient>
<linearGradient id="g-belt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4A565B"/><stop offset="100%" stop-color="#2A3337"/></linearGradient>
<pattern id="p-mesh" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 0L8 8M8 0L0 8" stroke="#8D989D" stroke-width="0.8"/></pattern>
<pattern id="p-tiles" width="120" height="60" patternUnits="userSpaceOnUse"><rect width="120" height="60" fill="#EEF3EF"/><path d="M0 0H120M0 30H120M60 0V30M0 30V60M120 30V60" stroke="#E2EAE4" stroke-width="2"/></pattern>
${clips}
</defs>`;
}

// ---------------------------------------------------------------- ingredients (built from their own slices)
const sliceWrap = (id: string, type: IngType, k: number, cx: number, seg: string, round: string) =>
  `<g data-slice data-type="${type}" data-ing="${id}" data-k="${k}" transform="translate(${r1(cx)} 0)"><g data-seg>${seg}</g><g data-round opacity="0">${round}</g></g>`;

function carrot(id: string): string {
  const R = (x: number) => 17 - ((x + 60) / 120) * 14;
  const slices = [0, 1, 2, 3]
    .map((k) => {
      const x0 = -60 + 30 * k;
      const x1 = x0 + 30;
      const cx = (x0 + x1) / 2;
      const a = r1(x0 - cx - 0.4);
      const b = r1(x1 - cx + 0.4);
      const ra = r1(R(x0));
      const rb = r1(R(x1));
      const rr = r1((R(x0) + R(x1)) / 2 + 3);
      const seg = `<path d="M${a} ${-ra}L${b} ${-rb}L${b} ${rb}L${a} ${ra}Z" fill="url(#g-carrot-v)"/><path d="M${a} ${r1(-ra * 0.45)}L${b} ${r1(-rb * 0.45)}" stroke="#FFC890" stroke-opacity=".7" stroke-width="2"/>${
        k < 3 ? `<path d="M${b - 6} ${r1(-rb * 0.2)}q3 2 0 4" stroke="#C2500E" stroke-width="1.4" fill="none" opacity=".6"/>` : ''
      }`;
      const round = `<circle data-face r="${rr}" fill="${COLORS.fresh.carrot}"/><circle data-detail r="${r1(rr * 0.5)}" fill="#FFC27A" opacity=".7"/><circle r="${rr}" fill="none" stroke="#C2500E" stroke-opacity=".35" stroke-width="1.5"/>`;
      return sliceWrap(id, 'carrot', k, cx, seg, round);
    })
    .join('');
  const greens = `<g data-greens><path d="M-61 -6q-24-24-46-22M-61 0q-32-4-52 9M-61 5q-22 18-40 28" stroke="#3E9B3A" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M-100 -30q-10-4-8 6M-108 10q-12 2-6 10" stroke="#2E8B3A" stroke-width="7" stroke-linecap="round" fill="none"/></g>`;
  return greens + slices;
}

function slabbed(id: string, type: 'amla' | 'beet'): string {
  const fill = type === 'amla' ? 'url(#g-amla)' : 'url(#g-beet)';
  return [0, 1, 2]
    .map((k) => {
      const cx = -20 + 20 * k;
      const rr = r1(Math.sqrt(900 - cx * cx) * 0.95 + (k === 1 ? 0 : 3));
      const veins =
        type === 'amla'
          ? [-16, 0, 16].map((v) => `<path d="M${v - cx} -29Q${(v - cx) * 1.15} 0 ${v - cx} 29" stroke="#8EA53C" stroke-opacity=".45" stroke-width="2" fill="none"/>`).join('')
          : `<ellipse cx="${-14 - cx}" cy="-12" rx="8" ry="5" fill="#fff" opacity=".25"/>`;
      const seg = `<g clip-path="url(#cl-${id}-${k})"><circle cx="${-cx}" r="30" fill="${fill}"/>${veins}${k === 0 && type === 'amla' ? `<ellipse cx="${-14 - cx}" cy="-14" rx="9" ry="6" fill="#fff" opacity=".5"/>` : ''}</g>${
        k === 1 && type === 'amla' ? '<path d="M0 -30q2-8 7-10" stroke="#6B5A2E" stroke-width="3" stroke-linecap="round" fill="none"/>' : ''
      }`;
      const round =
        type === 'amla'
          ? `<circle data-face r="${rr}" fill="${COLORS.fresh.amla}"/><g data-detail opacity=".8">${[0, 60, 120].map((a) => `<path d="M0 ${-rr + 3}V${rr - 3}" stroke="#9DB54A" stroke-width="1.6" transform="rotate(${a})"/>`).join('')}<circle r="4" fill="#9DB54A"/></g><circle r="${rr}" fill="none" stroke="#7E9B2E" stroke-opacity=".5" stroke-width="1.5"/>`
          : `<circle data-face r="${rr}" fill="${COLORS.fresh.beet}"/><g data-detail fill="none" stroke="#E86A9A" stroke-opacity=".55" stroke-width="1.6"><circle r="${r1(rr * 0.7)}"/><circle r="${r1(rr * 0.4)}"/></g>`;
      return sliceWrap(id, type, k, cx, seg, round);
    })
    .join('');
}

function beet(id: string): string {
  const greens = `<g data-greens><path d="M6 24q14 18 26 34" stroke="#7A0E32" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M-4 -28q-16-26-28-40M2 -29q3-30-2-50M7 -27q19-22 30-30" stroke="#B0124B" stroke-width="4" stroke-linecap="round" fill="none"/><ellipse cx="-34" cy="-74" rx="12" ry="20" transform="rotate(-35 -34 -74)" fill="url(#g-leaf)"/><ellipse cx="0" cy="-86" rx="12" ry="20" fill="url(#g-leaf)"/><ellipse cx="38" cy="-64" rx="11" ry="18" transform="rotate(40 38 -64)" fill="url(#g-leaf)"/></g>`;
  return greens + slabbed(id, 'beet');
}

export function ingredientsSvg(): string {
  return ING.map((i) => {
    const body = i.type === 'carrot' ? carrot(i.id) : i.type === 'amla' ? slabbed(i.id, 'amla') : beet(i.id);
    return `<g data-ingredient="${i.id}" data-itype="${i.type}" transform="translate(${i.start[0]} ${i.start[1]})"><g data-sheen opacity="0"><circle r="40" fill="#fff" opacity=".18"/></g>${body}</g>`;
  }).join('');
}

// ---------------------------------------------------------------- shared pieces
const pill = (x: number, y: number, text: string, k: string, w = 200) =>
  `<g data-k="${k}" opacity="0" transform="translate(${x} ${y})"><rect x="${-w / 2}" y="-20" width="${w}" height="40" rx="20" fill="#fff" stroke="#DDF5C9" stroke-width="2"/><circle cx="${-w / 2 + 22}" r="9" fill="#126B35"/><path d="M${-w / 2 + 17} 0l4 4 7-8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="${-w / 2 + 40}" y="5" font-size="15" font-weight="600" fill="#064421" font-family="var(--font-jakarta), sans-serif">${text}</text></g>`;

const label = (x: number, y: number, text: string, size = 13, fill = '#C9D2D5', weight = 600, anchor = 'middle') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}" letter-spacing="1.5" font-family="var(--font-jakarta), sans-serif">${text}</text>`;

const display = (x: number, y: number, w: number, title: string, k: string, value: string) =>
  `<rect x="${x}" y="${y}" width="${w}" height="46" rx="8" fill="#0D2A1A"/>${label(x + 12, y + 18, title, 10, '#7CBF92', 600, 'start')}<text data-k="${k}" x="${x + 12}" y="${y + 39}" font-size="20" font-weight="700" fill="#7CFF9E" font-family="ui-monospace, monospace">${value}</text>`;

function legs(x0: number, x1: number, y: number) {
  return `<rect x="${x0}" y="${y}" width="24" height="${760 - y}" fill="#5C6A70"/><rect x="${x1 - 24}" y="${y}" width="24" height="${760 - y}" fill="#5C6A70"/>`;
}

function belt(x0: number, x1: number) {
  const rollers = [];
  for (let x = x0 + 30; x < x1 - 10; x += 70) rollers.push(`<g transform="translate(${x} ${BELT_Y + 13})"><g data-k="roller"><circle r="9" fill="#9EA9AE"/><path d="M-7 0H7" stroke="#3F4A4E" stroke-width="3"/></g></g>`);
  return `<rect x="${x0}" y="${BELT_Y}" width="${x1 - x0}" height="26" rx="13" fill="url(#g-belt)"/><path data-k="belt-dash" d="M${x0 + 10} ${BELT_Y + 2}H${x1 - 10}" stroke="#6D7A80" stroke-width="3" stroke-dasharray="18 22"/>${rollers.join('')}${[x0 + 60, (x0 + x1) / 2, x1 - 60].map((x) => `<rect x="${x - 8}" y="${BELT_Y + 26}" width="16" height="${760 - BELT_Y - 26}" fill="#7C878C"/>`).join('')}`;
}

// ---------------------------------------------------------------- stations
function station1Table() {
  const leaves = [
    [640, 300], [760, 220], [960, 180], [1160, 230], [1340, 300], [1420, 420], [660, 470], [1250, 160],
  ]
    .map(([x, y], i) => `<g transform="translate(${x} ${y}) scale(${0.8 + (i % 3) * 0.3})"><g data-k="leaf"><path d="M0 -14Q12 -4 0 14Q-12 -4 0 -14Z" fill="url(#g-leaf)"/><path d="M0 -12V12" stroke="#C9F0B1"/></g></g>`)
    .join('');
  return `<g>
<rect x="690" y="600" width="640" height="24" rx="6" fill="url(#g-wood)"/>
<rect x="700" y="622" width="620" height="14" fill="#9C6B3E"/>
${legs(720, 1300, 636)}
<ellipse cx="1010" cy="760" rx="340" ry="14" fill="#06301a" opacity=".12"/>
${leaves}
</g>`;
}

function station2Washer() {
  const x0 = 2400;
  const x1 = 3200;
  const nozzles = [];
  for (let x = x0 + 80; x <= x1 - 80; x += 80) {
    nozzles.push(`<path d="M${x - 10} 418h20l-6 14h-8z" fill="#7C878C"/>`);
    nozzles.push(`<path data-k="spray" d="M${x - 18} 440L${x - 26} 598M${x} 440V598M${x + 18} 440L${x + 26} 598" stroke="#9ED8EC" stroke-width="3" stroke-linecap="round" stroke-dasharray="8 14" fill="none" opacity="0"/>`);
  }
  const bubbles = Array.from({ length: 16 }, (_, i) => `<circle data-k="bubble" cx="${x0 + 60 + i * 44}" cy="${700 - (i % 3) * 10}" r="${3 + (i % 3) * 2}" fill="#fff" opacity="0"/>`).join('');
  return `<g>
<rect x="${x0}" y="330" width="${x1 - x0}" height="96" rx="16" fill="url(#g-steel)" stroke="#8D989D"/>
${label((x0 + x1) / 2, 388, 'N&amp;D AQUA-WASH  ·  SPRAY WASHER', 15, '#4A565B', 700)}
<rect x="${x0 + 16}" y="426" width="${x1 - x0 - 32}" height="194" fill="#DFF0F5" opacity=".22"/>
${nozzles.join('')}
<rect x="${x0 - 10}" y="646" width="${x1 - x0 + 20}" height="104" rx="12" fill="url(#g-steel-v)" stroke="#8D989D"/>
<rect x="${x0 + 10}" y="660" width="${x1 - x0 - 20}" height="70" rx="8" fill="url(#g-water)"/>
${bubbles}
<rect x="${x0}" y="426" width="18" height="220" fill="url(#g-steel-v)"/><rect x="${x1 - 18}" y="426" width="18" height="220" fill="url(#g-steel-v)"/>
<rect data-k="wash-glass" x="${x0 + 18}" y="426" width="${x1 - x0 - 36}" height="194" fill="url(#g-glass)"/>
<circle data-k="wash-led" cx="${x1 - 40}" cy="360" r="9" fill="#55605F"/>
</g>`;
}

function station3Cutter() {
  const x = ST[2];
  return `<g>
<path d="M${x - 140} 620V380q0-14 14-14h252q14 0 14 14V620" fill="url(#g-steel)" stroke="#8D989D" stroke-width="2"/>
<rect x="${x - 120}" y="400" width="240" height="40" rx="8" fill="#0D2A1A"/>${label(x, 426, 'PRECISION SLICER', 13, '#7CFF9E', 700)}
<rect x="${x - 120}" y="452" width="240" height="168" rx="6" fill="#33403F"/>
<g data-k="blade"><rect x="${x - 6}" y="452" width="12" height="40" fill="#5C6A70"/><path d="M${x - 40} 490H${x + 40}L${x + 30} 516Q${x} 530 ${x - 30} 516Z" fill="url(#g-steel)" stroke="#7C878C"/></g>
<rect x="${x - 120}" y="452" width="240" height="168" rx="6" fill="url(#g-glass)"/>
<rect x="${x - 160}" y="560" width="20" height="60" fill="#7C878C"/><rect x="${x + 140}" y="560" width="20" height="60" fill="#7C878C"/>
<g transform="translate(${x - 330} 690)"><path d="M-46 -40H46L38 60H-38Z" fill="#6E8C5D"/><rect x="-52" y="-50" width="104" height="14" rx="6" fill="#57744A"/>${label(0, 20, 'TRIMMINGS', 11, '#E8F5E0', 700)}</g>
${pill(x, 300, 'Uniform slices', 'pill-cut', 190)}
</g>`;
}

export const TRAY_Y = [345, 465, 585];
export const TRAY_STAGE_X = 5950;
export const CAVITY_X = 6470;

function station4Dehydrator() {
  const x0 = 6260;
  const trays = TRAY_Y.map(
    (y, i) =>
      `<g data-k="tray" data-tray="${i}" transform="translate(${TRAY_STAGE_X} ${y})"><rect x="-180" y="0" width="360" height="9" rx="3" fill="url(#g-steel)"/><path d="M-176 2H176" stroke="#8D989D" stroke-dasharray="3 3"/><rect x="-186" y="-4" width="8" height="16" rx="2" fill="#7C878C"/><rect x="178" y="-4" width="8" height="16" rx="2" fill="#7C878C"/></g>`,
  ).join('');
  const air = [0, 1, 2, 3].map((i) => `<path data-k="air" d="M6290 ${300 + i * 116}q48-16 96 0t96 0t96 0t70 0" stroke="#FFD9A8" stroke-width="3" stroke-linecap="round" stroke-dasharray="16 20" fill="none" opacity="0"/>`).join('');
  const steam = [0, 1, 2, 3, 4].map((i) => `<path data-k="steam" d="M${6320 + i * 80} 196q-12-22 0-44q12-22 0-44" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity="0"/>`).join('');
  return `<g>
<ellipse cx="6530" cy="760" rx="320" ry="16" fill="#06301a" opacity=".14"/>
<rect x="${x0}" y="200" width="540" height="480" rx="20" fill="url(#g-steel)" stroke="#8D989D" stroke-width="2"/>
<rect x="${x0}" y="200" width="540" height="70" rx="20" fill="url(#g-steel-dark)"/>
${display(x0 + 22, 212, 150, 'MOISTURE', 'moist', '92%')}
${display(x0 + 360, 212, 160, 'TEMPERATURE', 'temp', '28°C')}
<circle data-k="led" cx="${x0 + 220}" cy="236" r="9" fill="#55605F"/>${label(x0 + 285, 241, 'N&amp;D DRY-PRO', 12)}
<rect data-k="cavity" x="6280" y="285" width="380" height="370" rx="10" fill="#33403F"/>
<rect data-k="heat" x="6280" y="285" width="380" height="370" rx="10" fill="url(#g-heat)" opacity="0"/>
${air}
<rect x="6672" y="285" width="118" height="370" rx="10" fill="url(#g-steel-v)" stroke="#A0AAAE"/>
<circle cx="6731" cy="360" r="40" fill="#2C363B"/>
<g transform="translate(6731 360)"><g data-k="fan">${[0, 90, 180, 270].map((a) => `<path d="M0 0Q14-10 30-4Q16 6 0 0Z" fill="#B9C3C7" transform="rotate(${a})"/>`).join('')}<circle r="6" fill="#E9EEF0"/></g></g>
${[0, 1, 2, 3, 4].map((i) => `<rect x="6697" y="${430 + i * 22}" width="68" height="8" rx="4" fill="#9EA9AE"/>`).join('')}
<rect x="6697" y="580" width="68" height="40" rx="8" fill="#126B35"/>
${legs(x0 + 20, x0 + 520, 680)}
${steam}
<g data-k="trolley" opacity="0" transform="translate(7140 0)"><rect x="-200" y="320" width="10" height="400" fill="#7C878C"/><rect x="190" y="320" width="10" height="400" fill="#7C878C"/>${TRAY_Y.map((y) => `<rect x="-200" y="${y + 9}" width="400" height="6" fill="#9EA9AE"/>`).join('')}<circle cx="-180" cy="742" r="16" fill="#3F4A4E"/><circle cx="180" cy="742" r="16" fill="#3F4A4E"/></g>
${trays}
<g data-k="door"><rect x="6268" y="273" width="404" height="394" rx="14" fill="none" stroke="url(#g-steel-v)" stroke-width="22"/><rect x="6279" y="284" width="382" height="372" rx="8" fill="url(#g-glass)"/><rect x="6636" y="420" width="14" height="110" rx="7" fill="#5C6A70"/></g>
${pill(6530, 130, 'Warm, controlled airflow', 'pill-dry', 260)}
</g>`;
}

export const BIN_X = [8380, 8550, 8720];
function station5Collection() {
  const names = ['DRIED CARROT', 'DRIED AMLA', 'DRIED BEETROOT'];
  const tags = ['#E46A1C', '#7A9A2E', '#8E1B3A'];
  return `<g>${BIN_X.map(
    (x, i) =>
      `<g data-k="bin" data-bin="${i}" transform="translate(${x} 0)"><path d="M-75 650H75L66 758H-66Z" fill="url(#g-steel)" stroke="#8D989D" stroke-width="2"/><rect x="-80" y="640" width="160" height="14" rx="6" fill="url(#g-steel-v)"/><rect x="-52" y="690" width="104" height="28" rx="6" fill="${tags[i]}"/>${label(0, 709, names[i], 10, '#fff', 700)}</g>`,
  ).join('')}${pill(8550, 560, 'Same pieces, now dried', 'pill-collect', 250)}</g>`;
}

export const POWDER_X = [10350, 10490, 10630];
export const GRINDER_X = 10080;
function station6Grinder() {
  const x = GRINDER_X;
  const types: IngType[] = ['carrot', 'amla', 'beet'];
  const swirls = types
    .map(
      (t) =>
        `<g data-k="swirl" data-type="${t}" opacity="0">${Array.from({ length: 22 }, (_, i) => {
          const a = (i / 22) * Math.PI * 2;
          const r = 38 + (i % 4) * 16;
          return `<circle cx="${r1(Math.cos(a) * r)}" cy="${r1(Math.sin(a) * r)}" r="${2 + (i % 3)}" fill="${COLORS.powder[t]}"/>`;
        }).join('')}</g>`,
    )
    .join('');
  const frags = types
    .map((t) => Array.from({ length: 12 }, (_, i) => `<circle data-k="frag" data-type="${t}" cx="${x - 30 + (i % 6) * 12}" cy="${300 + Math.floor(i / 6) * 10}" r="${3 + (i % 2)}" fill="${COLORS.dried[t]}" opacity="0"/>`).join(''))
    .join('');
  const streams = types
    .map((t, i) => `<path data-k="pstream" data-type="${t}" d="M${x + 175} 455Q${POWDER_X[i] - 20} 470 ${POWDER_X[i]} 640" stroke="${COLORS.powder[t]}" stroke-width="14" stroke-linecap="round" stroke-dasharray="10 8" fill="none" opacity="0"/>`)
    .join('');
  const jars = types
    .map(
      (t, i) =>
        `<g data-k="jar" data-type="${t}" transform="translate(${POWDER_X[i]} 0)"><clipPath id="jar-clip-${i}"><path d="M-54 646H54L50 756H-50Z"/></clipPath><path d="M-58 640H58L54 760H-54Z" fill="url(#g-glass)" stroke="#BFCBCF" stroke-width="3"/><g clip-path="url(#jar-clip-${i})"><rect data-k="jar-fill" data-type="${t}" x="-60" y="640" width="120" height="120" fill="${COLORS.powder[t]}" transform="translate(0 120)"/></g><rect x="-62" y="634" width="124" height="10" rx="4" fill="#7C878C"/></g>`,
    )
    .join('');
  return `<g>
<path d="M${x - 120} 230H${x + 120}L${x + 40} 330H${x - 40}Z" fill="url(#g-steel)" stroke="#8D989D" stroke-width="2"/>
<rect x="${x - 130}" y="220" width="260" height="16" rx="7" fill="url(#g-steel-v)"/>
<rect x="${x - 34}" y="328" width="68" height="40" fill="url(#g-steel-v)"/>
${frags}
<circle cx="${x}" cy="450" r="112" fill="#27322F" stroke="url(#g-steel)" stroke-width="26"/>
<g transform="translate(${x} 450)">${swirls}<g data-k="rotor">${[0, 90, 180, 270].map((a) => `<rect x="-8" y="-84" width="16" height="78" rx="6" fill="url(#g-steel)" transform="rotate(${a})"/>`).join('')}<circle r="18" fill="#C9D2D5" stroke="#6E7A80" stroke-width="3"/></g><circle r="98" fill="url(#g-glass)"/></g>
<rect x="${x - 160}" y="570" width="320" height="140" rx="18" fill="url(#g-steel-dark)"/>
${display(x + 10, 595, 130, 'GRINDER', 'rpm', 'RPM 0')}
${[0, 1, 2, 3].map((i) => `<rect x="${x - 130}" y="${598 + i * 24}" width="110" height="8" rx="4" fill="#77858B"/>`).join('')}
${legs(x - 150, x + 150, 710)}
<path d="M${x + 95} 420L${x + 120} 396L${x + 190} 450L${x + 165} 476Z" fill="url(#g-steel)" stroke="#8D989D"/>
${streams}
${jars}
${pill(POWDER_X[1], 560, 'Colours kept separate', 'pill-grind', 230)}
</g>`;
}

export const MIX_X = 11880;
function station7Mixer() {
  const x = MIX_X;
  const bands = (['carrot', 'amla', 'beet'] as IngType[])
    .map((t, i) => `<rect data-k="band" data-type="${t}" x="${x - 175}" y="${520 - i * 46}" width="350" height="48" fill="${COLORS.powder[t]}" opacity="0"/>`)
    .join('');
  const pours = (['carrot', 'amla', 'beet'] as IngType[])
    .map((t) => `<path data-k="pour" data-type="${t}" d="M${x} 250V330" stroke="${COLORS.powder[t]}" stroke-width="16" stroke-linecap="round" stroke-dasharray="10 8" fill="none" opacity="0"/>`)
    .join('');
  return `<g>
<rect x="${x - 40}" y="316" width="80" height="24" rx="6" fill="url(#g-steel-v)"/>
${pours}
<path d="M${x - 210} 340H${x + 210}V540Q${x + 210} 590 ${x + 160} 590H${x - 160}Q${x - 210} 590 ${x - 210} 540Z" fill="url(#g-steel)" stroke="#8D989D" stroke-width="2"/>
<clipPath id="mix-clip"><rect x="${x - 176}" y="372" width="352" height="196" rx="18"/></clipPath>
<rect x="${x - 176}" y="372" width="352" height="196" rx="18" fill="#33403F"/>
<g clip-path="url(#mix-clip)">${bands}<rect data-k="mixfill" x="${x - 176}" y="430" width="352" height="140" fill="${COLORS.abc}" opacity="0"/>
<g transform="translate(${x} 470)"><g data-k="ribbon"><path d="M-160 0C-120 -60 -40 60 0 0S120 -60 160 0" stroke="#D9E2E5" stroke-width="8" fill="none"/><path d="M-160 0C-120 60 -40 -60 0 0S120 60 160 0" stroke="#AEB9BD" stroke-width="6" fill="none"/></g></g></g>
<rect x="${x - 176}" y="372" width="352" height="196" rx="18" fill="url(#g-glass)"/>
${label(x, 362, 'N&amp;D RIBBON BLENDER', 13, '#4A565B', 700)}
<rect x="${x + 70}" y="590" width="40" height="30" fill="#7C878C"/><path data-k="mixout" d="M${x + 90} 620V680" stroke="${COLORS.abc}" stroke-width="16" stroke-linecap="round" stroke-dasharray="10 8" fill="none" opacity="0"/>
${legs(x - 190, x + 190, 590)}
${pill(x, 210, 'Carrot + Amla + Beetroot', 'pill-mix', 260)}
</g>`;
}

export const SIEVE_X = 13600;
function station8Sieve() {
  const x = SIEVE_X;
  const fine = Array.from({ length: 30 }, (_, i) => `<circle data-k="fine" cx="${x - 180 + ((i * 12.4) % 360)}" cy="400" r="${2 + (i % 2)}" fill="${COLORS.abc}" opacity="0"/>`).join('');
  const coarse = Array.from({ length: 12 }, (_, i) => `<circle data-k="coarse" cx="${x - 150 + i * 27}" cy="${350 + ((i * 17) % 20) - 10}" r="${4 + (i % 3)}" fill="#6E2430" opacity="0"/>`).join('');
  return `<g>
<rect x="${x - 270}" y="300" width="20" height="460" fill="#7C878C"/><rect x="${x + 250}" y="300" width="20" height="460" fill="#7C878C"/>
<g data-k="sieve">
<path d="M${x - 240} 350V390Q${x} 440 ${x + 240} 390V350" fill="url(#g-steel)" stroke="#8D989D" stroke-width="2"/>
<ellipse cx="${x}" cy="350" rx="240" ry="52" fill="url(#g-steel-v)"/>
<ellipse data-k="sieve-powder" cx="${x}" cy="356" rx="222" ry="44" fill="${COLORS.abc}" opacity="0"/>
<ellipse cx="${x}" cy="356" rx="222" ry="44" fill="url(#p-mesh)"/>
${coarse}
</g>
${fine}
<g data-k="bowl" transform="translate(${x} 690)"><path d="M-230 -40Q-220 60 0 70Q220 60 230 -40Z" fill="url(#g-steel)" stroke="#8D989D" stroke-width="2"/><ellipse cy="-40" rx="230" ry="26" fill="#C9D2D5"/><g data-k="mound"><path d="M-200 -40Q-90 -140 0 -142Q90 -140 200 -40Z" fill="${COLORS.abc}"/></g></g>
<g data-k="mag" opacity="0" transform="translate(${x - 170} 560)"><circle r="54" fill="#ffffff" opacity=".35" stroke="#2F3A33" stroke-width="10"/>${Array.from({ length: 16 }, (_, i) => `<circle cx="${-30 + (i % 4) * 20}" cy="${-30 + Math.floor(i / 4) * 20}" r="3" fill="${COLORS.abc}" opacity=".8"/>`).join('')}<rect x="38" y="38" width="20" height="70" rx="8" fill="#2F3A33" transform="rotate(-45 38 38)"/></g>
<g data-k="badge" opacity="0" transform="translate(${x + 300} 230)"><circle r="62" fill="#126B35"/><circle r="52" fill="none" stroke="#DDF5C9" stroke-width="2" stroke-dasharray="4 4"/><path d="M-22 2l14 14 30-32" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${label(0, 38, 'QUALITY', 11, '#DDF5C9', 700)}</g>
${pill(x - 360, 260, 'Fine, even texture', 'check', 210)}${pill(x - 360, 320, 'Colour &amp; aroma', 'check', 200)}${pill(x - 360, 380, 'Clean &amp; hygienic', 'check', 205)}
</g>`;
}

export const PACK_X = 15400;
function pouchArt(id: string) {
  return `<g data-k="${id}">
<clipPath id="pouch-clip-${id}"><path d="M-110 -150L110 -150L118 150Q0 172 -118 150Z"/></clipPath>
<ellipse cy="160" rx="120" ry="14" fill="#06301a" opacity=".18"/>
<path d="M-110 -150L110 -150L118 150Q0 172 -118 150Z" fill="#FFFDF4" stroke="#E5E9D9" stroke-width="2"/>
<g clip-path="url(#pouch-clip-${id})"><rect data-k="pfill" x="-130" y="-150" width="260" height="330" fill="${COLORS.abc}" opacity=".92" transform="translate(0 330)"/></g>
<path data-k="pband" d="M-110 -150L110 -150L111 -104L-111 -104Z" fill="#9E1F3F" opacity="0"/>
<g data-k="plabel" opacity="0"><rect x="-86" y="-80" width="172" height="110" rx="14" fill="#064421"/><text y="-48" text-anchor="middle" font-size="15" fill="#DDF5C9" letter-spacing="4" font-weight="700" font-family="var(--font-jakarta), sans-serif">N&amp;D</text><text y="-16" text-anchor="middle" font-size="24" fill="#fff" font-weight="700" font-family="var(--font-fraunces), serif">ABC Powder</text><text y="10" text-anchor="middle" font-size="11" fill="#DDF5C9" font-family="var(--font-jakarta), sans-serif">Amla · Beetroot · Carrot</text></g>
<path d="M-104 -100L-110 140" stroke="#fff" stroke-opacity=".55" stroke-width="8" stroke-linecap="round"/>
</g>`;
}
function station9Packaging() {
  const x = PACK_X;
  return `<g>
<rect x="${x - 130}" y="90" width="260" height="140" rx="16" fill="url(#g-steel)" stroke="#8D989D"/>
${display(x - 100, 120, 120, 'NET WT', 'netwt', '0 g')}
<g data-k="nozzle"><path d="M${x - 40} 230H${x + 40}L${x + 14} 290H${x - 14}Z" fill="url(#g-steel-v)" stroke="#8D989D"/></g>
<rect data-k="fstream" x="${x - 8}" y="292" width="16" height="130" rx="8" fill="${COLORS.abc}" opacity="0"/>
<g data-k="jaw-l" transform="translate(${x - 260} 0)"><rect x="0" y="340" width="120" height="44" rx="8" fill="url(#g-steel-dark)"/></g>
<g data-k="jaw-r" transform="translate(${x + 140} 0)"><rect x="0" y="340" width="120" height="44" rx="8" fill="url(#g-steel-dark)"/></g>
<rect data-k="sealglow" x="${x - 120}" y="350" width="240" height="24" rx="6" fill="#FF8A3D" opacity="0"/>
<g data-k="pouch-move" transform="translate(${x} 520)">${pouchArt('pouch')}</g>
${pill(x + 330, 250, 'Food-grade, heat-sealed', 'pill-pack', 250)}
</g>`;
}

const deco = {
  amla: (x: number, y: number, s = 0.55) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r="30" fill="url(#g-amla)"/><path d="M0 -30q2-8 7-10" stroke="#6B5A2E" stroke-width="3" fill="none"/></g>`,
  carrot: (x: number, y: number, rot = -15) =>
    `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M-48 -11L48 -2L48 2L-48 11Z" fill="url(#g-carrot-v)"/><path d="M-48 -4q-18-16-34-14M-48 2q-22 0-36 10" stroke="#3E9B3A" stroke-width="4" stroke-linecap="round" fill="none"/></g>`,
  beet: (x: number, y: number) => `<g transform="translate(${x} ${y}) scale(.6)"><circle r="30" fill="url(#g-beet)"/><path d="M0 -28q-6-20-14-34M4 -28q10-18 20-26" stroke="#B0124B" stroke-width="4" fill="none"/></g>`,
};

function station10Showcase() {
  const x = ST[9];
  const rays = [0, 1, 2, 3, 4].map((i) => `<path data-k="ray" d="M${x - 40 + i * 20} -40L${x - 440 + i * 200} 900L${x - 300 + i * 200} 900Z" fill="#DDF5C9" opacity="0"/>`).join('');
  const sparks = Array.from({ length: 14 }, (_, i) => `<circle data-k="spark" cx="${x - 380 + ((i * 97) % 780)}" cy="${160 + ((i * 53) % 360)}" r="${2 + (i % 3)}" fill="#DDF5C9" opacity="0"/>`).join('');
  return `<g>
<rect x="${x - 900}" y="-200" width="1900" height="1300" fill="#064421"/>
<rect x="${x - 900}" y="-200" width="60" height="1300" fill="#0A5A2D"/>
${rays}
<circle cx="${x}" cy="430" r="380" fill="url(#g-sun)" opacity=".22"/>
<ellipse cx="${x}" cy="735" rx="560" ry="70" fill="#0A5A2D"/><ellipse cx="${x}" cy="722" rx="520" ry="56" fill="#126B35"/>
<g data-k="show-decor" opacity="0">
<g transform="translate(${x - 250} 690)"><ellipse cy="40" rx="96" ry="12" fill="#06301a" opacity=".25"/><path d="M-90 0Q-80 50 0 52Q80 50 90 0Z" fill="#F6F1DC"/><ellipse rx="90" ry="16" fill="#E9E3C9"/><path d="M-74 -2Q-30 -42 0 -42Q30 -42 74 -2Z" fill="${COLORS.abc}"/></g>
<g transform="translate(${x + 270} 650) scale(.9)"><ellipse cy="86" rx="46" ry="8" fill="#06301a" opacity=".25"/><path d="M-30 -70L-46 -100" stroke="#126B35" stroke-width="6" stroke-linecap="round"/><path d="M-42 -80L42 -80L34 80Q0 90 -34 80Z" fill="url(#g-glass)" stroke="#d7e4dc" stroke-width="2"/><path d="M-39 -56L39 -56L34 78Q0 88 -34 78Z" fill="url(#g-juice)"/><ellipse cy="-56" rx="39" ry="6" fill="#F06A8C"/><circle cx="30" cy="-74" r="18" fill="#F7D046" stroke="#E5B92E" stroke-width="3"/></g>
${deco.amla(x - 420, 735)}${deco.carrot(x - 340, 748)}${deco.beet(x + 120, 745)}${deco.amla(x + 400, 740, 0.45)}${deco.carrot(x + 470, 752, 12)}${deco.beet(x - 140, 752)}
</g>
${sparks}
</g>`;
}

// ---------------------------------------------------------------- background (parallax layer)
export function backgroundSvg(): string {
  const windows = Array.from({ length: 9 }, (_, i) => {
    const x = 2000 + i * 820;
    return `<rect x="${x}" y="110" width="300" height="220" rx="14" fill="#F7FBF8"/><rect x="${x}" y="110" width="300" height="220" rx="14" fill="#DDF5C9" opacity=".35"/><path d="M${x + 150} 110V330M${x} 220H${x + 300}" stroke="#E2EAE4" stroke-width="6"/>`;
  }).join('');
  return `<g>
<rect x="-400" y="-200" width="2500" height="960" fill="#F1FBE9"/>
<circle cx="1180" cy="230" r="320" fill="url(#g-sun)"/>
<path d="M-400 640Q200 520 700 600T1700 560T2300 600V760H-400Z" fill="#CFEBB8"/>
<path d="M-400 700Q300 620 900 690T2100 680V760H-400Z" fill="#A9D98C"/>
<rect x="1900" y="-200" width="8400" height="960" fill="url(#p-tiles)"/>
<rect x="1900" y="-200" width="40" height="960" fill="#DCE7DF"/>
${windows}
<path d="M1900 60H10300" stroke="#D2DDD6" stroke-width="16"/><path d="M1900 90H10300" stroke="#E0E8E3" stroke-width="8"/>
</g>`;
}

// ---------------------------------------------------------------- the full world
export function worldSvg(): string {
  return `${defs()}
<g data-k="floor"><rect x="-400" y="760" width="${WORLD_W}" height="300" fill="#DCE5DD"/><rect x="-400" y="760" width="2100" height="300" fill="#8CC66F"/><rect x="-400" y="760" width="${WORLD_W}" height="5" fill="#fff" opacity=".7"/></g>
${belt(1500, 16200)}
${station1Table()}
${station3Cutter()}
${station4Dehydrator()}
${station5Collection()}
${station6Grinder()}
${station7Mixer()}
${station8Sieve()}
${station10Showcase()}
<g data-k="tote" opacity="0" transform="translate(11970 0)"><clipPath id="tote-clip"><path d="M-66 660H66L60 756H-60Z"/></clipPath><path d="M-70 654H70L64 760H-64Z" fill="url(#g-steel)" stroke="#8D989D" stroke-width="2"/><g clip-path="url(#tote-clip)"><rect data-k="tote-fill" x="-70" y="654" width="140" height="110" fill="${COLORS.abc}" transform="translate(0 110)"/></g></g>
${ingredientsSvg()}
${station2Washer()}
${station9Packaging()}
`;
}

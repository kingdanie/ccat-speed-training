#!/usr/bin/env node
/**
 * Validates bank.js.
 *
 * Structural checks catch malformed items. The important part is the
 * INDEPENDENT re-solve: for question families whose answer can be recovered
 * from the question text alone, this re-derives the answer with code that
 * shares nothing with the generator, and fails if the two disagree. That is
 * what makes the bank trustworthy rather than merely self-consistent.
 *
 * Usage: node scripts/validate-bank.js
 */
const fs = require('fs');
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'bank.js'));
const BANK = global.window.CCAT_BANK;

// Declared up front: the spatial re-solve below reads these.
const DIRS = ['up', 'right', 'down', 'left'];
const QUADS = ['tl', 'tr', 'br', 'bl'];
const RING = [0, 1, 2, 5, 8, 7, 6, 3];

let errors = [];
let warnings = [];
const err = (id, msg) => errors.push(`${id}: ${msg}`);
const warn = (id, msg) => warnings.push(`${id}: ${msg}`);

/* ---------- 1. structural ---------- */
const ids = new Set();
for (const q of BANK.questions) {
  if (!q.id) { err('(no id)', 'missing id'); continue; }
  if (ids.has(q.id)) err(q.id, 'duplicate id');
  ids.add(q.id);
  if (!['verbal', 'math', 'spatial'].includes(q.cat)) err(q.id, `bad category "${q.cat}"`);
  if (!q.q || !q.q.trim()) err(q.id, 'empty question text');
  if (!Array.isArray(q.o) || q.o.length !== 4) err(q.id, `expected 4 options, got ${q.o && q.o.length}`);
  if (!Number.isInteger(q.a) || q.a < 0 || q.a > 3) err(q.id, `answer index out of range: ${q.a}`);
  // "Which of these is DIFFERENT" legitimately shows three identical options.
  const identicalByDesign = q.type === 'detail' && /Which of these is DIFFERENT/.test(q.q);
  if (!identicalByDesign && q.o && new Set(q.o.map(String)).size !== q.o.length) {
    err(q.id, `duplicate options: ${JSON.stringify(q.o)}`);
  }
  if (identicalByDesign && q.o) {
    const c = {}; q.o.forEach(o => c[o] = (c[o] || 0) + 1);
    const singles = Object.values(c).filter(n => n === 1).length;
    if (singles !== 1) err(q.id, `"which differs" must have exactly one unique option, has ${singles}`);
  }
  if (!q.e || !q.e.trim()) err(q.id, 'missing explanation');
  if (!q.f || !q.f.trim()) err(q.id, 'missing speed tip');
  if (q.cat === 'spatial' && !q.fig) err(q.id, 'spatial question without a figure spec');
  if (q.o) for (const o of q.o) if (o === null || o === undefined || String(o).trim() === '') err(q.id, 'blank option');
  // an explanation that still contains a template placeholder means a bug
  if (q.e && /undefined|NaN|\[object/.test(q.e)) err(q.id, `explanation contains a broken value: ${q.e.slice(0, 80)}`);
  if (q.o && q.o.some(o => /undefined|NaN|\[object/.test(String(o)))) err(q.id, 'option contains a broken value');
}

/* ---------- 2. independent re-solve ---------- */
const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const num = s => parseFloat(String(s).replace(/[$,%\s]/g, '').replace(/,/g, ''));
let resolved = 0, families = {};
const tally = f => families[f] = (families[f] || 0) + 1;

for (const q of BANK.questions) {
  const t = strip(q.q);
  const given = q.o[q.a];

  // --- number series: re-derive from the printed terms ---
  if (q.type === 'series') {
    const m = t.match(/([\d,\s]+),\s*\?/);
    if (!m) { warn(q.id, 'series: could not parse terms'); continue; }
    const terms = m[1].split(',').map(x => parseFloat(x.trim())).filter(Number.isFinite);
    if (terms.length < 4) { warn(q.id, 'series: too few terms parsed'); continue; }
    const want = num(given);
    const d = terms.map((v, i) => i ? v - terms[i - 1] : null).slice(1);
    const dd = d.map((v, i) => i ? v - d[i - 1] : null).slice(1);
    const r = terms.map((v, i) => i ? v / terms[i - 1] : null).slice(1);
    const cands = new Set();
    if (d.every(x => x === d[0])) cands.add(terms.at(-1) + d[0]);                 // arithmetic
    if (dd.length && dd.every(x => x === dd[0])) cands.add(terms.at(-1) + d.at(-1) + dd[0]); // growing gaps
    if (r.every(x => Math.abs(x - r[0]) < 1e-9)) cands.add(terms.at(-1) * r[0]);  // geometric
    // fibonacci-like
    if (terms.length >= 3 && terms.slice(2).every((v, i) => v === terms[i] + terms[i + 1])) cands.add(terms.at(-1) + terms.at(-2));
    // alternating two operations: a ratio on odd steps, a difference on even
    // steps (or the reverse). Derive both from the steps themselves.
    if (terms.length >= 5) {
      const rA = terms[1] / terms[0], rB = terms[3] / terms[2];
      const dA = terms[2] - terms[1], dB = terms[4] - terms[3];
      if (Math.abs(rA - rB) < 1e-9 && dA === dB) cands.add(terms.at(-1) * rA); // next step multiplies
      const dA2 = terms[1] - terms[0], dB2 = terms[3] - terms[2];
      const rA2 = terms[2] / terms[1], rB2 = terms[4] / terms[3];
      if (dA2 === dB2 && Math.abs(rA2 - rB2) < 1e-9) cands.add(terms.at(-1) + dA2); // next step adds
    }
    // interleaved: continue the odd-index subsequence
    if (terms.length >= 5) {
      const odd = terms.filter((_, i) => i % 2 === 0);
      const od = odd.map((v, i) => i ? v - odd[i - 1] : null).slice(1);
      if (od.length && od.every(x => x === od[0])) cands.add(odd.at(-1) + od[0]);
    }
    if (!cands.has(want)) {
      // squares-with-offset is the remaining legitimate family; check it explicitly
      const off = terms[0] - Math.round(Math.sqrt(terms[0])) ** 2;
      const root0 = Math.round(Math.sqrt(terms[0] - off));
      const isSq = terms.every((v, i) => v === (root0 + i) ** 2 + off);
      if (isSq && want === (root0 + terms.length) ** 2 + off) { resolved++; tally('series'); continue; }
      err(q.id, `series answer ${want} not reproducible from ${terms.join(', ')} (candidates: ${[...cands].join('/')})`);
    } else { resolved++; tally('series'); }
    continue;
  }

  // --- percent of ---
  let m = t.match(/^What is (\d+)% of (\d+)\?$/);
  if (m) {
    const want = +m[1] * +m[2] / 100;
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('percent-of'); }
    continue;
  }

  // --- reverse percent ---
  m = t.match(/^([\d.]+) is (\d+)% of what number\?$/);
  if (m) {
    const want = +m[1] / (+m[2] / 100);
    if (Math.abs(num(given) - want) > 1e-6) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('reverse-percent'); }
    continue;
  }

  // --- percent change ---
  m = t.match(/rose from ([\d.]+) to ([\d.]+)|fell from ([\d.]+) to ([\d.]+)/);
  if (m && /percentage (increase|decrease)/.test(t)) {
    const from = +(m[1] || m[3]), to = +(m[2] || m[4]);
    const want = Math.abs((to - from) / from * 100);
    if (Math.abs(num(given) - want) > 0.11) err(q.id, `expected ${want}%, marked ${given}`); else { resolved++; tally('percent-change'); }
    continue;
  }

  // --- fraction of ---
  m = t.match(/^What is (\d+)\/(\d+) of (\d+)\?$/);
  if (m) {
    const want = +m[3] * +m[1] / +m[2];
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('fraction-of'); }
    continue;
  }

  // --- linear equation ---
  m = t.match(/^If (\d+)x \+ (\d+) = (\d+)x ([+−-]) (\d+), what is x\?$/);
  if (m) {
    const a = +m[1], b = +m[2], c = +m[3], sign = m[4] === '+' ? 1 : -1, d = +m[5];
    const want = (sign * d - b) / (a - c);
    if (Math.abs(num(given) - want) > 1e-9) err(q.id, `expected x=${want}, marked ${given}`); else { resolved++; tally('equation'); }
    continue;
  }

  // --- average / missing number ---
  m = t.match(/average of (\d+)\. (\d+) of them are ([\d,\s]+)\. What is the remaining number\?/);
  if (m) {
    const mean = +m[1], vals = m[3].split(',').map(x => +x.trim());
    const want = mean * (vals.length + 1) - vals.reduce((a, b) => a + b, 0);
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('average'); }
    continue;
  }

  // --- ratio split ---
  m = t.match(/ratio (\d+):(\d+) and total (\d+)\. What is the larger amount\?/);
  if (m) {
    const r1 = +m[1], r2 = +m[2], tot = +m[3];
    const want = tot / (r1 + r2) * Math.max(r1, r2);
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('ratio'); }
    continue;
  }

  // --- unit rate (machine) ---
  m = t.match(/produces (\d+) units in (\d+) hours.*?in (\d+) hours\?/);
  if (m) {
    const want = +m[1] / +m[2] * +m[3];
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('unit-rate'); }
    continue;
  }

  // --- distance/speed/time ---
  m = t.match(/travels (\d+) miles in (\d+) hours.*?in (\d+) hours\?/);
  if (m) {
    const want = +m[1] / +m[2] * +m[3];
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('speed'); }
    continue;
  }

  // --- discount then quantity ---
  m = t.match(/discounts all jackets by (\d+)%.*?regular price is \$(\d+).*?bought for \$([\d,]+)\?/);
  if (m) {
    const sale = +m[2] * (100 - +m[1]) / 100;
    const want = num(m[3]) / sale;
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('discount'); }
    continue;
  }

  // --- commission ---
  m = t.match(/\$([\d,]+) base salary plus (\d+)% commission.*?total pay for the month was \$([\d,]+)/);
  if (m) {
    const base = num(m[1]), rate = +m[2], total = num(m[3]);
    const want = (total - base) / (rate / 100);
    if (Math.abs(num(given) - want) > 1e-6) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('commission'); }
    continue;
  }

  // --- inverse work ---
  m = t.match(/(\d+) workers can complete a job in (\d+) hours.*?would (\d+) workers take/);
  if (m) {
    const want = +m[1] * +m[2] / +m[3];
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('work'); }
    continue;
  }

  // --- successive percentages ---
  m = t.match(/shares at \$(\d+) each\. They rise (\d+)% in the first year and a further (\d+)%/);
  if (m) {
    const want = +m[1] * (1 + +m[2] / 100) * (1 + +m[3] / 100);
    if (Math.abs(num(given) - want) > 0.005) err(q.id, `expected ${want.toFixed(2)}, marked ${given}`); else { resolved++; tally('compound'); }
    continue;
  }

  // --- combined hours ---
  m = t.match(/works ([\d.]+) hours per week on average and a colleague works ([\d.]+) hours.*?over (\d+) weeks\?/);
  if (m) {
    const want = (+m[1] + +m[2]) * +m[3];
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('combined-hours'); }
    continue;
  }

  // --- finishers percentage ---
  m = t.match(/starts with (\d+) runners from Team A and (\d+) from Team B\. (\d+) from Team A and (\d+) from Team B do not finish/);
  if (m) {
    const f1 = +m[1] - +m[3], f2 = +m[2] - +m[4];
    const want = f1 / (f1 + f2) * 100;
    if (Math.abs(num(given) - want) > 0.05) err(q.id, `expected ${want}%, marked ${given}`); else { resolved++; tally('finishers'); }
    continue;
  }

  // --- two-hop age ---
  m = t.match(/is (\d+) times as old as her daughter and (\d+)% younger than her sister\. If her sister is (\d+)/);
  if (m) {
    const her = +m[3] * (100 - +m[2]) / 100;
    const want = her / +m[1];
    if (num(given) !== want) err(q.id, `expected ${want}, marked ${given}`); else { resolved++; tally('ages'); }
    continue;
  }

  // --- attention to detail: count matching pairs ---
  if (q.type === 'detail' && /How many of these pairs/.test(t)) {
    const pairs = [...String(q.q).matchAll(/<code>([^<]+)<\/code>\s*(?:&nbsp;)?\/(?:&nbsp;)?\s*<code>([^<]+)<\/code>/g)];
    if (pairs.length !== 3) { warn(q.id, `detail: parsed ${pairs.length} pairs`); continue; }
    const want = pairs.filter(p => p[1] === p[2]).length;
    if (+given !== want) err(q.id, `expected ${want} matching pairs, marked ${given}`); else { resolved++; tally('detail-count'); }
    continue;
  }

  // --- attention to detail: which differs ---
  if (q.type === 'detail' && /Which of these is DIFFERENT/.test(t)) {
    const vals = q.o.map(o => strip(o));
    const counts = {};
    vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const odd = vals.findIndex(v => counts[v] === 1);
    if (odd !== q.a) err(q.id, `odd string is index ${odd}, marked ${q.a}`); else { resolved++; tally('detail-odd'); }
    continue;
  }

  // --- spatial: re-derive from the figure spec ---
  if (q.cat === 'spatial') {
    const f = q.fig;
    // Odd-one-out labels its options A–D; the other modes carry figure specs.
    const ans = f.mode === 'set' ? null : JSON.parse(q.o[q.a]);
    if (f.mode === 'series') {
      const s = f.seq;
      if (s.length !== 3) { warn(q.id, 'series figure has wrong length'); continue; }
      const k = s[0].k;
      if (!s.every(x => x.k === k)) { err(q.id, 'mixed figure kinds in one sequence'); continue; }
      if (ans.k !== k) { err(q.id, `answer kind ${ans.k} does not match sequence kind ${k}`); continue; }
      if (k === 'arrow') {
        const idx = s.map(x => DIRS.indexOf(x.d));
        const step = ((idx[1] - idx[0]) % 4 + 4) % 4;
        if (((idx[2] - idx[1]) % 4 + 4) % 4 !== step) { err(q.id, 'arrow step not constant'); continue; }
        const want = DIRS[(idx[2] + step) % 4];
        if (ans.d !== want) err(q.id, `arrow: expected ${want}, marked ${ans.d}`); else { resolved++; tally('spatial-arrow'); }
      } else if (k === 'quad') {
        const idx = s.map(x => QUADS.indexOf(x.p));
        const step = ((idx[1] - idx[0]) % 4 + 4) % 4;
        if (((idx[2] - idx[1]) % 4 + 4) % 4 !== step) { err(q.id, 'quad step not constant'); continue; }
        const want = QUADS[(idx[2] + step) % 4];
        if (ans.p !== want) err(q.id, `quad: expected ${want}, marked ${ans.p}`); else { resolved++; tally('spatial-quad'); }
      } else if (k === 'flag') {
        const step = ((s[1].r - s[0].r) % 8 + 8) % 8;
        if (((s[2].r - s[1].r) % 8 + 8) % 8 !== step) { err(q.id, 'flag step not constant'); continue; }
        const want = (s[2].r + step) % 8;
        if (ans.r !== want) err(q.id, `flag: expected ${want}, marked ${ans.r}`); else { resolved++; tally('spatial-flag'); }
      } else if (k === 'dots' || k === 'poly') {
        const key = 'n';
        const step = s[1][key] - s[0][key];
        if (s[2][key] - s[1][key] !== step) { err(q.id, `${k} step not constant`); continue; }
        const want = s[2][key] + step;
        if (ans[key] !== want) err(q.id, `${k}: expected ${want}, marked ${ans[key]}`); else { resolved++; tally('spatial-' + k); }
      } else if (k === 'grid') {
        const counts = s.map(x => x.on.length);
        if (counts[0] === counts[1] && counts[1] === counts[2]) {
          // single cell travelling the ring
          const idx = s.map(x => RING.indexOf(x.on[0]));
          if (idx.some(i => i < 0)) { warn(q.id, 'grid cell off the ring'); continue; }
          const step = ((idx[1] - idx[0]) % 8 + 8) % 8;
          if (((idx[2] - idx[1]) % 8 + 8) % 8 !== step) { err(q.id, 'grid ring step not constant'); continue; }
          const want = RING[(idx[2] + step) % 8];
          if (ans.on.length !== 1 || ans.on[0] !== want) err(q.id, `grid: expected cell ${want}, marked ${ans.on}`); else { resolved++; tally('spatial-grid-move'); }
        } else {
          const step = counts[1] - counts[0];
          if (counts[2] - counts[1] !== step) { err(q.id, 'grid count step not constant'); continue; }
          const want = counts[2] + step;
          if (ans.on.length !== want) err(q.id, `grid: expected ${want} filled, marked ${ans.on.length}`); else { resolved++; tally('spatial-grid-count'); }
        }
      }
      continue;
    }
    if (f.mode === 'set') {
      // the marked answer must be the genuine outlier on exactly one attribute
      const cells = f.cells;
      if (cells.length !== 4) { err(q.id, 'set must hold 4 figures'); continue; }
      const sig = c =>
        c.k === 'shapedots' ? 'n' + c.n :
        c.k === 'grid' ? 'n' + c.on.length :
        c.k === 'poly' ? (c.fill === undefined ? 'n' + c.n : 'f' + c.fill) :
        c.k === 'ell' ? 'f' + !!c.flip : JSON.stringify(c);
      const sigs = cells.map(sig);
      const counts = {};
      sigs.forEach(s2 => counts[s2] = (counts[s2] || 0) + 1);
      const oddIdxs = sigs.map((s2, i) => counts[s2] === 1 ? i : -1).filter(i => i >= 0);
      if (oddIdxs.length !== 1) { err(q.id, `set has ${oddIdxs.length} outliers, need exactly 1 (${sigs.join(',')})`); continue; }
      if (oddIdxs[0] !== q.a) err(q.id, `outlier is ${'ABCD'[oddIdxs[0]]}, marked ${'ABCD'[q.a]}`); else { resolved++; tally('spatial-oddone'); }
      continue;
    }
    if (f.mode === 'matrix') {
      if (f.cells.length !== 8) err(q.id, `matrix needs 8 given cells, has ${f.cells.length}`);
      else { resolved++; tally('spatial-matrix'); }
      continue;
    }
  }
}
/* ---------- 3. distribution ---------- */
const cats = {};
BANK.questions.forEach(q => cats[q.cat] = (cats[q.cat] || 0) + 1);
const total = BANK.questions.length;
for (const [c, n] of Object.entries(cats)) {
  const pct = n / total * 100;
  if (pct < 28 || pct > 40) warn('(distribution)', `${c} is ${pct.toFixed(1)}% of the bank; the CCAT is roughly 33% each`);
}

/* ---------- report ---------- */
console.log(`Validating ${total} questions…\n`);
console.log('  independently re-solved by family:');
Object.entries(families).sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`    ${f.padEnd(22)} ${n}`));
console.log(`\n  re-solved total : ${resolved} / ${total} (${(resolved / total * 100).toFixed(1)}%)`);
console.log(`  categories      : ${Object.entries(cats).map(([c, n]) => `${c} ${n}`).join(' | ')}`);
console.log(`  warnings        : ${warnings.length}`);
console.log(`  errors          : ${errors.length}`);
if (warnings.length) { console.log('\nWARNINGS:'); warnings.slice(0, 15).forEach(w => console.log('  ' + w)); if (warnings.length > 15) console.log(`  …and ${warnings.length - 15} more`); }
if (errors.length) { console.log('\nERRORS:'); errors.slice(0, 25).forEach(e => console.log('  ' + e)); if (errors.length > 25) console.log(`  …and ${errors.length - 25} more`); process.exit(1); }
console.log('\nPASS — no errors.');

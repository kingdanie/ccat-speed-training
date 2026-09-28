#!/usr/bin/env node
/**
 * Generates the CCAT practice question bank.
 *
 * Design rule: every answer is COMPUTED by the same code that builds the
 * question. Nothing is typed in by hand, so a question and its answer cannot
 * drift apart. Distractors are generated as near-misses that model the
 * specific mistake a rushed test-taker makes, then de-duplicated.
 *
 * Output: bank.js  ->  window.CCAT_BANK = { generated, counts, questions: [...] }
 *
 * Spatial questions store a compact figure SPEC rather than SVG markup; the
 * page renders them at runtime. Keeps the file small and the figures crisp.
 *
 * Usage: node scripts/generate-bank.js
 */
const fs = require('fs');
const path = require('path');
const W = require('./lib/words');

/* ---------- seeded RNG so output is reproducible ---------- */
let _seed = 20260928;
function rnd() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = a => a[Math.floor(rnd() * a.length)];
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Sample n distinct items from an array. */
function sample(a, n) { return shuffle(a).slice(0, n); }

/* ---------- option assembly ----------
   Takes the correct answer plus candidate distractors, removes duplicates and
   anything equal to the answer, tops up if short, shuffles, returns {o, a}. */
function opts(correct, distractors, topUp) {
  const seen = new Set([String(correct)]);
  const out = [];
  for (const d of distractors) {
    const k = String(d);
    if (seen.has(k)) continue;
    seen.add(k); out.push(d);
    if (out.length === 3) break;
  }
  let guard = 0;
  while (out.length < 3 && guard++ < 200) {
    const d = topUp ? topUp(out.length, guard) : null;
    if (d === null || d === undefined) break;
    const k = String(d);
    if (seen.has(k)) continue;
    seen.add(k); out.push(d);
  }
  if (out.length < 3) return null; // caller discards
  const all = shuffle([correct, ...out]);
  return { o: all.map(String), a: all.findIndex(x => String(x) === String(correct)) };
}

const BANK = [];
let idc = 0;
function add(cat, type, q, built, e, f, fig) {
  if (!built) return false;
  const item = { id: `${type}-${String(++idc).padStart(4, '0')}`, cat, type, q, o: built.o, a: built.a, e, f };
  if (fig) item.fig = fig;
  BANK.push(item);
  return true;
}
/** Run gen() until `count` questions of this type have been added. */
function fill(count, gen) {
  let made = 0, guard = 0;
  while (made < count && guard++ < count * 60) { if (gen()) made++; }
  if (made < count) console.warn(`  ! only made ${made}/${count}`);
  return made;
}

/* =========================================================
   MATH & LOGIC
   ========================================================= */

/* ---- Number series ---- */
function genSeries() {
  const kind = ri(1, 8);
  let terms = [], next, rule, tip;
  if (kind === 1) {                              // arithmetic
    const a = ri(2, 20), d = ri(3, 12);
    for (let i = 0; i < 5; i++) terms.push(a + i * d);
    next = a + 5 * d;
    rule = `Each term increases by ${d}. ${terms[4]} + ${d} = ${next}.`;
    tip = 'Step 1 of the checklist — a constant difference. Should take four seconds.';
  } else if (kind === 2) {                       // geometric
    const a = ri(2, 6), r = pick([2, 3]);
    for (let i = 0; i < 4; i++) terms.push(a * Math.pow(r, i));
    next = a * Math.pow(r, 4);
    rule = `Each term is multiplied by ${r}. ${terms[3]} × ${r} = ${next}.`;
    tip = 'Differences grow fast, so skip straight to ratios — that is step 3.';
  } else if (kind === 3) {                       // growing gaps
    const a = ri(1, 9), g = ri(2, 6), inc = ri(2, 6);
    let cur = a, gap = g;
    terms.push(cur);
    for (let i = 0; i < 4; i++) { cur += gap; gap += inc; terms.push(cur); }
    next = cur + gap;
    rule = `The gaps are ${g}, ${g + inc}, ${g + 2 * inc}, ${g + 3 * inc} — each ${inc} larger than the last. The next gap is ${gap}, so ${cur} + ${gap} = ${next}.`;
    tip = 'Write the gaps under the series. Growing gaps is the commonest series on the test.';
  } else if (kind === 4) {                       // alternating x then -
    const a = ri(3, 9), m = pick([2, 3]), s = ri(2, 6);
    // The multiply must outrun the subtract, or the series flattens into a
    // repeat like 3, 6, 3, 6, 3 — which has no single defensible answer.
    if (a * (m - 1) <= s) return false;
    let cur = a; terms.push(cur);
    for (let i = 0; i < 4; i++) { cur = i % 2 === 0 ? cur * m : cur - s; terms.push(cur); }
    if (new Set(terms).size !== terms.length) return false;   // no repeated terms
    if (terms.some(t => t <= 0)) return false;
    const lastWasMul = (terms.length - 1) % 2 === 1;
    next = lastWasMul ? terms[terms.length - 1] - s : terms[terms.length - 1] * m;
    rule = `Two operations alternate: ×${m}, then −${s}. The last step was ${lastWasMul ? '×' + m : '−' + s}, so the next is ${lastWasMul ? '−' + s : '×' + m}, giving ${next}.`;
    tip = 'Jumpy differences mean alternation. Test two operations taking turns.';
  } else if (kind === 5) {                       // fibonacci-like
    let a = ri(1, 5), b = ri(2, 7);
    terms = [a, b];
    for (let i = 0; i < 3; i++) terms.push(terms[terms.length - 1] + terms[terms.length - 2]);
    next = terms[terms.length - 1] + terms[terms.length - 2];
    rule = `Each term is the sum of the two before it. ${terms[terms.length - 2]} + ${terms[terms.length - 1]} = ${next}.`;
    tip = 'Check "sum of the previous two" whenever the gaps look like the series itself.';
  } else if (kind === 6) {                       // squares or cubes offset
    const off = ri(0, 3), start = ri(1, 3);
    for (let i = 0; i < 5; i++) terms.push((start + i) * (start + i) + off);
    next = (start + 5) * (start + 5) + off;
    rule = off === 0
      ? `These are perfect squares: ${terms.map((t, i) => `${start + i}²`).join(', ')}. Next is ${start + 5}² = ${next}.`
      : `Each term is a square plus ${off}: ${start}²+${off}, ${start + 1}²+${off}, … Next is ${start + 5}²+${off} = ${next}.`;
    tip = 'Memorise squares to 15². Seeing 1, 4, 9 or 4, 9, 16 should trigger it instantly.';
  } else if (kind === 7) {                       // interleaved
    const a = ri(2, 8), d = ri(2, 5), b = ri(40, 80), d2 = ri(3, 9);
    terms = [a, b, a + d, b - d2, a + 2 * d, b - 2 * d2];
    if (terms.some(t => t <= 0)) return false;
    if (new Set(terms).size !== terms.length) return false;
    next = a + 3 * d;
    rule = `Two series are interleaved. The odd positions go ${a}, ${a + d}, ${a + 2 * d} (+${d} each), so the next is ${next}. The even positions are a separate series.`;
    tip = 'Read every second term as its own series. Long jumpy runs are usually interleaved.';
  } else {                                        // decreasing
    const a = ri(80, 200), d = ri(4, 15);
    for (let i = 0; i < 5; i++) terms.push(a - i * d);
    next = a - 5 * d;
    rule = `Each term decreases by ${d}. ${terms[4]} − ${d} = ${next}.`;
    tip = 'A falling series is still step 1 — take the differences first.';
  }
  const last = terms[terms.length - 1];
  const built = opts(next, [next + ri(1, 4), next - ri(1, 4), last + (last - terms[terms.length - 2]), next * 2 - last],
    (n, g) => next + (g % 2 ? g : -g) - 4);
  return add('math', 'series',
    `What number comes next in this series?<br><b>${terms.join(', ')}, ?</b>`,
    built, rule, tip);
}

/* ---- Basic arithmetic ---- */
function genArithmetic() {
  const kind = ri(1, 7);
  if (kind === 1) {                               // percent of
    const p = pick([5, 10, 15, 20, 25, 30, 40, 60, 75]);
    const n = pick([80, 120, 160, 200, 240, 300, 360, 400, 500]);
    const ans = n * p / 100;
    return add('math', 'arithmetic', `What is ${p}% of ${n}?`,
      opts(ans, [n * p / 1000, ans + n / 10, ans / 2, ans * 2], (i, g) => ans + g * 2),
      `10% of ${n} is ${n / 10}, so ${p}% is ${p / 10} × ${n / 10} = ${ans}.`,
      'Build every percentage from 10% and 1%. Never multiply longhand.');
  }
  if (kind === 2) {                               // reverse percent
    const p = pick([5, 10, 15, 20, 25, 40, 50]);
    const whole = pick([20, 40, 60, 80, 120, 200, 240]);
    const part = whole * p / 100;
    if (!Number.isInteger(part)) return false;
    return add('math', 'arithmetic', `${part} is ${p}% of what number?`,
      opts(whole, [part * p, whole / 2, whole * 2, part + p], (i, g) => whole + g * 5),
      `${part} ÷ ${p}% = ${part} ÷ ${p / 100} = ${whole}. Check: ${p}% of ${whole} is ${part}. ✓`,
      '"Is P% of what" always means divide. This shape appears several times per test.');
  }
  if (kind === 3) {                               // percent change
    const base = pick([40, 50, 60, 80, 120, 150, 200, 250]);
    const p = pick([10, 20, 25, 40, 50]);
    const up = rnd() < 0.5;
    const nv = up ? base * (100 + p) / 100 : base * (100 - p) / 100;
    if (!Number.isInteger(nv)) return false;
    const ans = p + '%';
    return add('math', 'arithmetic',
      `A figure ${up ? 'rose' : 'fell'} from ${base} to ${nv}. What was the percentage ${up ? 'increase' : 'decrease'}?`,
      opts(ans, [Math.round(Math.abs(nv - base) / nv * 100) + '%', (p + 5) + '%', (p * 2) + '%', Math.abs(nv - base) + '%'],
        (i, g) => (p + g * 3) + '%'),
      `The change is ${Math.abs(nv - base)}. Divide by the STARTING value: ${Math.abs(nv - base)} ÷ ${base} = ${p / 100} = ${p}%.`,
      'Always divide by the starting value. Dividing by the new one is the planted trap.');
  }
  if (kind === 4) {                               // ratio split
    const r1 = ri(1, 5), r2 = ri(2, 7);
    if (r1 === r2) return false;
    const unit = ri(3, 15), total = (r1 + r2) * unit;
    const larger = Math.max(r1, r2) * unit;
    return add('math', 'arithmetic',
      `Two amounts are in the ratio ${r1}:${r2} and total ${total}. What is the larger amount?`,
      opts(larger, [Math.min(r1, r2) * unit, total / 2, larger + unit, total - larger - unit], (i, g) => larger + g * unit),
      `There are ${r1 + r2} shares in total. ${total} ÷ ${r1 + r2} = ${unit} per share, so the larger amount is ${Math.max(r1, r2)} × ${unit} = ${larger}.`,
      'Add the ratio parts, divide, multiply. Three steps, never more.');
  }
  if (kind === 5) {                               // linear equation
    const x = ri(2, 12), a = ri(2, 6), b = ri(1, 15), c = ri(2, 9);
    if (a === c) return false;
    const d = a * x + b - c * x;
    return add('math', 'arithmetic', `If ${a}x + ${b} = ${c}x ${d >= 0 ? '+ ' + d : '− ' + -d}, what is x?`,
      opts(x, [x + 1, x - 1, x * 2, b], (i, g) => x + g + 1),
      `Collect the x terms on one side and the numbers on the other: ${Math.abs(a - c)}x = ${Math.abs(b - d)}, so x = ${x}.`,
      'x terms left, numbers right, in one motion. Two lines on paper.');
  }
  if (kind === 6) {                               // average
    const n = pick([4, 5]), mean = ri(10, 40);
    const vals = [];
    let sum = 0;
    for (let i = 0; i < n - 1; i++) { const v = mean + ri(-8, 8); vals.push(v); sum += v; }
    const missing = mean * n - sum;
    if (missing < 1) return false;
    return add('math', 'arithmetic',
      `A group of ${n} numbers has an average of ${mean}. ${n - 1} of them are ${vals.join(', ')}. What is the remaining number?`,
      opts(missing, [mean, missing + ri(2, 6), missing - ri(2, 6), sum], (i, g) => missing + g * 2),
      `The total must be ${mean} × ${n} = ${mean * n}. The known values sum to ${sum}, so the missing one is ${mean * n} − ${sum} = ${missing}.`,
      'Convert the average to a total immediately: average × count, then subtract.');
  }
  // fraction of a quantity
  const den = pick([3, 4, 5, 6, 8]), num = ri(1, den - 1);
  const whole = den * pick([12, 16, 20, 24, 30]);
  const ans = whole * num / den;
  return add('math', 'arithmetic', `What is ${num}/${den} of ${whole}?`,
    opts(ans, [whole / den, whole - ans, ans + whole / den, ans / 2], (i, g) => ans + g * 3),
    `${whole} ÷ ${den} = ${whole / den}, then × ${num} = ${ans}.`,
    'Divide by the bottom, multiply by the top. Always in that order — the numbers stay smaller.');
}

/* ---- Word problems ---- */
function genWordProblem() {
  const kind = ri(1, 9);
  const N = () => pick(W.NAMES);
  if (kind === 1) {                               // unit rate
    const rate = ri(8, 40), h1 = ri(2, 6), h2 = ri(5, 12);
    if (h1 === h2) return false;
    const total = rate * h1, ans = rate * h2;
    return add('math', 'word', `A machine produces ${total} units in ${h1} hours. At the same rate, how many units will it produce in ${h2} hours?`,
      opts(ans, [total * h2, rate, ans + rate, ans - rate], (i, g) => ans + g * rate),
      `The unit rate is ${total} ÷ ${h1} = ${rate} per hour. Over ${h2} hours that is ${rate} × ${h2} = ${ans}.`,
      'Find the per-unit rate first, then scale. Never cross-multiply under time pressure.');
  }
  if (kind === 2) {                               // discount then quantity
    const price = pick([40, 50, 60, 75, 80, 120]);
    const disc = pick([10, 20, 25, 40, 50]);
    const sale = price * (100 - disc) / 100;
    if (!Number.isInteger(sale)) return false;
    const qty = ri(6, 15), spend = sale * qty;
    return add('math', 'word', `A shop discounts all jackets by ${disc}%. If the regular price is $${price}, how many jackets can be bought for $${spend}?`,
      opts(qty, [qty + 1, qty - 1, Math.round(spend / price), qty + 2], (i, g) => qty + g + 1),
      `${disc}% off $${price} leaves $${sale}. ${spend} ÷ ${sale} = ${qty}.`,
      'Work out the sale price first. Dividing by the full price is the planted mistake.');
  }
  if (kind === 3) {                               // commission
    const base = pick([2000, 2500, 3000, 3200, 3500]);
    const rate = pick([2, 4, 5, 10]);
    const sales = pick([20000, 25000, 30000, 34000, 40000, 50000]);
    const total = base + sales * rate / 100;
    if (!Number.isInteger(total)) return false;
    return add('math', 'word', `A salesperson earns a $${base.toLocaleString()} base salary plus ${rate}% commission on sales. If total pay for the month was $${total.toLocaleString()}, what were the total sales?`,
      opts('$' + sales.toLocaleString(), ['$' + (total * 100 / rate).toLocaleString(), '$' + (sales + 2000).toLocaleString(), '$' + (sales - 2000).toLocaleString(), '$' + (sales / 2).toLocaleString()],
        (i, g) => '$' + (sales + g * 2000).toLocaleString()),
      `Commission = ${total.toLocaleString()} − ${base.toLocaleString()} = ${(total - base).toLocaleString()}. Sales = ${(total - base).toLocaleString()} ÷ ${rate}% = $${sales.toLocaleString()}.`,
      'Subtract the base salary BEFORE dividing. Dividing the total pay is the commonest error here.');
  }
  if (kind === 4) {                               // inverse work
    const w1 = ri(2, 6), h1 = ri(4, 18);
    const work = w1 * h1;
    const w2 = pick([2, 3, 4, 6, 8, 9, 12].filter(x => x !== w1 && work % x === 0));
    if (!w2) return false;
    const ans = work / w2;
    return add('math', 'word', `${w1} workers can complete a job in ${h1} hours. How long would ${w2} workers take, working at the same rate?`,
      opts(ans + ' hours', [(h1 * w2 / w1) + ' hours', (ans + 1) + ' hours', (ans - 1) + ' hours', h1 + ' hours'],
        (i, g) => (ans + g + 1) + ' hours'),
      `Total work = ${w1} × ${h1} = ${work} worker-hours. ${work} ÷ ${w2} = ${ans} hours.`,
      'More workers means less time. Keep workers × hours constant.');
  }
  if (kind === 5) {                               // successive percentages
    const start = pick([20, 40, 50, 80, 100, 200]);
    const p1 = pick([10, 20, 25]), p2 = pick([10, 20, 25, 50]);
    const v = start * (1 + p1 / 100) * (1 + p2 / 100);
    if (Math.round(v * 100) / 100 !== v) return false;
    const naive = start * (1 + (p1 + p2) / 100);
    return add('math', 'word', `An investor buys shares at $${start} each. They rise ${p1}% in the first year and a further ${p2}% in the second. What is the price after two years?`,
      opts('$' + v.toFixed(2), ['$' + naive.toFixed(2), '$' + (v + 1).toFixed(2), '$' + (v - 1).toFixed(2), '$' + (start * (1 + p2 / 100)).toFixed(2)],
        (i, g) => '$' + (v + g).toFixed(2)),
      `$${start} × ${1 + p1 / 100} = $${(start * (1 + p1 / 100)).toFixed(2)}, then × ${1 + p2 / 100} = $${v.toFixed(2)}.`,
      `Never add the percentages — ${p1 + p2}% of the start would give $${naive.toFixed(2)}, which is sitting there as an option.`);
  }
  if (kind === 6) {                               // combined hours
    const a = ri(15, 30) + (rnd() < 0.5 ? 0.5 : 0);
    const b = ri(18, 35);
    const wk = pick([3, 4, 5]);
    const ans = (a + b) * wk;
    if (!Number.isInteger(ans)) return false;
    return add('math', 'word', `One employee works ${a} hours per week on average and a colleague works ${b} hours. How many hours do they work combined over ${wk} weeks?`,
      opts(ans, [a * wk, b * wk, ans + wk, a + b], (i, g) => ans + g * 3),
      `${a} + ${b} = ${a + b} hours per week. ${a + b} × ${wk} = ${ans}.`,
      'Add first, then multiply once. Multiplying each person separately doubles the work.');
  }
  if (kind === 7) {                               // percentage of a subgroup
    const t1 = ri(10, 20), t2 = ri(10, 20);
    const d1 = ri(2, 8), d2 = ri(2, 8);
    const f1 = t1 - d1, f2 = t2 - d2, tot = f1 + f2;
    const pct = f1 / tot * 100;
    if (Math.round(pct) !== pct) return false;
    return add('math', 'word', `A race starts with ${t1} runners from Team A and ${t2} from Team B. ${d1} from Team A and ${d2} from Team B do not finish. What percentage of the runners who FINISH are from Team A?`,
      opts(pct + '%', [Math.round(t1 / (t1 + t2) * 100) + '%', (pct + 5) + '%', (pct - 5) + '%', Math.round(f1 / t1 * 100) + '%'],
        (i, g) => (pct + g * 4) + '%'),
      `Team A finishers: ${t1} − ${d1} = ${f1}. Team B: ${t2} − ${d2} = ${f2}. Total finishers ${tot}. ${f1} ÷ ${tot} = ${pct}%.`,
      'The question asks about finishers, not starters. Re-read what the denominator should be.');
  }
  if (kind === 8) {                               // two-hop ages
    const sisterAge = pick([30, 40, 50, 60]);
    const less = pick([10, 20, 25]);
    const steph = sisterAge * (100 - less) / 100;
    const mult = pick([2, 3, 4]);
    if (!Number.isInteger(steph) || steph % mult !== 0) return false;
    const daughter = steph / mult;
    const n = N();
    return add('math', 'word', `${n} is ${mult} times as old as her daughter and ${less}% younger than her sister. If her sister is ${sisterAge}, how old is ${n}'s daughter?`,
      opts(daughter, [sisterAge / mult, daughter + 1, daughter - 1, steph], (i, g) => daughter + g + 1),
      `${n} is ${less}% less than ${sisterAge}, which is ${steph}. Her daughter is ${steph} ÷ ${mult} = ${daughter}.`,
      'Two hops from one number. Write "sister → her → daughter" on paper as you read it.');
  }
  // distance / speed / time
  const speed = pick([40, 50, 60, 70, 80]);
  const t1 = ri(2, 5), t2 = ri(3, 8);
  if (t1 === t2) return false;
  const dist = speed * t1, ans = speed * t2;
  return add('math', 'word', `A train travels ${dist} miles in ${t1} hours. At the same speed, how far will it travel in ${t2} hours?`,
    opts(ans + ' miles', [(dist * t2) + ' miles', speed + ' miles', (ans + speed) + ' miles', (ans - speed) + ' miles'],
      (i, g) => (ans + g * speed) + ' miles'),
    `Speed = ${dist} ÷ ${t1} = ${speed} mph. Over ${t2} hours: ${speed} × ${t2} = ${ans} miles.`,
    'Unit rate first, then scale. Same shape as every other rate question.');
}

/* ---- Tables and graphs ---- */
function genTable() {
  const years = [2021, 2022, 2023, 2024];
  const label = pick([['Product A', 'Product B'], ['North', 'South'], ['Team 1', 'Team 2'], ['Online', 'In store']]);
  const rowA = years.map(() => ri(20, 90) * 10);
  const rowB = years.map(() => ri(20, 90) * 10);
  const table = `<table class="qtable"><tr><th></th>${years.map(y => `<th>${y}</th>`).join('')}</tr>` +
    `<tr><th>${label[0]}</th>${rowA.map(v => `<td>${v}</td>`).join('')}</tr>` +
    `<tr><th>${label[1]}</th>${rowB.map(v => `<td>${v}</td>`).join('')}</tr></table>`;
  const mode = ri(1, 3);
  if (mode === 1) {
    const i = ri(0, 3);
    const diff = rowA[i] - rowB[i];
    const ans = Math.abs(diff);
    return add('math', 'table', `${table}In ${years[i]}, what was the difference between ${label[0]} and ${label[1]}?`,
      opts(ans, [rowA[i] + rowB[i], ans + 10, ans - 10, rowA[i]], (i2, g) => ans + g * 20),
      `${Math.max(rowA[i], rowB[i])} − ${Math.min(rowA[i], rowB[i])} = ${ans}.`,
      'Read only the column you need. Do not scan the whole table.');
  }
  if (mode === 2) {
    const i = ri(0, 3);
    const tot = rowA[i] + rowB[i];
    return add('math', 'table', `${table}What was the combined total for ${years[i]}?`,
      opts(tot, [Math.abs(rowA[i] - rowB[i]), tot + 100, tot - 100, rowA[i]], (i2, g) => tot + g * 50),
      `${rowA[i]} + ${rowB[i]} = ${tot}.`,
      'One column, one addition. These are free points — take them fast.');
  }
  // percent change between two years for one row
  const i = ri(0, 2);
  const from = rowA[i], to = rowA[i + 1];
  const pct = Math.round((to - from) / from * 1000) / 10;
  if (!Number.isFinite(pct) || Math.abs(pct) > 200) return false;
  const ans = (pct > 0 ? '+' : '') + pct + '%';
  return add('math', 'table', `${table}By what percentage did ${label[0]} change from ${years[i]} to ${years[i + 1]}?`,
    opts(ans, [(pct > 0 ? '+' : '') + Math.round((to - from) / to * 1000) / 10 + '%', (pct > 0 ? '+' : '') + (pct + 5) + '%', (pct > 0 ? '+' : '') + (pct - 5) + '%', (to - from) + '%'],
      (i2, g) => (pct > 0 ? '+' : '') + (Math.round((pct + g * 3) * 10) / 10) + '%'),
    `Change is ${to - from}. Divide by the starting value ${from}: ${to - from} ÷ ${from} = ${pct}%.`,
    'Percent change always divides by the earlier figure.');
}

/* =========================================================
   VERBAL
   ========================================================= */

function genAnalogy() {
  const fam = pick(W.ANALOGY_FAMILIES);
  const [p1, p2] = sample(fam.pairs, 2);
  if (!p2) return false;
  const distractors = sample(fam.distractors.concat(fam.pairs.filter(p => p !== p2).map(p => p[1])), 5)
    .filter(d => d !== p2[1]);
  return add('verbal', 'analogy',
    `<b>${p1[0].toUpperCase()}</b> is to <b>${p1[1].toUpperCase()}</b> as <b>${p2[0].toUpperCase()}</b> is to ?`,
    opts(p2[1], distractors, () => null),
    `${p1[0]} ${fam.rel} ${p1[1]}; in the same way ${p2[0]} ${fam.rel} ${p2[1]}.`,
    `Say the relationship as a sentence before you look at the options: "${p1[0]} ${fam.rel} ${p1[1]}".`);
}

function genAntonym() {
  const [word, opp, trap, u1, u2] = pick(W.ANTONYMS);
  return add('verbal', 'antonym', `Which word is most nearly the OPPOSITE of <b>${word.toUpperCase()}</b>?`,
    opts(opp, [trap, u1, u2], () => null),
    `${word} and ${opp} are opposites. "${trap}" is close to ${word} in meaning, not opposite to it.`,
    'Eliminate the near-synonym first — the test plants one in every antonym item.');
}

function genSynonym() {
  const [word, syn, trap, u1, u2] = pick(W.SYNONYMS);
  return add('verbal', 'synonym', `Which word is CLOSEST in meaning to <b>${word.toUpperCase()}</b>?`,
    opts(syn, [trap, u1, u2], () => null),
    `${word} means ${syn}. "${trap}" is its opposite, which is the planted trap.`,
    'Decide the word\'s tone first — positive, negative or neutral. That alone kills two options.');
}

function genSentence() {
  const [s, correct, wrong] = pick(W.SENTENCES);
  return add('verbal', 'sentence', `Choose the word that best completes the sentence.<br><i>${s}</i>`,
    opts(correct, wrong, () => null),
    `"${correct}" is the only option consistent with the rest of the sentence.`,
    'Read the sentence with the blank and predict the word before looking. Then match.');
}

function genDetail() {
  const mode = ri(1, 2);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '0123456789';
  const mk = () => {
    const style = ri(1, 3);
    if (style === 1) return Array.from({ length: 6 }, () => digits[ri(0, 9)]).join('');
    if (style === 2) return chars[ri(0, 23)] + chars[ri(0, 23)] + digits[ri(0, 9)] + '-' + digits[ri(0, 9)] + chars[ri(0, 23)];
    return Array.from({ length: 3 }, () => chars[ri(0, 23)]).join('') + digits[ri(0, 9)] + digits[ri(0, 9)];
  };
  const mutate = s => {
    const a = s.split('');
    const idxs = a.map((c, i) => /[A-Z0-9]/.test(c) ? i : -1).filter(i => i >= 0);
    if (idxs.length < 2) return null;
    if (rnd() < 0.5) {                                 // swap two neighbours
      for (let t = 0; t < 10; t++) {
        const i = idxs[ri(0, idxs.length - 2)];
        const j = i + 1;
        if (a[i] !== a[j] && /[A-Z0-9]/.test(a[j])) { [a[i], a[j]] = [a[j], a[i]]; return a.join(''); }
      }
      return null;
    }
    const i = pick(idxs);                              // change one character
    const pool = /[0-9]/.test(a[i]) ? digits : chars;
    let c = pool[ri(0, pool.length - 1)];
    if (c === a[i]) c = pool[(pool.indexOf(c) + 1) % pool.length];
    a[i] = c;
    return a.join('');
  };

  if (mode === 1) {                                    // how many pairs match
    const pairs = [];
    let matches = 0;
    for (let i = 0; i < 3; i++) {
      const s = mk();
      if (rnd() < 0.45) { pairs.push([s, s]); matches++; }
      else { const m = mutate(s); if (!m) return false; pairs.push([s, m]); }
    }
    return add('verbal', 'detail',
      `How many of these pairs are EXACTLY the same?<br>${pairs.map(p => `<code>${p[0]}</code> &nbsp;/&nbsp; <code>${p[1]}</code>`).join('<br>')}`,
      opts(matches, [0, 1, 2, 3].filter(n => n !== matches), () => null),
      `${matches} pair${matches === 1 ? '' : 's'} match exactly. Check character by character in chunks of three.`,
      'Read each string in chunks of three. Sound catches swaps that the eye slides past.');
  }
  // which one differs
  const base = mk();
  const odd = mutate(base);
  if (!odd) return false;
  const all = shuffle([base, base, base, odd]);
  const ansIdx = all.indexOf(odd);
  return add('verbal', 'detail', `Which of these is DIFFERENT from the others?`,
    { o: all.map(s => `<code>${s}</code>`), a: ansIdx },
    `Three read <code>${base}</code>; the odd one is <code>${odd}</code>.`,
    'Compare the middle of each string first — that is where differences get planted.');
}

/* =========================================================
   LOGIC (counted inside verbal on the real test)
   ========================================================= */

function genSyllogism() {
  const kind = ri(1, 6);
  const [A, B, C] = sample(W.NONSENSE, 3);
  const grp = pick(W.OCCUPATIONS), trait = pick(W.TRAITS), name = pick(W.NAMES);

  if (kind === 1) {                                   // valid: all + member
    return add('verbal', 'syllogism',
      `All ${grp} at the firm ${trait}. ${name} is one of the ${grp} at the firm. Which must be true?`,
      opts(`${name} ${trait.replace(/^(\w+)/, (m) => m + (m.endsWith('s') ? '' : ''))}`,
        [`${name} does not ${trait}`, `${name} is not one of the ${grp}`, 'Cannot be determined'], () => null),
      `${name} is inside the group, and everything in that group has the property. The conclusion is forced.`,
      '"All X are Y" plus "this is an X" is the one pattern you can answer without drawing.');
  }
  if (kind === 2) {                                   // invalid: all + some
    return add('verbal', 'syllogism',
      `All ${A} are ${B}. Some ${B} are ${C}. Therefore some ${A} are ${C}. Is this conclusion valid?`,
      opts('It cannot be determined', ['Yes, it is valid', 'No, it is definitely false', `Only if all ${B} are ${C}`], () => null),
      `The ${B} that are ${C} might be entirely outside ${A}. The premises allow the conclusion but do not force it.`,
      'Draw it: put the overlap away from the inner circle. If that picture is possible, the answer is "cannot be determined".');
  }
  if (kind === 3) {                                   // valid: some + all
    return add('verbal', 'syllogism',
      `Some ${A} are ${B}. All ${B} are ${C}. Does it follow that some ${A} are ${C}?`,
      opts('Yes', ['No', `Only if all ${A} are ${B}`, 'It cannot be determined'], () => null),
      `The ${A} that are ${B} must also be ${C}, because every ${B} is. So at least some ${A} are ${C}.`,
      '"Some A are B, all B are C" gives "some A are C". Always valid — learn it as a shape.');
  }
  if (kind === 4) {                                   // valid: no + all
    const sg = w => w.replace(/s$/, '');              // the word lists are plural
    return add('verbal', 'syllogism',
      `No ${B} are ${C}. All ${A} are ${B}. Can a ${sg(A)} be a ${sg(C)}?`,
      opts('No', ['Yes', `Only some ${A}`, 'It cannot be determined'], () => null),
      `${A} sits entirely inside ${B}, and ${B} does not overlap ${C} at all. So no ${sg(A)} is a ${sg(C)}.`,
      'Nonsense words are deliberate — they stop you reasoning from the real world. Just draw the circles.');
  }
  // cause  : the "if" clause, present tense
  // caused : the same event, past tense (an answer option)
  // notCaused : its negation, past tense (the contrapositive conclusion)
  // eff / negEff : the result, past tense, asserted and denied
  const COND = [
    { cause: 'the alarm sounds', caused: 'The alarm sounded', notCaused: 'The alarm did not sound', effect: 'the building is evacuated', eff: 'the building was evacuated', negEff: 'the building was not evacuated', other: 'The alarm was faulty', alt: 'a drill was scheduled' },
    { cause: 'the shipment is late', caused: 'The shipment was late', notCaused: 'The shipment was not late', effect: 'the client is notified', eff: 'the client was notified', negEff: 'the client was not notified', other: 'The client complained', alt: 'the invoice changed' },
    { cause: 'it rains', caused: 'It rained', notCaused: 'It did not rain', effect: 'the match is cancelled', eff: 'the match was cancelled', negEff: 'the match was not cancelled', other: 'The pitch flooded', alt: 'the referee was ill' },
    { cause: 'the server fails', caused: 'The server failed', notCaused: 'The server did not fail', effect: 'an alert is sent', eff: 'an alert was sent', negEff: 'no alert was sent', other: 'The network was slow', alt: 'a deploy ran' },
    { cause: 'the budget is exceeded', caused: 'The budget was exceeded', notCaused: 'The budget was not exceeded', effect: 'the board is informed', eff: 'the board was informed', negEff: 'the board was not informed', other: 'The audit was early', alt: 'a director resigned' },
    { cause: 'a test fails', caused: 'A test failed', notCaused: 'No test failed', effect: 'the build is blocked', eff: 'the build was blocked', negEff: 'the build was not blocked', other: 'The branch was stale', alt: 'the runner timed out' }
  ];
  const c = pick(COND);
  if (kind === 5) {                                   // contrapositive — valid
    return add('verbal', 'syllogism',
      `If ${c.cause}, ${c.effect}. However, ${c.negEff}. What follows?`,
      opts(c.notCaused, [c.caused, c.other, 'It cannot be determined'], () => null),
      `Denying the result denies the cause: since ${c.negEff}, ${c.cause} cannot have happened.`,
      'Deny the result → deny the cause. The only if–then inference that is always safe.');
  }
  // affirming the consequent — invalid
  return add('verbal', 'syllogism',
    `If ${c.cause}, ${c.effect}. It is known that ${c.eff}. Does it follow that ${c.cause}?`,
    opts('It cannot be determined', ['Yes', 'No', `Only if ${c.alt}`], () => null),
    `The effect can have other causes — ${c.alt}, for instance. Confirming the result tells you nothing about the cause.`,
    'Confirm the result → uncertain. The single most common logic trap on the test.');
}

function genOrdering() {
  const n = ri(3, 5);
  const people = sample(W.NAMES, n);
  const attr = pick([
    { adj: 'taller', noun: 'tallest', low: 'shortest' },
    { adj: 'older', noun: 'oldest', low: 'youngest' },
    { adj: 'faster', noun: 'fastest', low: 'slowest' },
    { adj: 'heavier', noun: 'heaviest', low: 'lightest' },
    { adj: 'more experienced', noun: 'most experienced', low: 'least experienced' },
    { adj: 'better paid', noun: 'best paid', low: 'worst paid' }
  ]);
  const clues = [];
  for (let i = 0; i < n - 1; i++) clues.push(`${people[i]} is ${attr.adj} than ${people[i + 1]}.`);
  const askTop = rnd() < 0.5;
  const ans = askTop ? people[0] : people[n - 1];
  const others = people.filter(p => p !== ans);
  return add('verbal', 'ordering',
    `${shuffle(clues).join(' ')} Who is the ${askTop ? attr.noun : attr.low}?`,
    opts(ans, others.concat(['Cannot be determined']), () => null),
    `The chain is ${people.join(' > ')}, so ${ans} is the ${askTop ? attr.noun : attr.low}.`,
    'Write the chain with > signs as you read each clue. Never hold an ordering in your head.');
}

/* =========================================================
   SPATIAL  (figure specs; the page renders them)
   ========================================================= */

const DIRS = ['up', 'right', 'down', 'left'];
const QUADS = ['tl', 'tr', 'br', 'bl'];
const QNAME = { tl: 'top-left', tr: 'top-right', br: 'bottom-right', bl: 'bottom-left' };
// Clockwise ring of a 3x3 grid, by cell index.
const RING = [0, 1, 2, 5, 8, 7, 6, 3];
const POLYNAME = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon', 7: 'heptagon', 8: 'octagon' };

/** Options built from figure specs: correct first, then shuffled. */
function figOpts(correct, wrongs) {
  if (wrongs.length < 3) return null;
  const all = shuffle([correct, ...wrongs.slice(0, 3)]);
  const key = JSON.stringify(correct);
  return { o: all.map(f => JSON.stringify(f)), a: all.findIndex(f => JSON.stringify(f) === key) };
}

function genShapeSeries() {
  const kind = ri(1, 7);

  if (kind === 1) {                                    // arrow rotation, 90° steps
    const cw = rnd() < 0.5, start = ri(0, 3);
    const at = i => DIRS[((start + (cw ? i : -i)) % 4 + 4) % 4];
    const seq = [0, 1, 2].map(i => ({ k: 'arrow', d: at(i) }));
    const ans = { k: 'arrow', d: at(3) };
    const wrongs = DIRS.filter(d => d !== ans.d).map(d => ({ k: 'arrow', d }));
    return add('spatial', 'shapeseries', 'Which figure comes next in the sequence?',
      figOpts(ans, wrongs),
      `The arrow turns 90° ${cw ? 'clockwise' : 'anticlockwise'} each step, so the next points ${ans.d}.`,
      'One attribute — rotation. Fix the direction from the first two figures, then stop looking.',
      { mode: 'series', seq });
  }

  if (kind === 2) {                                    // flag rotation, 45° steps
    const cw = rnd() < 0.5, start = ri(0, 7), step = pick([1, 2]);
    const at = i => (((start + (cw ? i : -i) * step) % 8) + 8) % 8;
    const seq = [0, 1, 2].map(i => ({ k: 'flag', r: at(i) }));
    const ans = { k: 'flag', r: at(3) };
    const wrongs = [0, 1, 2, 3, 4, 5, 6, 7].filter(r => r !== ans.r).map(r => ({ k: 'flag', r }));
    return add('spatial', 'shapeseries', 'Which figure comes next in the sequence?',
      figOpts(ans, sample(wrongs, 3)),
      `The marker rotates ${step * 45}° ${cw ? 'clockwise' : 'anticlockwise'} each step.`,
      'Work out the step size from figures one and two, then apply it once more. Do not re-derive it.',
      { mode: 'series', seq });
  }

  if (kind === 3) {                                    // shaded quadrant cycles
    const cw = rnd() < 0.5, start = ri(0, 3);
    const at = i => QUADS[((start + (cw ? i : -i)) % 4 + 4) % 4];
    const seq = [0, 1, 2].map(i => ({ k: 'quad', p: at(i) }));
    const ans = { k: 'quad', p: at(3) };
    const wrongs = QUADS.filter(p => p !== ans.p).map(p => ({ k: 'quad', p }));
    return add('spatial', 'shapeseries', 'Which figure comes next in the sequence?',
      figOpts(ans, wrongs),
      `The shaded quarter moves ${cw ? 'clockwise' : 'anticlockwise'} one position each step, landing in the ${QNAME[ans.p]}.`,
      'Shading moving inside a fixed frame is always a cycle. Pick the direction and follow it round.',
      { mode: 'series', seq });
  }

  if (kind === 4) {                                    // filled cell travels the ring
    const cw = rnd() < 0.5, start = ri(0, 7), step = pick([1, 2]);
    const at = i => RING[(((start + (cw ? i : -i) * step) % 8) + 8) % 8];
    const seq = [0, 1, 2].map(i => ({ k: 'grid', on: [at(i)] }));
    const ans = { k: 'grid', on: [at(3)] };
    const wrongs = RING.filter(c => c !== at(3)).map(c => ({ k: 'grid', on: [c] }));
    return add('spatial', 'shapeseries', 'Which figure comes next in the sequence?',
      figOpts(ans, sample(wrongs, 3)),
      `The filled square travels ${cw ? 'clockwise' : 'anticlockwise'} around the edge of the grid, ${step} position${step > 1 ? 's' : ''} per step.`,
      'Track the single moving element around the border. Ignore the empty cells entirely.',
      { mode: 'series', seq });
  }

  if (kind === 5) {                                    // count of filled cells grows
    const start = ri(1, 3), order = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const seq = [0, 1, 2].map(i => ({ k: 'grid', on: order.slice(0, start + i).sort((a, b) => a - b) }));
    const ansN = start + 3;
    if (ansN > 7) return false;
    const ans = { k: 'grid', on: order.slice(0, ansN).sort((a, b) => a - b) };
    const wrongs = [start, start + 1, start + 2, start + 4, start + 5]
      .filter(n => n !== ansN && n >= 1 && n <= 9)
      .map(n => ({ k: 'grid', on: order.slice(0, n).sort((a, b) => a - b) }));
    return add('spatial', 'shapeseries', 'Which figure comes next in the sequence?',
      figOpts(ans, sample(wrongs, 3)),
      `One extra square is filled at each step: ${start}, ${start + 1}, ${start + 2}, then ${ansN}.`,
      'Count filled squares. Their arrangement is deliberate noise — only the count changes.',
      { mode: 'series', seq });
  }

  if (kind === 6) {                                    // dot count
    const start = ri(1, 3);
    const seq = [0, 1, 2].map(i => ({ k: 'dots', n: start + i }));
    const ansN = start + 3;
    if (ansN > 6) return false;
    const ans = { k: 'dots', n: ansN };
    const wrongs = [1, 2, 3, 4, 5, 6].filter(n => n !== ansN).map(n => ({ k: 'dots', n }));
    return add('spatial', 'shapeseries', 'Which figure comes next in the sequence?',
      figOpts(ans, sample(wrongs, 3)),
      `One dot is added each step, so the next figure holds ${ansN}.`,
      'Count. Where the dots sit is decoration; only the number is moving.',
      { mode: 'series', seq });
  }

  // polygon side count, sometimes decreasing
  const up = rnd() < 0.6;
  const start = up ? ri(3, 4) : ri(6, 8);
  const at = i => start + (up ? i : -i);
  const seq = [0, 1, 2].map(i => ({ k: 'poly', n: at(i) }));
  const ansN = at(3);
  if (ansN < 3 || ansN > 8) return false;
  const ans = { k: 'poly', n: ansN };
  const wrongs = [3, 4, 5, 6, 7, 8].filter(n => n !== ansN).map(n => ({ k: 'poly', n }));
  return add('spatial', 'shapeseries', 'Which figure comes next in the sequence?',
    figOpts(ans, sample(wrongs, 3)),
    `The number of sides ${up ? 'increases' : 'decreases'} by one each step, so the next shape is a ${POLYNAME[ansN]} (${ansN} sides).`,
    'Count sides. Nothing else in these figures changes.',
    { mode: 'series', seq });
}

function genMatrix() {
  const kind = ri(1, 4);

  if (kind === 1) {                                    // quadrant cycles along rows
    const order = shuffle(QUADS);
    const cells = [];
    for (let i = 0; i < 8; i++) cells.push({ k: 'quad', p: order[i % 4] });
    const ans = { k: 'quad', p: order[8 % 4] };
    const wrongs = QUADS.filter(p => p !== ans.p).map(p => ({ k: 'quad', p }));
    return add('spatial', 'matrix', 'Which figure completes the 3 × 3 grid?',
      figOpts(ans, wrongs),
      `Reading left to right and top to bottom, the shaded quarter runs through the same four positions over and over. The ninth cell continues that cycle into the ${QNAME[ans.p]}.`,
      'Read a matrix like a sentence: left to right, top to bottom. The rule is rarely per-column.',
      { mode: 'matrix', cells });
  }

  if (kind === 2) {                                    // dots increase across each row
    const base = ri(1, 3);
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { if (r === 2 && c === 2) break; cells.push({ k: 'dots', n: base + c }); }
    const ansN = base + 2;
    if (ansN > 6) return false;
    const ans = { k: 'dots', n: ansN };
    const wrongs = [1, 2, 3, 4, 5, 6].filter(n => n !== ansN).map(n => ({ k: 'dots', n }));
    return add('spatial', 'matrix', 'Which figure completes the 3 × 3 grid?',
      figOpts(ans, sample(wrongs, 3)),
      `Every row runs ${base}, ${base + 1}, ${base + 2} dots from left to right. The missing cell ends the third row, so it holds ${ansN}.`,
      'Check the rows first. If rows explain it, never bother with the columns.',
      { mode: 'matrix', cells });
  }

  if (kind === 3) {                                    // sides increase down each column
    const base = ri(3, 5);
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { if (r === 2 && c === 2) break; cells.push({ k: 'poly', n: base + r }); }
    const ansN = base + 2;
    if (ansN > 8) return false;
    const ans = { k: 'poly', n: ansN };
    const wrongs = [3, 4, 5, 6, 7, 8].filter(n => n !== ansN).map(n => ({ k: 'poly', n }));
    return add('spatial', 'matrix', 'Which figure completes the 3 × 3 grid?',
      figOpts(ans, sample(wrongs, 3)),
      `Each ROW holds one shape: ${POLYNAME[base]}s, then ${POLYNAME[base + 1]}s, then ${POLYNAME[ansN]}s. The missing cell is in the last row, so it is a ${POLYNAME[ansN]}.`,
      'When rows do not explain it, the rule runs down the columns. Check both before guessing.',
      { mode: 'matrix', cells });
  }

  // rotation advances across the grid
  const step = pick([1, 2]);
  const start = ri(0, 7);
  const at = i => (start + i * step) % 8;
  const cells = [];
  for (let i = 0; i < 8; i++) cells.push({ k: 'flag', r: at(i) });
  const ans = { k: 'flag', r: at(8) };
  const wrongs = [0, 1, 2, 3, 4, 5, 6, 7].filter(r => r !== ans.r).map(r => ({ k: 'flag', r }));
  return add('spatial', 'matrix', 'Which figure completes the 3 × 3 grid?',
    figOpts(ans, sample(wrongs, 3)),
    `The marker turns ${step * 45}° clockwise from each cell to the next, reading left to right and top to bottom.`,
    'Treat the nine cells as one long sequence, not as a grid.',
    { mode: 'matrix', cells });
}

function genOddOne() {
  const kind = ri(1, 5);

  if (kind === 1) {                                    // dot count mismatch
    const n = ri(2, 4), oddIdx = ri(0, 3);
    const shapes = sample(['sq', 'tri', 'circ', 'pent'], 4);
    const oddN = n + (rnd() < 0.5 && n > 1 ? -1 : 1);
    const set = shapes.map((s, i) => ({ k: 'shapedots', s, n: i === oddIdx ? oddN : n }));
    return add('spatial', 'oddone', 'Which figure does NOT belong?',
      { o: ['A', 'B', 'C', 'D'], a: oddIdx },
      `Three figures contain ${n} dots; ${'ABCD'[oddIdx]} contains ${oddN}. The outer shape is irrelevant.`,
      'Count first, always. Counting finds the outsider faster than comparing shapes.',
      { mode: 'set', cells: set });
  }

  if (kind === 2) {                                    // reflection among rotations
    const oddIdx = ri(0, 3);
    const rots = sample([0, 90, 180, 270], 4);
    const set = rots.map((r, i) => ({ k: 'ell', rot: r, flip: i === oddIdx }));
    return add('spatial', 'oddone', 'Which figure does NOT belong?',
      { o: ['A', 'B', 'C', 'D'], a: oddIdx },
      `Three figures are rotations of one L-shape. ${'ABCD'[oddIdx]} is its mirror image, which no rotation can produce.`,
      'Equal element counts means it is rotation versus reflection. Trace the foot of the L.',
      { mode: 'set', cells: set });
  }

  if (kind === 3) {                                    // side count mismatch, rotated
    const common = ri(3, 6), oddIdx = ri(0, 3);
    const set = [0, 1, 2, 3].map(i => ({ k: 'poly', n: i === oddIdx ? common + 1 : common, rot: ri(0, 5) * 24 }));
    return add('spatial', 'oddone', 'Which figure does NOT belong?',
      { o: ['A', 'B', 'C', 'D'], a: oddIdx },
      `Three shapes have ${common} sides; ${'ABCD'[oddIdx]} has ${common + 1}. Rotating them disguises it.`,
      'Rotation is camouflage. Count sides and ignore orientation completely.',
      { mode: 'set', cells: set });
  }

  if (kind === 4) {                                    // filled-cell count mismatch
    const n = ri(3, 5), oddIdx = ri(0, 3);
    const set = [0, 1, 2, 3].map(i => {
      const count = i === oddIdx ? n + 1 : n;
      return { k: 'grid', on: sample([0, 1, 2, 3, 4, 5, 6, 7, 8], count).sort((a, b) => a - b) };
    });
    return add('spatial', 'oddone', 'Which figure does NOT belong?',
      { o: ['A', 'B', 'C', 'D'], a: oddIdx },
      `Three grids have ${n} filled squares; ${'ABCD'[oddIdx]} has ${n + 1}. Their arrangement is deliberately varied to hide it.`,
      'When arrangements all differ, the rule is almost always the count. Count and move.',
      { mode: 'set', cells: set });
  }

  // shading mismatch: one shape unshaded among shaded (or vice versa)
  const oddIdx = ri(0, 3);
  const n = ri(3, 6);
  const shadedMajority = rnd() < 0.5;
  const set = [0, 1, 2, 3].map(i => ({ k: 'poly', n, rot: ri(0, 5) * 24, fill: i === oddIdx ? !shadedMajority : shadedMajority }));
  return add('spatial', 'oddone', 'Which figure does NOT belong?',
    { o: ['A', 'B', 'C', 'D'], a: oddIdx },
    `All four are ${POLYNAME[n]}s, but three are ${shadedMajority ? 'shaded' : 'unshaded'} and ${'ABCD'[oddIdx]} is ${shadedMajority ? 'unshaded' : 'shaded'}.`,
    'When counts and shapes match, check shading next. It is the second thing on the checklist.',
    { mode: 'set', cells: set });
}

/* =========================================================
   BUILD
   ========================================================= */
// Counts target the CCAT's own roughly one-third-per-category split.
// These are requests, not guarantees: identical questions are dropped after
// generation, so each family is asked for a little more than it must yield.
const PLAN = [
  // Math & logic
  ['Number series', 62, genSeries],
  ['Basic arithmetic', 70, genArithmetic],
  ['Word problems', 78, genWordProblem],
  ['Tables & graphs', 22, genTable],
  // Verbal
  ['Analogies', 58, genAnalogy],
  ['Antonyms', 52, genAntonym],
  ['Synonyms', 28, genSynonym],
  ['Sentence completion', 44, genSentence],
  ['Attention to detail', 30, genDetail],
  ['Syllogisms', 14, genSyllogism],
  ['Ordering', 12, genOrdering],
  // Spatial
  ['Shape series', 105, genShapeSeries],
  ['Matrix patterns', 55, genMatrix],
  ['Odd one out', 80, genOddOne]
];

console.log('Generating question bank…');
for (const [name, n, gen] of PLAN) {
  const made = fill(n, gen);
  console.log(`  ${name.padEnd(22)} ${made}`);
}

/* ---------- de-duplicate identical question texts ---------- */
const seenQ = new Set();
const unique = BANK.filter(q => {
  // The figure spec is part of a spatial question's identity: two items can
  // share an option set and still be different questions.
  const key = q.type + '|' + q.q + '|' + q.o.join('|') + '|' + (q.fig ? JSON.stringify(q.fig) : '');
  if (seenQ.has(key)) return false;
  seenQ.add(key); return true;
});
const dropped = BANK.length - unique.length;

const counts = {};
for (const q of unique) {
  counts[q.cat] = (counts[q.cat] || 0) + 1;
  counts['type:' + q.type] = (counts['type:' + q.type] || 0) + 1;
}

const out = `/* Generated by scripts/generate-bank.js — do not edit by hand.
   Regenerate with: node scripts/generate-bank.js */
window.CCAT_BANK = ${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), total: unique.length, counts, questions: unique })};
`;
fs.writeFileSync(path.join(__dirname, '..', 'bank.js'), out);

console.log(`\n  duplicates dropped: ${dropped}`);
console.log(`  TOTAL: ${unique.length} questions`);
console.log(`  verbal ${counts.verbal} | math ${counts.math} | spatial ${counts.spatial}`);
console.log(`  written to bank.js (${(out.length / 1024).toFixed(0)} KB)`);

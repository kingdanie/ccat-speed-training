# CCAT Speed Training

A self-contained training app for the Criteria Cognitive Aptitude Test (CCAT), the 50-question / 15-minute screen used in Crossover's hiring process.

The whole thing is one HTML file with no build step, no dependencies and no network calls. Open `index.html` in a browser and it runs.

## Why it exists

The CCAT gives you about 18 seconds per question and almost nobody finishes. Passing is a pacing problem, not a knowledge problem, so this app drills technique against a stopwatch rather than teaching content.

## What's in it

**Stage 1 — Pacing**
How the test is scored, and the triage rule: five seconds to find a path, a 25-second ceiling, guess and never return.

**Stage 2 — Seven technique modules**

| Module | Teaches |
|---|---|
| Number series | Checking differences → second differences → ratios → alternation, in that fixed order |
| Math & word problems | Percentage shortcuts, reverse percentages, rates, inverse work problems, ratios |
| Verbal reasoning | The sentence method for analogies, tone-flipping for antonyms, category-finding for odd-one-out |
| Logic & deduction | Two-circle syllogism diagrams, the contrapositive rule, ordering chains |
| Spatial reasoning | The five-attribute checklist: rotation, shading, count, position, reflection |
| Attention to detail | Chunked comparison, and where differences get planted |
| Exam-style mixed set | Real question wording with nothing signalling which technique applies |

Each module gives the method, two worked examples showing where the seconds go, then a timed drill. Every question returns the reasoning and a speed tip the moment you answer.

**Stage 3 — Full simulation**
50 questions in 15 minutes, drawn from all categories, with a per-category breakdown afterwards telling you which types to commit to and which to guess on quickly.

78 practice questions in all.

## The stopwatch

Every drill question is timed and colour-coded against the real budget:

- **Blue** — under 18 seconds, on pace
- **Amber** — 18 to 25 seconds, over the average
- **Red** — past 25 seconds, where tests are lost

## Progress tracking

Results are held in memory for the session and shown in the progress view, which marks each module Fast, Slow or Needs work based on accuracy and average time. Refreshing clears them — finish a drill before leaving the page.

## Running it

Open `index.html`. That's the whole setup.

To reach it from a phone, enable GitHub Pages on this repo (Settings → Pages → deploy from the default branch, root folder) and it will serve at the Pages URL.

## Suggested schedule

- **Days 1–3** — one module per day, read then drill. Reread the technique for anything under 70% accuracy.
- **Days 4–12** — one simulation daily, then redo the drills for your two weakest categories.
- **Final three days** — two simulations a day. Stop learning new methods; rehearse the triage rule until it's automatic.

## A note on the questions

All 78 questions are original, written to match the CCAT's question archetypes. They aren't retrieved test items. Crossover requires a proctored retest under webcam monitoring after an offer, so the point here is to build the underlying speed, not to memorise answers.

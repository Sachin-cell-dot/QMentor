# QMentor — Prediction-First Quantum Learning Layer

**SIH Problem Statement ID:** SIH26140 · **Theme:** Smart Education · **Title:** AI-Based Interactive Quantum Algorithm Learning Platform

> This README is the single source of truth for this repository. Read it in full before writing
> or modifying any code. It contains the official problem statement, what is actually built
> today, the exact build order for what's next, and the constraints that must never be
> violated.
>
> If a future instruction conflicts with anything in this file, stop and flag the conflict
> instead of silently choosing one side.

---

## 1. Official Problem Statement (verbatim intent, condensed)

**Background:** Quantum computing is transformative but hard to teach because qubits,
superposition, entanglement, and quantum algorithms are abstract. Existing learning resources
are static, heavily theoretical, and lack hands-on interaction. Limited access to real quantum
hardware further restricts practical learning.

**Description:** Build an AI-powered interactive web platform where students, researchers, and
professionals can learn, design, simulate, and visualize quantum algorithms. It should offer
structured learning modules (fundamentals, circuit design, standard algorithms), let users build
circuits via drag-and-drop or code, execute them on multiple simulators (Qiskit Aer, PennyLane,
Cirq, qBraid, etc.), visualize quantum states and measurement outcomes, and provide AI-assisted
explanations, error detection, optimization suggestions, and personalized learning paths.

**Objectives (official):**

- Interactive web platform for learning quantum computing and algorithms.
- Graphical (drag-and-drop) and code-based circuit design tools.
- Real-time execution/simulation across multiple backends.
- AI-assisted tutoring: concept explanation, code generation, debugging, personalized
  recommendations.
- Visualization of quantum states, Bloch spheres, measurement probabilities, execution results.
- Assessment modules, coding challenges, progress tracking, instructor dashboards.

**Expected Solution (official):** A comprehensive platform integrating education, programming,
simulation, visualization, and intelligent tutoring, with structured content, visual circuit
builders, code editors, multi-framework simulation, AI assistance, assessment tools, and progress
analytics — scalable and accessible.

*(Full official PDF delivery table was not accessible during research — verify directly if scope
questions come up later. Nothing below contradicts the above; it is a deliberately narrowed MVP
slice of it.)*

---

## 2. Why We Are Not Building the Full Checklist

Prior-art research shows drag-and-drop circuit builders, Bloch-sphere visualization, and
Qiskit-based simulation are already mature and well-solved (IBM Quantum Composer, Quantum
Odyssey, Quantum Flytrap). Multi-framework support is solved well only by qBraid, and nothing
reviewed combines a graphical builder with true multi-backend execution. Across every solution
examined, **personalized/adaptive learning tied to a learner's actual mistakes is the one
capability nobody has solved.**

So our differentiation is not "more quantum features." It is: **notice that a student ran a
circuit but still doesn't understand it, and do something specific about that.**

We would rather demonstrate this one capability deeply, on a small number of lessons, than
implement every official bullet point shallowly. That trade-off is deliberate — see Section 3
for exactly what that means in practice, and Section 9 for what "deeply" does and doesn't cover
yet.

---

## 3. Our Solution: QMentor

**Core idea (do not deviate):** the student must submit a probability prediction *before* seeing
the simulated result. After running, compare prediction vs. actual, use a deterministic
(non-AI) rule match to name a specific misconception, then use one LLM call to explain that
already-determined label in plain language. The AI never computes or invents quantum numbers —
it only explains numbers that were already computed by the real simulator.

**Loop:** Learn → Build/Load circuit → Predict → Run (real simulation) → Compare → Diagnose
(deterministic rule, or Quirk-run counterfactual variants if no known pattern matches) →
Explain (AI, grounded, only when a diagnosis was actually determined) → Retry.

This directly answers the official objectives for "AI-assisted tutoring... error detection...
personalized learning paths" and "visualization of quantum states... measurement probabilities" —
scoped to a working core loop rather than a shallow implementation of every bullet point.

### What is explicitly out of scope for this MVP

- Multiple simulator frameworks (Qiskit/PennyLane/Cirq/qBraid) — Quirk's own engine is the single
  source of truth for this build.
- Real quantum hardware execution.
- Production multi-user instructor dashboards, gamification, authentication, database, adaptive
  skill graphs. The current instructor view is a demo using hardcoded sample student records only.
- A general-purpose AI chatbot or any AI component that performs quantum math.

These are legitimate roadmap items for the pitch, not things claimed as built today.

---

## 4. Stack

- **Circuit builder + simulator:** a fork of [`Strilanc/Quirk`](https://github.com/Strilanc/Quirk)
  (Apache-2.0), embedded via `<iframe>`. Quirk already provides drag-and-drop gate placement,
  real-time statevector simulation, chance/probability displays, and Bloch sphere views — do not
  rebuild any of this.
- **Wrapper app:** React 19 + Vite, communicating with the Quirk iframe via
  `window.postMessage`. The wrapper verifies incoming messages originate from the current iframe
  and same origin before trusting them.
- **No database. No auth.** A minimal server-side proxy protects the OpenAI key; learner data
  lives in memory or `localStorage` (`qmentor.retry.v1`).
- **AI calls:** OpenAI Responses API, one call per recognized wrong prediction — see Section 5,
  Step 8, for exactly when it fires and what it's allowed to say.

### Known Quirk limitation to design around

Quirk cannot recohere measured qubits (measurement uses the deferred-measurement trick). None of
the six current lessons require mid-circuit re-measurement, so this is a non-issue as long as future
lessons respect the same constraint.

### Attribution requirement

Apache-2.0 doesn't legally require an on-screen credit, but include this line in the README and
About screen: *"Circuit simulation powered by a fork of Quirk (Craig Gidney, Apache-2.0)."*

### Security note — server-side proxy implemented

The OpenAI API key is read only from the server-side `OPENAI_API_KEY` environment variable. The
frontend calls the same-origin `/api/explain` endpoint, so the key is not bundled into or exposed
to the browser. The deterministic fallback remains active when the proxy is unavailable.

---

## 5. Build Order — follow exactly, one step at a time

**Rule for every step: stop at the end of the step if time runs out. Each step alone must leave
the app in a working, demoable state — never a broken one.** Do not start a step until the
previous one is confirmed working. Prioritize a working 2-lesson demo over a broken 6-lesson
one.

### STEP 1 — Patch the Quirk fork

- Find where Quirk updates the URL hash with the circuit JSON on edit. Add:
  `window.postMessage({type: "circuit_changed", circuit: <that JSON>}, "*")` at that point.
- Find where Quirk renders chance/probability values. Add:
  `window.postMessage({type: "state_computed", probs: <same data it renders>}, "*")` at that
  point.
- Do not touch anything else in Quirk's source.

**Status: done.**

### STEP 2 — Wrapper skeleton

- `<iframe>` loading the built Quirk output.
- Listen for both message types in the wrapper; confirm the sender is the same iframe/origin
  before trusting the payload.

**Status: done.**

### STEP 3 — Content file (the entire "dataset," written by hand)

Six lessons, each with: starter circuit URL hash, `correct_probs` reference metadata (controls the
prediction form's input shape only — it is **not** the authoritative result; the authoritative
result is always whatever Quirk reports live), one `common_wrong_guess`, a `misconception_id`,
and an `explanation_seed` (plain text, factual, used as the AI's grounding and as the hardcoded
fallback).

| Lesson | Circuit | Concept |
|---|---|---|
| 1 | H | Superposition |
| 2 | H, H | Interference |
| 3 | H + Measure | Measurement |
| 4 | H + CNOT (Bell pair) | Entanglement |
| 5 | H + CNOT + CNOT (three qubits) | GHZ State |
| 6 | Hadamards + balanced oracle + measurement | Deutsch–Jozsa |

**Status: done — six lessons.**

### STEP 4 — Lesson pages

Short concept text + an "open in Quirk" link that loads the starter circuit via its URL hash.

**Status: done.**

### STEP 5 — Prediction UI

A form (inputs must sum to 1, tolerance 10⁻⁶) that must be submitted before the "Reveal Result"
button unlocks. Confidence selection is mandatory alongside the probability guess. Store the
prediction in memory only.

**Status: done.**

### STEP 6 — Comparison view

Bar chart: predicted vs. actual, using only the real numbers received in the `state_computed`
message. Never recompute probabilities in the wrapper.

**Status: done.**

### STEP 7 — Misconception match (deterministic, not a classifier)

If the prediction is close to that lesson's `common_wrong_guess` (within 0.05 per outcome), show
its `misconception_id` and `explanation_seed`. If it's wrong but doesn't match the known pattern,
generate eligible gate-removal/replacement variants, ask Quirk to simulate each, and attribute the
mistake to whichever variant reduces total error by at least 0.1. Otherwise show a generic "not
quite, here's the real distribution" fallback. Plain comparison logic and Quirk-run simulation
only — no AI involved in this step.

**Status: done**, including the counterfactual fallback path.

### STEP 8 — AI explanation call

**One API call only when a diagnosis was actually determined** — either a known-pattern match
or a successful counterfactual attribution from Step 7. An arbitrary wrong answer that matches
neither gets the generic deterministic fallback message, not an AI call.

Input to the model when it does fire: circuit JSON, predicted numbers, actual numbers, the
determined `misconception_id`, and (if applicable) the counterfactual evidence. Instruction to
the model: *"Explain in 2–3 sentences why this misconception applies to this circuit. Use only
the numbers provided. Do not state any other numbers."* Guardrails: 2–3 sentences, only supplied
numeric values may appear, the diagnosis itself cannot be changed by the model, `store: false`,
a ~180-token limit, and a three-second timeout. The hardcoded fallback explanation
(`explanation_seed`) is shown immediately regardless, and is what's kept if the API key is
absent, the call fails, times out, returns a non-success response, violates the response schema,
or introduces a number that wasn't supplied.

**Status: done**, exactly as scoped above — not "every wrong prediction," only diagnosed ones.

### STEP 9 — Retry flow

A second, slightly different circuit per lesson. Re-run steps 5–8 against it. Track in
`localStorage` whether the second prediction's error improved, whether confidence calibration
improved, and a three-tier per-concept mastery label.

**Status: done.** No longitudinal learner profile or cross-device history exists — this is a
single-browser, single-session record only.

### STEP 10 — Polish (only if time remains)

Mobile/projector display check. Add the README attribution line. General visual cleanup — do not
add new functionality at this stage.

**Status: partial.** Responsive CSS breakpoints exist; live mobile/projector verification is still
outstanding.

---

## 6. Non-negotiable constraints

- **Never let the AI compute or assert a probability.** It only explains numbers that were
  already produced by Quirk's real simulator and passed to it explicitly.
- **Never build a new simulator, a new drag-and-drop editor, or an ML/classifier model.** Quirk
  provides the simulator and editor; Step 7's misconception match is plain deterministic
  comparison logic plus Quirk-run counterfactual simulation, not a trained model.
- **Never fabricate or hardcode simulation results as if they were live.** Every "actual" number
  shown to the user must come from the `state_computed` postMessage, not from the content file.
- **Never skip a step's "must leave a working state" requirement** to rush ahead to a later step.
- **Never claim an evaluation result that hasn't actually been measured.** No accuracy,
  precision/recall, F1, or learner-study numbers exist yet (Section 9). If a pitch deck or demo
  needs to reference results, label them explicitly as *"Not currently implemented; proposed
  evaluation metric,"* not as an achieved number.

---

## 7. How to work with this file (for Codex / the coding agent)

Treat this README as fixed context for the entire build. When asked to work on the project:

1. Confirm which STEP (1–10) or which Section 9 roadmap item is being requested. If unspecified,
   propose the next incomplete item in priority order — do not jump ahead.
2. Before writing code, restate in one or two sentences what "done" looks like for that item,
   using the definitions above.
3. Implement only what that item describes. Do not preemptively build later items' functionality.
4. After implementing, state plainly whether the app is left in a working, demoable state, and
   update this file's status line for that item. If it is not working, say so — do not claim
   something is complete when it isn't.
5. If a request conflicts with a constraint in Section 6, say so before proceeding, and ask which
   should win.

---

## 8. What QMentor adds vs. the open-source foundation it sits on

**From Quirk (Apache-2.0, not our work):** circuit canvas and drag-and-drop editing, gate
semantics, state simulation, probability and quantum-state visualization, Bloch-sphere
capability, the simulator's own test suite.

**QMentor's actual contribution:** the prediction-before-reveal learning design; lesson content
and the guided concept path; probability-and-confidence capture; the predicted-vs-actual
comparison interface; deterministic known-misconception rules; Quirk-grounded counterfactual
circuit attribution when no known pattern matches; a grounded AI explanation layer with numeric
validation and a safe fallback; retry circuits with local improvement/calibration tracking; and
the iframe communication bridge tying all of it to Quirk's real simulator output.

**Recommended one-line positioning for the pitch:** "QMentor's innovation is the learning and
diagnostic layer. It is built on and integrated with an open-source Quirk-based simulation
foundation."

---

## 9. Honest current limitations and roadmap

**What is genuinely built today:** six lessons (superposition, interference, measurement,
entanglement, GHZ State, and Deutsch–Jozsa), the full predict → run → compare → diagnose → explain
→ retry loop described above, deterministic misconception matching, Quirk-run counterfactual
diagnosis for unmatched wrong answers, a grounded and guardrailed AI explanation call through a
server-side proxy, local retry/calibration tracking, and a visible per-concept progress/mastery
view. The tested Qiskit-subset → Quirk converter is wired into the app's code-input UI and supports
`h`, `x`, `cx`, `measure`, and `measure_all`. A clearly labeled instructor dashboard demo shows
aggregate insights from hardcoded sample student records only; it is not real multi-user analytics.

**What is not built, and should not be implied as built:**

- A database, authentication, production instructor backend, or multi-user accounts of any kind.
- Multiple simulator backends — Quirk is the only execution engine.
- Real quantum hardware execution.
- A general-purpose AI chatbot, AI code generation, or AI circuit optimization.
- Assessments, coding challenges, gamification, or adaptive skill graphs.
- Any measured accuracy, precision, recall, F1, learner-study result, or usability-study finding.
  The app records individual learners' own retry changes locally — that is a runtime record, not
  a published evaluation result.
- A root build script coordinating the Quirk build and the Vite build in one command.

**Roadmap, roughly in priority order:**

1. Consider additional simulator backends only with a clearly defined
   consistent result contract across them.
2. A real learner study measuring pre/post prediction error and retry improvement — until this
   exists, no learning-outcome claim should be made beyond "the app records whether an individual
   learner's own retry attempt improved."

---

*Circuit simulation powered by a fork of Quirk (Craig Gidney, Apache-2.0).*

# QMentor — Prediction-First Quantum Learning Layer

**SIH Problem Statement ID:** SIH26140
**Theme:** Smart Education
**Title:** AI-Based Interactive Quantum Algorithm Learning Platform

> This README is the single source of truth for this repository. Read it in full before writing
> or modifying any code. It contains the official problem statement, the solution we have
> committed to, the exact build order, and the constraints that must never be violated. If a
> future instruction conflicts with anything in this file, stop and flag the conflict instead of
> silently choosing one side.

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

## 3. Our Solution: QMentor

**Core idea (do not deviate):** the student must submit a probability prediction *before* seeing
the simulated result. After running, compare prediction vs. actual, use a deterministic
(non-AI) rule match to name a specific misconception, then use one LLM call to explain that
already-determined label in plain language. The AI never computes or invents quantum numbers —
it only explains numbers that were already computed by the real simulator.

**Loop:** Learn → Build/Load circuit → Predict → Run (real simulation) → Compare → Diagnose
(deterministic rule) → Explain (AI, grounded) → Retry.

This directly answers the official objectives for "AI-assisted tutoring... error detection...
personalized learning paths" and "visualization of quantum states... measurement probabilities" —
scoped to a working core loop rather than a shallow implementation of every bullet point.

### What is explicitly out of scope for this MVP
- Multiple simulator frameworks (Qiskit/PennyLane/Cirq/qBraid) — Quirk's own engine is the single
  source of truth for this build.
- Real quantum hardware execution.
- Instructor dashboards, gamification, authentication, database, adaptive skill graphs.
- A general-purpose AI chatbot or any AI component that performs quantum math.

These are legitimate roadmap items for the pitch, not things to build now.

---

## 4. Stack

- **Circuit builder + simulator:** a fork of [`Strilanc/Quirk`](https://github.com/Strilanc/Quirk)
  (Apache-2.0), embedded via `<iframe>`. Quirk already provides drag-and-drop gate placement,
  real-time statevector simulation, chance/probability displays, and Bloch sphere views — do not
  rebuild any of this.
  - Alternate base if less UI work is preferred: `EnesSakalliUniWien/Quirk` ("Shadow-Quant"),
    same license lineage, adds a probability histogram and floating Bloch view out of the box.
- **Wrapper app:** plain JS or React (implementer's choice), communicating with the Quirk iframe
  via `window.postMessage`.
- **No backend. No database. No auth.** Everything lives in memory or `localStorage`.
- **AI calls:** one LLM call per wrong prediction, strictly for explanation text — never for
  computing probabilities.

### Known Quirk limitation to design around
Quirk cannot recohere measured qubits (measurement uses the deferred-measurement trick). None of
the four MVP lessons require mid-circuit re-measurement, so this is a non-issue as long as future
lessons respect the same constraint.

### Attribution requirement
Apache-2.0 doesn't legally require an on-screen credit, but include this line in the README and
About screen: *"Circuit simulation powered by a fork of Quirk (Craig Gidney, Apache-2.0)."*

---

## 5. Build Order — follow exactly, one step at a time

**Rule for every step: stop at the end of the step if time runs out. Each step alone must leave
the app in a working, demoable state — never a broken one.** Do not start a step until the
previous one is confirmed working. Prioritize a working 2-lesson demo over a broken 4-lesson one.

### STEP 1 — Patch the Quirk fork
- Find where Quirk updates the URL hash with the circuit JSON on edit. Add:
  `window.postMessage({type: "circuit_changed", circuit: <that JSON>}, "*")` at that point.
- Find where Quirk renders chance/probability values. Add:
  `window.postMessage({type: "state_computed", probs: <same data it renders>}, "*")` at that
  point.
- Do not touch anything else in Quirk's source.

### STEP 2 — Wrapper skeleton
- `<iframe>` loading the built Quirk output.
- Listen for both message types in the wrapper; log to console to confirm they fire on real user
  interaction inside the iframe.

### STEP 3 — Content file (the entire "dataset," written by hand)
Four lessons, each with: starter circuit URL hash, `correct_probs`, one `common_wrong_guess`, a
`misconception_id`, and an `explanation_seed` (plain text, factual, used as the AI's grounding
and as the hardcoded fallback).

| Lesson | Circuit | Concept |
|---|---|---|
| 1 | H | Superposition |
| 2 | H, H | Interference |
| 3 | H + Measure | Measurement |
| 4 | H + CNOT (Bell pair) | Entanglement |

### STEP 4 — Lesson pages
Short concept text + an "open in Quirk" link that loads the starter circuit via its URL hash.

### STEP 5 — Prediction UI
A form (inputs must sum to 1) that must be submitted before the "Reveal Result" button unlocks.
Store the prediction in memory only.

### STEP 6 — Comparison view
Bar chart: predicted vs. actual, using only the real numbers received in the `state_computed`
message. Never recompute probabilities in the wrapper.

### STEP 7 — Misconception match (deterministic, not a classifier)
If the prediction is close to that lesson's `common_wrong_guess`, show its `misconception_id` and
`explanation_seed`. Otherwise show a generic "not quite, here's the real distribution" fallback.
Plain comparison logic only — no AI involved in this step.

### STEP 8 — AI explanation call
One API call per wrong prediction. Input: circuit JSON, predicted numbers, actual numbers,
matched `misconception_id`. Instruction to the model: *"Explain in 2–3 sentences why this
misconception applies to this circuit. Use only the numbers provided. Do not state any other
numbers."* Hardcode a fallback explanation per lesson (from `explanation_seed`) in case the API
fails or is slow.

### STEP 9 — Retry flow
A second, slightly different circuit per lesson. Re-run steps 5–8 against it. Track in
`localStorage` whether the second prediction improved versus the first.

### STEP 10 — Polish (only if time remains)
Mobile/projector display check. Add the README attribution line. General visual cleanup — do not
add new functionality at this stage.

---

## 6. Non-negotiable constraints

- **Never let the AI compute or assert a probability.** It only explains numbers that were
  already produced by Quirk's real simulator and passed to it explicitly.
- **Never build a new simulator, a new drag-and-drop editor, or an ML/classifier model.** Quirk
  provides the simulator and editor; Step 7's misconception match is plain deterministic
  comparison logic, not a model.
- **Never fabricate or hardcode simulation results as if they were live.** Every "actual" number
  shown to the user must come from the `state_computed` postMessage, not from the content file.
- **Never skip a step's "must leave a working state" requirement** to rush ahead to a later step.

---

## 7. How to work with this file (for Codex / the coding agent)

Treat this README as fixed context for the entire build. When asked to work on the project:

1. Confirm which STEP (1–10) is being requested. If unspecified, propose the next incomplete step
   in order — do not jump ahead.
2. Before writing code, restate in one or two sentences what "done" looks like for that step,
   using the definitions above.
3. Implement only what that step describes. Do not preemptively build later steps' functionality.
4. After implementing, state plainly whether the app is left in a working, demoable state. If it
   is not, say so — do not claim a step is complete when it isn't.
5. If a request conflicts with a constraint in Section 6, say so before proceeding, and ask which
   should win.

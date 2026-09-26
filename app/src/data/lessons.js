const lessons = [
  {
    id: 'superposition',
    title: 'H — Superposition',
    concept: 'Superposition',
    starterCircuitHash: '#circuit={"cols":[["H"],["Chance2"]]}',
    retryCircuitHash: '#circuit={"cols":[["X"],["H"],["Chance2"]]}',
    correct_probs: [0.5, 0.5, 0, 0],
    common_wrong_guess: [1, 0, 0, 0],
    misconception_id: 'hadamard_is_classical',
    explanation_seed: 'A Hadamard gate puts |0⟩ into an equal superposition of |0⟩ and |1⟩.',
  },
  {
    id: 'interference',
    title: 'H, H — Interference',
    concept: 'Interference',
    starterCircuitHash: '#circuit={"cols":[["H"],["H"],["Chance2"]]}',
    retryCircuitHash: '#circuit={"cols":[["H"],["Z"],["H"],["Chance2"]]}',
    correct_probs: [1, 0, 0, 0],
    common_wrong_guess: [0.5, 0.5, 0, 0],
    misconception_id: 'hadamards_repeat_randomness',
    explanation_seed: 'The second Hadamard recombines the amplitudes, so interference returns the qubit to |0⟩.',
  },
  {
    id: 'measurement',
    title: 'H + Measure — Measurement',
    concept: 'Measurement',
    starterCircuitHash: '#circuit={"cols":[["H"],["Measure"],["Chance2"]]}',
    retryCircuitHash: '#circuit={"cols":[["X"],["H"],["Measure"],["Chance2"]]}',
    correct_probs: [0.5, 0.5, 0, 0],
    common_wrong_guess: [1, 0, 0, 0],
    misconception_id: 'measurement_always_returns_zero',
    explanation_seed: 'Measuring the superposition can produce either basis outcome with equal probability.',
  },
  {
    id: 'entanglement',
    title: 'H + CNOT — Entanglement',
    concept: 'Entanglement',
    starterCircuitHash: '#circuit={"cols":[["H"],["•","X"],["Chance2"]]}',
    retryCircuitHash: '#circuit={"cols":[["H"],["•","X"],[1,"X"],["Chance2"]]}',
    correct_probs: [0.5, 0, 0, 0.5],
    common_wrong_guess: [0.25, 0.25, 0.25, 0.25],
    misconception_id: 'bell_qubits_are_independent',
    explanation_seed: 'The Hadamard and controlled-X create correlated outcomes: the two qubits are measured together as |00⟩ or |11⟩.',
  },
]

export { lessons }
export default lessons

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  requestOpenAIExplanation,
  validateExplanationInput,
} from '../api/explain.js'

const groundedInput = {
  circuit: '{"cols":[["H"],["Chance"]]}',
  prediction: [1, 0],
  actual: [0.5, 0.5],
  deterministicDiagnosis: {
    type: 'misconception',
    label: 'hadamard_is_classical',
  },
  explanationSeed: 'A Hadamard changes the basis-state amplitudes.',
}

test('server proxy forwards only grounded input and keeps authorization server-side', async () => {
  const structuredOutput = JSON.stringify({
    cause: 'The supplied misconception applies.',
    evidence: 'Prediction [1, 0] differs from actual [0.5, 0.5].',
    next_step: 'Review the Hadamard gate.',
  })
  const output = await requestOpenAIExplanation(groundedInput, {
    apiKey: 'server-test-key',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses')
      assert.equal(options.headers.Authorization, 'Bearer server-test-key')
      const body = JSON.parse(options.body)
      assert.deepEqual(JSON.parse(body.input), {
        current_circuit_json: groundedInput.circuit,
        submitted_prediction: groundedInput.prediction,
        real_quirk_actual_probabilities: groundedInput.actual,
        deterministic_diagnosis: groundedInput.deterministicDiagnosis,
        explanation_seed: groundedInput.explanationSeed,
      })
      return {
        ok: true,
        json: async () => ({
          output: [{ content: [{ type: 'output_text', text: structuredOutput }] }],
        }),
      }
    },
  })
  assert.equal(output, structuredOutput)
})

test('server rejects malformed or ungrounded input', () => {
  assert.equal(validateExplanationInput(groundedInput), true)
  assert.equal(validateExplanationInput({ ...groundedInput, actual: [] }), false)
  assert.equal(validateExplanationInput({ ...groundedInput, prediction: [1] }), false)
})

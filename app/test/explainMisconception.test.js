import assert from 'node:assert/strict'
import test from 'node:test'
import { explainMisconception } from '../src/services/explainMisconception.js'

const request = {
  circuit: '{"cols":[["H"],["Chance"]]}',
  prediction: [1, 0],
  actual: [0.5, 0.5],
  deterministicDiagnosis: {
    type: 'misconception',
    label: 'hadamard_is_classical',
  },
  explanationSeed: 'A Hadamard changes the basis-state amplitudes.',
}

test('frontend uses the local proxy and accepts valid structured feedback', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  globalThis.window = { setTimeout, clearTimeout }
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/explain')
    assert.equal(options.headers.Authorization, undefined)
    assert.deepEqual(JSON.parse(options.body), request)
    return {
      ok: true,
      json: async () => ({
        outputText: JSON.stringify({
          cause: 'The supplied misconception applies.',
          evidence: 'Prediction [1, 0] differs from actual [0.5, 0.5].',
          next_step: 'Review the Hadamard gate.',
        }),
      }),
    }
  }

  try {
    const result = await explainMisconception(request)
    assert.equal(result.source, 'ai')
    assert.equal(result.explanation.next_step, 'Review the Hadamard gate.')
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  }
})

test('frontend immediately preserves deterministic fallback on proxy failure', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  globalThis.window = { setTimeout, clearTimeout }
  globalThis.fetch = async () => ({ ok: false })

  try {
    const result = await explainMisconception(request)
    assert.equal(result.source, 'fallback')
    assert.equal(result.explanation.cause, request.explanationSeed)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.window = originalWindow
  }
})

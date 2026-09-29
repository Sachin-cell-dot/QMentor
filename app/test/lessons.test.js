import assert from 'node:assert/strict'
import test from 'node:test'
import { lessons } from '../src/data/lessons.js'

const decodeCircuit = (hash) => JSON.parse(decodeURIComponent(hash.replace(/^#circuit=/, '')))

test('adds exactly the GHZ and Deutsch-Jozsa lesson definitions', () => {
  assert.equal(lessons.length, 6)
  assert.deepEqual(lessons.slice(-2).map((lesson) => lesson.id), ['ghz-state', 'deutsch-jozsa'])
})

test('GHZ lesson uses the requested three-qubit gate sequence', () => {
  const lesson = lessons.find(({ id }) => id === 'ghz-state')
  assert.deepEqual(decodeCircuit(lesson.starterCircuitHash), {
    cols: [['H'], ['•', 'X'], [1, '•', 'X'], ['Chance3']],
  })
  assert.equal(lesson.correct_probs.length, 8)
  assert.equal(lesson.common_wrong_guess.length, 8)
})

test('Deutsch-Jozsa lesson uses supported gates and a balanced oracle', () => {
  const lesson = lessons.find(({ id }) => id === 'deutsch-jozsa')
  assert.deepEqual(decodeCircuit(lesson.starterCircuitHash), {
    cols: [[1, 'X'], ['H', 'H'], ['•', 'X'], ['H'], ['Measure'], ['Chance2']],
  })
  assert.equal(lesson.correct_probs.length, 4)
  assert.equal(lesson.common_wrong_guess.length, 4)
})

test('new lesson metadata and both circuit hashes are complete and parseable', () => {
  for (const lesson of lessons.slice(-2)) {
    for (const field of [
      'id',
      'title',
      'concept',
      'misconception_id',
      'explanation_seed',
      'theory',
    ]) {
      assert.equal(typeof lesson[field], 'string')
      assert.notEqual(lesson[field].trim(), '')
    }
    assert.ok(lesson.theory.split(/(?<=[.!?])\s+/).length >= 2)
    assert.ok(lesson.theory.split(/(?<=[.!?])\s+/).length <= 4)
    assert.ok(lesson.explainerSequence.length >= 2)
    assert.ok(Array.isArray(decodeCircuit(lesson.starterCircuitHash).cols))
    assert.ok(Array.isArray(decodeCircuit(lesson.retryCircuitHash).cols))
    assert.equal(lesson.correct_probs.length, lesson.common_wrong_guess.length)
  }
})

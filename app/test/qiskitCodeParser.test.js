import assert from 'node:assert/strict'
import test from 'node:test'
import { QiskitCodeParseError, parseQiskitCode } from '../src/services/qiskitCodeParser.js'

const circuitFor = (source) => JSON.parse(parseQiskitCode(source).circuitJson)

test('converts the four MVP lesson circuits', () => {
  assert.deepEqual(circuitFor('qc.h(0)'), { cols: [['H'], ['Chance']] })
  assert.deepEqual(circuitFor('qc.h(0)\nqc.h(0)'), {
    cols: [['H'], ['H'], ['Chance']],
  })
  assert.deepEqual(circuitFor('qc.h(0)\nqc.measure(0,0)'), {
    cols: [['H'], ['Measure'], ['Chance']],
  })
  assert.deepEqual(circuitFor('qc.h(0)\nqc.cx(0,1)'), {
    cols: [['H'], ['•', 'X'], ['Chance2']],
  })
})

test('supports X, measure_all, comments, and blank lines', () => {
  assert.deepEqual(circuitFor('# prepare\nqc.x(1)\n\nqc.measure_all() # read both'), {
    cols: [[1, 'X'], ['Measure', 'Measure'], ['Chance2']],
  })
})

test('fails the whole conversion on an unsupported line', () => {
  assert.throws(
    () => parseQiskitCode('qc.h(0)\nqc.rz(0,1.57)'),
    (error) => (
      error instanceof QiskitCodeParseError
      && error.lineNumber === 2
      && error.lineText === 'qc.rz(0,1.57)'
      && error.message.includes('Line 2')
    ),
  )
})

test('fails clearly on empty or comment-only input', () => {
  assert.throws(() => parseQiskitCode(''), /Enter at least one supported circuit instruction/)
  assert.throws(() => parseQiskitCode('\n# nothing here'), /Enter at least one supported circuit instruction/)
})

test('returns the existing local Quirk iframe path', () => {
  assert.equal(
    parseQiskitCode('qc.h(0)').iframePath,
    '/quirk/quirk.html#circuit={"cols":[["H"],["Chance"]]}',
  )
})

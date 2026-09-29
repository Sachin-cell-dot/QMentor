const MAX_QUBITS = 16

class QiskitCodeParseError extends Error {
  constructor(message, { lineNumber = null, lineText = '' } = {}) {
    super(message)
    this.name = 'QiskitCodeParseError'
    this.lineNumber = lineNumber
    this.lineText = lineText
  }
}

const identityColumn = (height) => Array.from({ length: height }, () => 1)

const parseIndex = (value, lineNumber, lineText) => {
  const index = Number(value)
  if (!Number.isSafeInteger(index) || index < 0 || index >= MAX_QUBITS) {
    throw new QiskitCodeParseError(
      `Line ${lineNumber}: qubit index must be an integer from 0 to ${MAX_QUBITS - 1}.`,
      { lineNumber, lineText },
    )
  }
  return index
}

function parseStatement(text, lineNumber, lineText) {
  let match = text.match(/^qc\.(h|x)\(\s*(\d+)\s*\)\s*;?$/)
  if (match) {
    return {
      type: match[1],
      qubits: [parseIndex(match[2], lineNumber, lineText)],
    }
  }

  match = text.match(/^qc\.cx\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*;?$/)
  if (match) {
    const control = parseIndex(match[1], lineNumber, lineText)
    const target = parseIndex(match[2], lineNumber, lineText)
    if (control === target) {
      throw new QiskitCodeParseError(
        `Line ${lineNumber}: CNOT control and target must be different qubits.`,
        { lineNumber, lineText },
      )
    }
    return { type: 'cx', qubits: [control, target] }
  }

  match = text.match(/^qc\.measure\(\s*(\d+)\s*,\s*(\d+)\s*\)\s*;?$/)
  if (match) {
    return {
      type: 'measure',
      qubits: [parseIndex(match[1], lineNumber, lineText)],
    }
  }

  if (/^qc\.measure_all\(\s*\)\s*;?$/.test(text)) {
    return { type: 'measure_all', qubits: [] }
  }

  throw new QiskitCodeParseError(
    `Line ${lineNumber} is unsupported: ${lineText}`,
    { lineNumber, lineText },
  )
}

function statementToColumn(statement, qubitCount) {
  if (statement.type === 'measure_all') {
    return Array.from({ length: qubitCount }, () => 'Measure')
  }

  const height = Math.max(...statement.qubits) + 1
  const column = identityColumn(height)
  if (statement.type === 'h') {
    column[statement.qubits[0]] = 'H'
  } else if (statement.type === 'x') {
    column[statement.qubits[0]] = 'X'
  } else if (statement.type === 'cx') {
    column[statement.qubits[0]] = '•'
    column[statement.qubits[1]] = 'X'
  } else if (statement.type === 'measure') {
    column[statement.qubits[0]] = 'Measure'
  }
  return column
}

function parseQiskitCode(source) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new QiskitCodeParseError('Enter at least one supported circuit instruction.')
  }

  const statements = []
  source.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1
    const withoutComment = rawLine.split('#', 1)[0].trim()
    if (withoutComment === '') {
      return
    }
    statements.push(parseStatement(withoutComment, lineNumber, rawLine.trim()))
  })

  if (statements.length === 0) {
    throw new QiskitCodeParseError('Enter at least one supported circuit instruction.')
  }

  const referencedQubits = statements.flatMap((statement) => statement.qubits)
  const qubitCount = referencedQubits.length === 0 ? 1 : Math.max(...referencedQubits) + 1
  const columns = statements.map((statement) => statementToColumn(statement, qubitCount))
  columns.push([qubitCount === 1 ? 'Chance' : `Chance${qubitCount}`])

  const circuitJson = JSON.stringify({ cols: columns })
  const circuitHash = `#circuit=${circuitJson}`
  return {
    circuitJson,
    circuitHash,
    iframePath: `/quirk/quirk.html${circuitHash}`,
    qubitCount,
  }
}

export { QiskitCodeParseError, parseQiskitCode }

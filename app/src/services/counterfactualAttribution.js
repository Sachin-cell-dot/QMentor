const SIMPLE_REPLACEMENT_GATES = ['H', 'X', 'Y', 'Z']
const MIN_MEANINGFUL_IMPROVEMENT = 0.1
const NUMERIC_EPSILON = 1e-12
const RUN_TIMEOUT_MS = 4000

const gateId = (entry) => (
  typeof entry === 'string'
    ? entry
    : typeof entry?.id === 'string'
      ? entry.id
      : null
)

const isIgnoredSlot = (entry) => entry == null || entry === 1
const isProtectedGate = (id) => id === 'Measure' || id?.startsWith('Chance')
const isControl = (id) => id === '•' || id === '◦'

const distributionError = (prediction, actual) => prediction.reduce(
  (error, value, index) => error + Math.abs(value - actual[index]),
  0,
)

const probabilitiesFromQuirk = (payload) => {
  if (!Number.isInteger(payload?._height) || payload._height < 1 || payload?._buffer == null) {
    return null
  }

  const probabilities = []
  for (let index = 0; index < payload._height; index += 1) {
    const value = payload._buffer[index * 2]
    if (!Number.isFinite(value)) {
      return null
    }
    probabilities.push(value)
  }
  return probabilities
}

const cloneCircuit = (circuit) => JSON.parse(JSON.stringify(circuit))

const readableGateName = (gate) => (
  gate === '•+X' || gate === '◦+X' ? 'controlled-X (CNOT)' : gate
)

function describeCounterfactualAttribution(attribution) {
  if (attribution?.kind === 'remove') {
    const gate = readableGateName(attribution.gate)
    return `The original circuit includes ${gate}. Removing ${gate} produces a real Quirk distribution that is closer to your prediction under the same L1 comparison.`
  }
  if (attribution?.kind === 'replace') {
    const gate = readableGateName(attribution.gate)
    const replacement = readableGateName(attribution.replacement)
    return `The original circuit uses ${gate}. Replacing ${gate} with ${replacement} produces a real Quirk distribution that is closer to your prediction under the same L1 comparison.`
  }
  return null
}

function generateCounterfactualVariants(circuitJson) {
  let circuit
  try {
    circuit = JSON.parse(circuitJson)
  } catch {
    return []
  }

  if (!Array.isArray(circuit?.cols)) {
    return []
  }

  const variants = []
  const seen = new Set()
  const addVariant = (variant) => {
    const json = JSON.stringify(variant.circuit)
    if (json !== circuitJson && !seen.has(json)) {
      seen.add(json)
      variants.push({ ...variant, circuitJson: json })
    }
  }

  circuit.cols.forEach((column, columnIndex) => {
    if (!Array.isArray(column)) {
      return
    }

    const activeEntries = column
      .map((entry, rowIndex) => ({ entry, id: gateId(entry), rowIndex }))
      .filter(({ entry }) => !isIgnoredSlot(entry))

    if (
      activeEntries.length === 0
      || activeEntries.some(({ id }) => id === null || isProtectedGate(id))
      || (activeEntries.length > 1 && !activeEntries.some(({ id }) => isControl(id)))
    ) {
      return
    }

    const removed = cloneCircuit(circuit)
    removed.cols.splice(columnIndex, 1)
    addVariant({
      kind: 'remove',
      columnIndex,
      gate: activeEntries.map(({ id }) => id).join('+'),
      circuit: removed,
    })

    if (activeEntries.length !== 1 || !SIMPLE_REPLACEMENT_GATES.includes(activeEntries[0].id)) {
      return
    }

    const [{ id, rowIndex }] = activeEntries
    for (const replacement of SIMPLE_REPLACEMENT_GATES) {
      if (replacement === id) {
        continue
      }
      const replaced = cloneCircuit(circuit)
      replaced.cols[columnIndex][rowIndex] = replacement
      addVariant({
        kind: 'replace',
        columnIndex,
        rowIndex,
        gate: id,
        replacement,
        circuit: replaced,
      })
    }
  })

  return variants
}

function runVariantInQuirk({ quirkUrl, circuitJson, expectedOrigin, signal }) {
  return new Promise((resolve, reject) => {
    let timeoutId
    const iframe = document.createElement('iframe')
    iframe.title = 'Quirk counterfactual evaluator'
    iframe.tabIndex = -1
    iframe.setAttribute('aria-hidden', 'true')
    Object.assign(iframe.style, {
      position: 'fixed',
      left: '-10000px',
      width: '900px',
      height: '700px',
      border: '0',
      opacity: '0',
      pointerEvents: 'none',
    })

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('message', handleMessage)
      signal?.removeEventListener('abort', handleAbort)
      iframe.remove()
    }
    const finish = (callback, value) => {
      cleanup()
      callback(value)
    }
    const handleAbort = () => finish(reject, new DOMException('Aborted', 'AbortError'))
    const handleMessage = (event) => {
      if (
        event.source !== iframe.contentWindow
        || event.origin !== expectedOrigin
        || event.data?.type !== 'state_computed'
      ) {
        return
      }
      const probabilities = probabilitiesFromQuirk(event.data.probs)
      if (probabilities !== null) {
        finish(resolve, probabilities)
      }
    }

    if (signal?.aborted) {
      handleAbort()
      return
    }

    window.addEventListener('message', handleMessage)
    signal?.addEventListener('abort', handleAbort, { once: true })
    timeoutId = window.setTimeout(
      () => finish(reject, new Error('Quirk counterfactual run timed out.')),
      RUN_TIMEOUT_MS,
    )
    document.body.append(iframe)
    iframe.src = `${quirkUrl}#circuit=${encodeURIComponent(circuitJson)}`
  })
}

async function runCounterfactualAttribution({
  circuitJson,
  prediction,
  originalActual,
  quirkUrl = '/quirk/quirk.html',
  signal,
}) {
  if (
    !Array.isArray(prediction)
    || !Array.isArray(originalActual)
    || prediction.length !== originalActual.length
  ) {
    return null
  }

  const variants = generateCounterfactualVariants(circuitJson)
  if (variants.length === 0) {
    return null
  }

  const originalDistance = distributionError(prediction, originalActual)
  const evaluatedVariants = []

  for (const variant of variants) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const probabilities = await runVariantInQuirk({
      quirkUrl,
      circuitJson: variant.circuitJson,
      expectedOrigin: window.location.origin,
      signal,
    })
    if (probabilities.length === prediction.length) {
      evaluatedVariants.push({
        ...variant,
        probabilities,
        distance: distributionError(prediction, probabilities),
      })
    }
  }

  if (evaluatedVariants.length === 0) {
    return null
  }

  const closest = evaluatedVariants.reduce((best, candidate) => (
    candidate.distance < best.distance ? candidate : best
  ))
  const improvement = originalDistance - closest.distance

  return {
    attribution: improvement + NUMERIC_EPSILON >= MIN_MEANINGFUL_IMPROVEMENT ? closest : null,
    originalDistance,
    improvement,
    evaluatedCount: evaluatedVariants.length,
  }
}

export {
  MIN_MEANINGFUL_IMPROVEMENT,
  distributionError,
  describeCounterfactualAttribution,
  generateCounterfactualVariants,
  runCounterfactualAttribution,
}

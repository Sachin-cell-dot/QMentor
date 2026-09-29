import {
  RESPONSE_KEYS,
  RESPONSE_SCHEMA,
} from '../../shared/explanationContract.js'

const REQUEST_TIMEOUT_MS = 3000
const EXPLANATION_ENDPOINT = '/api/explain'

const formatDistribution = (distribution) => `[${distribution.join(', ')}]`

function createFallbackExplanation({
  prediction,
  actual,
  deterministicDiagnosis,
  explanationSeed,
}) {
  const counterfactual = deterministicDiagnosis.counterfactual_distribution
  const evidence = counterfactual
    ? `Your prediction ${formatDistribution(prediction)} is closer to the counterfactual Quirk distribution ${formatDistribution(counterfactual)} than the actual Quirk distribution ${formatDistribution(actual)}.`
    : `Your prediction ${formatDistribution(prediction)} differs from the actual Quirk distribution ${formatDistribution(actual)}, consistent with ${deterministicDiagnosis.label}.`

  return {
    cause: explanationSeed,
    evidence,
    next_step: 'Review the diagnosed gate behavior, then retry your prediction.',
  }
}

const numericTokens = (text) => text.match(/-?\d+(?:\.\d+)?/g) ?? []

function parseStructuredExplanation(text, allowedNumbers) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }

  if (
    parsed === null
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
    || Object.keys(parsed).sort().join(',') !== [...RESPONSE_KEYS].sort().join(',')
    || RESPONSE_KEYS.some((key) => typeof parsed[key] !== 'string' || parsed[key].trim() === '')
  ) {
    return null
  }

  const combined = RESPONSE_KEYS.map((key) => parsed[key].trim()).join(' ')
  const sentenceCount = (combined.match(/[.!?](?:\s|$)/g) ?? []).length
  if (sentenceCount < 2 || sentenceCount > 3) {
    return null
  }

  const allowed = new Set(allowedNumbers.map(String))
  if (numericTokens(combined).some((number) => !allowed.has(number))) {
    return null
  }

  return Object.fromEntries(RESPONSE_KEYS.map((key) => [key, parsed[key].trim()]))
}

async function explainMisconception({
  circuit,
  prediction,
  actual,
  deterministicDiagnosis,
  explanationSeed,
}) {
  const fallback = createFallbackExplanation({
    prediction,
    actual,
    deterministicDiagnosis,
    explanationSeed,
  })
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(EXPLANATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        circuit,
        prediction,
        actual,
        deterministicDiagnosis,
        explanationSeed,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { explanation: fallback, source: 'fallback' }
    }

    const payload = await response.json()
    const outputText = typeof payload?.outputText === 'string' ? payload.outputText : ''
    const allowedNumbers = [
      ...prediction,
      ...actual,
      ...(deterministicDiagnosis.counterfactual_distribution ?? []),
    ]
    const explanation = parseStructuredExplanation(outputText ?? '', allowedNumbers)
    return explanation === null
      ? { explanation: fallback, source: 'fallback' }
      : { explanation, source: 'ai' }
  } catch {
    return { explanation: fallback, source: 'fallback' }
  } finally {
    window.clearTimeout(timeout)
  }
}

export {
  RESPONSE_SCHEMA,
  createFallbackExplanation,
  explainMisconception,
  parseStructuredExplanation,
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MODEL = 'gpt-6-astra'
const REQUEST_TIMEOUT_MS = 3000
const RESPONSE_KEYS = ['cause', 'evidence', 'next_step']

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    cause: { type: 'string', minLength: 1 },
    evidence: { type: 'string', minLength: 1 },
    next_step: { type: 'string', minLength: 1 },
  },
  required: RESPONSE_KEYS,
  additionalProperties: false,
}

const extractOutputText = (response) => response.output
  ?.flatMap((item) => item.content ?? [])
  .find((content) => content.type === 'output_text')
  ?.text
  ?.trim()

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
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) {
    return { explanation: fallback, source: 'fallback' }
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        store: false,
        max_output_tokens: 180,
        text: {
          format: {
            type: 'json_schema',
            name: 'grounded_quantum_explanation',
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        instructions: [
          'Return JSON containing cause, evidence, and next_step in 2–3 concise sentences total.',
          'Use only numbers supplied in the input; never calculate, infer, invent, or restate other probability values.',
          'Do not change, replace, or second-guess the deterministic diagnosis.',
          'cause is the conceptual reason for the supplied diagnosis.',
          'evidence references only the supplied prediction, actual, and counterfactual values.',
          'next_step is one short actionable learning suggestion.',
        ].join(' '),
        input: JSON.stringify({
          current_circuit_json: circuit,
          submitted_prediction: prediction,
          real_quirk_actual_probabilities: actual,
          deterministic_diagnosis: deterministicDiagnosis,
          explanation_seed: explanationSeed,
        }),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { explanation: fallback, source: 'fallback' }
    }

    const outputText = extractOutputText(await response.json())
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

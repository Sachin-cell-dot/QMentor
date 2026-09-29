import {
  EXPLANATION_INSTRUCTIONS,
  RESPONSE_SCHEMA,
} from '../shared/explanationContract.js'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MODEL = 'gpt-6-astra'
const SERVER_TIMEOUT_MS = 2500
const MAX_REQUEST_BYTES = 64 * 1024

const isFiniteDistribution = (value) => (
  Array.isArray(value)
  && value.length > 0
  && value.every((entry) => Number.isFinite(entry))
)

function validateExplanationInput(payload) {
  if (
    payload === null
    || typeof payload !== 'object'
    || Array.isArray(payload)
    || typeof payload.circuit !== 'string'
    || payload.circuit.trim() === ''
    || !isFiniteDistribution(payload.prediction)
    || !isFiniteDistribution(payload.actual)
    || payload.prediction.length !== payload.actual.length
    || payload.deterministicDiagnosis === null
    || typeof payload.deterministicDiagnosis !== 'object'
    || typeof payload.deterministicDiagnosis.label !== 'string'
    || payload.deterministicDiagnosis.label.trim() === ''
    || typeof payload.explanationSeed !== 'string'
    || payload.explanationSeed.trim() === ''
  ) {
    return false
  }

  const counterfactual = payload.deterministicDiagnosis.counterfactual_distribution
  return counterfactual === undefined || (
    isFiniteDistribution(counterfactual)
    && counterfactual.length === payload.actual.length
  )
}

const extractOutputText = (response) => response.output
  ?.flatMap((item) => item.content ?? [])
  .find((content) => content.type === 'output_text')
  ?.text
  ?.trim()

async function requestOpenAIExplanation(payload, { apiKey, fetchImpl = fetch } = {}) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured.')
  }
  if (!validateExplanationInput(payload)) {
    throw new TypeError('Invalid grounded explanation input.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS)
  try {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
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
        instructions: EXPLANATION_INSTRUCTIONS,
        input: JSON.stringify({
          current_circuit_json: payload.circuit,
          submitted_prediction: payload.prediction,
          real_quirk_actual_probabilities: payload.actual,
          deterministic_diagnosis: payload.deterministicDiagnosis,
          explanation_seed: payload.explanationSeed,
        }),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}.`)
    }
    const outputText = extractOutputText(await response.json())
    if (!outputText) {
      throw new Error('OpenAI response did not contain structured output text.')
    }
    return outputText
  } finally {
    clearTimeout(timeout)
  }
}

async function readRequestBody(request) {
  if (request.body !== undefined) {
    if (typeof request.body === 'string') {
      return JSON.parse(request.body)
    }
    if (request.body !== null && typeof request.body === 'object') {
      return request.body
    }
  }

  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_REQUEST_BYTES) {
      throw new RangeError('Request body is too large.')
    }
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const sendJson = (response, statusCode, value) => {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(value))
}

function createExplainHandler({ apiKey = process.env.OPENAI_API_KEY, fetchImpl = fetch } = {}) {
  return async function explainHandler(request, response) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST')
      sendJson(response, 405, { error: 'Method not allowed.' })
      return
    }
    if (!apiKey) {
      sendJson(response, 503, { error: 'AI explanation service is not configured.' })
      return
    }

    let payload
    try {
      payload = await readRequestBody(request)
    } catch {
      sendJson(response, 400, { error: 'Invalid JSON request body.' })
      return
    }
    if (!validateExplanationInput(payload)) {
      sendJson(response, 400, { error: 'Invalid grounded explanation input.' })
      return
    }

    try {
      const outputText = await requestOpenAIExplanation(payload, { apiKey, fetchImpl })
      sendJson(response, 200, { outputText })
    } catch (error) {
      const timedOut = error?.name === 'AbortError'
      sendJson(response, timedOut ? 504 : 502, {
        error: timedOut ? 'AI explanation timed out.' : 'AI explanation request failed.',
      })
    }
  }
}

const serverlessHandler = createExplainHandler()

export default serverlessHandler
export {
  createExplainHandler,
  requestOpenAIExplanation,
  validateExplanationInput,
}

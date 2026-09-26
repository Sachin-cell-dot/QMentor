const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const MODEL = 'gpt-6-astra'
const REQUEST_TIMEOUT_MS = 3000

const extractOutputText = (response) => response.output
  ?.flatMap((item) => item.content ?? [])
  .find((content) => content.type === 'output_text')
  ?.text
  ?.trim()

async function explainMisconception({
  circuit,
  prediction,
  actual,
  misconceptionId,
  explanationSeed,
}) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) {
    return null
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
        max_output_tokens: 160,
        instructions: [
          'Explain in 2–3 sentences why the already-matched misconception applies to this circuit.',
          'Use only the numbers provided in the input.',
          'Never calculate, invent, infer, or state any additional probability values.',
          'Explain only the supplied misconception; do not diagnose a different one.',
        ].join(' '),
        input: JSON.stringify({
          circuit,
          submitted_prediction: prediction,
          real_quirk_actual_probabilities: actual,
          matched_misconception_id: misconceptionId,
          explanation_seed: explanationSeed,
        }),
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return null
    }

    return extractOutputText(await response.json()) ?? null
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

export { explainMisconception }

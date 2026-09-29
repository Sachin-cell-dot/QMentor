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

const EXPLANATION_INSTRUCTIONS = [
  'Return JSON containing cause, evidence, and next_step in 2–3 concise sentences total.',
  'Use only numbers supplied in the input; never calculate, infer, invent, or restate other probability values.',
  'Do not change, replace, or second-guess the deterministic diagnosis.',
  'cause is the conceptual reason for the supplied diagnosis.',
  'evidence references only the supplied prediction, actual, and counterfactual values.',
  'next_step is one short actionable learning suggestion.',
].join(' ')

export { EXPLANATION_INSTRUCTIONS, RESPONSE_KEYS, RESPONSE_SCHEMA }

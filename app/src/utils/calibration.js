const CONFIDENCE_LEVELS = ['low', 'medium', 'high']
const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 }
const NUMERIC_EPSILON = 1e-12

// Calibration rule: L1 error <= 0.1 maps to high confidence, <= 0.5 maps to
// medium confidence, and larger errors map to low confidence. Calibration
// improves when retry error falls or the selected confidence moves closer to
// the confidence tier appropriate for that retry error.
const appropriateConfidenceRank = (error) => (
  error <= 0.1 + NUMERIC_EPSILON
    ? CONFIDENCE_RANK.high
    : error <= 0.5 + NUMERIC_EPSILON
      ? CONFIDENCE_RANK.medium
      : CONFIDENCE_RANK.low
)

const confidenceCalibrationGap = (confidence, error) => (
  Math.abs(CONFIDENCE_RANK[confidence] - appropriateConfidenceRank(error))
)

const didCalibrationImprove = ({
  attempt1Confidence,
  retryConfidence,
  attempt1Error,
  retryError,
}) => (
  retryError < attempt1Error
  || confidenceCalibrationGap(retryConfidence, retryError)
    < confidenceCalibrationGap(attempt1Confidence, attempt1Error)
)

export { CONFIDENCE_LEVELS, confidenceCalibrationGap, didCalibrationImprove }

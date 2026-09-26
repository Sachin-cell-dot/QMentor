import { useEffect, useRef, useState } from 'react'
import { lessons } from './data/lessons.js'
import { explainMisconception } from './services/explainMisconception.js'
import './styles.css'

const PROBABILITY_TOLERANCE = 1e-6
// Maximum allowed absolute difference for each outcome in deterministic diagnosis matching.
const DIAGNOSIS_TOLERANCE = 0.05
const RETRY_STORAGE_KEY = 'qmentor.retry.v1'

const emptyPredictionFor = (lesson) => lesson.correct_probs.map(() => '')

const readQuirkProbabilities = (payload) => {
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

const distributionsAreClose = (left, right, tolerance = DIAGNOSIS_TOLERANCE) => (
  left.length === right.length
  && left.every((value, index) => Math.abs(value - right[index]) <= tolerance)
)

const distributionError = (prediction, actual) => prediction.reduce(
  (error, value, index) => error + Math.abs(value - actual[index]),
  0,
)

const readSavedImprovement = (lessonId) => {
  try {
    const record = JSON.parse(window.localStorage.getItem(RETRY_STORAGE_KEY) ?? '{}')[lessonId]
    if (
      typeof record?.improved === 'boolean'
      && Number.isFinite(record.attempt1Error)
      && Number.isFinite(record.retryError)
    ) {
      return record
    }
  } catch {
    // Ignore missing or malformed local data.
  }
  return null
}

const saveImprovement = (lessonId, record) => {
  try {
    let stored = JSON.parse(window.localStorage.getItem(RETRY_STORAGE_KEY) ?? '{}')
    if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
      stored = {}
    }
    window.localStorage.setItem(RETRY_STORAGE_KEY, JSON.stringify({
      ...stored,
      [lessonId]: record,
    }))
  } catch {
    // Keep the lesson usable when storage is unavailable or malformed.
  }
}

function ProbabilityBar({ label, value, color }) {
  return (
    <div className="probability-bar">
      <span className="probability-bar__label">{label}</span>
      <div className="probability-bar__track">
        <div
          className="probability-bar__fill"
          style={{ background: color, width: `${value * 100}%` }}
        />
      </div>
      <span className="probability-bar__value">{value}</span>
    </div>
  )
}

function Diagnosis({ prediction, actual, lesson, explanation }) {
  if (distributionsAreClose(prediction, actual)) {
    return (
      <div className="diagnosis diagnosis--success" aria-label="Diagnosis">
        <strong>Result</strong>
        <p>Your prediction matches the real simulator distribution.</p>
      </div>
    )
  }

  if (distributionsAreClose(prediction, lesson.common_wrong_guess)) {
    return (
      <div className="diagnosis diagnosis--guided" aria-label="Diagnosis">
        <p><strong>Misconception:</strong> {lesson.misconception_id}</p>
        <p>{explanation ?? lesson.explanation_seed}</p>
      </div>
    )
  }

  return (
    <div className="diagnosis" aria-label="Diagnosis">
      <strong>Feedback</strong>
      <p>Your prediction was not quite correct.</p>
      <p>Real simulator distribution: [{actual.join(', ')}]</p>
    </div>
  )
}

function App() {
  const quirkFrameRef = useRef(null)
  const aiRequestKeyRef = useRef(null)
  const [latestCircuit, setLatestCircuit] = useState(null)
  const [latestProbabilities, setLatestProbabilities] = useState(null)
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0].id)
  const [quirkSource, setQuirkSource] = useState(
    `/quirk/quirk.html${lessons[0].starterCircuitHash}`,
  )
  const [predictionInputs, setPredictionInputs] = useState(() => emptyPredictionFor(lessons[0]))
  const [submittedPrediction, setSubmittedPrediction] = useState(null)
  const [predictionFeedback, setPredictionFeedback] = useState('')
  const [comparisonRequested, setComparisonRequested] = useState(false)
  const [aiExplanation, setAiExplanation] = useState(null)
  const [attempt, setAttempt] = useState('initial')
  const [attemptOneError, setAttemptOneError] = useState(null)
  const [savedImprovement, setSavedImprovement] = useState(() => (
    readSavedImprovement(lessons[0].id)
  ))

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId)
  const actualProbabilities = readQuirkProbabilities(latestProbabilities)

  useEffect(() => {
    const handleQuirkMessage = (event) => {
      const quirkWindow = quirkFrameRef.current?.contentWindow
      if (event.source !== quirkWindow || event.origin !== window.location.origin) {
        return
      }

      if (event.data?.type === 'circuit_changed') {
        setLatestCircuit(event.data.circuit)
        setComparisonRequested(false)
        setAiExplanation(null)
        aiRequestKeyRef.current = null
        console.info('[QMentor] circuit_changed', event.data.circuit)
      } else if (event.data?.type === 'state_computed') {
        setLatestProbabilities(event.data.probs)
        console.info('[QMentor] state_computed', event.data.probs)
      }
    }

    window.addEventListener('message', handleQuirkMessage)
    return () => window.removeEventListener('message', handleQuirkMessage)
  }, [])

  const openStarterCircuit = () => {
    setLatestProbabilities(null)
    setComparisonRequested(false)
    setAiExplanation(null)
    aiRequestKeyRef.current = null
    setAttempt('initial')
    setAttemptOneError(null)
    setPredictionInputs(emptyPredictionFor(selectedLesson))
    setSubmittedPrediction(null)
    setPredictionFeedback('')
    setQuirkSource(`/quirk/quirk.html${selectedLesson.starterCircuitHash}`)
  }

  const selectLesson = (lesson) => {
    setSelectedLessonId(lesson.id)
    setPredictionInputs(emptyPredictionFor(lesson))
    setSubmittedPrediction(null)
    setPredictionFeedback('')
    setLatestProbabilities(null)
    setComparisonRequested(false)
    setAiExplanation(null)
    aiRequestKeyRef.current = null
    setAttempt('initial')
    setAttemptOneError(null)
    setSavedImprovement(readSavedImprovement(lesson.id))
  }

  const updatePredictionInput = (index, value) => {
    setPredictionInputs((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? value : entry
    )))
    setSubmittedPrediction(null)
    setPredictionFeedback('')
    setComparisonRequested(false)
    setAiExplanation(null)
    aiRequestKeyRef.current = null
  }

  const submitPrediction = (event) => {
    event.preventDefault()
    setComparisonRequested(false)
    setAiExplanation(null)
    aiRequestKeyRef.current = null

    if (predictionInputs.some((value) => value.trim() === '')) {
      setSubmittedPrediction(null)
      setPredictionFeedback('Enter a probability for every outcome.')
      return
    }

    const prediction = predictionInputs.map(Number)
    if (prediction.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
      setSubmittedPrediction(null)
      setPredictionFeedback('Each probability must be a number from 0 to 1.')
      return
    }

    const total = prediction.reduce((sum, value) => sum + value, 0)
    if (Math.abs(total - 1) > PROBABILITY_TOLERANCE) {
      setSubmittedPrediction(null)
      setPredictionFeedback(`Probabilities must sum to 1. Current total: ${total}.`)
      return
    }

    setSubmittedPrediction(prediction)
    setPredictionFeedback('Prediction saved. Reveal Result is now available.')
  }

  const revealResult = () => {
    setComparisonRequested(true)

    if (
      actualProbabilities === null
      || submittedPrediction === null
      || actualProbabilities.length !== submittedPrediction.length
    ) {
      return
    }

    const currentError = distributionError(submittedPrediction, actualProbabilities)
    if (attempt === 'initial') {
      setAttemptOneError(currentError)
    } else if (attemptOneError !== null) {
      const improvement = {
        improved: currentError < attemptOneError,
        attempt1Error: attemptOneError,
        retryError: currentError,
      }
      saveImprovement(selectedLesson.id, improvement)
      setSavedImprovement(improvement)
    }

    if (
      distributionsAreClose(submittedPrediction, actualProbabilities)
      || !distributionsAreClose(submittedPrediction, selectedLesson.common_wrong_guess)
      || typeof latestCircuit !== 'string'
    ) {
      return
    }

    const requestKey = JSON.stringify({
      circuit: latestCircuit,
      prediction: submittedPrediction,
      actual: actualProbabilities,
      misconceptionId: selectedLesson.misconception_id,
    })
    if (aiRequestKeyRef.current === requestKey) {
      return
    }
    aiRequestKeyRef.current = requestKey
    setAiExplanation(selectedLesson.explanation_seed)

    explainMisconception({
      circuit: latestCircuit,
      prediction: submittedPrediction,
      actual: actualProbabilities,
      misconceptionId: selectedLesson.misconception_id,
      explanationSeed: selectedLesson.explanation_seed,
    }).then((explanation) => {
      if (explanation && aiRequestKeyRef.current === requestKey) {
        setAiExplanation(explanation)
      }
    })
  }

  const startRetry = () => {
    setAttempt('retry')
    setPredictionInputs(emptyPredictionFor(selectedLesson))
    setSubmittedPrediction(null)
    setPredictionFeedback('')
    setLatestCircuit(null)
    setLatestProbabilities(null)
    setComparisonRequested(false)
    setAiExplanation(null)
    aiRequestKeyRef.current = null
    setQuirkSource(`/quirk/quirk.html${selectedLesson.retryCircuitHash}`)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <div>
          <p className="eyebrow">Interactive quantum learning</p>
          <h1>QMentor</h1>
          <p className="tagline">Prediction-First Quantum Learning</p>
        </div>
        <span className="stage-badge">MVP learning lab</span>
      </header>

      <main>
        <nav className="lesson-nav" aria-label="Lessons">
          {lessons.map((lesson, index) => (
            <button
              className="lesson-tab"
              key={lesson.id}
              type="button"
              aria-pressed={lesson.id === selectedLessonId}
              onClick={() => selectLesson(lesson)}
            >
              <span>{index + 1}</span>
              {lesson.title}
            </button>
          ))}
        </nav>

        <div className="workspace">
          <div className="learning-column">
            <section className="card lesson-card" aria-labelledby="lesson-title">
              <p className="section-label">Current lesson</p>
              <h2 id="lesson-title">{selectedLesson.title}</h2>
              <p><strong>{selectedLesson.concept}:</strong> {selectedLesson.explanation_seed}</p>
              <button className="button button--secondary" type="button" onClick={openStarterCircuit}>
                Open starter circuit in Quirk
              </button>
            </section>

            <form className="card prediction-card" onSubmit={submitPrediction} noValidate>
              <fieldset>
                <legend>
                  <span className="attempt-chip">
                    {attempt === 'initial' ? 'Attempt 1' : 'Retry attempt'}
                  </span>
                  Predict the measurement probabilities
                </legend>
                <p className="form-hint">Enter a value from 0 to 1 for every outcome. The total must equal 1.</p>
                <div className="prediction-grid">
                  {predictionInputs.map((value, index) => {
                    const qubitCount = Math.log2(predictionInputs.length)
                    const outcome = index.toString(2).padStart(qubitCount, '0')
                    return (
                      <label className="prediction-input" key={outcome}>
                        <span>Probability of <strong>|{outcome}⟩</strong></span>
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="any"
                          value={value}
                          onChange={(event) => updatePredictionInput(index, event.target.value)}
                        />
                      </label>
                    )
                  })}
                </div>
                <div className="button-row">
                  <button className="button button--secondary" type="submit">Submit prediction</button>
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={submittedPrediction === null}
                    onClick={revealResult}
                  >
                    Reveal Result
                  </button>
                </div>
                {predictionFeedback && (
                  <p className="status-message" role="status" aria-live="polite">{predictionFeedback}</p>
                )}
              </fieldset>
            </form>

            {comparisonRequested && (
              <section className="card comparison-card" aria-labelledby="comparison-title">
                <p className="section-label">Comparison</p>
                <h2 id="comparison-title">
                  {attempt === 'initial' ? 'Attempt 1' : 'Retry attempt'}: predicted vs actual
                </h2>
                {actualProbabilities === null ? (
                  <p className="status-message" role="status">Waiting for a valid probability result from Quirk.</p>
                ) : actualProbabilities.length !== submittedPrediction.length ? (
                  <p className="status-message status-message--error" role="alert">
                    Quirk returned {actualProbabilities.length} outcomes, but this prediction has{' '}
                    {submittedPrediction.length}. Update the circuit and try again.
                  </p>
                ) : (
                  <>
                    <div className="chart-legend" aria-hidden="true">
                      <span><i className="legend-dot legend-dot--prediction" />Predicted</span>
                      <span><i className="legend-dot legend-dot--actual" />Actual</span>
                    </div>
                    {actualProbabilities.map((actual, index) => {
                      const qubitCount = Math.log2(actualProbabilities.length)
                      const outcome = index.toString(2).padStart(qubitCount, '0')
                      return (
                        <div className="outcome-row" key={outcome}>
                          <strong className="outcome-label">|{outcome}&gt;</strong>
                          <ProbabilityBar label="Predicted" value={submittedPrediction[index]} color="#6366f1" />
                          <ProbabilityBar label="Actual" value={actual} color="#0f9f76" />
                        </div>
                      )
                    })}
                    <Diagnosis
                      prediction={submittedPrediction}
                      actual={actualProbabilities}
                      lesson={selectedLesson}
                      explanation={aiExplanation}
                    />
                    {attempt === 'initial' && (
                      <button className="button button--primary" type="button" onClick={startRetry}>Try Again</button>
                    )}
                  </>
                )}
              </section>
            )}

            {savedImprovement && (
              <p className="saved-result" data-testid="retry-improvement">
                <strong>Saved retry result:</strong> {savedImprovement.improved ? 'improved' : 'did not improve'}{' '}
                (attempt 1 error: {savedImprovement.attempt1Error}, retry error:{' '}
                {savedImprovement.retryError}).
              </p>
            )}
          </div>

          <section className="simulator-panel" aria-labelledby="simulator-title">
            <div className="simulator-heading">
              <div>
                <p className="section-label">Live workspace</p>
                <h2 id="simulator-title">Quirk circuit simulator</h2>
              </div>
              <span className="live-indicator"><i />Live</span>
            </div>
            <iframe
              ref={quirkFrameRef}
              src={quirkSource}
              title="Quirk quantum circuit simulator"
            />
          </section>
        </div>
      </main>

      <footer>
        Circuit simulation powered by a fork of Quirk (Craig Gidney, Apache-2.0).
      </footer>
    </div>
  )
}

export default App

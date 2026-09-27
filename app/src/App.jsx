import { useEffect, useRef, useState } from 'react'
import { lessons } from './data/lessons.js'
import {
  createFallbackExplanation,
  explainMisconception,
} from './services/explainMisconception.js'
import {
  describeCounterfactualAttribution,
  distributionError,
  runCounterfactualAttribution,
} from './services/counterfactualAttribution.js'
import { CONFIDENCE_LEVELS, didCalibrationImprove } from './utils/calibration.js'
import AnimatedContent from './components/AnimatedContent.jsx'
import Aurora from './components/Aurora.jsx'
import RubberSegment from './components/RubberSegment.jsx'
import ShinyText from './components/ShinyText.jsx'
import './styles.css'

const PROBABILITY_TOLERANCE = 1e-6
// Maximum allowed absolute difference for each outcome in deterministic diagnosis matching.
const DIAGNOSIS_TOLERANCE = 0.05
const NUMERIC_EPSILON = 1e-12
const RETRY_STORAGE_KEY = 'qmentor.retry.v1'
const CONCEPT_GRAPH_ORDER = ['superposition', 'measurement', 'interference', 'entanglement']

const emptyPredictionFor = (lesson) => lesson.correct_probs.map(() => '')
const circuitJsonFromHash = (hash) => decodeURIComponent(hash.replace(/^#circuit=/, ''))

const readQuirkProbabilities = (payload) => {
  if (Array.isArray(payload)) {
    return payload.every(Number.isFinite) ? payload : null
  }
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
  && left.every((value, index) => Math.abs(value - right[index]) <= tolerance + NUMERIC_EPSILON)
)

const readSavedImprovement = (lessonId) => {
  try {
    const record = JSON.parse(window.localStorage.getItem(RETRY_STORAGE_KEY) ?? '{}')[lessonId]
    if (
      typeof record?.improved === 'boolean'
      && typeof record.calibrationImproved === 'boolean'
      && CONFIDENCE_LEVELS.includes(record.attempt1Confidence)
      && CONFIDENCE_LEVELS.includes(record.retryConfidence)
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

const readAttemptOneResult = (lessonId) => {
  try {
    const record = JSON.parse(window.localStorage.getItem(RETRY_STORAGE_KEY) ?? '{}')[lessonId]
    if (
      Number.isFinite(record?.attempt1Error)
      && CONFIDENCE_LEVELS.includes(record.attempt1Confidence)
    ) {
      return record
    }
  } catch {
    // Ignore missing or malformed local data.
  }
  return null
}

const saveAttemptOneResult = (lessonId, attempt1Confidence, attempt1Error) => {
  try {
    let stored = JSON.parse(window.localStorage.getItem(RETRY_STORAGE_KEY) ?? '{}')
    if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
      stored = {}
    }
    window.localStorage.setItem(RETRY_STORAGE_KEY, JSON.stringify({
      ...stored,
      [lessonId]: { attempt1Confidence, attempt1Error },
    }))
  } catch {
    // Keep the lesson usable when storage is unavailable or malformed.
  }
}

const masteryForLesson = (lessonId) => {
  const record = readAttemptOneResult(lessonId)
  if (record === null) {
    return 'not-attempted'
  }
  return record.attempt1Error <= PROBABILITY_TOLERANCE
    ? 'first-try-correct'
    : 'needed-retry'
}

function ProbabilityBar({ label, value, color }) {
  return (
    <div className="probability-bar" aria-label={`${label} probability ${value}`}>
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

function GroundedExplanation({ feedback, source, prediction, actual, counterfactual }) {
  return (
    <div className="grounded-explanation" aria-label="Grounded explanation">
      <span className={`feedback-source feedback-source--${source}`}>
        {source === 'ai' ? 'AI-grounded explanation' : 'Deterministic fallback'}
      </span>
      <p><strong>Cause</strong><span>{feedback.cause}</span></p>
      <p><strong>Evidence</strong><span>{feedback.evidence}</span></p>
      <p><strong>Next step</strong><span>{feedback.next_step}</span></p>
      <div className="grounding-data">
        <strong>Grounding data</strong>
        <span>Predicted: [{prediction.join(', ')}]</span>
        <span>Actual (Quirk): [{actual.join(', ')}]</span>
        {counterfactual && (
          <span>Counterfactual (Quirk): [{counterfactual.join(', ')}]</span>
        )}
      </div>
    </div>
  )
}

function AiLoadingNotice() {
  return (
    <p className="ai-loading" role="status" aria-live="polite">
      <span className="ai-loading__dot" aria-hidden="true" />
      <ShinyText
        text="AI explanation is loading. Deterministic feedback is ready now."
        color="#675319"
        shineColor="#c47a0a"
        speed={1.4}
      />
    </p>
  )
}

function Diagnosis({
  prediction,
  actual,
  lesson,
  explanation,
  explanationSource,
  counterfactualAttribution,
  aiLoading,
}) {
  if (distributionsAreClose(prediction, actual)) {
    return (
      <div className="diagnosis diagnosis--success" aria-label="Diagnosis">
        <div className="diagnosis-heading">
          <span className="diagnosis-icon" aria-hidden="true">✓</span>
          <div><span>Accurate prediction</span><strong>Result</strong></div>
        </div>
        <p>Your prediction matches the real simulator distribution.</p>
      </div>
    )
  }

  if (distributionsAreClose(prediction, lesson.common_wrong_guess)) {
    return (
      <div
        className="diagnosis diagnosis--guided"
        data-diagnosis="misconception"
        aria-label="Diagnosis"
        aria-busy={aiLoading}
      >
        <div className="diagnosis-heading">
          <span className="diagnosis-icon" aria-hidden="true">!</span>
          <div><span>Pattern detected</span><strong>Misconception: {lesson.misconception_id}</strong></div>
        </div>
        {explanation ? (
          <GroundedExplanation
            feedback={explanation}
            source={explanationSource}
            prediction={prediction}
            actual={actual}
            counterfactual={null}
          />
        ) : <p>{lesson.explanation_seed}</p>}
        {aiLoading && <AiLoadingNotice />}
      </div>
    )
  }

  const counterfactualDiagnosis = describeCounterfactualAttribution(counterfactualAttribution)
  if (counterfactualDiagnosis !== null) {
    return (
      <div
        className="diagnosis diagnosis--guided"
        data-diagnosis="counterfactual"
        aria-label="Diagnosis"
        aria-busy={aiLoading}
      >
        <div className="diagnosis-heading">
          <span className="diagnosis-icon" aria-hidden="true">↔</span>
          <div><span>Closest circuit variant</span><strong>Counterfactual diagnosis</strong></div>
        </div>
        <p>{counterfactualDiagnosis}</p>
        {explanation && (
          <GroundedExplanation
            feedback={explanation}
            source={explanationSource}
            prediction={prediction}
            actual={actual}
            counterfactual={counterfactualAttribution.probabilities}
          />
        )}
        {aiLoading && <AiLoadingNotice />}
      </div>
    )
  }

  return (
    <div className="diagnosis" aria-label="Diagnosis">
      <div className="diagnosis-heading">
        <span className="diagnosis-icon" aria-hidden="true">i</span>
        <div><span>Review needed</span><strong>Feedback</strong></div>
      </div>
      <p>Your prediction was not quite correct.</p>
      <p>Real simulator distribution: [{actual.join(', ')}]</p>
    </div>
  )
}

function App() {
  const quirkFrameRef = useRef(null)
  const aiRequestKeyRef = useRef(null)
  const counterfactualRequestKeyRef = useRef(null)
  const counterfactualAbortRef = useRef(null)
  const [latestCircuit, setLatestCircuit] = useState(() => (
    circuitJsonFromHash(lessons[0].starterCircuitHash)
  ))
  const [latestProbabilities, setLatestProbabilities] = useState(null)
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0].id)
  const [quirkSource, setQuirkSource] = useState(
    `/quirk/quirk.html${lessons[0].starterCircuitHash}`,
  )
  const [quirkFrameKey, setQuirkFrameKey] = useState(0)
  const [predictionInputs, setPredictionInputs] = useState(() => emptyPredictionFor(lessons[0]))
  const [submittedPrediction, setSubmittedPrediction] = useState(null)
  const [predictionFeedback, setPredictionFeedback] = useState('')
  const [confidence, setConfidence] = useState('')
  const [comparisonRequested, setComparisonRequested] = useState(false)
  const [aiExplanation, setAiExplanation] = useState(null)
  const [aiExplanationSource, setAiExplanationSource] = useState('fallback')
  const [aiLoading, setAiLoading] = useState(false)
  const [counterfactualAttribution, setCounterfactualAttribution] = useState(null)
  const [counterfactualStatus, setCounterfactualStatus] = useState('idle')
  const [attempt, setAttempt] = useState('initial')
  const [attemptOneError, setAttemptOneError] = useState(null)
  const [attemptOneConfidence, setAttemptOneConfidence] = useState(null)
  const [savedImprovement, setSavedImprovement] = useState(() => (
    readSavedImprovement(lessons[0].id)
  ))
  const [entryPath, setEntryPath] = useState(null)
  const [explainedLessonId, setExplainedLessonId] = useState(null)
  const [learnCircuitOpened, setLearnCircuitOpened] = useState(false)

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId)
  const conceptLessons = CONCEPT_GRAPH_ORDER.map(
    (lessonId) => lessons.find((lesson) => lesson.id === lessonId),
  )
  const actualProbabilities = readQuirkProbabilities(latestProbabilities)
  const lessonMastery = Object.fromEntries(
    lessons.map((lesson) => [lesson.id, masteryForLesson(lesson.id)]),
  )

  useEffect(() => {
    const handleQuirkMessage = (event) => {
      const quirkWindow = quirkFrameRef.current?.contentWindow
      if (event.source !== quirkWindow || event.origin !== window.location.origin) {
        return
      }

      if (event.data?.type === 'circuit_changed') {
        counterfactualAbortRef.current?.abort()
        counterfactualAbortRef.current = null
        counterfactualRequestKeyRef.current = null
        setCounterfactualAttribution(null)
        setLatestCircuit(event.data.circuit)
        setComparisonRequested(false)
        setAiExplanation(null)
        setAiLoading(false)
        aiRequestKeyRef.current = null
        console.info('[QMentor] circuit_changed', event.data.circuit)
      } else if (event.data?.type === 'state_computed') {
        setLatestProbabilities(event.data.probs)
        console.info('[QMentor] state_computed', event.data.probs)
      }
    }

    window.addEventListener('message', handleQuirkMessage)
    return () => {
      window.removeEventListener('message', handleQuirkMessage)
      counterfactualAbortRef.current?.abort()
    }
  }, [])

  const resetCounterfactualRun = () => {
    counterfactualAbortRef.current?.abort()
    counterfactualAbortRef.current = null
    counterfactualRequestKeyRef.current = null
    setCounterfactualAttribution(null)
    setCounterfactualStatus('idle')
  }

  const openStarterCircuit = () => {
    setLatestCircuit(circuitJsonFromHash(selectedLesson.starterCircuitHash))
    setLatestProbabilities(null)
    setComparisonRequested(false)
    setAiExplanation(null)
    setAiLoading(false)
    aiRequestKeyRef.current = null
    resetCounterfactualRun()
    setAttempt('initial')
    setAttemptOneError(null)
    setAttemptOneConfidence(null)
    setConfidence('')
    setPredictionInputs(emptyPredictionFor(selectedLesson))
    setSubmittedPrediction(null)
    setPredictionFeedback('')
    setQuirkSource(`/quirk/quirk.html${selectedLesson.starterCircuitHash}`)
    setQuirkFrameKey((current) => current + 1)
  }

  const selectLesson = (lesson) => {
    if (lesson.id === selectedLessonId) {
      return
    }
    setSelectedLessonId(lesson.id)
    setLatestCircuit(null)
    setPredictionInputs(emptyPredictionFor(lesson))
    setSubmittedPrediction(null)
    setPredictionFeedback('')
    setLatestProbabilities(null)
    setComparisonRequested(false)
    setAiExplanation(null)
    setAiLoading(false)
    aiRequestKeyRef.current = null
    resetCounterfactualRun()
    setAttempt('initial')
    setAttemptOneError(null)
    setAttemptOneConfidence(null)
    setConfidence('')
    setSavedImprovement(readSavedImprovement(lesson.id))
  }

  const chooseLesson = (lesson) => {
    selectLesson(lesson)
    if (entryPath === 'learn') {
      setExplainedLessonId(lesson.id)
      setLearnCircuitOpened(false)
    }
  }

  const openSelectedCircuit = () => {
    openStarterCircuit()
    if (entryPath === 'learn') {
      setLearnCircuitOpened(true)
    }
  }

  const updatePredictionInput = (index, value) => {
    setPredictionInputs((current) => current.map((entry, entryIndex) => (
      entryIndex === index ? value : entry
    )))
    setSubmittedPrediction(null)
    setPredictionFeedback('')
    setComparisonRequested(false)
    setAiExplanation(null)
    setAiLoading(false)
    aiRequestKeyRef.current = null
    resetCounterfactualRun()
  }

  const updateConfidence = (value) => {
    setConfidence(value)
    setSubmittedPrediction(null)
    setPredictionFeedback('')
    setComparisonRequested(false)
    setAiExplanation(null)
    setAiLoading(false)
    aiRequestKeyRef.current = null
    resetCounterfactualRun()
  }

  const submitPrediction = (event) => {
    event.preventDefault()
    setComparisonRequested(false)
    setAiExplanation(null)
    setAiLoading(false)
    aiRequestKeyRef.current = null
    resetCounterfactualRun()

    if (!CONFIDENCE_LEVELS.includes(confidence)) {
      setSubmittedPrediction(null)
      setPredictionFeedback('Select your confidence before submitting.')
      return
    }

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

  const requestGroundedExplanation = ({
    circuit,
    prediction,
    actual,
    deterministicDiagnosis,
  }) => {
    const requestKey = JSON.stringify({
      circuit,
      prediction,
      actual,
      deterministicDiagnosis,
    })
    if (aiRequestKeyRef.current === requestKey) {
      return
    }
    aiRequestKeyRef.current = requestKey
    setAiExplanation(createFallbackExplanation({
      prediction,
      actual,
      deterministicDiagnosis,
      explanationSeed: selectedLesson.explanation_seed,
    }))
    setAiExplanationSource('fallback')
    setAiLoading(true)

    explainMisconception({
      circuit,
      prediction,
      actual,
      deterministicDiagnosis,
      explanationSeed: selectedLesson.explanation_seed,
    }).then(({ explanation, source }) => {
      if (aiRequestKeyRef.current === requestKey) {
        setAiExplanation(explanation)
        setAiExplanationSource(source)
        setAiLoading(false)
      }
    }).catch(() => {
      if (aiRequestKeyRef.current === requestKey) {
        setAiLoading(false)
      }
    })
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
      setAttemptOneConfidence(confidence)
      saveAttemptOneResult(selectedLesson.id, confidence, currentError)
      setSavedImprovement(null)
    } else if (attemptOneError !== null && attemptOneConfidence !== null) {
      const improvement = {
        improved: currentError < attemptOneError,
        calibrationImproved: didCalibrationImprove({
          attempt1Confidence: attemptOneConfidence,
          retryConfidence: confidence,
          attempt1Error: attemptOneError,
          retryError: currentError,
        }),
        attempt1Confidence: attemptOneConfidence,
        retryConfidence: confidence,
        attempt1Error: attemptOneError,
        retryError: currentError,
      }
      saveImprovement(selectedLesson.id, improvement)
      setSavedImprovement(improvement)
    }

    const predictionIsCorrect = distributionsAreClose(submittedPrediction, actualProbabilities)
    const matchesCannedMisconception = distributionsAreClose(
      submittedPrediction,
      selectedLesson.common_wrong_guess,
    )
    if (!predictionIsCorrect && !matchesCannedMisconception && typeof latestCircuit === 'string') {
      const counterfactualKey = JSON.stringify({
        circuit: latestCircuit,
        prediction: submittedPrediction,
        actual: actualProbabilities,
      })
      if (counterfactualRequestKeyRef.current !== counterfactualKey) {
        resetCounterfactualRun()
        counterfactualRequestKeyRef.current = counterfactualKey
        setCounterfactualStatus('running')
        const controller = new AbortController()
        counterfactualAbortRef.current = controller
        runCounterfactualAttribution({
          circuitJson: latestCircuit,
          prediction: submittedPrediction,
          originalActual: actualProbabilities,
          signal: controller.signal,
        }).then((result) => {
          if (!controller.signal.aborted && counterfactualRequestKeyRef.current === counterfactualKey) {
            const attribution = result?.attribution ?? null
            setCounterfactualAttribution(attribution)
            setCounterfactualStatus('complete')
            if (attribution !== null) {
              requestGroundedExplanation({
                circuit: latestCircuit,
                prediction: submittedPrediction,
                actual: actualProbabilities,
                deterministicDiagnosis: {
                  type: 'counterfactual',
                  label: describeCounterfactualAttribution(attribution),
                  counterfactual_distribution: attribution.probabilities,
                },
              })
            }
            console.info('[QMentor] counterfactual_attribution', result)
          }
        }).catch((error) => {
          if (!controller.signal.aborted && counterfactualRequestKeyRef.current === counterfactualKey) {
            setCounterfactualStatus('complete')
          }
          if (error.name !== 'AbortError') {
            console.warn('[QMentor] counterfactual_attribution_failed', error)
          }
        })
      }
    }

    if (
      predictionIsCorrect
      || !matchesCannedMisconception
      || typeof latestCircuit !== 'string'
    ) {
      return
    }

    requestGroundedExplanation({
      circuit: latestCircuit,
      prediction: submittedPrediction,
      actual: actualProbabilities,
      deterministicDiagnosis: {
        type: 'misconception',
        label: selectedLesson.misconception_id,
      },
    })
  }

  const startRetry = () => {
    setAttempt('retry')
    setPredictionInputs(emptyPredictionFor(selectedLesson))
    setSubmittedPrediction(null)
    setPredictionFeedback('')
    setConfidence('')
    setLatestCircuit(circuitJsonFromHash(selectedLesson.retryCircuitHash))
    setLatestProbabilities(null)
    setComparisonRequested(false)
    setAiExplanation(null)
    setAiLoading(false)
    aiRequestKeyRef.current = null
    resetCounterfactualRun()
    setQuirkSource(`/quirk/quirk.html${selectedLesson.retryCircuitHash}`)
    setQuirkFrameKey((current) => current + 1)
  }

  const hasComparableResult = (
    comparisonRequested
    && submittedPrediction !== null
    && actualProbabilities !== null
    && submittedPrediction.length === actualProbabilities.length
  )
  const revealedPredictionIsCorrect = hasComparableResult && distributionsAreClose(
    submittedPrediction,
    actualProbabilities,
  )
  let learningState = 'Predicting'
  if (submittedPrediction !== null && !comparisonRequested) {
    learningState = 'Ready to reveal'
  } else if (comparisonRequested && !hasComparableResult) {
    learningState = 'Revealed'
  } else if (
    hasComparableResult
    && !revealedPredictionIsCorrect
    && (counterfactualStatus === 'running' || aiLoading)
  ) {
    learningState = 'Diagnosing'
  } else if (hasComparableResult && revealedPredictionIsCorrect) {
    learningState = 'Revealed'
  } else if (hasComparableResult) {
    learningState = 'Feedback ready'
  }
  const conceptExplanationVisible = (
    entryPath === 'test' || explainedLessonId === selectedLesson.id
  )
  const learningLoopVisible = entryPath === 'test' || learnCircuitOpened

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
        {entryPath === null ? (
          <section className="landing-panel" aria-labelledby="landing-title">
            <div className="landing-aurora" aria-hidden="true">
              <Aurora
                colorStops={['#c7d2fe', '#a7f3d0', '#fde68a']}
                amplitude={0.65}
                blend={0.65}
                speed={0.35}
                lightMode
              />
            </div>
            <div className="landing-content">
              <p className="section-label">Choose your path</p>
              <h2 id="landing-title">How would you like to begin?</h2>
              <p>Build intuition by predicting real simulator outcomes before they are revealed.</p>
              <div className="landing-actions">
                <button className="button button--primary" type="button" onClick={() => setEntryPath('learn')}>
                  <strong>Learn first</strong>
                  <small>Explore the idea, then test it</small>
                </button>
                <button className="button button--secondary" type="button" onClick={() => setEntryPath('test')}>
                  <strong>Test me now</strong>
                  <small>Start directly with a prediction</small>
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="path-toolbar">
              <span>{entryPath === 'learn' ? 'Learn first' : 'Test me now'}</span>
              <button type="button" onClick={() => setEntryPath(null)}>Change entry path</button>
            </div>

            {learningLoopVisible && (
              <div
                className="learning-status"
                data-attempt={attempt}
                data-state={learningState.toLowerCase().replaceAll(' ', '-')}
                role="status"
                aria-live="polite"
              >
                <span>{attempt === 'initial' ? 'Attempt 1' : 'Retry attempt'}</span>
                <strong>
                  <ShinyText
                    text={learningState}
                    disabled={learningState !== 'Diagnosing' && learningState !== 'Feedback ready'}
                    color={attempt === 'initial' ? '#4338ca' : '#9a5b08'}
                    shineColor="#ffffff"
                    speed={1.8}
                  />
                </strong>
              </div>
            )}

            <AnimatedContent distance={18} duration={0.45} threshold={0.01}>
              <nav className="lesson-nav concept-map" aria-label="Quantum concept map">
                <div className="concept-map__root">
                  <small>Start here</small>
                  <strong>Qubits</strong>
                </div>
                <div className="concept-map__lessons">
                  {conceptLessons.map((lesson, index) => (
                    <button
                      className="lesson-tab concept-node"
                      data-mastery={lessonMastery[lesson.id]}
                      data-active={lesson.id === selectedLessonId ? '' : undefined}
                      key={lesson.id}
                      type="button"
                      aria-pressed={lesson.id === selectedLessonId}
                      aria-label={`${lesson.concept}: ${lessonMastery[lesson.id]}`}
                      onClick={() => chooseLesson(lesson)}
                    >
                      <span className="journey-node__marker" aria-hidden="true">{index + 1}</span>
                      <span className="journey-node__copy">
                        <strong>{lesson.concept}</strong>
                        <small>{lessonMastery[lesson.id]}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </nav>
            </AnimatedContent>

            {entryPath === 'learn' && !conceptExplanationVisible && (
              <section className="concept-prompt" aria-live="polite">
                <strong>Select a concept to learn first.</strong>
                <p>Its short introduction will appear before you open the circuit.</p>
              </section>
            )}

            {conceptExplanationVisible && !learningLoopVisible && (
              <section className="card lesson-card concept-explanation" aria-labelledby="concept-title">
                <p className="section-label">Concept explanation</p>
                <h2 id="concept-title">{selectedLesson.concept}</h2>
                <p className="concept-theory">{selectedLesson.theory}</p>
                <div className="explainer-sequence" aria-label={`${selectedLesson.concept} explainer sequence`}>
                  {selectedLesson.explainerSequence.map((step, index) => (
                    <div className="explainer-step" key={`${index}-${step}`}>
                      <span>{index + 1}</span>
                      <strong>{step}</strong>
                    </div>
                  ))}
                </div>
                <button className="button button--secondary" type="button" onClick={openSelectedCircuit}>
                  Open starter circuit in Quirk
                </button>
              </section>
            )}

            {learningLoopVisible && (
              <div className="workspace">
          <div className="learning-column">
            <section className="card lesson-card" aria-labelledby="lesson-title">
              <p className="section-label">Current lesson</p>
              <h2 id="lesson-title">{selectedLesson.title}</h2>
              <p><strong>{selectedLesson.concept}:</strong> {selectedLesson.introduction}</p>
              <button className="button button--secondary" type="button" onClick={openSelectedCircuit}>
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
                <fieldset className="confidence-input">
                  <legend>How confident are you?</legend>
                  <RubberSegment
                    aria-label="Prediction confidence"
                    className="confidence-segment"
                    items={[
                      { value: 'low', label: 'Low' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'high', label: 'High' },
                    ]}
                    value={confidence}
                    onChange={updateConfidence}
                    trackColor="#e9ecf4"
                    thumbColor="#ffffff"
                    textColor="#536077"
                    activeTextColor="#312e81"
                    radius={12}
                    size="lg"
                    draggable={false}
                  />
                </fieldset>
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
              <section
                className="card comparison-card"
                aria-labelledby="comparison-title"
                aria-busy={counterfactualStatus === 'running' || aiLoading}
              >
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
                      const difference = Math.abs(submittedPrediction[index] - actual)
                      const isCloseOutcome = difference <= DIAGNOSIS_TOLERANCE + NUMERIC_EPSILON
                      return (
                        <div
                          className={`outcome-row outcome-row--${isCloseOutcome ? 'close' : 'off'}`}
                          key={outcome}
                        >
                          <strong className="outcome-label">|{outcome}&gt;</strong>
                          <ProbabilityBar label="Predicted" value={submittedPrediction[index]} color="#6366f1" />
                          <ProbabilityBar label="Actual" value={actual} color="#0f9f76" />
                          <span className="outcome-assessment">
                            <strong>{isCloseOutcome ? 'Close' : 'Clearly off'}</strong>
                            {' '}— absolute difference {difference.toFixed(3)}
                          </span>
                        </div>
                      )
                    })}
                    {counterfactualStatus === 'running' && (
                      <p className="counterfactual-progress" role="status" aria-live="polite">
                        Testing plausible circuit variants...
                      </p>
                    )}
                    <Diagnosis
                      prediction={submittedPrediction}
                      actual={actualProbabilities}
                      lesson={selectedLesson}
                      explanation={aiExplanation}
                      explanationSource={aiExplanationSource}
                      counterfactualAttribution={counterfactualAttribution}
                      aiLoading={aiLoading}
                    />
                    {attempt === 'initial' && (
                      <button className="button button--primary" type="button" onClick={startRetry}>Try Again</button>
                    )}
                  </>
                )}
              </section>
            )}

            {savedImprovement && (
              <div className="saved-result" data-testid="retry-improvement">
                <strong>Saved retry result</strong>
                <p>{savedImprovement.improved ? 'Accuracy improved.' : 'Accuracy did not improve.'}</p>
                <p>
                  {savedImprovement.calibrationImproved
                    ? 'Confidence became better calibrated.'
                    : 'Confidence calibration did not improve.'}
                </p>
                <small>
                  Attempt 1: {savedImprovement.attempt1Confidence} confidence, error{' '}
                  {savedImprovement.attempt1Error}. Retry: {savedImprovement.retryConfidence}{' '}
                  confidence, error {savedImprovement.retryError}.
                </small>
              </div>
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
            <p className="simulator-instruction">Drag a gate from the toolbox onto a wire below.</p>
            <iframe
              key={quirkFrameKey}
              ref={quirkFrameRef}
              src={quirkSource}
              title="Quirk quantum circuit simulator"
            />
          </section>
              </div>
            )}
          </>
        )}
      </main>

      <footer>
        Circuit simulation powered by a fork of Quirk (Craig Gidney, Apache-2.0).
      </footer>
    </div>
  )
}

export default App

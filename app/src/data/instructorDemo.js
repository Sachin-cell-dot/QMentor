import { lessons } from './lessons.js'

const instructorDemoRecords = [
  { studentId: 'demo-ada', lessonId: 'superposition', needsPractice: true, misconception_id: 'hadamard_is_classical' },
  { studentId: 'demo-ada', lessonId: 'interference', needsPractice: true, misconception_id: 'hadamards_repeat_randomness' },
  { studentId: 'demo-ada', lessonId: 'measurement', needsPractice: false, misconception_id: null },
  { studentId: 'demo-ada', lessonId: 'entanglement', needsPractice: false, misconception_id: null },
  { studentId: 'demo-ada', lessonId: 'ghz-state', needsPractice: true, misconception_id: 'ghz_qubits_are_independent' },
  { studentId: 'demo-ada', lessonId: 'deutsch-jozsa', needsPractice: false, misconception_id: null },
  { studentId: 'demo-ben', lessonId: 'superposition', needsPractice: false, misconception_id: null },
  { studentId: 'demo-ben', lessonId: 'interference', needsPractice: true, misconception_id: 'hadamards_repeat_randomness' },
  { studentId: 'demo-ben', lessonId: 'measurement', needsPractice: true, misconception_id: 'measurement_always_returns_zero' },
  { studentId: 'demo-ben', lessonId: 'entanglement', needsPractice: true, misconception_id: 'bell_qubits_are_independent' },
  { studentId: 'demo-ben', lessonId: 'ghz-state', needsPractice: true, misconception_id: 'ghz_qubits_are_independent' },
  { studentId: 'demo-ben', lessonId: 'deutsch-jozsa', needsPractice: true, misconception_id: 'deutsch_jozsa_ignores_phase_kickback' },
  { studentId: 'demo-chen', lessonId: 'superposition', needsPractice: true, misconception_id: 'hadamard_is_classical' },
  { studentId: 'demo-chen', lessonId: 'interference', needsPractice: false, misconception_id: null },
  { studentId: 'demo-chen', lessonId: 'measurement', needsPractice: true, misconception_id: null },
  { studentId: 'demo-chen', lessonId: 'entanglement', needsPractice: true, misconception_id: 'bell_qubits_are_independent' },
  { studentId: 'demo-chen', lessonId: 'ghz-state', needsPractice: false, misconception_id: null },
  { studentId: 'demo-chen', lessonId: 'deutsch-jozsa', needsPractice: true, misconception_id: 'deutsch_jozsa_ignores_phase_kickback' },
  { studentId: 'demo-dia', lessonId: 'superposition', needsPractice: true, misconception_id: 'hadamard_is_classical' },
  { studentId: 'demo-dia', lessonId: 'interference', needsPractice: true, misconception_id: 'hadamards_repeat_randomness' },
  { studentId: 'demo-dia', lessonId: 'measurement', needsPractice: false, misconception_id: null },
  { studentId: 'demo-dia', lessonId: 'entanglement', needsPractice: false, misconception_id: null },
  { studentId: 'demo-dia', lessonId: 'ghz-state', needsPractice: true, misconception_id: 'ghz_qubits_are_independent' },
  { studentId: 'demo-dia', lessonId: 'deutsch-jozsa', needsPractice: false, misconception_id: null },
  { studentId: 'demo-eli', lessonId: 'superposition', needsPractice: false, misconception_id: null },
  { studentId: 'demo-eli', lessonId: 'interference', needsPractice: true, misconception_id: 'hadamards_repeat_randomness' },
  { studentId: 'demo-eli', lessonId: 'measurement', needsPractice: true, misconception_id: 'measurement_always_returns_zero' },
  { studentId: 'demo-eli', lessonId: 'entanglement', needsPractice: true, misconception_id: 'bell_qubits_are_independent' },
  { studentId: 'demo-eli', lessonId: 'ghz-state', needsPractice: false, misconception_id: null },
  { studentId: 'demo-eli', lessonId: 'deutsch-jozsa', needsPractice: true, misconception_id: 'deutsch_jozsa_ignores_phase_kickback' },
]

function aggregateInstructorDemo(records = instructorDemoRecords) {
  const studentCount = new Set(records.map((record) => record.studentId)).size
  const concepts = lessons.map((lesson) => {
    const lessonRecords = records.filter((record) => record.lessonId === lesson.id)
    return {
      lessonId: lesson.id,
      concept: lesson.concept,
      misconceptionId: lesson.misconception_id,
      misconceptionFrequency: lessonRecords.filter(
        (record) => record.misconception_id === lesson.misconception_id,
      ).length,
      studentsNeedingPractice: lessonRecords.filter((record) => record.needsPractice).length,
      studentCount,
    }
  })

  const mostCommon = concepts.reduce((current, concept) => (
    concept.misconceptionFrequency > current.misconceptionFrequency ? concept : current
  ), concepts[0])

  return { studentCount, concepts, mostCommon }
}

export { aggregateInstructorDemo, instructorDemoRecords }

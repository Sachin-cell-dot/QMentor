import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateInstructorDemo, instructorDemoRecords } from '../src/data/instructorDemo.js'

test('builds deterministic aggregates from the sample records', () => {
  const analytics = aggregateInstructorDemo(instructorDemoRecords)
  assert.equal(analytics.studentCount, 5)
  assert.deepEqual(
    analytics.concepts.map((concept) => ({
      lessonId: concept.lessonId,
      misconceptionFrequency: concept.misconceptionFrequency,
      studentsNeedingPractice: concept.studentsNeedingPractice,
    })),
    [
      { lessonId: 'superposition', misconceptionFrequency: 3, studentsNeedingPractice: 3 },
      { lessonId: 'interference', misconceptionFrequency: 4, studentsNeedingPractice: 4 },
      { lessonId: 'measurement', misconceptionFrequency: 2, studentsNeedingPractice: 3 },
      { lessonId: 'entanglement', misconceptionFrequency: 3, studentsNeedingPractice: 3 },
      { lessonId: 'ghz-state', misconceptionFrequency: 3, studentsNeedingPractice: 3 },
      { lessonId: 'deutsch-jozsa', misconceptionFrequency: 3, studentsNeedingPractice: 3 },
    ],
  )
  assert.equal(analytics.mostCommon.lessonId, 'interference')
  assert.equal(analytics.mostCommon.misconceptionId, 'hadamards_repeat_randomness')
})

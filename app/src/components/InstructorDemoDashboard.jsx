import { aggregateInstructorDemo } from '../data/instructorDemo.js'

const demoAnalytics = aggregateInstructorDemo()

function MetricBar({ label, value, total, tone }) {
  return (
    <div className="instructor-metric">
      <div>
        <span>{label}</span>
        <strong>{value}/{total}</strong>
      </div>
      <div className="instructor-metric__track" aria-hidden="true">
        <span className={`instructor-metric__fill instructor-metric__fill--${tone}`} style={{ width: `${(value / total) * 100}%` }} />
      </div>
    </div>
  )
}

function InstructorDemoDashboard() {
  return (
    <section className="instructor-dashboard" aria-labelledby="instructor-title">
      <header className="instructor-dashboard__header">
        <div>
          <p className="section-label">Instructor demo</p>
          <h2 id="instructor-title">Concept-level misconception insights</h2>
          <p>Demo analytics using sample student records</p>
        </div>
        <span>{demoAnalytics.studentCount} mock students</span>
      </header>

      <aside className="instructor-highlight">
        <span>Most common misconception</span>
        <strong>{demoAnalytics.mostCommon.misconceptionId}</strong>
        <p>
          {demoAnalytics.mostCommon.misconceptionFrequency} of {demoAnalytics.studentCount} sample
          students showed this pattern in {demoAnalytics.mostCommon.concept}.
        </p>
      </aside>

      <div className="instructor-concepts">
        {demoAnalytics.concepts.map((concept) => (
          <article className="instructor-concept-card" key={concept.lessonId}>
            <div className="instructor-concept-card__heading">
              <h3>{concept.concept}</h3>
              <code>{concept.misconceptionId}</code>
            </div>
            <MetricBar
              label="Misconception frequency"
              value={concept.misconceptionFrequency}
              total={concept.studentCount}
              tone="misconception"
            />
            <MetricBar
              label="Students needing practice"
              value={concept.studentsNeedingPractice}
              total={concept.studentCount}
              tone="practice"
            />
          </article>
        ))}
      </div>
    </section>
  )
}

export default InstructorDemoDashboard

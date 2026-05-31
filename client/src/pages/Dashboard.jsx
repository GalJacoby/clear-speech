import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

function toTitleCase(str) {
  return str
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function scoreColor(score) {
  if (score >= 80) return { bg: '#d1fae5', text: '#065f46' }
  if (score >= 55) return { bg: '#fef3c7', text: '#92400e' }
  return { bg: '#fee2e2', text: '#991b1b' }
}

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function Dashboard({ setToken }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [assignments, setAssignments] = useState([])
  const [completedAssignments, setCompletedAssignments] = useState([])
  const [upcomingAppointments, setUpcomingAppointments] = useState([])
  const [myFlaggedWords, setMyFlaggedWords] = useState([])
  const [error, setError] = useState('')

  // Expandable completed practices — stores fetched recordings per assignment
  const [expandedPracticeId, setExpandedPracticeId] = useState(null)
  const [practiceRecordings, setPracticeRecordings] = useState({})
  const [loadingRecordingsFor, setLoadingRecordingsFor] = useState(null)

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const token = localStorage.getItem('token')
        if (!token) { navigate('/login'); return }

        const headers = { Authorization: `Bearer ${token}` }
        const userResponse = await axios.get('http://127.0.0.1:8000/users/me', { headers })
        const currentUser = userResponse.data
        setUser(currentUser)

        if (currentUser.role === 'patient') {
          const [assignRes, apptRes, flagRes] = await Promise.all([
            axios.get('http://127.0.0.1:8000/practice/patient/assignments', { headers }),
            axios.get('http://127.0.0.1:8000/appointments/upcoming', { headers }).catch(() => ({ data: [] })),
            axios.get('http://127.0.0.1:8000/recordings/my-flagged', { headers }).catch(() => ({ data: [] })),
          ])
          setAssignments(assignRes.data.filter(a => a.status === 'pending'))
          setCompletedAssignments(
            assignRes.data
              .filter(a => a.status === 'completed')
              .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))
          )
          setUpcomingAppointments(apptRes.data)
          // Deduplicate flagged words by word_text
          const seen = new Set()
          setMyFlaggedWords(flagRes.data.filter(r => {
            if (seen.has(r.word_text)) return false
            seen.add(r.word_text)
            return true
          }))
        }
      } catch (err) {
        console.error("Fetch error:", err)
        if (err.response?.status === 401) {
          localStorage.removeItem('token')
          setToken(null)
          navigate('/login')
        } else {
          setError("Could not load dashboard data.")
        }
      }
    }
    loadDashboardData()
  }, [])

  const handleTogglePractice = async (assignmentId) => {
    if (expandedPracticeId === assignmentId) { setExpandedPracticeId(null); return }
    setExpandedPracticeId(assignmentId)
    if (practiceRecordings[assignmentId]) return
    setLoadingRecordingsFor(assignmentId)
    try {
      const token = localStorage.getItem('token')
      const res = await axios.get(`http://127.0.0.1:8000/recordings/assignment/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setPracticeRecordings(prev => ({ ...prev, [assignmentId]: res.data }))
    } catch (err) {
      console.error("Failed to fetch recordings:", err)
    } finally {
      setLoadingRecordingsFor(null)
    }
  }

  const handleTogglePatientFlag = async (recordingId, assignmentId) => {
    // 1. Find the recording and compute new toggled state
    const rec = (practiceRecordings[assignmentId] || []).find(r => r.id === recordingId)
    if (!rec) return
    const newFlagged = !rec.marked_by_patient
    const updatedRec = { ...rec, marked_by_patient: newFlagged }

    // 2. Snapshot for rollback
    const prevFlaggedWords = myFlaggedWords

    // 3. Optimistic: update the word list inside the expanded practice
    setPracticeRecordings(prev => ({
      ...prev,
      [assignmentId]: prev[assignmentId].map(r => r.id === recordingId ? updatedRec : r)
    }))

    // 4. Optimistic: update the "Words for My Next Appointment" chips
    setMyFlaggedWords(prev => {
      if (newFlagged) {
        return prev.find(r => r.word_text === rec.word_text) ? prev : [...prev, updatedRec]
      }
      return prev.filter(r => r.word_text !== rec.word_text)
    })

    // 5. Fire API in background; revert both on failure
    try {
      const token = localStorage.getItem('token')
      await axios.patch(
        `http://127.0.0.1:8000/recordings/${recordingId}/toggle-flag`,
        { flag: 'patient' },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch (err) {
      console.error("Flag toggle failed — reverting:", err)
      setPracticeRecordings(prev => ({
        ...prev,
        [assignmentId]: prev[assignmentId].map(r => r.id === recordingId ? rec : r)
      }))
      setMyFlaggedWords(prevFlaggedWords)
      alert("Could not update flag. Please try again.")
    }
  }

  if (!user) return <div className="card-container"><h3>Loading...</h3></div>

  const displayName = toTitleCase(user.full_name)

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Welcome Back, {displayName}!</h1>
        <p className="dashboard-subtitle">
          {user.role === 'patient'
            ? `You have ${assignments.length} active mission${assignments.length !== 1 ? 's' : ''}`
            : 'Therapist Dashboard'}
        </p>
      </div>

      {error && <p className="error-msg">{error}</p>}

      {/* --- PATIENT PANEL --- */}
      {user.role === 'patient' && (
        <>
          {/* Active missions */}
          <div>
            <h3 style={{ textAlign: 'center' }}>Your Missions:</h3>
            {assignments.length === 0 ? (
              <p style={{ textAlign: 'center' }}>No active missions right now.</p>
            ) : (
              <ul className="mission-grid">
                {assignments.map((assignment, index) => (
                  <li key={assignment.id || index} className="mission-square-card">
                    <strong className="mission-title">
                      {assignment.template_title || "Practice Session"}
                    </strong>
                    <div className="mission-meta">
                      <span className="badge badge-sound">{assignment.target_sound}</span>
                      <span className="badge badge-status">{assignment.status}</span>
                    </div>
                    <button
                      className="btn-start-full"
                      onClick={() => navigate(`/practice/${assignment.id}`, { state: { targetSound: assignment.target_sound } })}
                    >
                      Start
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Completed practices */}
          {completedAssignments.length > 0 && (
            <div style={{ marginTop: '40px' }}>
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '32px' }}>
                <h3 style={{ textAlign: 'center', marginBottom: '20px' }}>Completed Practices</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 auto', maxWidth: '520px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {completedAssignments.map(a => {
                    const colors = typeof a.score === 'number' ? scoreColor(a.score) : null
                    const isExpanded = expandedPracticeId === a.id
                    const recs = practiceRecordings[a.id] || []
                    return (
                      <li key={a.id} style={{ backgroundColor: 'white', borderRadius: '10px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                        {/* Summary row */}
                        <div
                          onClick={() => handleTogglePractice(a.id)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
                        >
                          <div>
                            <p style={{ margin: 0, fontWeight: 600, color: '#111827', fontSize: '0.95rem' }}>
                              {a.template_title || 'Practice Session'}
                            </p>
                            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
                              {a.completed_at ? `Completed ${formatDate(a.completed_at)}` : formatDate(a.created_at)}
                            </p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {colors && (
                              <span style={{ fontSize: '0.85rem', fontWeight: 700, padding: '4px 12px', borderRadius: '999px', backgroundColor: colors.bg, color: colors.text, whiteSpace: 'nowrap' }}>
                                {a.score}/100
                              </span>
                            )}
                            <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </div>

                        {/* Expanded word list */}
                        {isExpanded && (
                          <div style={{ borderTop: '1px solid #f3f4f6', padding: '12px 18px', backgroundColor: '#fafafa' }}>
                            {loadingRecordingsFor === a.id ? (
                              <p style={{ margin: 0, fontSize: '0.85rem', color: '#9ca3af' }}>Loading words…</p>
                            ) : recs.length === 0 ? (
                              <p style={{ margin: 0, fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic' }}>No word recordings found.</p>
                            ) : (
                              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {recs.map(rec => (
                                  <li key={rec.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827' }}>{rec.word_text}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {typeof rec.score === 'number' && (
                                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{rec.score}/100</span>
                                      )}
                                      <button
                                        onClick={() => handleTogglePatientFlag(rec.id, a.id)}
                                        title={rec.marked_by_patient ? 'Remove appointment flag' : 'Flag for next appointment'}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: 0, color: rec.marked_by_patient ? '#8b5cf6' : '#d1d5db', transition: 'color 0.15s' }}
                                      >
                                        {rec.marked_by_patient ? '★' : '☆'}
                                      </button>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <p style={{ margin: '10px 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>★ marks a word for review at your next physical appointment</p>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          )}
          {/* Upcoming Appointments + Words Needing Attention — two-column on wide screens */}
          <div style={{ marginTop: '40px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>

            {/* Upcoming Appointments */}
            <div style={{ flex: '1 1 260px', backgroundColor: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Upcoming Appointments
              </p>
              {upcomingAppointments.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>No upcoming appointments scheduled.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {upcomingAppointments.map(apt => {
                    const d = new Date(apt.start_time)
                    const datePart = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                    const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                    return (
                      <li key={apt.id} style={{ padding: '10px 12px', backgroundColor: '#eff6ff', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#1e40af' }}>{datePart}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#3b82f6' }}>{timePart}{apt.title ? ` · ${apt.title}` : ''}</p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* Words Needing Attention */}
            <div style={{ flex: '1 1 260px', backgroundColor: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.75rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Words for My Next Appointment ★
              </p>
              {myFlaggedWords.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                  No words starred yet. Open a completed practice below and tap ★ on any word to add it here.
                </p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {myFlaggedWords.map(r => (
                    <li key={r.id} style={{ padding: '5px 14px', backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '999px', fontSize: '0.875rem', fontWeight: 600, color: '#5b21b6' }}>
                      ★ {r.word_text}
                    </li>
                  ))}
                </ul>
              )}
              {myFlaggedWords.length > 0 && (
                <p style={{ margin: '12px 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>These words have been flagged for review with your clinician.</p>
              )}
            </div>

          </div>
        </>
      )}

      {/* --- CLINICIAN PANEL --- */}
      {user.role === 'clinician' && (
        <div className="action-grid">
          <button className="action-card" onClick={() => navigate('/patients')}>
            <span className="action-card-icon">👥</span>
            <div>
              <p className="action-card-title">Patients</p>
              <p className="action-card-desc">Manage your patient list and track their progress</p>
            </div>
          </button>
          <button className="action-card" onClick={() => navigate('/practices')}>
            <span className="action-card-icon">📋</span>
            <div>
              <p className="action-card-title">Practices</p>
              <p className="action-card-desc">Create and manage speech practice templates</p>
            </div>
          </button>
          <button className="action-card" onClick={() => navigate('/schedule')}>
            <span className="action-card-icon">📅</span>
            <div>
              <p className="action-card-title">Schedule</p>
              <p className="action-card-desc">Manage patient appointments and sessions</p>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

export default Dashboard

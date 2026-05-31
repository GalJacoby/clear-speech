import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

const SecureAudioPlayer = ({ recordingId }) => {
  const [audioSrc, setAudioSrc] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchAudio = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await axios.get(`http://127.0.0.1:8000/recordings/play/${recordingId}`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        })
        setAudioSrc(URL.createObjectURL(response.data))
      } catch (err) {
        console.error("Audio fetch error:", err)
        setError(true)
      }
    }
    fetchAudio()
    return () => { if (audioSrc) URL.revokeObjectURL(audioSrc) }
  }, [recordingId])

  if (error) return <p style={{color: 'red', fontSize: '0.8rem'}}>⚠️ Audio unavailable</p>
  if (!audioSrc) return <p style={{fontSize: '0.8rem', color: '#6b7280'}}>Loading audio...</p>
  return <audio controls src={audioSrc} style={{ width: '100%' }} />
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: '14px' }}>
      <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
      <p style={{ margin: '3px 0 0 0', fontSize: '0.95rem', color: '#111827' }}>{value}</p>
    </div>
  )
}

function formatAppointmentTime(isoString) {
  const d = new Date(isoString)
  const datePart = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${datePart} at ${timePart}`
}

function PatientDetails() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const patientFromNav = location.state?.patient || null

  // Patient detail (full profile)
  const [patientDetail, setPatientDetail] = useState(null)

  // Assignments
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Audio review
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [isReviewLoading, setIsReviewLoading] = useState(false)

  // Flagged words for this patient
  const [flaggedWords, setFlaggedWords] = useState([])

  // Assign modal
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false)
  const [templates, setTemplates] = useState([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([])
  const [modalMessage, setModalMessage] = useState('')

  const alreadyAssignedTemplateIds = assignments
    .filter(a => a.status === 'pending')
    .map(a => a.template_id)

  const fetchAssignments = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(
        `http://127.0.0.1:8000/clinician/patients/${patientId}/assignments`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setAssignments(response.data)
      setLoading(false)
    } catch (err) {
      console.error("Fetch error:", err)
      setError("Could not load patient assignments.")
      setLoading(false)
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }

    fetchAssignments()

    axios.get(`http://127.0.0.1:8000/clinician/patients/${patientId}`, { headers })
      .then(r => setPatientDetail(r.data))
      .catch(() => {})

    axios.get('http://127.0.0.1:8000/practice/templates', { headers })
      .then(r => setTemplates(r.data))
      .catch(() => {})

    axios.get(`http://127.0.0.1:8000/recordings/flagged/${patientId}`, { headers })
      .then(r => setFlaggedWords(r.data))
      .catch(() => {})
  }, [patientId])

  const handleToggleClinicianFlag = async (recordingId) => {
    // 1. Compute new toggled state
    const rec = recordings.find(r => r.id === recordingId)
    if (!rec) return
    const newFlagged = !rec.marked_by_clinician
    const updatedRec = { ...rec, marked_by_clinician: newFlagged }

    // 2. Snapshot for rollback
    const prevRecordings   = recordings
    const prevFlaggedWords = flaggedWords

    // 3. Optimistic: flip the star in the review panel immediately
    setRecordings(prev => prev.map(r => r.id === recordingId ? updatedRec : r))

    // 4. Optimistic: update the "Words Needing Attention" sidebar immediately
    setFlaggedWords(prev => {
      const stillFlagged = newFlagged || updatedRec.marked_by_patient
      if (stillFlagged) {
        return prev.find(r => r.id === recordingId)
          ? prev.map(r => r.id === recordingId ? updatedRec : r)
          : [...prev, updatedRec]
      }
      return prev.filter(r => r.id !== recordingId)
    })

    // 5. Fire API in background; revert both on failure
    try {
      const token = localStorage.getItem('token')
      await axios.patch(
        `http://127.0.0.1:8000/recordings/${recordingId}/toggle-flag`,
        { flag: 'clinician' },
        { headers: { Authorization: `Bearer ${token}` } }
      )
    } catch (err) {
      console.error('Flag toggle failed — reverting:', err)
      setRecordings(prevRecordings)
      setFlaggedWords(prevFlaggedWords)
      alert("Could not update flag. Please try again.")
    }
  }

  const handleUnassign = async (assignmentId) => {
    if (!window.confirm('Remove this assignment from the patient?')) return
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`http://127.0.0.1:8000/practice/assignments/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setAssignments(prev => prev.filter(a => a.id !== assignmentId))
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not remove assignment.')
    }
  }

  const handleReviewAudio = async (assignmentId) => {
    if (selectedAssignmentId === assignmentId) { setSelectedAssignmentId(null); return }
    setSelectedAssignmentId(assignmentId)
    setIsReviewLoading(true)
    setRecordings([])
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get(`http://127.0.0.1:8000/recordings/assignment/${assignmentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setRecordings(response.data)
    } catch (err) {
      alert("Could not load recordings for this assignment.")
    } finally {
      setIsReviewLoading(false)
    }
  }

  const openAssignModal = () => { setSelectedTemplateIds([]); setModalMessage(''); setIsAssignModalOpen(true) }
  const closeAssignModal = () => { setIsAssignModalOpen(false); setSelectedTemplateIds([]); setModalMessage('') }

  const toggleTemplateSelection = (id) =>
    setSelectedTemplateIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleAssignTemplates = async (e) => {
    e.preventDefault()
    setModalMessage('')
    const newIds = selectedTemplateIds.filter(id => !alreadyAssignedTemplateIds.includes(id))
    if (newIds.length === 0) { setModalMessage("❌ Please select at least one new practice to assign."); return }

    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }
    let hasError = false, errorMessage = "❌ Error assigning practices."

    for (let templateId of newIds) {
      try {
        await axios.post('http://127.0.0.1:8000/practice/assignments', { patient_id: patientId, template_id: templateId }, { headers })
      } catch (err) {
        hasError = true
        if (err.response?.data?.detail) errorMessage = `❌ ${err.response.data.detail}`
        break
      }
    }

    if (hasError) { setModalMessage(errorMessage) }
    else {
      setModalMessage(`✅ ${newIds.length} Practice(s) assigned successfully!`)
      await fetchAssignments()
      setTimeout(() => closeAssignModal(), 2000)
    }
  }

  const completedAssignments = assignments.filter(a => a.status === 'completed')
  const pendingAssignments = assignments.filter(a => a.status === 'pending')

  const displayName = patientDetail?.full_name || patientFromNav?.full_name || 'Patient'

  const formatDOB = (dob) => {
    if (!dob) return null
    const d = new Date(dob)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, color: '#111827' }}>{displayName}'s Profile</h1>
        <p style={{ color: '#6b7280', margin: '5px 0 0 0' }}>Review progress and assigned missions</p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>

        {/* LEFT: Patient Info Card */}
        <div style={{ width: '280px', flexShrink: 0, backgroundColor: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #e5e7eb' }}>

          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: '12px' }}>
              👤
            </div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#111827', textAlign: 'center' }}>{displayName}</h2>
          </div>

          {patientDetail ? (
            <>
              <InfoRow label="Date of Birth" value={formatDOB(patientDetail.date_of_birth)} />
              <InfoRow label="Parent / Guardian Email" value={patientDetail.parent_email} />
              {patientDetail.target_sounds?.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Sounds</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {patientDetail.target_sounds.map(s => (
                      <span key={s} className="badge badge-sound">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {!patientDetail.date_of_birth && !patientDetail.parent_email && (!patientDetail.target_sounds || patientDetail.target_sounds.length === 0) && (
                <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>No additional details recorded.</p>
              )}

              {/* Next Appointment */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
                <p style={{ margin: '0 0 6px 0', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Next Appointment</p>
                {patientDetail.next_appointment ? (
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#111827', fontWeight: 500 }}>
                    {formatAppointmentTime(patientDetail.next_appointment.start_time)}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic' }}>No upcoming appointments scheduled.</p>
                )}
              </div>

              {/* Words Needing Attention */}
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f3f4f6' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Words Needing Attention
                </p>
                {flaggedWords.length === 0 ? (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af', fontStyle: 'italic' }}>None flagged yet.</p>
                ) : (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[...new Map(flaggedWords.map(r => [r.word_text, r])).values()].map(r => (
                      <li key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                        <span style={{ fontSize: '0.875rem', color: '#111827', fontWeight: 600 }}>{r.word_text}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {r.marked_by_clinician && <span title="Clinician flagged" style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700 }}>★</span>}
                          {r.marked_by_patient   && <span title="Patient flagged"   style={{ fontSize: '0.75rem', color: '#8b5cf6', fontWeight: 700 }}>★</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: 0 }}>Loading details...</p>
          )}
        </div>

        {/* RIGHT: Assignments + Audio Review */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {loading && <p>Loading assignments...</p>}
          {error && <p className="error-msg">{error}</p>}

          {!loading && !error && (
            <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #e5e7eb', textAlign: 'left' }}>

              {/* Split header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '1px solid #e5e7eb', marginBottom: '4px' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>Assigned Practices</h2>
                <button onClick={openAssignModal} className="btn-create">+ Assign Practice</button>
              </div>

              {assignments.length === 0 ? (
                <p style={{ color: '#6b7280', marginTop: '16px' }}>No missions assigned yet.</p>
              ) : (
                <>
                  {completedAssignments.length > 0 && (
                    <div style={{ marginBottom: pendingAssignments.length > 0 ? '24px' : '0' }}>
                      <h3 style={{ color: '#059669', fontSize: '1rem', margin: '16px 0 10px 0' }}>Ready for Review ✅</h3>
                      <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
                        {completedAssignments.map(a => (
                          <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px dashed #e5e7eb' }}>
                            <div>
                              <h4 style={{ margin: '0 0 4px 0', color: '#1f2937' }}>{a.template_title || 'Practice Mission'}</h4>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Sound: <strong>{a.target_sound}</strong></span>
                                {typeof a.score === 'number' && (
                                  <span style={{
                                    fontSize: '0.78rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                                    backgroundColor: a.score >= 80 ? '#d1fae5' : a.score >= 55 ? '#fef3c7' : '#fee2e2',
                                    color: a.score >= 80 ? '#065f46' : a.score >= 55 ? '#92400e' : '#991b1b'
                                  }}>
                                    Score: {a.score}/100
                                  </span>
                                )}
                              </div>
                            </div>
                            <button onClick={() => handleReviewAudio(a.id)} style={{ fontSize: '0.8rem', backgroundColor: selectedAssignmentId === a.id ? '#3b82f6' : 'white', color: selectedAssignmentId === a.id ? 'white' : '#374151', border: '1px solid #d1d5db', cursor: 'pointer', padding: '6px 14px', borderRadius: '6px' }}>
                              {selectedAssignmentId === a.id ? 'Close Review' : 'Review Audio'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {pendingAssignments.length > 0 && (
                    <div>
                      <h3 style={{ color: '#d97706', fontSize: '1rem', margin: '16px 0 10px 0' }}>Waiting for Patient ⏳</h3>
                      <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
                        {pendingAssignments.map(a => (
                          <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px dashed #e5e7eb' }}>
                            <div>
                              <h4 style={{ margin: '0 0 4px 0', color: '#1f2937' }}>{a.template_title || 'Practice Mission'}</h4>
                              <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Sound: <strong>{a.target_sound}</strong></span>
                            </div>
                            <button className="template-btn-delete" onClick={() => handleUnassign(a.id)}>Unassign</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Audio review panel */}
          {selectedAssignmentId && (
            <div style={{ marginTop: '20px', backgroundColor: '#f9fafb', borderRadius: '12px', padding: '20px', border: '1px solid #d1d5db' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0 }}>Assignment Recordings 🎙️</h3>
                <button onClick={() => setSelectedAssignmentId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#6b7280' }}>✖</button>
              </div>
              {isReviewLoading && <p>Loading audio files...</p>}
              {!isReviewLoading && recordings.length === 0 && <p>No recordings found for this assignment.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {recordings.map(rec => {
                  const hasScore = typeof rec.score === 'number'
                  const scoreCol = hasScore
                    ? rec.score >= 80 ? { bg: '#d1fae5', text: '#065f46' }
                      : rec.score >= 55 ? { bg: '#fef3c7', text: '#92400e' }
                      : { bg: '#fee2e2', text: '#991b1b' }
                    : null
                  return (
                    <div key={rec.id} style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#111827' }}>
                          Word: <span style={{ color: '#2563eb' }}>{rec.word_text}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {hasScore && (
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', backgroundColor: scoreCol.bg, color: scoreCol.text, whiteSpace: 'nowrap' }}>
                              {rec.score}/100
                            </span>
                          )}
                          <button
                            onClick={() => handleToggleClinicianFlag(rec.id)}
                            title={rec.marked_by_clinician ? 'Remove attention flag' : 'Mark for attention'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '2px', color: rec.marked_by_clinician ? '#f59e0b' : '#d1d5db', transition: 'color 0.15s' }}
                          >
                            {rec.marked_by_clinician ? '★' : '☆'}
                          </button>
                          {rec.marked_by_patient && (
                            <span title="Patient flagged this word" style={{ fontSize: '0.75rem', color: '#8b5cf6', fontWeight: 600 }}>Patient ★</span>
                          )}
                        </div>
                      </div>
                      <SecureAudioPlayer recordingId={rec.id} />
                      {rec.feedback && (
                        <p style={{ margin: '10px 0 0', fontSize: '0.875rem', color: '#374151', lineHeight: 1.55, padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '6px', borderLeft: '3px solid #93c5fd' }}>
                          {rec.feedback}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Assign Practices Modal */}
      {isAssignModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '450px', textAlign: 'left', position: 'relative' }}>
            <button onClick={closeAssignModal} style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
            <h2 style={{ marginTop: 0 }}>Assign Practices</h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>For patient: <strong>{displayName}</strong></p>

            {templates.length === 0 ? (
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fef2f2', border: '1px solid #f87171', borderRadius: '8px' }}>
                <p style={{ color: '#b91c1c', margin: 0, fontSize: '0.9rem' }}>No practice templates yet. Create one from the Practices hub first.</p>
              </div>
            ) : (
              <form onSubmit={handleAssignTemplates} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '0.9rem' }}>
                    Select Practice Templates ({selectedTemplateIds.length} selected):
                  </label>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px', backgroundColor: '#f9fafb' }}>
                    {templates.map(t => {
                      const isAlreadyAssigned = alreadyAssignedTemplateIds.includes(t.id)
                      return (
                        <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 5px', cursor: isAlreadyAssigned ? 'default' : 'pointer', borderBottom: '1px solid #e5e7eb', opacity: isAlreadyAssigned ? 0.6 : 1 }}>
                          <input type="checkbox" checked={isAlreadyAssigned || selectedTemplateIds.includes(t.id)} disabled={isAlreadyAssigned} onChange={() => !isAlreadyAssigned && toggleTemplateSelection(t.id)} style={{ width: '18px', height: '18px', cursor: isAlreadyAssigned ? 'default' : 'pointer', accentColor: '#3b82f6' }} />
                          <span style={{ fontSize: '0.95rem', color: '#374151' }}>
                            <strong>{t.title}</strong>
                            <span style={{ color: '#6b7280', fontSize: '0.85rem' }}> (Sound: {t.target_sound})</span>
                            {isAlreadyAssigned && <span style={{ color: '#9ca3af', fontSize: '0.78rem', fontStyle: 'italic' }}> — Already Assigned</span>}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <button type="submit" className="btn-primary" style={{ marginTop: '10px', backgroundColor: '#3b82f6' }}>Submit Assignments</button>
              </form>
            )}

            {modalMessage && (
              <div style={{ marginTop: '15px', padding: '10px', borderRadius: '8px', backgroundColor: modalMessage.includes('❌') ? '#fef2f2' : '#f0fdf4', color: modalMessage.includes('❌') ? '#b91c1c' : '#15803d', fontWeight: 'bold', textAlign: 'center' }}>
                {modalMessage}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PatientDetails

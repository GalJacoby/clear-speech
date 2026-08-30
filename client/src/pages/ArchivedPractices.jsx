import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import axios from 'axios'
import '../App.css'
import { API_URL } from '../config'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function scoreColor(score) {
  if (score >= 80) return { bg: '#d1fae5', text: '#065f46' }
  if (score >= 55) return { bg: '#fef3c7', text: '#92400e' }
  return { bg: '#fee2e2', text: '#991b1b' }
}

function ScoreBadge({ score }) {
  if (score == null) return null
  const c = scoreColor(score)
  return (
    <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '2px 10px', borderRadius: '999px', backgroundColor: c.bg, color: c.text, whiteSpace: 'nowrap' }}>
      {score}/100
    </span>
  )
}

// Fetches and plays audio securely (identical to PatientDetails SecureAudioPlayer)
function SecureAudioPlayer({ recordingId }) {
  const [audioSrc, setAudioSrc] = useState(null)
  const [error, setError]       = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await axios.get(`${API_URL}/recordings/play/${recordingId}`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        })
        setAudioSrc(URL.createObjectURL(res.data))
      } catch { setError(true) }
    }
    load()
    return () => { if (audioSrc) URL.revokeObjectURL(audioSrc) }
  }, [recordingId])

  if (error)     return <p style={{ color: 'red', fontSize: '0.8rem', margin: 0 }}>⚠️ Audio unavailable</p>
  if (!audioSrc) return <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: 0 }}>Loading…</p>
  return <audio controls src={audioSrc} style={{ width: '100%' }} />
}

// ── Page component ─────────────────────────────────────────────────────────────

function ArchivedPractices() {
  const { patientId } = useParams()
  const navigate      = useNavigate()
  const location      = useLocation()
  const patient       = location.state?.patient || { full_name: 'Patient' }

  const [archived,  setArchived]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  // Expandable row state
  const [expandedId,          setExpandedId]          = useState(null)
  const [recordingsCache,     setRecordingsCache]     = useState({})  // { assignmentId: recordings[] }
  const [loadingRecordingsId, setLoadingRecordingsId] = useState(null)

  useEffect(() => {
    const fetchArchived = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await axios.get(
          `${API_URL}/clinician/patients/${patientId}/archived-assignments`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        setArchived(res.data)
      } catch (err) {
        console.error(err)
        setError('Could not load archived practices.')
      } finally {
        setLoading(false)
      }
    }
    fetchArchived()
  }, [patientId])

  const handleToggleRow = async (assignmentId) => {
    // Collapse if already open
    if (expandedId === assignmentId) { setExpandedId(null); return }
    setExpandedId(assignmentId)

    // Use cache if available
    if (recordingsCache[assignmentId]) return

    setLoadingRecordingsId(assignmentId)
    try {
      const token = localStorage.getItem('token')
      const res = await axios.get(
        `${API_URL}/recordings/assignment/${assignmentId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setRecordingsCache(prev => ({ ...prev, [assignmentId]: res.data }))
    } catch (err) {
      console.error(err)
      setRecordingsCache(prev => ({ ...prev, [assignmentId]: [] }))
    } finally {
      setLoadingRecordingsId(null)
    }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ margin: 0, color: '#111827' }}>Archived Practices</h1>
          <p style={{ color: '#6b7280', margin: '5px 0 0 0' }}>
            {patient.full_name} — completed & reviewed sessions
          </p>
        </div>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, padding: '4px 0', fontFamily: 'inherit' }}>
          ← Back
        </button>
      </div>

      {loading && <p style={{ color: '#6b7280' }}>Loading…</p>}
      {error   && <p className="error-msg">{error}</p>}

      {!loading && !error && archived.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          <p style={{ fontSize: '1rem', margin: 0 }}>No archived practices yet.</p>
          <p style={{ fontSize: '0.875rem', marginTop: '8px' }}>
            Use the "✓ Complete Review" button on the patient profile to archive a reviewed session.
          </p>
        </div>
      )}

      {!loading && !error && archived.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {archived.map(a => {
            const isOpen          = expandedId === a.id
            const recs            = recordingsCache[a.id] || []
            const isLoadingRecs   = loadingRecordingsId === a.id

            return (
              <div key={a.id} style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>

                {/* Summary row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, color: '#111827', fontSize: '0.95rem' }}>
                      {a.template_title || 'Practice Session'}
                    </p>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span className="badge badge-sound">{a.target_sound || '—'}</span>
                      <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Completed {formatDate(a.completed_at)}</span>
                    </div>
                  </div>
                  <ScoreBadge score={a.score} />
                  <button
                    onClick={() => handleToggleRow(a.id)}
                    style={{
                      fontSize: '0.82rem', fontWeight: 600, padding: '6px 16px',
                      backgroundColor: isOpen ? '#1e40af' : '#eff6ff',
                      color: isOpen ? 'white' : '#2563eb',
                      border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer',
                      whiteSpace: 'nowrap', transition: 'all 0.15s', fontFamily: 'inherit'
                    }}
                  >
                    {isOpen ? 'Close' : 'Open ▼'}
                  </button>
                </div>

                {/* Expanded recordings — read-only, no action buttons */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: '16px 20px', backgroundColor: '#f9fafb' }}>
                    {isLoadingRecs ? (
                      <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.875rem' }}>Loading recordings…</p>
                    ) : recs.length === 0 ? (
                      <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.875rem', fontStyle: 'italic' }}>No recordings found for this session.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {recs.map(rec => {
                          const hasScore = typeof rec.score === 'number'
                          const sc = hasScore ? scoreColor(rec.score) : null
                          return (
                            <div key={rec.id} style={{ backgroundColor: 'white', borderRadius: '8px', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
                              {/* Word + score */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827' }}>
                                  Word: <span style={{ color: '#2563eb' }}>{rec.word_text}</span>
                                </div>
                                {hasScore && (
                                  <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '2px 10px', borderRadius: '999px', backgroundColor: sc.bg, color: sc.text }}>
                                    {rec.score}/100
                                  </span>
                                )}
                              </div>
                              {/* Audio (read-only) */}
                              <SecureAudioPlayer recordingId={rec.id} />
                              {/* AI feedback */}
                              {rec.feedback && (
                                <p style={{ margin: '10px 0 0', fontSize: '0.875rem', color: '#374151', lineHeight: 1.55, padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '6px', borderLeft: '3px solid #93c5fd' }}>
                                  {rec.feedback}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ArchivedPractices

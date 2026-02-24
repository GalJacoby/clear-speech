import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

// This component handles fetching audio with the Authorization header
const SecureAudioPlayer = ({ recordingId }) => {
  const [audioSrc, setAudioSrc] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchAudio = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await axios.get(`http://127.0.0.1:8000/recordings/play/${recordingId}`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob' // Important: Tell axios this is a binary file
        })

        // Create a local URL for the binary data
        const url = URL.createObjectURL(response.data)
        setAudioSrc(url)
      } catch (err) {
        console.error("Audio fetch error:", err)
        setError(true)
      }
    }

    fetchAudio()

    // Cleanup to prevent memory leaks
    return () => {
      if (audioSrc) URL.revokeObjectURL(audioSrc)
    }
  }, [recordingId])

  if (error) return <p style={{color: 'red', fontSize: '0.8rem'}}>⚠️ Audio unavailable</p>
  if (!audioSrc) return <p style={{fontSize: '0.8rem', color: '#6b7280'}}>Loading audio...</p>

  return <audio controls src={audioSrc} style={{ width: '100%' }} />
}

function PatientDetails() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Get patient info passed via navigation state
  const patient = location.state?.patient || { full_name: 'Patient' }

  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null)
  const [recordings, setRecordings] = useState([])
  const [isReviewLoading, setIsReviewLoading] = useState(false)

  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchPatientAssignments = async () => {
      try {
        const token = localStorage.getItem('token')
        const headers = { Authorization: `Bearer ${token}` }

        const response = await axios.get(`http://127.0.0.1:8000/clinician/patients/${patientId}/assignments`, { headers })

        setAssignments(response.data)
        setLoading(false)
      } catch (err) {
        console.error("Fetch error:", err)
        setError("Could not load patient assignments.")
        setLoading(false)
      }
    }
    fetchPatientAssignments()
  }, [patientId])

  // Function to fetch recordings for a specific assignment
  const handleReviewAudio = async (assignmentId) => {
    // Check if we are clicking the same assignment to toggle it off
    if (selectedAssignmentId === assignmentId) {
        setSelectedAssignmentId(null)
        return
    }

    setSelectedAssignmentId(assignmentId)
    setIsReviewLoading(true)
    setRecordings([]) // Clear previous recordings

    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }

      // Endpoint updated to match the new recordings router
      const response = await axios.get(`http://127.0.0.1:8000/recordings/assignment/${assignmentId}`, { headers })

      setRecordings(response.data)
      setIsReviewLoading(false)
    } catch (err) {
      console.error("Error fetching recordings:", err)
      alert("Could not load recordings for this assignment.")
      setIsReviewLoading(false)
    }
  }

  // Filter assignments into two categories
  const completedAssignments = assignments.filter(a => a.status === 'completed')
  const pendingAssignments = assignments.filter(a => a.status === 'pending')

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 style={{ margin: 0, color: '#111827' }}>{patient.full_name}'s Profile</h1>
          <p style={{ color: '#6b7280', margin: '5px 0 0 0' }}>Review progress and assigned missions</p>
        </div>
        <button
          onClick={() => navigate('/patients')}
          className="btn-primary"
          style={{ backgroundColor: '#4b5563', width: 'auto', padding: '10px 20px', whiteSpace: 'nowrap' }}
        >
          Back to Patients List
        </button>
      </div>

      {loading && <p>Loading assignments...</p>}
      {error && <p className="error-msg">{error}</p>}

      {/* Assignments List Container */}
      {!loading && !error && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', textAlign: 'left' }}>
          <h2 style={{ marginTop: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>Assigned Missions</h2>

          {assignments.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No missions assigned yet.</p>
          ) : (
            <>
              {/* SECTION: Ready for Review (Completed) */}
              {completedAssignments.length > 0 && (
                <div style={{ marginBottom: pendingAssignments.length > 0 ? '30px' : '0' }}>
                  <h3 style={{ color: '#059669', fontSize: '1.1rem', margin: '15px 0 10px 0' }}>Ready for Review ✅</h3>
                  <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
                    {completedAssignments.map(assignment => (
                        <li key={assignment.id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '15px 0',
                          borderBottom: '1px dashed #e5e7eb'
                        }}>
                          <div>
                            <h4 style={{margin: '0 0 5px 0', color: '#1f2937'}}>{assignment.template_title || 'Practice Mission'}</h4>
                            <span style={{fontSize: '0.85rem', color: '#6b7280', display: 'flex', gap: '10px'}}>
                              <span> Sound: <strong>{assignment.target_sound}</strong></span>
                            </span>
                          </div>

                          <button
                              onClick={() => handleReviewAudio(assignment.id)}
                              className="btn-secondary"
                              style={{
                                fontSize: '0.8rem',
                                backgroundColor: selectedAssignmentId === assignment.id ? '#3b82f6' : 'white',
                                color: selectedAssignmentId === assignment.id ? 'white' : '#374151',
                                border: '1px solid #d1d5db',
                                cursor: 'pointer'
                              }}
                          >
                            {selectedAssignmentId === assignment.id ? "Close Review" : "Review Audio"}
                          </button>
                        </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* SECTION: Waiting for Patient (Pending) */}
              {pendingAssignments.length > 0 && (
                <div>
                  <h3 style={{ color: '#d97706', fontSize: '1.1rem', margin: '15px 0 10px 0' }}>Waiting for Patient ⏳</h3>
                  <ul style={{ padding: 0, listStyle: 'none', margin: 0 }}>
                    {pendingAssignments.map(assignment => (
                        <li key={assignment.id} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '15px 0',
                          borderBottom: '1px dashed #e5e7eb'
                        }}>
                          <div>
                            <h4 style={{margin: '0 0 5px 0', color: '#1f2937'}}>{assignment.template_title || 'Practice Mission'}</h4>
                            <span style={{fontSize: '0.85rem', color: '#6b7280', display: 'flex', gap: '10px'}}>
                              <span> Sound: <strong>{assignment.target_sound}</strong></span>
                            </span>
                          </div>

                        </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* RECORDINGS REVIEW SECTION */}
      {selectedAssignmentId && (
        <div style={{ marginTop: '30px', backgroundColor: '#f9fafb', borderRadius: '12px', padding: '20px', border: '1px solid #d1d5db', position: 'relative' }}>

          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
              <h3 style={{margin: 0}}>Assignment Recordings 🎙️</h3>
              <button
                onClick={() => setSelectedAssignmentId(null)}
                style={{background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#6b7280'}}
                title="Close"
              >
                  ✖
              </button>
          </div>

          {isReviewLoading && <p>Loading audio files...</p>}

          {!isReviewLoading && recordings.length === 0 && <p>No recordings found for this assignment.</p>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {recordings.map((rec) => (
              <div key={rec.id} style={{ backgroundColor: 'white', padding: '15px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

                <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '1.1rem', color: '#111827' }}>
                  Word: <span style={{ color: '#2563eb' }}>{rec.word_text}</span>
                </div>

                <SecureAudioPlayer recordingId={rec.id} />

              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

export default PatientDetails
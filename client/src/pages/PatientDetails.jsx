import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

function PatientDetails() {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  // Get patient info passed via navigation state
  const patient = location.state?.patient || { full_name: 'Patient' }

  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchPatientSessions = async () => {
      try {
        const token = localStorage.getItem('token')
        const headers = { Authorization: `Bearer ${token}` }

        // Make sure the URL matches where you put the new endpoint!
        // Adjust if you didn't put it under a /clinician prefix
        const response = await axios.get(`http://127.0.0.1:8000/clinician/patients/${patientId}/sessions`, { headers })

        setSessions(response.data)
        setLoading(false)
      } catch (err) {
        console.error("Fetch error:", err)
        setError("Could not load patient sessions.")
        setLoading(false)
      }
    }
    fetchPatientSessions()
  }, [patientId])

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 style={{ margin: 0, color: '#111827' }}>{patient.full_name}'s Profile</h1>
          <p style={{ color: '#6b7280', margin: '5px 0 0 0' }}>Review progress and assigned sessions</p>
        </div>
        <button onClick={() => navigate('/patients')} className="btn-secondary">Back to Patients</button>
      </div>

      {loading && <p>Loading sessions...</p>}
      {error && <p className="error-msg">{error}</p>}

      {/* Sessions List */}
      {!loading && !error && (
        <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', textAlign: 'left' }}>
          <h2 style={{ marginTop: 0, borderBottom: '1px solid #e5e7eb', paddingBottom: '10px' }}>Assigned Missions</h2>

          {sessions.length === 0 ? (
            <p style={{ color: '#6b7280' }}>No sessions assigned yet.</p>
          ) : (
            <ul style={{ padding: 0, listStyle: 'none' }}>
              {sessions.map(session => (
                <li key={session.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 0', borderBottom: '1px dashed #e5e7eb' }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', color: '#1f2937' }}>{session.title || 'Practice Session'}</h4>
                    <span style={{ fontSize: '0.85rem', color: '#6b7280', display: 'flex', gap: '10px' }}>
                      <span>🎯 Sound: <strong>{session.target_sound}</strong></span>
                      <span>|</span>
                      <span>⏳ Status: {session.status || 'Pending'}</span>
                    </span>
                  </div>

                  {/* Future: Button to see the actual recordings for this session */}
                  <button className="btn-secondary" style={{ fontSize: '0.8rem' }}>Review Audio</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default PatientDetails
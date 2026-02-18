import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

function PatientManagement() {
  const navigate = useNavigate()

  // State for loading patients
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // NEW: States for the Assign Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [targetSound, setTargetSound] = useState('')
  const [sessionTitle, setSessionTitle] = useState('')
  const [modalMessage, setModalMessage] = useState('')

  useEffect(() => {
    const fetchPatients = async () => {
      try {
        const token = localStorage.getItem('token')
        const headers = { Authorization: `Bearer ${token}` }

        // Ensure this URL matches your router structure
        const response = await axios.get('http://127.0.0.1:8000/clinician/my-patients', { headers })

        setPatients(response.data)
        setLoading(false)
      } catch (err) {
        console.error("Fetch error:", err)
        setError("Could not load patients list.")
        setLoading(false)
      }
    }
    fetchPatients()
  }, [])

  // NEW: Functions to handle the modal
  const openAssignModal = (patient) => {
    setSelectedPatient(patient)
    setTargetSound('')
    setSessionTitle('')
    setModalMessage('')
    setIsModalOpen(true)
  }

  const closeAssignModal = () => {
    setIsModalOpen(false)
    setSelectedPatient(null)
  }

  // NEW: Function to submit the new session to the backend
  const handleCreateSession = async (e) => {
    e.preventDefault()
    setModalMessage('')

    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const cleanTargetSound = targetSound.trim().toLowerCase()

      const sessionData = {
        // Important: we use user_id because your backend logic filters by Patient.user_id == session_data.patient_id
        patient_id: selectedPatient.user_id,
        target_sound: cleanTargetSound,
        title: sessionTitle
      }

      await axios.post('http://127.0.0.1:8000/practice/sessions', sessionData, { headers })

      setModalMessage("✅ Session created successfully!")

      // Close modal after 2 seconds
      setTimeout(() => {
        closeAssignModal()
      }, 2000)

    } catch (err) {
      console.error("Create session error:", err)
      setModalMessage("❌ Error creating session.")
    }
  }

  if (loading) return <div className="card-container"><h3>Loading patients...</h3></div>
  if (error) return <div className="card-container"><h3 className="error-msg">{error}</h3></div>

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', position: 'relative' }}>

      {/* Header Area */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 style={{ margin: 0, color: '#111827' }}>Patient Management 👥</h1>
          <p style={{ color: '#6b7280', margin: '5px 0 0 0' }}>Monitor and manage all your patients</p>
        </div>
        <button onClick={() => navigate('/dashboard')} className="btn-secondary">Back to Dashboard</button>
      </div>

      {/* Patients Grid */}
      {patients.length === 0 ? (
        <p>You don't have any patients assigned yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {patients.map(patient => (
            <div key={patient.id} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', border: '1px solid #e5e7eb', textAlign: 'left' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  👤
                </div>
                <div>
                  <h3 style={{ margin: 0, color: '#111827' }}>{patient.full_name}</h3>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>DOB: {patient.date_of_birth || 'N/A'}</span>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px dashed #e5e7eb', marginBottom: '20px' }} />

              <div style={{display: 'flex', gap: '10px'}}>
                <button
                    onClick={() => navigate(`/patients/${patient.user_id}`, {state: {patient}})}
                    className="btn-primary"
                    style={{flex: 2, backgroundColor: '#111827'}}
                >
                  View Details
                </button>
                {/* UPDATE: This button now opens the modal */}
                <button
                    onClick={() => openAssignModal(patient)}
                    className="btn-secondary"
                    style={{flex: 1, backgroundColor: 'white', color: '#111827', border: '1px solid #d1d5db'}}
                >
                  Assign
                </button>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* NEW: The Assign Modal Overlay */}
      {isModalOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '400px', textAlign: 'left', position: 'relative' }}>

            <button
              onClick={closeAssignModal}
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              ✖
            </button>

            <h2 style={{ marginTop: 0 }}>Assign Session</h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>For patient: <strong>{selectedPatient?.full_name}</strong></p>

            <form onSubmit={handleCreateSession} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>

              <div>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.9rem' }}>Session Title:</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Weekly 'ch' Practice"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.9rem'}}>Target
                  Sound:</label>
                <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. ch, s, r"
                    value={targetSound}
                    onChange={(e) => setTargetSound(e.target.value)}
                    required
                />
                <span style={{fontSize: '0.8rem', color: '#9ca3af', display: 'block', marginTop: '5px'}}>
                  * Please enter a single sound without spaces or commas (e.g., ch).
                </span>
              </div>

              <button type="submit" className="btn-primary">Create Mission</button>

            </form>

            {/* Display success or error message inside the modal */}
            {modalMessage && (
              <p style={{ marginTop: '15px', fontWeight: 'bold', textAlign: 'center', color: modalMessage.includes('❌') ? 'red' : 'green' }}>
                {modalMessage}
              </p>
            )}

          </div>
        </div>
      )}

    </div>
  )
}

export default PatientManagement

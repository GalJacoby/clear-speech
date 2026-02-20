import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

function PatientManagement() {
  const navigate = useNavigate()

  // State for loading patients and templates
  const [patients, setPatients] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // States for the Assign Modal
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)

  // CHANGED: Now an array to hold multiple selected template IDs
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([])
  const [modalMessage, setModalMessage] = useState('')

  // Fetch both patients and available templates on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token')
        const headers = { Authorization: `Bearer ${token}` }

        // Fetch Patients
        const patientsRes = await axios.get('http://127.0.0.1:8000/clinician/my-patients', { headers })
        setPatients(patientsRes.data)

        // Fetch Clinician's Templates
        const templatesRes = await axios.get('http://127.0.0.1:8000/practice/templates', { headers })
        setTemplates(templatesRes.data)

        setLoading(false)
      } catch (err) {
        console.error("Fetch error:", err)
        setError("Could not load data.")
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Functions to handle the modal
  const openAssignModal = (patient) => {
    setSelectedPatient(patient)
    setSelectedTemplateIds([]) // Reset selections
    setModalMessage('')
    setIsModalOpen(true)
  }

  const closeAssignModal = () => {
    setIsModalOpen(false)
    setSelectedPatient(null)
  }

  // Handle checking/unchecking a template
  const toggleTemplateSelection = (templateId) => {
    setSelectedTemplateIds(prev => {
      if (prev.includes(templateId)) {
        return prev.filter(id => id !== templateId)
      } else {
        return [...prev, templateId]
      }
    })
  }

  // Function to submit the assignments to the backend
  const handleAssignTemplates = async (e) => {
    e.preventDefault()
    setModalMessage('')

    if (selectedTemplateIds.length === 0) {
      setModalMessage("❌ Please select at least one template.")
      return
    }

    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }

    let hasError = false;
    let errorMessage = "❌ Error assigning practices.";

    // Loop through each selected template and assign it
    for (let templateId of selectedTemplateIds) {
      try {
        const assignmentData = {
          patient_id: selectedPatient.user_id,
          template_id: templateId
        }
        await axios.post('http://127.0.0.1:8000/practice/assignments', assignmentData, { headers })
      } catch (err) {
        hasError = true;
        // CHANGED: Grab the specific detail message from the FastAPI backend if it exists
        if (err.response && err.response.data && err.response.data.detail) {
          errorMessage = `❌ ${err.response.data.detail}`;
        }
        break; // Stop processing further templates if one fails (e.g. duplicate)
      }
    }

    if (hasError) {
      setModalMessage(errorMessage);
    } else {
      setModalMessage(`✅ ${selectedTemplateIds.length} Practice(s) assigned successfully!`)
      // Close modal after 2 seconds
      setTimeout(() => {
        closeAssignModal()
      }, 2000)
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

      {/* The Assign Modal Overlay */}
      {isModalOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '450px', textAlign: 'left', position: 'relative' }}>

            <button
              onClick={closeAssignModal}
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              ✖
            </button>

            <h2 style={{ marginTop: 0 }}>Assign Practices</h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>For patient: <strong>{selectedPatient?.full_name}</strong></p>

            {templates.length === 0 ? (
              <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fef2f2', border: '1px solid #f87171', borderRadius: '8px' }}>
                <p style={{ color: '#b91c1c', margin: 0, fontSize: '0.9rem' }}>
                  You don't have any practice templates yet. Please create a template from the dashboard first.
                </p>
              </div>
            ) : (
              <form onSubmit={handleAssignTemplates} style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '0.9rem' }}>
                    Select Practice Templates ({selectedTemplateIds.length} selected):
                  </label>

                  {/* CHANGED: Checkbox list instead of a dropdown */}
                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '10px',
                    backgroundColor: '#f9fafb'
                  }}>
                    {templates.map(t => (
                      <label
                        key={t.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '8px 5px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #e5e7eb'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTemplateIds.includes(t.id)}
                          onChange={() => toggleTemplateSelection(t.id)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#3b82f6' }}
                        />
                        <span style={{ fontSize: '0.95rem', color: '#374151' }}>
                          <strong>{t.title}</strong> <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>(Sound: {t.target_sound})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{ marginTop: '10px' }}>
                  Submit Assignments
                </button>
              </form>
            )}

            {/* Display success or error message inside the modal */}
            {modalMessage && (
              <div style={{
                marginTop: '15px',
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: modalMessage.includes('❌') ? '#fef2f2' : '#f0fdf4',
                color: modalMessage.includes('❌') ? '#b91c1c' : '#15803d',
                fontWeight: 'bold',
                textAlign: 'center'
              }}>
                {modalMessage}
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  )
}

export default PatientManagement
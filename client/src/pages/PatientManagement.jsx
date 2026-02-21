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

  // Array to hold multiple selected template IDs
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([])
  const [modalMessage, setModalMessage] = useState('')

  // States for the Create Patient Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    full_name: '',
    date_of_birth: '',
    target_sounds: ''
  })
  const [createMessage, setCreateMessage] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }

      const [patientsRes, templatesRes] = await Promise.all([
        axios.get('http://127.0.0.1:8000/clinician/my-patients', { headers }),
        axios.get('http://127.0.0.1:8000/practice/templates', { headers })
      ])
      setPatients(patientsRes.data)
      setTemplates(templatesRes.data)
    } catch (err) {
      console.error("Fetch error:", err)
      setError("Could not load data.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
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

  // Create Patient modal
  const openCreateModal = () => {
    setCreateForm({ email: '', password: '', full_name: '', date_of_birth: '', target_sounds: '' })
    setCreateMessage('')
    setIsCreateModalOpen(true)
  }

  const closeCreateModal = () => {
    setIsCreateModalOpen(false)
  }

  const handleCreatePatient = async (e) => {
    e.preventDefault()
    setCreateMessage('')
    if (!createForm.email?.trim() || !createForm.password?.trim() || !createForm.full_name?.trim()) {
      setCreateMessage('Please fill in email, password, and full name.')
      return
    }
    setCreateLoading(true)
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }
      const payload = {
        email: createForm.email.trim(),
        password: createForm.password,
        full_name: createForm.full_name.trim(),
        date_of_birth: createForm.date_of_birth || null,
        target_sounds: createForm.target_sounds
          ? createForm.target_sounds.split(',').map(s => s.trim()).filter(Boolean)
          : []
      }
      await axios.post('http://127.0.0.1:8000/clinician/patients', payload, { headers })
      setCreateMessage('Patient created successfully.')
      await fetchData()
      setTimeout(() => closeCreateModal(), 1500)
    } catch (err) {
      const detail = err.response?.data?.detail
      setCreateMessage(detail || 'Failed to create patient.')
    } finally {
      setCreateLoading(false)
    }
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
        // Grab the specific detail message from the FastAPI backend if it exists
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
        <div style={{ textAlign: 'left', flex: 1 }}>
          <h1 style={{ margin: 0, color: '#111827' }}>Patient Management</h1>
          <p style={{ color: '#6b7280', margin: '5px 0 0 0' }}>Monitor and manage all your patients</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={openCreateModal}
            className="btn-primary"
            style={{ backgroundColor: '#059669', width: 'auto', padding: '10px 20px', whiteSpace: 'nowrap' }}
          >
            Add Patient
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary"
            style={{ backgroundColor: '#4b5563', width: 'auto', padding: '10px 20px', whiteSpace: 'nowrap' }}
          >
            Back to Dashboard
          </button>
        </div>
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
                    className="btn-primary"
                    style={{flex: 1, backgroundColor: '#111827'}}
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

                <button type="submit" className="btn-primary" style={{ marginTop: '10px', backgroundColor: '#3b82f6' }}>
                  Submit Assignments
                </button>
              </form>
            )}

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

      {/* Create Patient Modal */}
      {isCreateModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '12px', width: '420px', textAlign: 'left', position: 'relative' }}>

            <button
              onClick={closeCreateModal}
              disabled={createLoading}
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
            >
              ✖
            </button>

            <h2 style={{ marginTop: 0 }}>Add New Patient</h2>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '20px' }}>Create a patient account linked to you. They will use the email and password to log in.</p>

            <form onSubmit={handleCreatePatient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '0.9rem' }}>Full name *</label>
                <input
                  type="text"
                  value={createForm.full_name}
                  onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="e.g. Alex Smith"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '0.9rem' }}>Email *</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="patient@example.com"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '0.9rem' }}>Password *</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '0.9rem' }}>Date of birth (optional)</label>
                <input
                  type="date"
                  value={createForm.date_of_birth}
                  onChange={e => setCreateForm(f => ({ ...f, date_of_birth: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 'bold', fontSize: '0.9rem' }}>Target sounds (optional)</label>
                <input
                  type="text"
                  value={createForm.target_sounds}
                  onChange={e => setCreateForm(f => ({ ...f, target_sounds: e.target.value }))}
                  placeholder="e.g. s, r, th"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', boxSizing: 'border-box' }}
                />
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#6b7280' }}>Comma-separated list of target sounds</p>
              </div>

              {createMessage && (
                <div style={{
                  padding: '10px',
                  borderRadius: '8px',
                  backgroundColor: createMessage.includes('success') ? '#f0fdf4' : '#fef2f2',
                  color: createMessage.includes('success') ? '#15803d' : '#b91c1c',
                  fontSize: '0.9rem'
                }}>
                  {createMessage}
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={createLoading}
                style={{ marginTop: '8px', backgroundColor: '#059669' }}
              >
                {createLoading ? 'Creating...' : 'Create Patient'}
              </button>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}

export default PatientManagement
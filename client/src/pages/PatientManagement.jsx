import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

function PatientManagement() {
  const navigate = useNavigate()

  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

      const patientsRes = await axios.get('http://127.0.0.1:8000/clinician/my-patients', { headers })
      const fetchedPatients = patientsRes.data

      // Fetch assignments per patient to show the completed-count badge
      const patientsWithCounts = await Promise.all(fetchedPatients.map(async (patient) => {
        try {
          const assignRes = await axios.get(`http://127.0.0.1:8000/clinician/patients/${patient.user_id}/assignments`, { headers })
          const completedCount = assignRes.data.filter(a => a.status === 'completed').length
          return { ...patient, completedCount }
        } catch {
          return { ...patient, completedCount: 0 }
        }
      }))

      setPatients(patientsWithCounts)
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
        <button onClick={openCreateModal} className="btn-create">
          + Add Patient
        </button>
      </div>

      {/* Patients Grid */}
      {patients.length === 0 ? (
        <p>You don't have any patients assigned yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {patients.map(patient => (
            <div
              key={patient.user_id}
              className="patient-card"
              onClick={() => navigate(`/patients/${patient.user_id}`, { state: { patient } })}
              style={{
                position: 'relative',
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb',
                textAlign: 'left'
              }}
            >
              {/* Completed-missions badge */}
              {patient.completedCount > 0 && (
                <div
                  title={`${patient.completedCount} mission(s) ready for review`}
                  style={{
                    position: 'absolute',
                    top: '15px',
                    right: '15px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '0.9rem',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  {patient.completedCount}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '12px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6', fontSize: '1.5rem', fontWeight: 'bold', flexShrink: 0 }}>
                  👤
                </div>
                <div>
                  <h3 style={{ margin: 0, color: '#111827' }}>{patient.full_name}</h3>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px dashed #e5e7eb', margin: 0 }} />

              <p style={{ margin: '12px 0 0 0', fontSize: '0.82rem', color: '#9ca3af' }}>
                Click to view profile →
              </p>
            </div>
          ))}
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

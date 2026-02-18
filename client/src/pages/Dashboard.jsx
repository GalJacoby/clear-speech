import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'
import Login from "./Login.jsx";

function Dashboard({ setToken }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [sessions, setSessions] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const token = localStorage.getItem('token')

        if (!token) {
            navigate('/login')
            return
        }

        const headers = { Authorization: `Bearer ${token}` }
        const userResponse = await axios.get('http://127.0.0.1:8000/users/me', { headers })
        const currentUser = userResponse.data
        setUser(currentUser)

        if (currentUser.role === 'patient') {
          const sessionsResponse = await axios.get('http://127.0.0.1:8000/practice/patient/sessions', { headers })
          setSessions(sessionsResponse.data)
        }

      } catch (err) {
        console.error("Fetch error:", err)
        if (err.response && err.response.status === 401) {
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

  const handleLogout = () => {
    localStorage.removeItem('token')
    setToken(null)
    navigate('/login')
  }

  if (!user) {
      return <div className="card-container"><h3>Loading...</h3></div>
  }

  return (
    <div className="card-container" style={{maxWidth: '600px'}}>
      <h1>Welcome Back!</h1>
      <p style={{color: '#6b7280'}}>Hello <strong>{user.full_name}</strong></p>

      {error && <p className="error-msg">{error}</p>}

      {user.role === 'patient' && (
        <div style={{ textAlign: 'left', marginTop: '20px' }}>
          <h3>Your Missions:</h3>
          {sessions.length === 0 ? (
            <p>No active sessions.</p>
          ) : (
            <ul style={{ padding: 0 }}>
              {sessions.map((session, index) => (
                <li key={session.id || index} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    🔊 <strong>Target:</strong> {session.target_sound} |
                    ⏳ <strong>Status:</strong> {session.status}
                  </div>

                  {/* 4. UPDATE: Pass the target_sound in the 'state' object */}
                  <button
                    onClick={() => navigate(`/practice/${session.id}`, { state: { targetSound: session.target_sound } })}
                    style={{
                      padding: '5px 15px',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    Start
                  </button>

                </li>
              ))}
            </ul>
          )}
        </div>
      )}

{user.role === 'clinician' && (
        <div style={{ textAlign: 'left', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <h3>Clinician Panel</h3>
          <p>Manage your patients and assign practice sessions.</p>
          <button
            onClick={() => navigate('/patients')}
            className="btn-primary"
            style={{ width: '100%' }}
          >
            View All Patients
          </button>
        </div>
      )}

      <button onClick={handleLogout} className="btn-danger">Logout</button>
    </div>
  )
}

export default Dashboard
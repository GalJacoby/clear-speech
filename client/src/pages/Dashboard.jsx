import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

function Dashboard({ setToken }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  // CHANGED: Renamed sessions to assignments to match our new logic
  const [assignments, setAssignments] = useState([])
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
          // Fetching from the new assignments endpoint
          const assignmentsResponse = await axios.get('http://127.0.0.1:8000/practice/patient/assignments', { headers })

          // CHANGED: Filter assignments to only show the ones that are still "pending"
          const activeMissions = assignmentsResponse.data.filter(
            assignment => assignment.status === 'pending'
          )

          setAssignments(activeMissions)
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
      <h1>Welcome Back, {user.full_name}!</h1>

      {error && <p className="error-msg">{error}</p>}

      {/* --- PATIENT PANEL --- */}
      {user.role === 'patient' && (
        <div style={{ textAlign: 'left', marginTop: '20px' }}>
          <h3>Your Missions:</h3>
          {assignments.length === 0 ? (
            <p>No active missions right now.</p>
          ) : (
            <ul style={{ padding: 0 }}>
              {assignments.map((assignment, index) => (
                <li key={assignment.id || index} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div>
                    {/* Displaying the template title pulled from the backend */}
                    <strong style={{ display: 'block', fontSize: '1.1rem', color: '#111827' }}>
                      {assignment.template_title || "Practice Session"}
                    </strong>
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      🔊 Sound: {assignment.target_sound} | ⏳ Status: {assignment.status}
                    </span>
                  </div>

                  <button
                    // Still navigating to practice room, but now passing the assignment.id
                    onClick={() => navigate(`/practice/${assignment.id}`, { state: { targetSound: assignment.target_sound } })}
                    style={{
                      padding: '8px 20px',
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      marginLeft: '15px'
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

      {/* --- CLINICIAN PANEL --- */}
      {user.role === 'clinician' && (
          <div style={{textAlign: 'left', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px'}}>

              <button
                  onClick={() => navigate('/patients')}
                  className="btn-primary"
                  style={{width: '100%'}}
              >
                  View My Patients
              </button>

              <button onClick={() => navigate('/create-template')} className="btn-primary" style={{marginBottom: '20px', backgroundColor: '#3b82f6'}}>
                  ➕ Create New Practice Template
              </button>
          </div>
      )}

      <button onClick={handleLogout} className="btn-danger" style={{ marginTop: '20px' }}>Logout</button>
    </div>
  )
}

export default Dashboard
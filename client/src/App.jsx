import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom'
import axios from 'axios'
import './App.css'

// ==========================================
// COMPONENT 1: The Login Page
// ==========================================
function Login({ setToken }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const formData = new URLSearchParams()
      formData.append('username', email)
      formData.append('password', password)

      const response = await axios.post('http://127.0.0.1:8000/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      const receivedToken = response.data.access_token
      localStorage.setItem('token', receivedToken)
      setToken(receivedToken)
      navigate('/dashboard')

    } catch (error) {
      setMessage("Login Failed. Please check your credentials.")
    }
  }

  return (
    <div className="card-container">
      <h1>ClearSpeech</h1>
      <p style={{color: '#6b7280', marginBottom: '20px'}}>Sign in to your account</p>

      <form onSubmit={handleLogin}>
        <input
          className="input-field"
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input-field"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn-primary">Login</button>
      </form>

      {message && <p className="error-msg">{message}</p>}
    </div>
  )
}

// ==========================================
// COMPONENT 2: The Practice Room (NEW!)
// ==========================================
function PracticeRoom() {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  // 2. USE: Get the state passed from the dashboard
  const location = useLocation()
  const { targetSound } = location.state || {} // Fallback to empty object if no state

  return (
    <div className="card-container">
      <h1>Practice Room</h1>

      {/* 3. DISPLAY: Show the sound if available, otherwise show ID */}
      <h2>Current Session: <span style={{color: '#2563eb'}}>{targetSound || sessionId}</span></h2>

      <div style={{ marginTop: '50px', padding: '20px', border: '2px dashed #ccc' }}>
         <p>🎤 Recording Interface will appear here soon...</p>
      </div>

      <button
        onClick={() => navigate('/dashboard')}
        className="btn-primary"
        style={{ backgroundColor: '#6b7280', marginTop: '20px' }}
      >
        Back to Dashboard
      </button>
    </div>
  )
}

// ==========================================
// COMPONENT 3: The Dashboard Page
// ==========================================
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
      <p style={{color: '#6b7280'}}>Hello <strong>{user.email}</strong> ({user.role})</p>

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
        <div style={{ textAlign: 'left', marginTop: '20px' }}>
          <h3>Clinician Panel</h3>
          <p>Patient management coming soon...</p>
        </div>
      )}

      <button onClick={handleLogout} className="btn-danger">Logout</button>
    </div>
  )
}
// ==========================================
// MAIN APP COMPONENT
// ==========================================
function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!token ? <Login setToken={setToken} /> : <Navigate to="/dashboard" />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={token ? <Dashboard setToken={setToken} /> : <Navigate to="/login" />} />

        {/* NEW ROUTE: Dynamic path for specific practice session */}
        <Route path="/practice/:sessionId" element={token ? <PracticeRoom /> : <Navigate to="/login" />} />

        <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
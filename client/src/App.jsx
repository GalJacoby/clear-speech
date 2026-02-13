import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import axios from 'axios'

// ==========================================
// COMPONENT 1: The Login Page
// ==========================================
function Login({ setToken }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  // NEW: A hook that lets us change the URL programmatically
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

      // NEW: Redirect the user to the dashboard URL after successful login
      navigate('/dashboard')

    } catch (error) {
      setMessage("Login Failed. Please check your credentials.")
    }
  }

  return (
    <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'Arial' }}>
      <h1>ClearSpeech Login</h1>
      <form onSubmit={handleLogin}>
        <div>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ margin: '5px', padding: '8px' }}/>
        </div>
        <div>
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ margin: '5px', padding: '8px' }}/>
        </div>
        <button type="submit" style={{ padding: '10px 20px', marginTop: '10px' }}>Login</button>
      </form>
      <p style={{ color: 'red' }}>{message}</p>
    </div>
  )
}

// ==========================================
// COMPONENT 2: The Dashboard Page (Role-Based)
// ==========================================
function Dashboard({ setToken }) {
  const navigate = useNavigate()

  // States to manage the user profile and their specific data
  const [user, setUser] = useState(null)
  const [sessions, setSessions] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const token = localStorage.getItem('token')
        const headers = { Authorization: `Bearer ${token}` }

        // 1. Who is logged in? Fetch user profile
        const userResponse = await axios.get('http://127.0.0.1:8000/users/me', { headers })
        const currentUser = userResponse.data
        setUser(currentUser) // Save user info (including role) to state

        // 2. Fetch specific data based on the ROLE
        if (currentUser.role === 'patient') {
          const sessionsResponse = await axios.get('http://127.0.0.1:8000/practice/patient/sessions', { headers })
          setSessions(sessionsResponse.data)
        }
        else if (currentUser.role === 'clinician') {
          // Future: Fetch clinician's patients here
          // const patientsResponse = await axios.get('http://127.0.0.1:8000/patients/my-patients', { headers })
          console.log("Clinician logged in. Ready to fetch clinician data.")
        }

      } catch (err) {
        console.error("Fetch error:", err)
        setError("Could not load dashboard data.")
      }
    }

    loadDashboardData()
  }, []) // Run once on mount

  const handleLogout = () => {
    localStorage.removeItem('token')
    setToken(null)
    navigate('/login')
  }

  // Show a loading state until we know who the user is
  if (!user) {
    return <div style={{ textAlign: 'center', marginTop: '50px' }}>Loading Dashboard...</div>
  }

  return (
    <div style={{ textAlign: 'center', marginTop: '50px', fontFamily: 'Arial' }}>
      <h1>ClearSpeech Dashboard</h1>
      <h2>Hello, {user.email}!</h2>
      <p>Your role is: <strong>{user.role}</strong></p>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* ========================================= */}
      {/* PATIENT VIEW                              */}
      {/* ========================================= */}
      {user.role === 'patient' && (
        <div style={{ margin: '30px auto', maxWidth: '400px', textAlign: 'left', backgroundColor: '#e6f2ff', padding: '20px', borderRadius: '8px' }}>
          <h3>Your Practice Sessions:</h3>
          {sessions.length === 0 ? (
            <p>No sessions found.</p>
          ) : (
            <ul style={{ paddingLeft: '20px' }}>
              {sessions.map((session, index) => (
                <li key={session.id || index} style={{ marginBottom: '10px' }}>
                  <strong>Sound:</strong> {session.target_sound} <br/>
                  <strong>Status:</strong> {session.status}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ========================================= */}
      {/* CLINICIAN VIEW                            */}
      {/* ========================================= */}
      {user.role === 'clinician' && (
        <div style={{ margin: '30px auto', maxWidth: '400px', textAlign: 'left', backgroundColor: '#f9fbe7', padding: '20px', borderRadius: '8px' }}>
          <h3>Clinician Control Panel</h3>
          <p>Welcome! Here you will soon see the list of your assigned patients and review their recordings.</p>
          {/* We will build this section next! */}
        </div>
      )}

      <button onClick={handleLogout} style={{ padding: '10px 20px', backgroundColor: 'red', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '20px' }}>
        Logout
      </button>
    </div>
  )
}

// ==========================================
// COMPONENT 3: The Main App (The Traffic Cop)
// ==========================================
function App() {
  // The main memory that knows if we have a token
  const [token, setToken] = useState(localStorage.getItem('token'))

  return (
    <BrowserRouter>
      <Routes>
        {/* Route 1: The Login Page. If they already have a token, kick them to dashboard */}
        <Route
          path="/login"
          element={!token ? <Login setToken={setToken} /> : <Navigate to="/dashboard" />}
        />

        {/* Route 2: The Dashboard Page. If they DON'T have a token, kick them to login */}
        <Route
          path="/dashboard"
          element={token ? <Dashboard setToken={setToken} /> : <Navigate to="/login" />}
        />

        {/* Default Route: If they type any other URL, redirect based on token */}
        <Route
          path="*"
          element={<Navigate to={token ? "/dashboard" : "/login"} />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
import { useState, useEffect, useRef } from 'react'
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
// COMPONENT 2: The Practice Room (PERSISTENT RECORDINGS)
// ==========================================
function PracticeRoom() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const { targetSound } = location.state || { targetSound: 's' }

  // Data State
  const [words, setWords] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Recording State
  const [isRecording, setIsRecording] = useState(false)

  // NEW: Store recordings by Word ID (Dictionary: { wordId: { url, blob } })
  const [recordingsMap, setRecordingsMap] = useState({})

  // Refs
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => {
    const fetchWords = async () => {
      try {
        const token = localStorage.getItem('token')
        const headers = { Authorization: `Bearer ${token}` }

        const response = await axios.get(`http://127.0.0.1:8000/practice/words/${targetSound}`, { headers })
        setWords(response.data)
        setLoading(false)

      } catch (err) {
        console.error("Failed to load words:", err)
        setError("Could not load practice words.")
        setLoading(false)
      }
    }
    fetchWords()
  }, [targetSound])

  // Helper to get current word's recording
  const currentWord = words[currentIndex]
  const currentRecording = currentWord ? recordingsMap[currentWord.id] : null

  // --- RECORDING LOGIC ---

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        const url = URL.createObjectURL(blob)

        // SAVE: Update the map with the new recording for this specific word
        setRecordingsMap(prev => ({
            ...prev,
            [currentWord.id]: { blob, url }
        }))

        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)

    } catch (err) {
      console.error("Error accessing microphone:", err)
      alert("Could not access microphone.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const deleteRecording = () => {
    // DELETE: Remove only the recording for the current word
    setRecordingsMap(prev => {
        const newMap = { ...prev }
        delete newMap[currentWord.id]
        return newMap
    })
  }

  // Navigation
  const handleNext = () => {
    if (currentIndex < words.length - 1) setCurrentIndex(prev => prev + 1)
  }

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1)
  }

  if (loading) return <div className="card-container"><h3>Loading words...</h3></div>
  if (error) return <div className="card-container"><h3 className="error-msg">{error}</h3></div>
  if (words.length === 0) return <div className="card-container"><h3>No words found.</h3></div>

  const imageUrl = `http://127.0.0.1:8000${currentWord.image_url}`

  return (
    <div className="card-container">

      {/* HEADER: Centered Title with Button on the Left */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px' }}>
        <button
            onClick={() => navigate('/dashboard')}
            className="btn-secondary"
            style={{ position: 'absolute', left: 0 }} // Anchor button to left
        >
            Exit
        </button>
        <span style={{ color: '#6b7280', fontWeight: 'bold' }}>Sound: {targetSound}</span>
      </div>

      <p>Word {currentIndex + 1} of {words.length}</p>

      {/* PRACTICE CARD */}
      <div className="practice-card" style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', backgroundColor: '#f9fafb' }}>

        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            {currentWord.image_url ? (
                <img
                    src={imageUrl}
                    alt={currentWord.text}
                    style={{ maxHeight: '100%', maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
            ) : (
                <div style={{ width: '150px', height: '150px', background: '#ddd', borderRadius: '50%' }}>No Image</div>
            )}
        </div>

        <h1 style={{ fontSize: '3rem', margin: '10px 0', color: '#111827' }}>{currentWord.text}</h1>

        {/* RECORDER UI */}
        <div style={{ marginTop: '20px', padding: '15px', border: '2px dashed #3b82f6', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>

           {/* STATE 1: Not Recording AND No Saved Recording for this word */}
           {!isRecording && !currentRecording && (
             <button onClick={startRecording} className="btn-primary" style={{ borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ef4444' }}>
                🎤
             </button>
           )}

           {/* STATE 2: Currently Recording */}
           {isRecording && (
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <p style={{ color: '#ef4444', fontWeight: 'bold', animation: 'pulse 1s infinite' }}>Recording...</p>
                <button onClick={stopRecording} className="btn-primary" style={{ backgroundColor: '#374151' }}>
                    Stop
                </button>
             </div>
           )}

           {/* STATE 3: Recording Exists (Playback) */}
           {currentRecording && (
             <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <audio controls src={currentRecording.url} style={{ width: '100%' }} />
                <button onClick={deleteRecording} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 10px' }}>
                    🗑 Delete & Retry
                </button>
             </div>
           )}

        </div>

      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
        <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="btn-secondary"
            style={{ opacity: currentIndex === 0 ? 0.5 : 1 }}
        >
            Previous
        </button>

        <button
            onClick={handleNext}
            disabled={currentIndex === words.length - 1}
            className="btn-primary"
            style={{ opacity: currentIndex === words.length - 1 ? 0.5 : 1 }}
        >
            Next Word
        </button>
      </div>
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
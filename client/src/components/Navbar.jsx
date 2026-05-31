import { useNavigate } from 'react-router-dom'

const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)

const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

function getRoleFromToken() {
  const token = localStorage.getItem('token')
  if (!token) return null
  try {
    // JWT is three base64url segments separated by dots; the payload is the middle one
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role || null
  } catch {
    return null
  }
}

function Navbar({ setToken }) {
  const navigate = useNavigate()
  const role = getRoleFromToken()

  const handleLogout = () => {
    localStorage.removeItem('token')
    setToken(null)
    navigate('/login')
  }

  const label = role === 'patient' ? 'Patient Dashboard' : 'Therapist Dashboard'

  return (
    <nav className="navbar">
      <span className="navbar-brand">ClearSpeech</span>
      <div className="navbar-right">
        <span className="navbar-label">{label}</span>
        <button className="navbar-btn" onClick={() => navigate('/dashboard')}>
          <HomeIcon />
          Home
        </button>
        <button className="navbar-btn navbar-btn-logout" onClick={handleLogout}>
          <LogoutIcon />
          Logout
        </button>
      </div>
    </nav>
  )
}

export default Navbar

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'
import { API_URL } from '../config'

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

      const response = await axios.post(`${API_URL}/login`, formData, {
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

export default Login
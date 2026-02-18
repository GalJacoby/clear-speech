import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate} from 'react-router-dom'
import './App.css'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PracticeRoom from './pages/PracticeRoom'
import PatientManagement from './pages/PatientManagement'
import PatientDetails from './pages/PatientDetails'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!token ? <Login setToken={setToken} /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={token ? <Dashboard setToken={setToken} /> : <Navigate to="/login" />} />
        <Route path="/practice/:sessionId" element={token ? <PracticeRoom /> : <Navigate to="/login" />} />
        <Route path="/patients" element={token ? <PatientManagement /> : <Navigate to="/login" />} />
        <Route path="/patients/:patientId" element={token ? <PatientDetails /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
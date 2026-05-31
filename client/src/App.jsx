import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate} from 'react-router-dom'
import './App.css'

import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PracticeRoom from './pages/PracticeRoom'
import PatientManagement from './pages/PatientManagement'
import PatientDetails from './pages/PatientDetails'
import CreateTemplate from './pages/CreateTemplate'
import EditTemplate from './pages/EditTemplate'
import Practices from './pages/Practices'
import Schedule from './pages/Schedule'
import ArchivedPractices from './pages/ArchivedPractices'

function ClinicianLayout({ children, setToken }) {
  return (
    <div className="clinician-layout">
      <Navbar setToken={setToken} />
      <main>{children}</main>
    </div>
  )
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!token ? <Login setToken={setToken} /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={token ? <ClinicianLayout setToken={setToken}><Dashboard setToken={setToken} /></ClinicianLayout> : <Navigate to="/login" />} />
        <Route path="/practice/:sessionId" element={token ? <PracticeRoom /> : <Navigate to="/login" />} />
        <Route path="/patients" element={token ? <ClinicianLayout setToken={setToken}><PatientManagement /></ClinicianLayout> : <Navigate to="/login" />} />
        <Route path="/patients/:patientId" element={token ? <ClinicianLayout setToken={setToken}><PatientDetails /></ClinicianLayout> : <Navigate to="/login" />} />
        <Route path="/practices" element={token ? <ClinicianLayout setToken={setToken}><Practices /></ClinicianLayout> : <Navigate to="/login" />} />
        <Route path="/create-template" element={token ? <ClinicianLayout setToken={setToken}><CreateTemplate /></ClinicianLayout> : <Navigate to="/login" />} />
        <Route path="/edit-template/:templateId" element={token ? <ClinicianLayout setToken={setToken}><EditTemplate /></ClinicianLayout> : <Navigate to="/login" />} />
        <Route path="/schedule" element={token ? <ClinicianLayout setToken={setToken}><Schedule /></ClinicianLayout> : <Navigate to="/login" />} />
        <Route path="/patients/:patientId/archived" element={token ? <ClinicianLayout setToken={setToken}><ArchivedPractices /></ClinicianLayout> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to={token ? "/dashboard" : "/login"} />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
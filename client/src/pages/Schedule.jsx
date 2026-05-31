import { useState, useEffect, useCallback } from 'react'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import axios from 'axios'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import '../App.css'

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 0 }),
  getDay,
  locales: { 'en-US': enUS }
})

const RECURRENCE_OPTIONS = [
  { value: 'one-time', label: 'One-time' },
  { value: 'weekly',   label: 'Weekly (12 weeks)' },
  { value: 'bi-weekly', label: 'Bi-weekly (12 occurrences)' }
]

const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #d1d5db', boxSizing: 'border-box', fontSize: '0.9rem', fontFamily: 'inherit' }
const labelStyle = { display: 'block', marginBottom: '5px', fontWeight: 600, fontSize: '0.85rem', color: '#374151' }

function Schedule() {
  const [appointments, setAppointments] = useState([])
  const [patients, setPatients] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [calDate, setCalDate] = useState(new Date())
  const [calView, setCalView] = useState('month')

  const [form, setForm] = useState({
    patient_id: '',
    title: '',
    date: '',
    start_time: '09:00',
    end_time: '09:30',
    recurrence_type: 'one-time'
  })

  const fetchAppointments = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await axios.get('http://127.0.0.1:8000/appointments', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setAppointments(res.data)
    } catch (err) {
      console.error("Failed to fetch appointments:", err)
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    const headers = { Authorization: `Bearer ${token}` }

    fetchAppointments()

    axios.get('http://127.0.0.1:8000/clinician/my-patients', { headers })
      .then(r => setPatients(r.data))
      .catch(err => console.error("Failed to fetch patients:", err))
  }, [])

  const events = appointments.map(apt => ({
    id: apt.id,
    title: `${apt.patient_name || 'Patient'}: ${apt.title}`,
    start: new Date(apt.start_time),
    end: new Date(apt.end_time),
    resource: apt
  }))

  const openNewModal = () => {
    setForm({ patient_id: '', title: '', date: '', start_time: '09:00', end_time: '09:30', recurrence_type: 'one-time' })
    setSubmitError('')
    setSelectedEvent(null)
    setIsModalOpen(true)
  }

  const handleSelectSlot = ({ start }) => {
    const dateStr = format(start, 'yyyy-MM-dd')
    setForm(f => ({ ...f, date: dateStr }))
    setSubmitError('')
    setSelectedEvent(null)
    setIsModalOpen(true)
  }

  const handleSelectEvent = (event) => {
    setSelectedEvent(event.resource)
  }

  const closeModal = () => { setIsModalOpen(false); setSelectedEvent(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')

    if (!form.patient_id || !form.title || !form.date || !form.start_time || !form.end_time) {
      setSubmitError('Please fill in all fields.')
      return
    }

    const startISO = new Date(`${form.date}T${form.start_time}:00`).toISOString()
    const endISO   = new Date(`${form.date}T${form.end_time}:00`).toISOString()

    if (new Date(endISO) <= new Date(startISO)) {
      setSubmitError('End time must be after start time.')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const res = await axios.post('http://127.0.0.1:8000/appointments', {
        patient_id: form.patient_id,
        title: form.title,
        start_time: startISO,
        end_time: endISO,
        recurrence_type: form.recurrence_type
      }, { headers: { Authorization: `Bearer ${token}` } })

      setAppointments(prev => [...prev, ...res.data])
      closeModal()
    } catch (err) {
      setSubmitError(err.response?.data?.detail || 'Failed to create appointment.')
    }
  }

  const handleDeleteOne = async () => {
    if (!selectedEvent) return
    if (!window.confirm('Delete this appointment?')) return
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`http://127.0.0.1:8000/appointments/${selectedEvent.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setAppointments(prev => prev.filter(a => a.id !== selectedEvent.id))
      setSelectedEvent(null)
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not delete appointment.')
    }
  }

  const handleDeleteSeries = async () => {
    if (!selectedEvent?.recurrence_group_id) return
    if (!window.confirm('Delete ALL appointments in this series?')) return
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`http://127.0.0.1:8000/appointments/series/${selectedEvent.recurrence_group_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setAppointments(prev => prev.filter(a => a.recurrence_group_id !== selectedEvent.recurrence_group_id))
      setSelectedEvent(null)
    } catch (err) {
      alert(err.response?.data?.detail || 'Could not delete series.')
    }
  }

  return (
    <div className="dashboard-page">

      {/* Link-based back navigation — React Router Link is immune to event-layer issues */}
      <Link
        to="/dashboard"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none', marginBottom: '8px' }}
      >
        ← Back
      </Link>

      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Schedule</h1>
          <p className="dashboard-subtitle">{appointments.length} appointment{appointments.length !== 1 ? 's' : ''} scheduled</p>
        </div>
        <button className="btn-create" onClick={openNewModal}>+ New Appointment</button>
      </div>

      {/* Selected-event action strip */}
      {selectedEvent && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', marginBottom: '16px' }}>
          <span style={{ flex: 1, fontSize: '0.9rem', color: '#1e40af', fontWeight: 500 }}>
            Selected: <strong>{selectedEvent.title}</strong> — {new Date(selectedEvent.start_time).toLocaleString()}
          </span>
          <button onClick={handleDeleteOne} className="template-btn-delete">Delete this</button>
          {selectedEvent.recurrence_type !== 'one-time' && (
            <button onClick={handleDeleteSeries} className="template-btn-delete">Delete entire series</button>
          )}
          <button onClick={() => setSelectedEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '1.1rem' }}>✖</button>
        </div>
      )}

      {/* Calendar */}
      <div className="calendar-container">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={['month', 'week', 'day']}
          date={calDate}
          view={calView}
          onNavigate={date => setCalDate(date)}
          onView={view => setCalView(view)}
          selectable
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          style={{ height: '100%' }}
          eventPropGetter={() => ({
            style: { backgroundColor: '#3b82f6', border: 'none', borderRadius: '4px', fontSize: '0.8rem' }
          })}
        />
      </div>

      {/* New Appointment Modal */}
      {isModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '32px', borderRadius: '12px', width: '480px', position: 'relative', textAlign: 'left' }}>
            <button onClick={closeModal} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}>✖</button>
            <h2 style={{ marginTop: 0, marginBottom: '20px' }}>New Appointment</h2>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Patient *</label>
                <select value={form.patient_id} onChange={e => setForm(f => ({ ...f, patient_id: e.target.value }))} style={inputStyle} required>
                  <option value="">Select a patient…</option>
                  {patients.map(p => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Title / Notes *</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Weekly session" style={inputStyle} required />
              </div>

              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} required />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Start Time *</label>
                  <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} style={inputStyle} required />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>End Time *</label>
                  <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} style={inputStyle} required />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Recurrence</label>
                <select value={form.recurrence_type} onChange={e => setForm(f => ({ ...f, recurrence_type: e.target.value }))} style={inputStyle}>
                  {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>

              {submitError && (
                <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#b91c1c', fontSize: '0.9rem' }}>{submitError}</div>
              )}

              <button type="submit" className="btn-primary" style={{ marginTop: '4px', backgroundColor: '#3b82f6' }}>
                Create Appointment
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Schedule

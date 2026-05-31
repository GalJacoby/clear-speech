import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

function Practices() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    fetchTemplates()
  }, [])

  const fetchTemplates = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await axios.get('http://127.0.0.1:8000/practice/templates', {
        headers: { Authorization: `Bearer ${token}` }
      })
      setTemplates(response.data)
    } catch (err) {
      console.error("Failed to fetch templates:", err)
      setError('Could not load practice templates.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (templateId, templateTitle) => {
    if (!window.confirm(`Delete "${templateTitle}"? This cannot be undone.`)) return
    setDeleteError('')
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`http://127.0.0.1:8000/practice/templates/${templateId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setTemplates(prev => prev.filter(t => t.id !== templateId))
    } catch (err) {
      console.error("Delete error:", err)
      setDeleteError('Could not delete this template. It may still be assigned to patients.')
    }
  }

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <div>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, padding: '4px 0', fontFamily: 'inherit', marginBottom: '4px' }}>
            ← Back
          </button>
          <h1>Practices</h1>
          <p className="dashboard-subtitle">
            {loading ? '' : `${templates.length} template${templates.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button className="btn-create" onClick={() => navigate('/create-template')}>
          + Create New Practice
        </button>
      </div>

      {error && <p className="error-msg">{error}</p>}
      {deleteError && <p className="error-msg">{deleteError}</p>}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading templates...</p>
      ) : templates.length === 0 ? (
        <div className="empty-state">
          <p style={{ margin: 0, fontSize: '1rem' }}>No practice templates yet.</p>
          <button className="btn-create" onClick={() => navigate('/create-template')}>
            Create your first practice
          </button>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map(template => (
            <div key={template.id} className="template-card">
              <div className="template-card-body">
                <h3 className="template-title">{template.title}</h3>
                <div className="mission-meta">
                  <span className="badge badge-sound">{template.target_sound}</span>
                </div>
                {template.word_count != null && (
                  <p className="template-meta">{template.word_count} word{template.word_count !== 1 ? 's' : ''}</p>
                )}
              </div>
              <div className="template-card-actions">
                <button
                  className="template-btn-edit"
                  onClick={() => navigate(`/edit-template/${template.id}`)}
                >
                  Edit
                </button>
                <button
                  className="template-btn-delete"
                  onClick={() => handleDelete(template.id, template.title)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Practices

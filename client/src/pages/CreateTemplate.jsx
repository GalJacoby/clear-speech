import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

function CreateTemplate() {
  const navigate = useNavigate()

  // State for the form
  const [title, setTitle] = useState('')
  const [targetSound, setTargetSound] = useState('')
  const [selectedWordIds, setSelectedWordIds] = useState([])

  // State for data from DB
  const [allWords, setAllWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 1. Fetch all words when the component mounts
  useEffect(() => {
    const fetchWords = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await axios.get('http://127.0.0.1:8000/practice/words', {
          headers: { Authorization: `Bearer ${token}` }
        })
        setAllWords(response.data)
        setLoading(false)
      } catch (err) {
        console.error("Failed to fetch words:", err)
        setError("Could not load the word bank.")
        setLoading(false)
      }
    }
    fetchWords()
  }, [])

  // 2. Filter words dynamically based on the target sound typed by the clinician
  const filteredWords = allWords.filter(word =>
    targetSound === '' || word.text.toLowerCase().includes(targetSound.toLowerCase()) ||
    (word.phonetic_trans && word.phonetic_trans.includes(targetSound))
  )

  // 3. Handle checking/unchecking a word
  const toggleWordSelection = (wordId) => {
    setSelectedWordIds(prev => {
      if (prev.includes(wordId)) {
        return prev.filter(id => id !== wordId) // Remove if already selected
      } else {
        return [...prev, wordId] // Add if not selected
      }
    })
  }

  // 4. Submit the new template to the backend
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (selectedWordIds.length === 0) {
      alert("Please select at least one word for this practice.")
      return
    }

    try {
      const token = localStorage.getItem('token')
      await axios.post('http://127.0.0.1:8000/practice/templates', {
        title: title,
        target_sound: targetSound,
        word_ids: selectedWordIds // Sending the array of selected IDs!
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      alert("✅ Practice Template created successfully!")
      navigate('/dashboard') // Go back to dashboard

    } catch (err) {
      console.error("Failed to create template:", err)
      alert("Error creating template. Please try again.")
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>Create New Practice Template</h2>

        {/* CHANGED: Styled the Cancel button to match the navigation buttons */}
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-primary"
          style={{ backgroundColor: '#4b5563', width: 'auto', padding: '10px 20px', whiteSpace: 'nowrap' }}
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>

        {/* Step 1: Basic Info */}
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Template Title:</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., S Sound - Beginners"
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Target Sound:</label>
            <input
              type="text"
              required
              value={targetSound}
              onChange={(e) => setTargetSound(e.target.value)}
              placeholder="e.g., s, sh, r"
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
            />
          </div>
        </div>

        {/* Step 2: Word Selection */}
        <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>
            Select Words from Bank ({selectedWordIds.length} selected)
          </h3>

          {loading && <p>Loading word bank...</p>}
          {error && <p style={{ color: 'red' }}>{error}</p>}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '15px',
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '5px'
          }}>
            {filteredWords.map(word => {
              const isSelected = selectedWordIds.includes(word.id)
              return (
                <div
                  key={word.id}
                  onClick={() => toggleWordSelection(word.id)}
                  style={{
                    border: isSelected ? '3px solid #3b82f6' : '1px solid #d1d5db',
                    borderRadius: '8px',
                    padding: '10px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#eff6ff' : 'white',
                    textAlign: 'center',
                    transition: 'all 0.2s'
                  }}
                >
                  {word.image_url ? (
                    <img src={`http://127.0.0.1:8000${word.image_url}`} alt={word.text} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '5px', marginBottom: '10px' }} />
                  ) : (
                     <div style={{ width: '80px', height: '80px', backgroundColor: '#f3f4f6', borderRadius: '5px', margin: '0 auto 10px auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Img</div>
                  )}
                  <div style={{ fontWeight: 'bold' }}>{word.text}</div>
                  <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>/{word.phonetic_trans}/</div>
                </div>
              )
            })}
          </div>

          {filteredWords.length === 0 && !loading && (
            <p style={{ color: '#6b7280', textAlign: 'center' }}>No words found for this target sound.</p>
          )}

        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '20px', width: '100%', padding: '12px', fontSize: '1.1rem', backgroundColor: '#3b82f6' }}>
          💾 Save Practice Template
        </button>

      </form>
    </div>
  )
}

export default CreateTemplate
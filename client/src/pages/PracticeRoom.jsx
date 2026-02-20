import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

function PracticeRoom() {
  // We keep 'sessionId' from useParams so we don't break App.jsx routes,
  // but logically this is now our 'assignmentId'
  const { sessionId } = useParams()
  const assignmentId = sessionId

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

  // Store recordings by Word ID (Dictionary: { wordId: { url, blob } })
  const [recordingsMap, setRecordingsMap] = useState({})

  // Refs
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => {
    const fetchWords = async () => {
      try {
        const token = localStorage.getItem('token')
        const headers = { Authorization: `Bearer ${token}` }

        // CHANGED: Now fetching the EXACT words linked to this specific assignment
        const response = await axios.get(`http://127.0.0.1:8000/practice/assignments/${assignmentId}/words`, { headers })

        setWords(response.data)
        setLoading(false)

      } catch (err) {
        console.error("Failed to load words:", err)
        setError("Could not load practice words.")
        setLoading(false)
      }
    }
    fetchWords()
  }, [assignmentId])

  // Helper to get current word's recording
  const currentWord = words[currentIndex]
  const currentRecording = currentWord ? recordingsMap[currentWord.id] : null

  // --- COMPLETION LOGIC ---
  // Check if every word fetched from the DB has a corresponding entry in our recordingsMap
  const isSessionComplete = words.length > 0 && Object.keys(recordingsMap).length === words.length;

  const handleSubmitSession = async () => {
    // 1. Ask for confirmation
    if (!window.confirm("Are you sure you want to submit all recordings?")) return

    try {
      const token = localStorage.getItem('token')
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'multipart/form-data'
      }

      // 2. Create an array of upload promises
      const uploadPromises = words.map(word => {
        const recordingData = recordingsMap[word.id]

        if (!recordingData) return null

        const formData = new FormData()
        formData.append('file', recordingData.blob, `recording_${word.id}.wav`)

        // CHANGED: Sending assignment_id instead of session_id
        formData.append('assignment_id', assignmentId)
        formData.append('word_id', word.id)

        return axios.post('http://127.0.0.1:8000/recordings/upload', formData, { headers })
      })

      // 3. Wait for ALL uploads to finish
      await Promise.all(uploadPromises)

      alert("✅ Great job! All recordings submitted successfully.")
      navigate('/dashboard')

    } catch (err) {
      console.error("Upload error:", err)
      alert("❌ Something went wrong while uploading. Please try again.")
    }
  }

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
  if (words.length === 0) return <div className="card-container"><h3>No words found in this template.</h3></div>

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

      {/* --- FOOTER AREA --- */}
      <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Navigation Buttons Row */}
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button
                onClick={handlePrev}
                disabled={currentIndex === 0}
                className="btn-secondary"
                style={{
                    flex: 1, // Make buttons equal width
                    opacity: currentIndex === 0 ? 0.5 : 1,
                    margin: 0 // Reset default margins
                }}
            >
                ⬅ Previous
            </button>

            <button
                onClick={handleNext}
                disabled={currentIndex === words.length - 1}
                className="btn-primary"
                style={{
                    flex: 1, // Make buttons equal width
                    opacity: currentIndex === words.length - 1 ? 0.5 : 1,
                    backgroundColor: '#3b82f6', // Standard Blue
                    margin: 0
                }}
            >
                Next Word ➡
            </button>
        </div>

        {/* Submit Section */}
        <div style={{
            paddingTop: '20px',
            borderTop: '1px solid #e5e7eb',
            textAlign: 'center'
        }}>
            <button
              onClick={handleSubmitSession}
              disabled={!isSessionComplete}
              style={{
                backgroundColor: isSessionComplete ? '#10b981' : '#f3f4f6',
                color: isSessionComplete ? 'white' : '#9ca3af',
                border: isSessionComplete ? 'none' : '1px dashed #d1d5db', // Dashed border when locked
                padding: '12px 30px',
                fontSize: '1rem',
                borderRadius: '30px', // Rounded pill shape
                cursor: isSessionComplete ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s ease',
                fontWeight: 'bold',
                boxShadow: isSessionComplete ? '0 4px 6px -1px rgba(16, 185, 129, 0.4)' : 'none',
                width: '100%',
                maxWidth: '300px'
              }}
            >
              {isSessionComplete ? "✅ Submit All Recordings" : `🎤 Record ${words.length - Object.keys(recordingsMap).length} more to finish`}
            </button>
        </div>

      </div>
    </div>
  )
}

export default PracticeRoom
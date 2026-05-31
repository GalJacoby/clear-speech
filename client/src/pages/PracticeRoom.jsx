import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import axios from 'axios'
import '../App.css'

// ── Helpers ──────────────────────────────────────────────────────────────────

function imgSrc(imageUrl) {
  if (!imageUrl) return null
  return imageUrl.startsWith('http') ? imageUrl : `http://127.0.0.1:8000${imageUrl}`
}

function mediaSrc(url) {
  if (!url) return null
  return url.startsWith('http') ? url : `http://127.0.0.1:8000${url}`
}

function scoreColor(score) {
  if (score >= 80) return '#10b981'   // green
  if (score >= 55) return '#f59e0b'   // amber
  return '#ef4444'                     // red
}

function scoreLabel(score) {
  if (score >= 80) return 'Great job! 🎉'
  if (score >= 55) return 'Good effort! 👍'
  return 'Keep practicing! 💪'
}

/**
 * Converts a WebM/Opus blob (what MediaRecorder actually produces) into a
 * 16-bit PCM WAV at 16 kHz mono, which soundfile/librosa can read without ffmpeg.
 */
async function convertToWav(blob) {
  const audioCtx = new AudioContext()
  const arrayBuffer = await blob.arrayBuffer()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  audioCtx.close()

  const TARGET_SR = 16000
  const offlineCtx = new OfflineAudioContext(
    1,
    Math.ceil(audioBuffer.duration * TARGET_SR),
    TARGET_SR
  )
  const src = offlineCtx.createBufferSource()
  src.buffer = audioBuffer
  src.connect(offlineCtx.destination)
  src.start()
  const rendered = await offlineCtx.startRendering()

  return encodeWav(rendered)
}

function encodeWav(audioBuffer) {
  const pcm = audioBuffer.getChannelData(0)
  const samples = new Int16Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }

  const buf = new ArrayBuffer(44 + samples.buffer.byteLength)
  const v = new DataView(buf)
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }

  str(0, 'RIFF');  v.setUint32(4, 36 + samples.buffer.byteLength, true)
  str(8, 'WAVE');  str(12, 'fmt ')
  v.setUint32(16, 16, true)          // subchunk1 size
  v.setUint16(20, 1, true)           // PCM
  v.setUint16(22, 1, true)           // mono
  v.setUint32(24, 16000, true)       // sample rate
  v.setUint32(28, 32000, true)       // byte rate (16000 * 2)
  v.setUint16(32, 2, true)           // block align
  v.setUint16(34, 16, true)          // bits per sample
  str(36, 'data'); v.setUint32(40, samples.buffer.byteLength, true)
  new Int16Array(buf, 44).set(samples)

  return new Blob([buf], { type: 'audio/wav' })
}

// ── Component ─────────────────────────────────────────────────────────────────

function PracticeRoom() {
  const { sessionId } = useParams()
  const assignmentId = sessionId

  const navigate = useNavigate()
  const location = useLocation()
  const { targetSound } = location.state || { targetSound: 's' }

  const [words, setWords] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [isRecording, setIsRecording] = useState(false)
  const [recordingsMap, setRecordingsMap] = useState({})

  // { wordId: { loading: bool, score: int, feedback: str, error: str } }
  const [gradingMap, setGradingMap] = useState({})

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  useEffect(() => {
    const fetchWords = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await axios.get(
          `http://127.0.0.1:8000/practice/assignments/${assignmentId}/words`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
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

  const currentWord = words[currentIndex]
  const currentRecording = currentWord ? recordingsMap[currentWord.id] : null
  const currentGrading  = currentWord ? gradingMap[currentWord.id]   : null

  const isSessionComplete = words.length > 0 && Object.keys(recordingsMap).length === words.length

  // ── Grading ────────────────────────────────────────────────────────────────

  const gradeRecording = async (blob, wordId, wordText) => {
    setGradingMap(prev => ({ ...prev, [wordId]: { loading: true } }))
    try {
      const wavBlob = await convertToWav(blob)
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', wavBlob, 'recording.wav')
      formData.append('word', wordText)

      const response = await axios.post(
        'http://127.0.0.1:8000/recordings/grade',
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      )
      setGradingMap(prev => ({ ...prev, [wordId]: { loading: false, ...response.data } }))
    } catch (err) {
      console.error('Grading error:', err)
      setGradingMap(prev => ({
        ...prev,
        [wordId]: { loading: false, error: 'Could not grade this recording. Please try again.' }
      }))
    }
  }

  // ── Recording ──────────────────────────────────────────────────────────────

  const startRecording = async () => {
    // Capture word identity at the moment recording starts (avoids stale closure)
    const wordId   = currentWord.id
    const wordText = currentWord.text

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const url  = URL.createObjectURL(blob)
        setRecordingsMap(prev => ({ ...prev, [wordId]: { blob, url } }))
        stream.getTracks().forEach(t => t.stop())
        gradeRecording(blob, wordId, wordText)
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
    const id = currentWord.id
    setRecordingsMap(prev => { const m = { ...prev }; delete m[id]; return m })
    setGradingMap(prev  => { const m = { ...prev }; delete m[id]; return m })
  }

  // ── Session submit ─────────────────────────────────────────────────────────

  const handleSubmitSession = async () => {
    if (!window.confirm("Are you sure you want to submit all recordings?")) return
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }

      await Promise.all(words.map(word => {
        const rec = recordingsMap[word.id]
        if (!rec) return null
        const grading = gradingMap[word.id]
        const formData = new FormData()
        formData.append('file', rec.blob, `recording_${word.id}.wav`)
        formData.append('assignment_id', assignmentId)
        formData.append('word_id', word.id)
        if (grading?.score != null)  formData.append('score',    grading.score)
        if (grading?.feedback)       formData.append('feedback', grading.feedback)
        return axios.post('http://127.0.0.1:8000/recordings/upload', formData, {
          headers: { ...headers, 'Content-Type': 'multipart/form-data' }
        })
      }))

      // Calculate average score from all graded words (ignore words that errored or are still loading)
      const gradedScores = Object.values(gradingMap)
        .filter(g => !g.loading && typeof g.score === 'number')
        .map(g => g.score)
      const averageScore = gradedScores.length > 0
        ? Math.round(gradedScores.reduce((sum, s) => sum + s, 0) / gradedScores.length)
        : null

      await axios.patch(
        `http://127.0.0.1:8000/practice/assignments/${assignmentId}/complete`,
        { score: averageScore },
        { headers }
      )
      alert("✅ Great job! All recordings submitted successfully.")
      navigate('/dashboard')
    } catch (err) {
      console.error("Upload error:", err)
      alert("❌ Something went wrong while uploading. Please try again.")
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  const handleNext = () => { if (currentIndex < words.length - 1) setCurrentIndex(i => i + 1) }
  const handlePrev = () => { if (currentIndex > 0) setCurrentIndex(i => i - 1) }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return <div className="card-container"><h3>Loading words…</h3></div>
  if (error)   return <div className="card-container"><h3 className="error-msg">{error}</h3></div>
  if (words.length === 0) return <div className="card-container"><h3>No words found in this template.</h3></div>

  const imageUrl = imgSrc(currentWord.image_url)

  return (
    <div className="card-container">

      {/* Header */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px' }}>
        <button onClick={() => navigate('/dashboard')} className="btn-secondary" style={{ position: 'absolute', left: 0 }}>
          Exit
        </button>
        <span style={{ color: '#6b7280', fontWeight: 'bold' }}>Sound: {targetSound}</span>
      </div>

      <p>Word {currentIndex + 1} of {words.length}</p>

      {/* Practice card */}
      <div className="practice-card" style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', backgroundColor: '#f9fafb' }}>

        {/* Image */}
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
          {imageUrl ? (
            <img src={imageUrl} alt={currentWord.text} style={{ maxHeight: '100%', maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
          ) : (
            <div style={{ width: '150px', height: '150px', background: '#e5e7eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>No Image</div>
          )}
        </div>

        {/* Word text — shown only for 'text' mode (or legacy/undefined) */}
        {(currentWord.practice_type === 'text' || !currentWord.practice_type) && (
          <h1 style={{ fontSize: '3rem', margin: '10px 0', color: '#111827' }}>{currentWord.text}</h1>
        )}

        {/* Play Word button — shown only for 'sound' mode (hides text; audio is the only cue) */}
        {(currentWord.practice_type === 'sound' || currentWord.practice_type === 'voice') && mediaSrc(currentWord.audio_url) && (
          <button
            type="button"
            onClick={() => new Audio(mediaSrc(currentWord.audio_url)).play().catch(console.error)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto 14px auto',
              padding: '10px 24px', backgroundColor: '#f0fdf4', color: '#15803d',
              border: '2px solid #bbf7d0', borderRadius: '30px', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.95rem', transition: 'background-color 0.15s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#dcfce7'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
          >
            🔊 Play Word
          </button>
        )}

        {/* Recorder UI */}
        <div style={{ marginTop: '20px', padding: '15px', border: '2px dashed #3b82f6', borderRadius: '8px', backgroundColor: '#eff6ff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>

          {/* STATE 1: idle */}
          {!isRecording && !currentRecording && (
            <button onClick={startRecording} className="btn-primary" style={{ borderRadius: '50%', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ef4444' }}>
              🎤
            </button>
          )}

          {/* STATE 2: recording */}
          {isRecording && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <p style={{ color: '#ef4444', fontWeight: 'bold' }}>Recording…</p>
              <button onClick={stopRecording} className="btn-primary" style={{ backgroundColor: '#374151' }}>Stop</button>
            </div>
          )}

          {/* STATE 3: recording exists */}
          {currentRecording && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <audio controls src={currentRecording.url} style={{ width: '100%' }} />
              <button onClick={deleteRecording} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 10px' }}>
                🗑 Delete & Retry
              </button>
            </div>
          )}
        </div>

        {/* AI Grading result */}
        {currentGrading && (
          <div style={{ marginTop: '16px', padding: '14px', borderRadius: '10px', border: '1px solid #e5e7eb', backgroundColor: 'white', textAlign: 'left' }}>
            {currentGrading.loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', padding: '8px 0', color: '#6b7280', fontSize: '0.9rem' }}>
                <span style={{ width: '18px', height: '18px', border: '2px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
                Grading your pronunciation…
              </div>
            ) : currentGrading.error ? (
              <p style={{ margin: 0, color: '#ef4444', fontSize: '0.875rem' }}>{currentGrading.error}</p>
            ) : (
              <>
                {/* Score row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: scoreColor(currentGrading.score), minWidth: '56px' }}>
                    {currentGrading.score}
                    <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#9ca3af' }}>/100</span>
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${currentGrading.score}%`, height: '100%', backgroundColor: scoreColor(currentGrading.score), borderRadius: '4px', transition: 'width 0.6s ease' }} />
                    </div>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', fontWeight: 600, color: scoreColor(currentGrading.score) }}>
                      {scoreLabel(currentGrading.score)}
                    </p>
                  </div>
                </div>
                {/* Feedback */}
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', lineHeight: 1.55 }}>
                  {currentGrading.feedback}
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <button onClick={handlePrev} disabled={currentIndex === 0} className="btn-secondary" style={{ flex: 1, opacity: currentIndex === 0 ? 0.5 : 1, margin: 0 }}>
            ⬅ Previous
          </button>
          <button onClick={handleNext} disabled={currentIndex === words.length - 1} className="btn-primary" style={{ flex: 1, opacity: currentIndex === words.length - 1 ? 0.5 : 1, backgroundColor: '#3b82f6', margin: 0 }}>
            Next Word ➡
          </button>
        </div>

        <div style={{ paddingTop: '20px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
          <button
            onClick={handleSubmitSession}
            disabled={!isSessionComplete}
            style={{
              backgroundColor: isSessionComplete ? '#10b981' : '#f3f4f6',
              color: isSessionComplete ? 'white' : '#9ca3af',
              border: isSessionComplete ? 'none' : '1px dashed #d1d5db',
              padding: '12px 30px', fontSize: '1rem', borderRadius: '30px',
              cursor: isSessionComplete ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s ease', fontWeight: 'bold',
              boxShadow: isSessionComplete ? '0 4px 6px -1px rgba(16,185,129,0.4)' : 'none',
              width: '100%', maxWidth: '300px'
            }}
          >
            {isSessionComplete
              ? "✅ Submit All Recordings"
              : `🎤 Record ${words.length - Object.keys(recordingsMap).length} more to finish`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PracticeRoom

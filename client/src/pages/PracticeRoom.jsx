import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import axios from 'axios'
import { Mic, ChevronLeft, ChevronRight, X, Volume2, Trash2 } from 'lucide-react'
import '../App.css'
import { API_URL } from '../config'

// ── Helpers ──────────────────────────────────────────────────────────────────

function imgSrc(imageUrl) {
  if (!imageUrl) return null
  return imageUrl.startsWith('http') ? imageUrl : `${API_URL}${imageUrl}`
}

function mediaSrc(url) {
  if (!url) return null
  return url.startsWith('http') ? url : `${API_URL}${url}`
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
  const { targetSound = 's', practiceType = 'words', syllablePrompts = [], repetitionCount = 3 } = location.state || {}

  // ── Words mode state ───────────────────────────────────────────────────────
  const [words, setWords] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ── Unified recording + grading state ─────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false)
  const [recordingsMap, setRecordingsMap] = useState({})
  // { key: { loading: bool, score: int, feedback: str, error: str } }
  const [gradingMap, setGradingMap] = useState({})

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  // ── Sounds mode: build syllable × repetition item list ───────────────────
  const soundsItems = practiceType === 'sounds'
    ? syllablePrompts.flatMap(s =>
        Array.from({ length: repetitionCount }, (_, i) => ({
          key: `${s}_${i + 1}`,
          syllable: s,
          attempt: i + 1,
        }))
      )
    : []

  // ── Unified items and current item ────────────────────────────────────────
  const items = practiceType === 'sounds' ? soundsItems : words
  const totalItems = items.length
  const currentItem = items[currentIndex]

  // Keys and labels differ by mode
  const currentKey   = practiceType === 'sounds' ? currentItem?.key   : currentItem?.id?.toString()
  const currentLabel = practiceType === 'sounds' ? currentItem?.syllable : currentItem?.text

  const currentRecording = currentKey ? recordingsMap[currentKey] : null
  const currentGrading   = currentKey ? gradingMap[currentKey]    : null

  const isSessionComplete = totalItems > 0 && items.every(item => {
    const k = practiceType === 'sounds' ? item.key : item.id?.toString()
    return !!recordingsMap[k]
  })

  const remainingCount = items.filter(item => {
    const k = practiceType === 'sounds' ? item.key : item.id?.toString()
    return !recordingsMap[k]
  }).length

  // ── Fetch words (words mode only) ─────────────────────────────────────────
  useEffect(() => {
    if (practiceType === 'sounds') { setLoading(false); return }
    const fetchWords = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await axios.get(
          `${API_URL}/practice/assignments/${assignmentId}/words`,
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
  }, [assignmentId, practiceType])

  // ── Grading ────────────────────────────────────────────────────────────────
  const gradeRecording = async (blob, key, label) => {
    setGradingMap(prev => ({ ...prev, [key]: { loading: true } }))
    try {
      const wavBlob = await convertToWav(blob)
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', wavBlob, 'recording.wav')
      formData.append('word', label)
      if (practiceType === 'sounds') formData.append('practice_type', 'sounds')

      const response = await axios.post(
        `${API_URL}/recordings/grade`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      )
      setGradingMap(prev => ({ ...prev, [key]: { loading: false, ...response.data } }))
    } catch (err) {
      console.error('Grading error:', err)
      setGradingMap(prev => ({
        ...prev,
        [key]: { loading: false, error: 'Could not grade this recording. Please try again.' }
      }))
    }
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = async () => {
    const key   = currentKey
    const label = currentLabel
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
        setRecordingsMap(prev => ({ ...prev, [key]: { blob, url } }))
        stream.getTracks().forEach(t => t.stop())
        gradeRecording(blob, key, label)
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
    setRecordingsMap(prev => { const m = { ...prev }; delete m[currentKey]; return m })
    setGradingMap(prev  => { const m = { ...prev }; delete m[currentKey]; return m })
  }

  // ── Session submit ─────────────────────────────────────────────────────────
  const handleSubmitSession = async () => {
    if (!window.confirm("Are you sure you want to submit all recordings?")) return
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }

      await Promise.all(items.map(item => {
        const k = practiceType === 'sounds' ? item.key : item.id?.toString()
        const rec = recordingsMap[k]
        if (!rec) return null
        const grading = gradingMap[k]
        const formData = new FormData()
        formData.append('file', rec.blob, `recording_${k}.wav`)
        formData.append('assignment_id', assignmentId)
        if (practiceType === 'sounds') {
          formData.append('syllable_text', item.syllable)
        } else {
          formData.append('word_id', item.id)
        }
        if (grading?.score != null)  formData.append('score',    grading.score)
        if (grading?.feedback)       formData.append('feedback', grading.feedback)
        return axios.post(`${API_URL}/recordings/upload`, formData, {
          headers: { ...headers, 'Content-Type': 'multipart/form-data' }
        })
      }))

      const gradedScores = Object.values(gradingMap)
        .filter(g => !g.loading && typeof g.score === 'number')
        .map(g => g.score)
      const averageScore = gradedScores.length > 0
        ? Math.round(gradedScores.reduce((sum, s) => sum + s, 0) / gradedScores.length)
        : null

      await axios.patch(
        `${API_URL}/practice/assignments/${assignmentId}/complete`,
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
  const handleNext = () => { if (currentIndex < totalItems - 1) setCurrentIndex(i => i + 1) }
  const handlePrev = () => { if (currentIndex > 0) setCurrentIndex(i => i - 1) }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div className="card-container"><h3>Loading…</h3></div>
  if (error)   return <div className="card-container"><h3 className="error-msg">{error}</h3></div>
  if (totalItems === 0) return <div className="card-container"><h3>No items found in this practice.</h3></div>

  const imageUrl = practiceType === 'sounds' ? null : imgSrc(currentItem?.image_url)

  // Shared recorder UI block
  const RecorderUI = (
    <div style={{ marginTop: '20px', padding: '24px 16px', borderRadius: '16px', backgroundColor: '#fafafa', border: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      {!isRecording && !currentRecording && (
        <button
          onClick={startRecording}
          title="Start recording"
          style={{ width: '72px', height: '72px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: practiceType === 'sounds' ? 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: practiceType === 'sounds' ? '0 4px 14px rgba(236,72,153,0.35)' : '0 4px 14px rgba(99,102,241,0.35)', transition: 'transform 0.15s, box-shadow 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.06)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <Mic size={28} color="white" strokeWidth={1.75} />
        </button>
      )}
      {isRecording && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={stopRecording}
            title="Stop recording"
            style={{ width: '72px', height: '72px', borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'micPulse 1.6s ease-in-out infinite', boxShadow: '0 4px 14px rgba(244,63,94,0.3)' }}
          >
            <Mic size={28} color="white" strokeWidth={1.75} />
          </button>
          <span style={{ fontSize: '0.8rem', color: '#f43f5e', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Recording…</span>
        </div>
      )}
      {currentRecording && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
          <audio controls src={currentRecording.url} style={{ width: '100%', borderRadius: '8px' }} />
          <button
            onClick={deleteRecording}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '999px', padding: '6px 16px', cursor: 'pointer', color: '#9ca3af', fontSize: '0.8rem', fontFamily: 'inherit', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#fca5a5'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <Trash2 size={13} strokeWidth={2} /> Delete & Retry
          </button>
        </div>
      )}
    </div>
  )

  // Shared grading result block
  const GradingResult = currentGrading ? (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 800, color: scoreColor(currentGrading.score), minWidth: '56px' }}>
              {currentGrading.score}<span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#9ca3af' }}>/100</span>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${currentGrading.score}%`, height: '100%', backgroundColor: scoreColor(currentGrading.score), borderRadius: '4px', transition: 'width 0.6s ease' }} />
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', fontWeight: 600, color: scoreColor(currentGrading.score) }}>{scoreLabel(currentGrading.score)}</p>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', lineHeight: 1.55 }}>{currentGrading.feedback}</p>
        </>
      )}
    </div>
  ) : null

  // Shared footer
  const Footer = (
    <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
        <button
          onClick={handlePrev}
          disabled={currentIndex === 0}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px 20px', borderRadius: '999px', border: '1.5px solid #e5e7eb', backgroundColor: 'white', color: '#6b7280', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem', cursor: currentIndex === 0 ? 'not-allowed' : 'pointer', opacity: currentIndex === 0 ? 0.4 : 1, transition: 'all 0.15s' }}
          onMouseEnter={e => { if (currentIndex > 0) e.currentTarget.style.backgroundColor = '#f9fafb' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white' }}
        >
          <ChevronLeft size={16} strokeWidth={2.5} /> Previous
        </button>
        <button
          onClick={handleNext}
          disabled={currentIndex === totalItems - 1}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '11px 20px', borderRadius: '999px', border: 'none', background: currentIndex === totalItems - 1 ? '#e5e7eb' : 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)', color: currentIndex === totalItems - 1 ? '#9ca3af' : 'white', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.875rem', cursor: currentIndex === totalItems - 1 ? 'not-allowed' : 'pointer', transition: 'all 0.15s', boxShadow: currentIndex === totalItems - 1 ? 'none' : '0 4px 12px rgba(99,102,241,0.3)' }}
        >
          Next <ChevronRight size={16} strokeWidth={2.5} />
        </button>
      </div>
      <div style={{ paddingTop: '20px', borderTop: '1px solid #e5e7eb', textAlign: 'center' }}>
        <button
          onClick={handleSubmitSession}
          disabled={!isSessionComplete}
          style={{ backgroundColor: isSessionComplete ? '#10b981' : '#f3f4f6', color: isSessionComplete ? 'white' : '#9ca3af', border: isSessionComplete ? 'none' : '1px dashed #d1d5db', padding: '12px 30px', fontSize: '1rem', borderRadius: '30px', cursor: isSessionComplete ? 'pointer' : 'not-allowed', transition: 'all 0.3s ease', fontWeight: 'bold', boxShadow: isSessionComplete ? '0 4px 6px -1px rgba(16,185,129,0.4)' : 'none', width: '100%', maxWidth: '300px' }}
        >
          {isSessionComplete ? "✅ Submit All Recordings" : `🎤 Record ${remainingCount} more to finish`}
        </button>
      </div>
    </div>
  )

  // ── Letter Sounds render ───────────────────────────────────────────────────
  if (practiceType === 'sounds') {
    const syllableIndex = syllablePrompts.indexOf(currentItem.syllable)
    const syllableNumber = syllableIndex + 1
    return (
      <div className="card-container">
        {/* Header */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            title="Exit practice"
            style={{ position: 'absolute', left: 0, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', color: '#9ca3af', transition: 'background-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
          >
            <X size={18} strokeWidth={2} />
          </button>
          <span style={{ color: '#9ca3af', fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 500 }}>
            Letter Sounds — /{targetSound}/
          </span>
        </div>

        {/* Progress line */}
        <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#6b7280', textAlign: 'center' }}>
          Syllable {syllableNumber} of {syllablePrompts.length}  ·  Attempt {currentItem.attempt} of {repetitionCount}
        </p>
        {/* Overall mini progress */}
        <div style={{ height: '4px', backgroundColor: '#e5e7eb', borderRadius: '2px', overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ width: `${((currentIndex + 1) / totalItems) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #ec4899, #f472b6)', transition: 'width 0.4s ease' }} />
        </div>

        {/* Syllable card */}
        <div className="practice-card" style={{ border: '2px solid #fce7f3', borderRadius: '16px', padding: '32px 20px', backgroundColor: '#fff7fb', textAlign: 'center' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', fontWeight: 600, color: '#be185d', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Let's say this sound!
          </p>
          {/* Giant syllable display */}
          <div style={{ fontSize: '5rem', fontWeight: 800, color: '#9d174d', lineHeight: 1, margin: '0 0 8px 0', letterSpacing: '0.04em' }}>
            {currentItem.syllable}
          </div>
          <p style={{ margin: '0 0 20px 0', fontSize: '0.85rem', color: '#d946a8' }}>
            attempt {currentItem.attempt} of {repetitionCount}
          </p>

          {RecorderUI}
          {GradingResult}
        </div>

        {Footer}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes micPulse { 0%,100%{box-shadow:0 4px 14px rgba(244,63,94,0.3)} 50%{box-shadow:0 4px 24px rgba(244,63,94,0.6)} }`}</style>
      </div>
    )
  }

  // ── Word Bank render (original) ────────────────────────────────────────────
  return (
    <div className="card-container">
      {/* Header */}
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '20px' }}>
        <button
          onClick={() => navigate('/dashboard')}
          title="Exit practice"
          style={{ position: 'absolute', left: 0, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '50%', color: '#9ca3af', transition: 'background-color 0.15s, color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f3f4f6'; e.currentTarget.style.color = '#374151' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9ca3af' }}
        >
          <X size={18} strokeWidth={2} />
        </button>
        <span style={{ color: '#9ca3af', fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 500 }}>Sound: {targetSound}</span>
      </div>

      <p>Word {currentIndex + 1} of {totalItems}</p>

      {/* Practice card */}
      <div className="practice-card" style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '20px', backgroundColor: '#f9fafb' }}>
        {/* Image */}
        <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
          {imageUrl ? (
            <img src={imageUrl} alt={currentItem.text} style={{ maxHeight: '100%', maxWidth: '100%', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
          ) : (
            <div style={{ width: '150px', height: '150px', background: '#e5e7eb', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>No Image</div>
          )}
        </div>

        {(currentItem.practice_type === 'text' || !currentItem.practice_type) && (
          <h1 style={{ fontSize: '3rem', margin: '10px 0', color: '#111827' }}>{currentItem.text}</h1>
        )}

        {(currentItem.practice_type === 'sound' || currentItem.practice_type === 'voice') && mediaSrc(currentItem.audio_url) && (
          <button
            type="button"
            onClick={() => new Audio(mediaSrc(currentItem.audio_url)).play().catch(console.error)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 auto 14px auto', padding: '10px 26px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1.5px solid #bbf7d0', borderRadius: '999px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', transition: 'all 0.15s', fontFamily: 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#dcfce7' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0fdf4' }}
          >
            <Volume2 size={16} strokeWidth={2} />
            Play Word
          </button>
        )}

        {RecorderUI}
        {GradingResult}
      </div>

      {Footer}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes micPulse { 0%,100%{box-shadow:0 4px 14px rgba(244,63,94,0.3)} 50%{box-shadow:0 4px 24px rgba(244,63,94,0.6)} }`}</style>
    </div>
  )
}

export default PracticeRoom

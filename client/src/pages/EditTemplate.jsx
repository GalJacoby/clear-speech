import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import { Trash2 } from 'lucide-react'
import '../App.css'

function imgSrc(imageUrl) {
  if (!imageUrl) return null
  return imageUrl.startsWith('http') ? imageUrl : `http://127.0.0.1:8000${imageUrl}`
}

function EditTemplate() {
  const { templateId } = useParams()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [targetSound, setTargetSound] = useState('')
  const [selectedWordIds, setSelectedWordIds] = useState([])

  const [allWords, setAllWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [audioUploading, setAudioUploading] = useState(new Set())
  const [generatingAudio, setGeneratingAudio] = useState(new Set())
  const [recordingWordId, setRecordingWordId] = useState(null)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef  = useRef(null)
  const audioChunksRef    = useRef([])
  const streamRef         = useRef(null)
  const isAbortedRef      = useRef(false)
  const customBlobUrlsRef = useRef([])
  const [wordTypeMap,    setWordTypeMap]    = useState({})
  const [audioSourceMap, setAudioSourceMap] = useState({})
  const [aiAudioByWord,     setAiAudioByWord]     = useState({})
  const [customAudioByWord, setCustomAudioByWord] = useState({})
  const [playingWordId,  setPlayingWordId]  = useState(null)
  const audioPreviewRef = useRef(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('token')
        const headers = { Authorization: `Bearer ${token}` }

        const [wordsRes, templateRes] = await Promise.all([
          axios.get('http://127.0.0.1:8000/practice/words', { headers }),
          axios.get(`http://127.0.0.1:8000/practice/templates/${templateId}`, { headers })
        ])

        setAllWords(wordsRes.data)
        const initAi = {}
        wordsRes.data.forEach(w => { if (w.practice_type === 'sound' && w.audio_url) initAi[w.id] = w.audio_url })
        setAiAudioByWord(initAi)
        setTitle(templateRes.data.title)
        setTargetSound(templateRes.data.target_sound)
        setSelectedWordIds(templateRes.data.word_ids)
        setLoading(false)
      } catch (err) {
        console.error("Failed to load template:", err)
        setError("Could not load template data.")
        setLoading(false)
      }
    }
    fetchData()
  }, [templateId])

  const filteredWords = allWords.filter(word =>
    targetSound === '' ||
    word.text.toLowerCase().includes(targetSound.toLowerCase()) ||
    (word.phonetic_trans && word.phonetic_trans.includes(targetSound))
  )

  const toggleWordSelection = (wordId) => {
    setSelectedWordIds(prev =>
      prev.includes(wordId) ? prev.filter(id => id !== wordId) : [...prev, wordId]
    )
  }

  const resolveAudioSrc = (audioUrl) => {
    if (!audioUrl) return null
    if (audioUrl.startsWith('blob:') || audioUrl.startsWith('http')) return audioUrl
    return `http://127.0.0.1:8000${audioUrl}`
  }

  const playPreview = (wordId, audioUrl) => {
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause()
      audioPreviewRef.current.src = ''
      audioPreviewRef.current.load()
      audioPreviewRef.current = null
    }
    if (playingWordId === wordId) { setPlayingWordId(null); return }
    const src = resolveAudioSrc(audioUrl)
    if (!src) return
    console.log('[ClearSpeech] Playing audio source:', src)
    const a = new Audio(src)
    audioPreviewRef.current = a
    a.onended = () => { setPlayingWordId(null); audioPreviewRef.current = null }
    a.onerror = () => {
      console.warn('[ClearSpeech] Audio unavailable:', src)
      setPlayingWordId(null)
      audioPreviewRef.current = null
      setAllWords(prev => prev.map(w => w.id === wordId ? { ...w, audio_url: null } : w))
      setAiAudioByWord(prev => { const n = { ...prev }; delete n[wordId]; return n })
    }
    a.play().catch(e => console.error('[ClearSpeech] Playback error:', e))
    setPlayingWordId(wordId)
  }

  const handleSetAudioSource = async (wordId, source) => {
    if (isRecording && recordingWordId === wordId) abortRecording()
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause()
      audioPreviewRef.current.src = ''
      audioPreviewRef.current.load()
      audioPreviewRef.current = null
    }
    setPlayingWordId(null)
    setAudioSourceMap(prev => ({ ...prev, [wordId]: source }))

    if (source === 'ai' && aiAudioByWord[wordId]) {
      setAllWords(prev => prev.map(w => w.id === wordId ? { ...w, audio_url: aiAudioByWord[wordId] } : w))
      // FIX: write AI URL back to DB so the next session doesn't load the custom recording
      try {
        const token = localStorage.getItem('token')
        const word = allWords.find(w => w.id === wordId)
        if (word) {
          await axios.post(
            'http://127.0.0.1:8000/practice/audio/generate',
            { word_id: wordId, text: word.text },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        }
      } catch (e) {
        console.warn('[handleSetAudioSource] DB restore failed:', e)
      }
    } else if (source === 'record' && customAudioByWord[wordId]) {
      setAllWords(prev => prev.map(w => w.id === wordId ? { ...w, audio_url: customAudioByWord[wordId] } : w))
    }
  }

  const handleDeleteWord = async (wordId, wordText) => {
    if (!window.confirm(`Delete "${wordText}" from the word bank? Existing practices that use this word will not be affected.`)) return
    try {
      const token = localStorage.getItem('token')
      await axios.delete(`http://127.0.0.1:8000/practice/words/${wordId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setAllWords(prev => prev.filter(w => w.id !== wordId))
      setSelectedWordIds(prev => prev.filter(id => id !== wordId))
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete word.')
    }
  }

  const handleSetWordType = async (wordId, newType) => {
    setWordTypeMap(prev => ({ ...prev, [wordId]: newType }))
    try {
      const token = localStorage.getItem('token')
      await axios.patch(
        `http://127.0.0.1:8000/practice/words/${wordId}/type`,
        { practice_type: newType },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setAllWords(prev => prev.map(w => w.id === wordId ? { ...w, practice_type: newType } : w))
    } catch (err) {
      console.error('Failed to update type:', err)
      setWordTypeMap(prev => ({ ...prev, [wordId]: allWords.find(w => w.id === wordId)?.practice_type ?? 'text' }))
    }
  }

  const handleGenerateAudio = async (wordId, wordText) => {
    setGeneratingAudio(prev => new Set(prev).add(wordId))
    try {
      const token = localStorage.getItem('token')
      const res = await axios.post(
        'http://127.0.0.1:8000/practice/audio/generate',
        { word_id: wordId, text: wordText },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setAllWords(prev => prev.map(w => w.id === wordId ? { ...w, audio_url: res.data.audio_url } : w))
      setAiAudioByWord(prev => ({ ...prev, [wordId]: res.data.audio_url }))
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to generate AI audio.')
    } finally {
      setGeneratingAudio(prev => { const s = new Set(prev); s.delete(wordId); return s })
    }
  }

  const startRecordingForWord = async (wordId) => {
    try {
      isAbortedRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mediaRecorder.onstop = () => {
        if (isAbortedRef.current) {
          streamRef.current = null
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = null
        stream.getTracks().forEach(t => t.stop())
        setRecordingWordId(null)
        setIsRecording(false)
        const blob    = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const blobUrl = URL.createObjectURL(blob)
        customBlobUrlsRef.current.push(blobUrl)
        setCustomAudioByWord(prev => ({ ...prev, [wordId]: blobUrl }))
      }
      mediaRecorder.start()
      setRecordingWordId(wordId)
      setIsRecording(true)
    } catch {
      alert('Could not access microphone.')
    }
  }

  const stopRecordingForWord = () => {
    if (mediaRecorderRef.current && isRecording) mediaRecorderRef.current.stop()
  }

  const abortRecording = () => {
    isAbortedRef.current = true
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null
      if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setRecordingWordId(null)
    setIsRecording(false)
  }

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        isAbortedRef.current = true
        mediaRecorderRef.current.onstop = null
        mediaRecorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause()
        audioPreviewRef.current.src = ''
        audioPreviewRef.current.load()
        audioPreviewRef.current = null
      }
      customBlobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      customBlobUrlsRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!isRecording || recordingWordId === null) return
    if ((audioSourceMap[recordingWordId] ?? 'record') !== 'record') {
      abortRecording()
    }
  }, [audioSourceMap])

  const handleUploadAudio = async (wordId, file, onUploaded) => {
    if (!file) return
    setAudioUploading(prev => new Set(prev).add(wordId))
    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', file)
      const res = await axios.post(
        `http://127.0.0.1:8000/practice/words/${wordId}/audio`,
        formData,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      )
      setAllWords(prev => prev.map(w => w.id === wordId ? { ...w, audio_url: res.data.audio_url } : w))
      if (onUploaded) onUploaded(res.data.audio_url)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to upload audio prompt.')
    } finally {
      setAudioUploading(prev => { const s = new Set(prev); s.delete(wordId); return s })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (selectedWordIds.length === 0) {
      alert("Please select at least one word for this practice.")
      return
    }
    try {
      const token = localStorage.getItem('token')
      await axios.put(`http://127.0.0.1:8000/practice/templates/${templateId}`, {
        title,
        target_sound: targetSound,
        word_ids: selectedWordIds
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      navigate('/practices')
    } catch (err) {
      console.error("Failed to update template:", err)
      alert("Error saving changes. Please try again.")
    }
  }

  if (loading) return <div style={{ padding: '40px 48px' }}><p>Loading...</p></div>
  if (error) return <div style={{ padding: '40px 48px' }}><p className="error-msg">{error}</p></div>

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, padding: '4px 0', fontFamily: 'inherit', marginBottom: '10px' }}>
        ← Back
      </button>
      <h2 style={{ margin: '0 0 20px 0' }}>Edit Practice</h2>

      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>

        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Practice Title:</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., S Sound - Beginners"
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
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
              style={{ width: '100%', padding: '10px', borderRadius: '5px', border: '1px solid #ccc', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
          <h3 style={{ marginBottom: '15px' }}>
            Select Words ({selectedWordIds.length} selected)
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '15px',
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '5px'
          }}>
            {filteredWords.map(word => {
              const isSelected      = selectedWordIds.includes(word.id)
              const wordType        = wordTypeMap[word.id] ?? word.practice_type ?? 'text'
              const audioSource     = audioSourceMap[word.id] ?? 'ai'
              const isBusy          = audioUploading.has(word.id) || generatingAudio.has(word.id)
              const isRecordingThis = recordingWordId === word.id
              const btnBase         = { fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid' }

              // Source-isolated URLs — no cross-source fallbacks
              const aiUrl     = aiAudioByWord[word.id] || null
              const customUrl = customAudioByWord[word.id] || null
              const activeUrl = audioSource === 'ai' ? aiUrl : customUrl
              return (
                <div
                  key={word.id}
                  onClick={() => toggleWordSelection(word.id)}
                  style={{ border: isSelected ? '3px solid #3b82f6' : '1px solid #d1d5db', borderRadius: '8px', padding: '10px', cursor: 'pointer', backgroundColor: isSelected ? '#eff6ff' : 'white', textAlign: 'center', transition: 'all 0.2s', position: 'relative' }}
                >
                  <button
                    type="button"
                    title={`Delete "${word.text}" from word bank`}
                    onClick={e => { e.stopPropagation(); handleDeleteWord(word.id, word.text) }}
                    style={{ position: 'absolute', top: '5px', right: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '3px', borderRadius: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.15s, background-color 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = '#fef2f2' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#d1d5db'; e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                  {imgSrc(word.image_url) ? (
                    <img src={imgSrc(word.image_url)} alt={word.text} style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '5px', marginBottom: '6px' }} />
                  ) : (
                    <div style={{ width: '72px', height: '72px', backgroundColor: '#f3f4f6', borderRadius: '5px', margin: '0 auto 6px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#9ca3af' }}>No Img</div>
                  )}
                  <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '7px', color: '#111827' }}>
                    {word.text}
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginBottom: '5px' }}>
                      {[['text', 'Text'], ['sound', '🔊 Sound']].map(([val, lbl]) => (
                        <button key={val} type="button" onClick={() => handleSetWordType(word.id, val)}
                          style={{ ...btnBase, borderColor: wordType === val ? (val === 'sound' ? '#059669' : '#2563eb') : '#d1d5db', backgroundColor: wordType === val ? (val === 'sound' ? '#059669' : '#2563eb') : 'white', color: wordType === val ? 'white' : '#9ca3af' }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                    {wordType === 'sound' && (
                      <div>
                        {/* ▶ Listen — resolves URL dynamically at click time */}
                        {activeUrl && (
                          <button type="button"
                            onClick={() => {
                              const src = (audioSourceMap[word.id] ?? 'ai') === 'record'
                                ? customAudioByWord[word.id]
                                : aiAudioByWord[word.id]
                              if (src) playPreview(word.id, src)
                            }}
                            style={{ width: '100%', marginBottom: '5px', ...btnBase, padding: '3px 0', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: playingWordId === word.id ? '#dcfce7' : '#f0fdf4', color: '#15803d', borderColor: '#bbf7d0' }}>
                            {playingWordId === word.id ? '⏸ Pause' : '▶ Listen'}
                          </button>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '4px' }}>
                          {[['ai', '🤖 AI'], ['record', '🎤 Custom']].map(([val, lbl]) => (
                            <label key={val} style={{ fontSize: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', color: audioSource === val ? '#111827' : '#9ca3af' }}>
                              <input type="radio" name={`src-${word.id}`} checked={audioSource === val}
                                onChange={() => handleSetAudioSource(word.id, val)}
                                style={{ width: '10px', height: '10px', accentColor: '#2563eb' }} />
                              {lbl}
                            </label>
                          ))}
                        </div>
                        {isBusy ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                            <span style={{ width: '11px', height: '11px', border: '2px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                            <span style={{ fontSize: '0.6rem', color: '#6b7280' }}>Processing…</span>
                          </div>
                        ) : audioSource === 'ai' ? (
                          /* AI branch — Generate button only; mic/record UI completely hidden */
                          !aiUrl ? (
                            <button type="button" onClick={() => handleGenerateAudio(word.id, word.text)} disabled={!!recordingWordId}
                              style={{ ...btnBase, backgroundColor: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                              Generate AI
                            </button>
                          ) : null
                        ) : (
                          /* Custom Record branch — mic UI only; AI buttons completely hidden */
                          isRecordingThis ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                              <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 700 }}>🔴</span>
                              <button type="button" onClick={stopRecordingForWord} style={{ fontSize: '0.58rem', padding: '1px 5px', backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Stop</button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => startRecordingForWord(word.id)} disabled={!!recordingWordId}
                              style={{ ...btnBase, backgroundColor: '#fff1f2', color: '#dc2626', borderColor: '#fecaca' }}>
                              {customAudioByWord[word.id] ? '🎤 Re-record' : 'Start Mic'}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {filteredWords.length === 0 && (
            <p style={{ color: '#6b7280', textAlign: 'center' }}>No words found for this target sound.</p>
          )}
        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '20px', width: '100%', padding: '12px', fontSize: '1.1rem', backgroundColor: '#3b82f6' }}>
          Save Changes
        </button>
      </form>
    </div>
  )
}

export default EditTemplate

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Trash2 } from 'lucide-react'
import '../App.css'
import { API_URL } from '../config'

function imgSrc(imageUrl) {
  if (!imageUrl) return null
  return imageUrl.startsWith('http') ? imageUrl : `${API_URL}${imageUrl}`
}

function CreateTemplate() {
  const navigate = useNavigate()

  // Which mode is selected: null = chooser, 'words' = word bank form, 'sounds' = letter sounds form
  const [practiceMode, setPracticeMode] = useState(null)

  // ── Word Bank form state ─────────────────────────────────────────────────────
  const [title, setTitle] = useState('')
  const [targetSound, setTargetSound] = useState('')
  const [selectedWordIds, setSelectedWordIds] = useState([])

  // ── Letter Sounds form state ─────────────────────────────────────────────────
  const [soundsTitle, setSoundsTitle] = useState('')
  const [targetPhoneme, setTargetPhoneme] = useState('')
  const [syllables, setSyllables] = useState([])
  const [repetitionCount, setRepetitionCount] = useState(3)
  const [newSyllableInput, setNewSyllableInput] = useState('')

  const VOWELS = ['a', 'e', 'i', 'o', 'u']

  const handlePhonemeChange = (value) => {
    setTargetPhoneme(value)
    if (value.trim()) {
      setSyllables(VOWELS.map(v => `${value.trim().toLowerCase()}${v}`))
    } else {
      setSyllables([])
    }
  }

  const removeSyllable = (syl) => setSyllables(prev => prev.filter(s => s !== syl))

  const addCustomSyllable = () => {
    const val = newSyllableInput.trim().toLowerCase()
    if (val && !syllables.includes(val)) {
      setSyllables(prev => [...prev, val])
    }
    setNewSyllableInput('')
  }

  const handleSubmitSounds = async (e) => {
    e.preventDefault()
    if (!soundsTitle.trim()) { alert("Please enter a practice title."); return }
    if (!targetPhoneme.trim()) { alert("Please enter a target phoneme."); return }
    if (syllables.length === 0) { alert("Please add at least one syllable."); return }
    try {
      const token = localStorage.getItem('token')
      await axios.post(`${API_URL}/practice/templates`, {
        title: soundsTitle.trim(),
        target_sound: targetPhoneme.trim(),
        word_ids: [],
        practice_type: 'sounds',
        syllable_prompts: syllables,
        repetition_count: repetitionCount,
      }, { headers: { Authorization: `Bearer ${token}` } })
      alert("✅ Letter Sounds Practice created successfully!")
      navigate('/practices')
    } catch (err) {
      console.error("Failed to create sounds template:", err)
      alert("Error creating practice. Please try again.")
    }
  }

  const [allWords, setAllWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add-word state
  const [isAddWordOpen, setIsAddWordOpen] = useState(false)
  const [newWordText, setNewWordText] = useState('')
  const [isWordLoading, setIsWordLoading] = useState(false)
  const [wordAddError, setWordAddError] = useState('')

  // Audio state
  const [audioUploading, setAudioUploading] = useState(new Set())   // file upload in progress
  const [generatingAudio, setGeneratingAudio] = useState(new Set()) // gTTS generation in progress
  const [recordingWordId, setRecordingWordId] = useState(null)      // which word is being mic-recorded
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef    = useRef(null)
  const audioChunksRef      = useRef([])
  const streamRef           = useRef(null)
  const isAbortedRef        = useRef(false)
  const customBlobUrlsRef   = useRef([])   // blob URLs to revoke on unmount

  // Per-card overrides: { wordId: 'text' | 'sound' } and { wordId: 'ai' | 'record' }
  const [wordTypeMap,    setWordTypeMap]    = useState({})
  const [audioSourceMap, setAudioSourceMap] = useState({})

  // Session-level audio URL caches (so source switching can restore the right track)
  const [aiAudioByWord,     setAiAudioByWord]     = useState({})  // { wordId: url }
  const [customAudioByWord, setCustomAudioByWord] = useState({})  // { wordId: url }

  // Preview playback
  const [playingWordId, setPlayingWordId] = useState(null)
  const audioPreviewRef = useRef(null)

  useEffect(() => {
    const fetchWords = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await axios.get(`${API_URL}/practice/words`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setAllWords(response.data)
        // Pre-populate the AI audio cache from DB values so the Listen button
        // works on the first session without requiring a manual re-generation.
        const initAi = {}
        response.data.forEach(w => { if (w.practice_type === 'sound' && w.audio_url) initAi[w.id] = w.audio_url })
        setAiAudioByWord(initAi)
        setLoading(false)
      } catch (err) {
        console.error("Failed to fetch words:", err)
        setError("Could not load the word bank.")
        setLoading(false)
      }
    }
    fetchWords()
  }, [])

  const filteredWords = allWords.filter(word =>
    targetSound === '' || word.text.toLowerCase().includes(targetSound.toLowerCase()) ||
    (word.phonetic_trans && word.phonetic_trans.includes(targetSound))
  )

  const toggleWordSelection = (wordId) => {
    setSelectedWordIds(prev =>
      prev.includes(wordId) ? prev.filter(id => id !== wordId) : [...prev, wordId]
    )
  }

  const handleAddWord = async () => {
    if (!newWordText.trim()) return
    setIsWordLoading(true)
    setWordAddError('')
    try {
      const token = localStorage.getItem('token')
      const headers = { Authorization: `Bearer ${token}` }

      // 1. Create the word (practice_type is always set per card later, not here)
      const wordRes = await axios.post(
        `${API_URL}/practice/words`,
        { text: newWordText.trim() },
        { headers }
      )
      let newWord = wordRes.data

      // 2. Always generate AI audio — gTTS cache makes repeated words instant
      try {
        const audioRes = await axios.post(
          `${API_URL}/practice/audio/generate`,
          { word_id: newWord.id, text: newWord.text },
          { headers }
        )
        newWord = { ...newWord, audio_url: audioRes.data.audio_url }
        setAiAudioByWord(prev => ({ ...prev, [newWord.id]: audioRes.data.audio_url }))
      } catch (audioErr) {
        console.warn('[AddWord] AI audio generation failed:', audioErr)
        // Non-fatal — word is added without audio
      }

      setAllWords(prev => prev.find(w => w.id === newWord.id) ? prev : [...prev, newWord])
      setSelectedWordIds(prev => prev.includes(newWord.id) ? prev : [...prev, newWord.id])

      // Auto-play so the clinician hears the word immediately
      if (newWord.audio_url) {
        new Audio(`${API_URL}${newWord.audio_url}`).play().catch(console.error)
      }

      setNewWordText('')
      setIsAddWordOpen(false)
    } catch (err) {
      setWordAddError(err.response?.data?.detail || 'Failed to add word.')
    } finally {
      setIsWordLoading(false)
    }
  }

  const resolveAudioSrc = (audioUrl) => {
    if (!audioUrl) return null
    // blob: and http(s): URLs are used as-is; server-relative paths get prefixed
    if (audioUrl.startsWith('blob:') || audioUrl.startsWith('http')) return audioUrl
    return `${API_URL}${audioUrl}`
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

    const a = new Audio()
    audioPreviewRef.current = a

    a.onended = () => { setPlayingWordId(null); audioPreviewRef.current = null }
    a.onerror = () => {
      console.warn('[ClearSpeech] Audio unavailable:', src)
      setPlayingWordId(null)
      audioPreviewRef.current = null
      if (!src.startsWith('blob:')) {
        setAllWords(prev => prev.map(w => w.id === wordId ? { ...w, audio_url: null } : w))
        setAiAudioByWord(prev => { const n = { ...prev }; delete n[wordId]; return n })
      }
    }

    const doPlay = () => {
      a.play()
        .then(() => setPlayingWordId(wordId))
        .catch(e => {
          console.error('[ClearSpeech] Playback error:', e)
          audioPreviewRef.current = null
        })
    }

    if (src.startsWith('blob:')) {
      // Blob URLs must be fully loaded before play() — set src, load(), then play on canplaythrough
      a.addEventListener('canplaythrough', doPlay, { once: true })
      a.src = src
      a.load()
    } else {
      a.src = src
      doPlay()
    }
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
            `${API_URL}/practice/audio/generate`,
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
      await axios.delete(`${API_URL}/practice/words/${wordId}`, {
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
        `${API_URL}/practice/words/${wordId}/type`,
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
        `${API_URL}/practice/audio/generate`,
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
      isAbortedRef.current = false   // fresh recording — clear any previous abort flag
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
        // Use the recorder's actual MIME type so the blob is decodable on every browser
        // (Chrome=audio/webm, Firefox=audio/ogg, Safari=audio/mp4)
        const mimeType = mediaRecorder.mimeType || 'audio/webm'
        const blob    = new Blob(audioChunksRef.current, { type: mimeType })
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
    isAbortedRef.current = true   // checked at top of onstop; blocks upload even if event fires late
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null   // best-effort null; abort flag is the real guard
      if (mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())  // kills browser mic indicator
      streamRef.current = null
    }
    setRecordingWordId(null)
    setIsRecording(false)
  }

  // Unmount cleanup: stop recording, kill mic stream, flush audio preview
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
      // Revoke custom-recording blob URLs to free browser memory
      customBlobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      customBlobUrlsRef.current = []
    }
  }, [])

  // Safety net: if audioSourceMap changes to anything other than 'record' while the mic
  // is active, abort the recording so it can never run silently in the background.
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
        `${API_URL}/practice/words/${wordId}/audio`,
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
      await axios.post(`${API_URL}/practice/templates`, {
        title,
        target_sound: targetSound,
        word_ids: selectedWordIds,
        practice_type: 'words',
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      alert("✅ Practice Template created successfully!")
      navigate('/practices')
    } catch (err) {
      console.error("Failed to create template:", err)
      alert("Error creating template. Please try again.")
    }
  }

  // ── Type Chooser ─────────────────────────────────────────────────────────────
  if (practiceMode === null) {
    return (
      <div style={{ padding: '20px', maxWidth: '680px', margin: '0 auto' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, padding: '4px 0', fontFamily: 'inherit', marginBottom: '20px' }}>
          ← Back
        </button>
        <h2 style={{ margin: '0 0 6px 0', color: '#111827' }}>Create New Practice</h2>
        <p style={{ margin: '0 0 32px 0', color: '#6b7280', fontSize: '0.95rem' }}>Choose the type of practice you'd like to create.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

          {/* Word Bank card */}
          <button
            type="button"
            onClick={() => setPracticeMode('words')}
            style={{ background: 'white', border: '2px solid #e5e7eb', borderRadius: '14px', padding: '28px 24px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', fontFamily: 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>📖</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', color: '#111827' }}>Word Bank Practice</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.5 }}>
              Pick words from the library and practice pronouncing them. Great for vocabulary and articulation work.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {['sun', 'ship', 'star', 'snake'].map(w => (
                <span key={w} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '999px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}>{w}</span>
              ))}
            </div>
          </button>

          {/* Letter Sounds card */}
          <button
            type="button"
            onClick={() => setPracticeMode('sounds')}
            style={{ background: 'white', border: '2px solid #e5e7eb', borderRadius: '14px', padding: '28px 24px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', fontFamily: 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ec4899'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(236,72,153,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <div style={{ fontSize: '2.2rem', marginBottom: '12px' }}>🔤</div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', color: '#111827' }}>Letter Sounds Practice</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.85rem', color: '#6b7280', lineHeight: 1.5 }}>
              Create syllable drills for a target phoneme. Perfect for isolating and repeating specific sounds.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {['sha', 'she', 'shi', 'sho', 'shu'].map(s => (
                <span key={s} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '999px', backgroundColor: '#fce7f3', color: '#9d174d', fontWeight: 600 }}>{s}</span>
              ))}
            </div>
          </button>
        </div>
      </div>
    )
  }

  // ── Letter Sounds Form ────────────────────────────────────────────────────────
  if (practiceMode === 'sounds') {
    return (
      <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
        <button onClick={() => setPracticeMode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, padding: '4px 0', fontFamily: 'inherit', marginBottom: '10px' }}>
          ← Back
        </button>
        <h2 style={{ margin: '0 0 4px 0', color: '#111827' }}>Letter Sounds Practice</h2>
        <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '0.9rem' }}>Set a target phoneme and configure syllable drills with a repetition goal.</p>

        <form onSubmit={handleSubmitSounds} style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Title */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>Practice Title</label>
            <input
              type="text"
              required
              value={soundsTitle}
              onChange={e => setSoundsTitle(e.target.value)}
              placeholder="e.g., SH Sound Drills — Beginners"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* Target Phoneme */}
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>Target Phoneme</label>
            <input
              type="text"
              required
              value={targetPhoneme}
              onChange={e => handlePhonemeChange(e.target.value)}
              placeholder="e.g., sh, s, r, l"
              style={{ width: '220px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            {targetPhoneme.trim() && (
              <p style={{ margin: '6px 0 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
                Auto-generated syllables from vowel combinations. You can remove or add more below.
              </p>
            )}
          </div>

          {/* Syllable chips */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>
              Syllable Drills <span style={{ fontWeight: 400, color: '#9ca3af' }}>({syllables.length} total)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px', minHeight: '36px', padding: '8px', backgroundColor: '#fafafa', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              {syllables.length === 0 && <span style={{ fontSize: '0.8rem', color: '#9ca3af', alignSelf: 'center' }}>Enter a phoneme above to auto-generate syllables.</span>}
              {syllables.map(s => (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', backgroundColor: '#fce7f3', color: '#9d174d', fontWeight: 700, fontSize: '0.85rem' }}>
                  {s}
                  <button
                    type="button"
                    onClick={() => removeSyllable(s)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#be185d', padding: '0', lineHeight: 1, fontSize: '0.8rem' }}
                  >×</button>
                </span>
              ))}
            </div>
            {/* Add custom syllable */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={newSyllableInput}
                onChange={e => setNewSyllableInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSyllable())}
                placeholder="Add custom syllable…"
                style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.85rem', fontFamily: 'inherit' }}
              />
              <button
                type="button"
                onClick={addCustomSyllable}
                disabled={!newSyllableInput.trim()}
                style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: 'white', cursor: newSyllableInput.trim() ? 'pointer' : 'not-allowed', fontSize: '0.85rem', fontFamily: 'inherit', color: '#374151', opacity: newSyllableInput.trim() ? 1 : 0.5 }}
              >
                + Add
              </button>
            </div>
          </div>

          {/* Repetition count */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>
              Repetitions per Syllable: <span style={{ color: '#ec4899', fontWeight: 700 }}>{repetitionCount}×</span>
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[1, 2, 3, 5, 7, 10].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRepetitionCount(n)}
                  style={{ padding: '6px 16px', borderRadius: '999px', border: `2px solid ${repetitionCount === n ? '#ec4899' : '#e5e7eb'}`, backgroundColor: repetitionCount === n ? '#fce7f3' : 'white', color: repetitionCount === n ? '#9d174d' : '#6b7280', fontWeight: repetitionCount === n ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.875rem', transition: 'all 0.15s' }}
                >
                  {n}×
                </button>
              ))}
            </div>
            {syllables.length > 0 && (
              <p style={{ margin: '8px 0 0 0', fontSize: '0.78rem', color: '#9ca3af' }}>
                Total attempts: {syllables.length} syllables × {repetitionCount} reps = <strong>{syllables.length * repetitionCount}</strong> recordings
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ padding: '12px', fontSize: '1rem', backgroundColor: '#ec4899', borderColor: '#ec4899' }}
          >
            Save Letter Sounds Practice
          </button>
        </form>
      </div>
    )
  }

  // ── Word Bank Form (existing) ──────────────────────────────────────────────
  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>

      <button onClick={() => setPracticeMode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', color: '#6b7280', fontSize: '0.875rem', fontWeight: 600, padding: '4px 0', fontFamily: 'inherit', marginBottom: '10px' }}>
        ← Back
      </button>
      <h2 style={{ margin: '0 0 20px 0' }}>Word Bank Practice</h2>

      <form onSubmit={handleSubmit} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>

        {/* Step 1: Basic Info */}
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

        {/* Step 2: Word Selection */}
        <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>

          {/* Section header row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>
              Select Words ({selectedWordIds.length} selected)
            </h3>
            {!isAddWordOpen && (
              <button
                type="button"
                onClick={() => { setIsAddWordOpen(true); setWordAddError('') }}
                className="btn-outline"
                style={{ width: 'auto', margin: 0, padding: '7px 16px', fontSize: '0.875rem' }}
              >
                + Add Word
              </button>
            )}
          </div>

          {/* Add-word inline panel */}
          {isAddWordOpen && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={newWordText}
                onChange={e => setNewWordText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddWord())}
                placeholder="Type a word (e.g. sun)"
                disabled={isWordLoading}
                autoFocus
                style={{ flex: 1, minWidth: '160px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.9rem', fontFamily: 'inherit' }}
              />

              <button
                type="button"
                onClick={handleAddWord}
                disabled={isWordLoading || !newWordText.trim()}
                className="btn-create"
                style={{ flexShrink: 0 }}
              >
                {isWordLoading ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    Saving…
                  </span>
                ) : 'Save Word'}
              </button>
              <button
                type="button"
                disabled={isWordLoading}
                onClick={() => { setIsAddWordOpen(false); setNewWordText(''); setWordAddError('') }}
                style={{ flexShrink: 0, background: 'none', border: '1px solid #d1d5db', borderRadius: '6px', padding: '8px 12px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit', color: '#6b7280' }}
              >
                Cancel
              </button>
              {wordAddError && (
                <span style={{ width: '100%', color: '#ef4444', fontSize: '0.85rem', marginTop: '4px' }}>{wordAddError}</span>
              )}
            </div>
          )}

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
              const isSelected    = selectedWordIds.includes(word.id)
              const src           = imgSrc(word.image_url)
              const wordType      = wordTypeMap[word.id] ?? word.practice_type ?? 'text'
              const audioSource   = audioSourceMap[word.id] ?? 'ai'
              const isBusy        = audioUploading.has(word.id) || generatingAudio.has(word.id)
              const isRecordingThis = recordingWordId === word.id
              const btnBase       = { fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit', border: '1px solid' }

              // Source-isolated URLs — no cross-source fallbacks
              const aiUrl     = aiAudioByWord[word.id] || null
              const customUrl = customAudioByWord[word.id] || null
              const activeUrl = audioSource === 'ai' ? aiUrl : customUrl

              return (
                <div
                  key={word.id}
                  onClick={() => toggleWordSelection(word.id)}
                  style={{
                    border: isSelected ? '3px solid #3b82f6' : '1px solid #d1d5db',
                    borderRadius: '8px', padding: '10px', cursor: 'pointer',
                    backgroundColor: isSelected ? '#eff6ff' : 'white',
                    textAlign: 'center', transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  {/* Soft delete icon — stopPropagation keeps card selection intact */}
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

                  {src ? (
                    <img src={src} alt={word.text} style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '5px', marginBottom: '6px' }} />
                  ) : (
                    <div style={{ width: '72px', height: '72px', backgroundColor: '#f3f4f6', borderRadius: '5px', margin: '0 auto 6px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#9ca3af' }}>No Img</div>
                  )}

                  <div style={{ fontWeight: 700, fontSize: '0.82rem', marginBottom: '7px', color: '#111827' }}>
                    {word.text}
                  </div>

                  {/* ── Master toggle: Text / Sound ── */}
                  <div onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', marginBottom: '5px' }}>
                      {[['text', 'Text'], ['sound', '🔊 Sound']].map(([val, lbl]) => (
                        <button key={val} type="button"
                          onClick={() => handleSetWordType(word.id, val)}
                          style={{
                            ...btnBase,
                            borderColor: wordType === val ? (val === 'sound' ? '#059669' : '#2563eb') : '#d1d5db',
                            backgroundColor: wordType === val ? (val === 'sound' ? '#059669' : '#2563eb') : 'white',
                            color: wordType === val ? 'white' : '#9ca3af',
                          }}
                        >{lbl}</button>
                      ))}
                    </div>

                    {/* ── Sound sub-menu ── */}
                    {wordType === 'sound' && (
                      <div>
                        {/* ▶ Listen — resolves the URL dynamically at click time to avoid stale closures */}
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

                        {/* Source radio row */}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '4px' }}>
                          {[['ai', '🤖 AI'], ['record', '🎤 Custom']].map(([val, lbl]) => (
                            <label key={val} style={{ fontSize: '0.6rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', color: audioSource === val ? '#111827' : '#9ca3af' }}>
                              <input
                                type="radio"
                                name={`src-${word.id}`}
                                checked={audioSource === val}
                                onChange={() => handleSetAudioSource(word.id, val)}
                                style={{ width: '10px', height: '10px', accentColor: '#2563eb' }}
                              />
                              {lbl}
                            </label>
                          ))}
                        </div>

                        {/* Action area — strictly separated by source; no cross-bleeding */}
                        {isBusy ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                            <span style={{ width: '11px', height: '11px', border: '2px solid #e5e7eb', borderTopColor: '#3b82f6', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                            <span style={{ fontSize: '0.6rem', color: '#6b7280' }}>Processing…</span>
                          </div>
                        ) : audioSource === 'ai' ? (
                          /* AI branch — only Generate button; never shows mic/record UI */
                          !aiUrl ? (
                            <button type="button"
                              onClick={() => handleGenerateAudio(word.id, word.text)}
                              disabled={!!recordingWordId}
                              style={{ ...btnBase, backgroundColor: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }}>
                              Generate AI
                            </button>
                          ) : null
                        ) : (
                          /* Custom Record branch — only mic UI; never shows AI buttons */
                          isRecordingThis ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}>
                              <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 700 }}>🔴</span>
                              <button type="button" onClick={stopRecordingForWord}
                                style={{ fontSize: '0.58rem', padding: '1px 5px', backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Stop</button>
                            </div>
                          ) : (
                            <button type="button"
                              onClick={() => startRecordingForWord(word.id)}
                              disabled={!!recordingWordId}
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

          {filteredWords.length === 0 && !loading && (
            <p style={{ color: '#6b7280', textAlign: 'center' }}>No words found for this target sound.</p>
          )}

        </div>

        <button type="submit" className="btn-primary" style={{ marginTop: '20px', width: '100%', padding: '12px', fontSize: '1.1rem', backgroundColor: '#3b82f6' }}>
          Save Practice Template
        </button>

      </form>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

export default CreateTemplate

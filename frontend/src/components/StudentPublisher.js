import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2 } from 'lucide-react';

// Pick best available audio MIME for MediaRecorder across browsers
const pickAudioMime = () => {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4'
  ];
  for (const m of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return '';
};

const getIceServers = () => {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isHttp = window.location.protocol === 'http:';
  if (isLocal && isHttp) {
    return [ { urls: 'stun:stun.l.google.com:19302' } ];
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: ['turns:turn.miila.eu:5349', 'turn:turn.miila.eu:3478'],
      username: 'miila',
      credential: 'VeryStrongTurnPass123'
    }
  ];
};

const StudentPublisher = () => {
  const [room, setRoom] = useState('default');
  const [activeTab, setActiveTab] = useState('publisher'); // 'publisher' | 'tutor'
  const [connected, setConnected] = useState(false);
  const videoRef = useRef(null);
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const dcRef = useRef(null);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const outQueueRef = useRef([]);
  const makingOfferRef = useRef(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const localStreamRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('room');
    if (r) setRoom(r);
  }, []);

  const wsBase = () => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    // In local dev (CRA on :3000), proxy /ws to backend :8000 may not be active until restart.
    // Use backend port directly when running on localhost dev server.
    const host = window.location.hostname;
    const port = window.location.port;
    if ((host === 'localhost' || host === '127.0.0.1') && port && port !== '8000') {
      return `${proto}://localhost:8000`;
    }
    return `${proto}://${window.location.host}`;
  };

  const refreshDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(cams);
      if (!selectedDeviceId && cams[0]) setSelectedDeviceId(cams[0].deviceId);
    } catch {}
  };

  const getStreamForDevice = async (deviceId) => {
    const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  };

  const start = async () => {
    // Clean up any previous session
    try { wsRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    setConnected(false);

    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    pcRef.current = pc;

    // Local media
    const stream = await getStreamForDevice(selectedDeviceId);
    localStreamRef.current = stream;
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    if (videoRef.current) videoRef.current.srcObject = stream;
    await refreshDevices();

    // DataChannel for signals (ready)
    const dc = pc.createDataChannel('signals');
    dcRef.current = dc;

    // Signaling WS
    const ws = new WebSocket(`${wsBase()}/ws/signal?room=${encodeURIComponent(room)}&role=pub`);
    wsRef.current = ws;

    const sendOffer = async () => {
      try {
        if (!pc || pc.signalingState !== 'stable' || makingOfferRef.current) return;
        makingOfferRef.current = true;
        const off = await pc.createOffer();
        await pc.setLocalDescription(off);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'offer', sdp: off.sdp }));
        } else {
          outQueueRef.current.push({ type: 'offer', sdp: off.sdp });
        }
      } catch {}
      finally { makingOfferRef.current = false; }
    };

    const resendOrOffer = async () => {
      try {
        if (!pc) return;
        const ld = pc.localDescription;
        if (pc.signalingState === 'have-local-offer' && ld && ld.sdp) {
          const msg = { type: 'offer', sdp: ld.sdp };
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
          else outQueueRef.current.push(msg);
          return;
        }
        if (pc.signalingState === 'stable') {
          await sendOffer();
          return;
        }
        // Retry shortly until stable/have-local-offer
        setTimeout(resendOrOffer, 200);
      } catch {}
    };

    ws.onmessage = async (ev) => {
      const data = JSON.parse(ev.data || '{}');
      if (data.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          try { await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }); } catch {}
        }
      } else if (data.type === 'ice') {
        try { await pc.addIceCandidate(data.candidate); } catch {}
      } else if (data.type === 'need-offer') {
        await resendOrOffer();
      }
    };

    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const msg = { type: 'ice', candidate: e.candidate };
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        outQueueRef.current.push(msg);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === 'failed' || st === 'disconnected' || st === 'closed') {
        try { ws.close(); } catch {}
        try { pc.close(); } catch {}
        try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
        setConnected(false);
      }
    };

    pc.onnegotiationneeded = async () => { await sendOffer(); };
    ws.onopen = () => {
      // Announce presence so late subscribers can request a fresh offer
      try { ws.send(JSON.stringify({ type: 'hello' })); } catch {}
      // If subscriber is already online, they'll request need-offer. Still, we attempt once.
      sendOffer();
      try {
        outQueueRef.current.forEach((m) => ws.send(JSON.stringify(m)));
      } catch {}
      outQueueRef.current = [];
      setConnected(true);
    };
  };

  const sendReady = () => {
    try {
      dcRef.current?.send(JSON.stringify({ type: 'ready', ts: Date.now() }));
    } catch {}
  };

  const startListening = () => {
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
      const rec = new SR();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (ev) => {
        try {
          const text = Array.from(ev.results).map(r => r[0]?.transcript || '').join(' ').toLowerCase();
          if (text.includes('ready')) {
            sendReady();
          }
        } catch {}
      };
      rec.onend = () => {
        if (listening) {
          try { rec.start(); } catch {}
        }
      };
      recognitionRef.current = rec;
      setListening(true);
      rec.start();
    } catch {}
  };

  const stopListening = () => {
    try {
      setListening(false);
      const rec = recognitionRef.current;
      if (rec) {
        rec.onend = null;
        rec.stop();
      }
      recognitionRef.current = null;
    } catch {}
  };

  const stop = () => {
    try { wsRef.current?.send(JSON.stringify({ type: 'bye' })); } catch {}
    try { wsRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    setConnected(false);
  };

  // -------- Voice AI Tutor (student-side) --------
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem('miila_tutor_messages') || '[]'); } catch { return []; }
  }); // {role:'student'|'tutor', text}
  const messagesRef = useRef([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => {
    try { localStorage.setItem('miila_tutor_messages', JSON.stringify(messages)); } catch {}
  }, [messages]);
  const [answer, setAnswer] = useState('');
  const [tutorError, setTutorError] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]); // used only in per-turn mode
  const turnChunksRef = useRef([]);  // persistent recorder collects here per turn
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const vadTimerRef = useRef(null);
  const stopTimerRef = useRef(null);
  const captureActiveRef = useRef(false); // collecting current turn
  const startedSpeechRef = useRef(false);
  const restartPlannedRef = useRef(false);
  const pendingStudentIdxRef = useRef(-1);
  const restartingRef = useRef(false);
  const autoRestartRef = useRef(true); // emulate Stop → Start between turns
  const speechStartTsRef = useRef(0);
  const lastVoiceTsRef = useRef(0);
  const finalizeTimerRef = useRef(null);

  const hardRestartRecorder = () => {
    if (restartingRef.current) return;
    restartingRef.current = true;
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    turnChunksRef.current = [];
    cleanupVAD();
    setTimeout(() => {
      try {
        if (voiceActive) beginListeningTurn();
      } finally {
        restartingRef.current = false;
      }
    }, 150);
  };

  const cleanupVAD = () => {
    try { clearInterval(vadTimerRef.current); } catch {}
    vadTimerRef.current = null;
    try { clearTimeout(stopTimerRef.current); } catch {}
    stopTimerRef.current = null;
    try { analyserRef.current?.disconnect(); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
    analyserRef.current = null;
    audioCtxRef.current = null;
  };

  const speak = (text) => {
    return new Promise((resolve) => {
      if (!text) { resolve(); return; }
      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        utter.onend = () => resolve();
        utter.onerror = () => resolve();
        try { window.speechSynthesis.cancel(); } catch {}
        window.speechSynthesis.speak(utter);
      } catch {
        resolve();
      }
    });
  };

  const processTurn = async (blob) => {
    try {
      setVoiceBusy(true);
      if (!blob || !blob.size || blob.size < 1500) {
        // Ignore empty/invalid chunk; re-arm listening
        startedSpeechRef.current = false;
        turnChunksRef.current = [];
        captureActiveRef.current = true;
        return;
      }
      const form = new FormData();
      const blobType = (blob && blob.type) || '';
      const ext = blobType.includes('mp4') ? 'mp4' : (blobType.includes('webm') ? 'webm' : 'wav');
      form.append('audio', blob, `turn_${Date.now()}.${ext}`);
      const historyPayload = JSON.stringify(messagesRef.current || []);
      form.append('history', historyPayload);
      // Ensure 5-turn mini-lesson before final answer
      form.append('turn_cap', '5');
      try { console.log('[TURN] sending history items =', (messagesRef.current || []).length); } catch {}
      const storedKey = localStorage.getItem('miila_api_key') || '';
      if (storedKey) form.append('api_key', storedKey);
      const apiBase = window.location.origin;
      const res = await fetch(`${apiBase}/tutor/voice_turn`, { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Voice tutor failed');
      const recognized = data.recognized_text || '';
      const tutor = data.tutor_message || '';
      const done = !!data.done;
      const finalAnswer = data.final_answer || '';
      const audio_b64 = data.audio_b64 || '';
      // Replace pending placeholder with transcript (or a fallback), then append tutor
      setMessages(prev => {
        const next = [...prev];
        const idx = pendingStudentIdxRef.current;
        if (idx >= 0 && idx < next.length && next[idx]?.role === 'student' && next[idx]?.text === '…') {
          next[idx] = { role: 'student', text: recognized || '(could not transcribe)' };
        } else if (recognized) {
          next.push({ role: 'student', text: recognized });
        }
        if (tutor) next.push({ role: 'tutor', text: tutor });
        return next;
      });
      // Block capture while speaking
      captureActiveRef.current = false;
      if (audio_b64) {
        try {
          const a = new Audio(`data:audio/mpeg;base64,${audio_b64}`);
          // Best-effort: don't block forever if the ended event never fires
          await new Promise((resolve) => {
            let settled = false;
            const done = () => { if (!settled) { settled = true; resolve(); } };
            a.onended = done; a.onerror = done; a.onpause = done;
            a.onloadedmetadata = () => {
              const est = isFinite(a.duration) && a.duration > 0 ? (a.duration * 1000 + 200) : 7000;
              setTimeout(done, Math.min(12000, Math.max(1500, est)));
            };
            // Fallback timeout if metadata never loads
            setTimeout(done, 8000);
            try { a.play().catch(done); } catch { done(); }
          });
        } catch {
          await speak(tutor);
        }
      } else {
        await speak(tutor);
      }
      // small debounce so we don't capture our own TTS tail (slightly longer for slow devices)
      await new Promise(r => setTimeout(r, 1000));
      // Decide whether to end or keep listening
      const userWantsToStop = /(^|\b)(stop|that's all|quit|exit|finish)(\b|$)/i.test((recognized || '').trim());
      if (done || userWantsToStop) {
        if (finalAnswer || tutor) setAnswer(finalAnswer || tutor);
        autoRestartRef.current = false;
        try { stopVoiceTutor(); } catch {}
        return;
      }
      // Re-arm for next guided question
      if (!restartPlannedRef.current && autoRestartRef.current) {
        restartPlannedRef.current = true;
        try { stopVoiceTutor(); } catch {}
        setTimeout(() => {
          try { if (autoRestartRef.current) startVoiceTutor(); } finally { restartPlannedRef.current = false; }
        }, 250);
      }
    } catch (e) {
      const msg = String(e?.message || e || 'Voice tutor failed');
      // If backend complains about invalid file format or duration 0, re-arm quietly
      if (msg.toLowerCase().includes('invalid file format') || msg.includes('duration')) {
        startedSpeechRef.current = false;
        turnChunksRef.current = [];
        captureActiveRef.current = true;
      } else {
        setTutorError(msg);
      }
    } finally {
      setVoiceBusy(false);
    }
  };

  const beginListeningTurn = () => {
    console.log('[VAD] beginListeningTurn');
    const src = localStreamRef.current;
    if (!src) { console.warn('[VAD] no localStreamRef'); return; }

    // kill any old VAD/analyser before starting fresh
    try { clearInterval(vadTimerRef.current); } catch {}
    vadTimerRef.current = null;
    try { analyserRef.current?.disconnect(); } catch {}
    try { if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') { audioCtxRef.current.close(); } } catch {}
    analyserRef.current = null;
    audioCtxRef.current = null;

    // pick one live audio track
    const liveTracks = (src.getAudioTracks && src.getAudioTracks())?.filter(t => t.readyState === 'live') || [];
    if (!liveTracks.length) return;
    const onlyAudio = new MediaStream([liveTracks[0]]);
    console.log('[VAD] using mic track:', liveTracks[0].label || '(default)');

    // recorder
    const mime = pickAudioMime();
    if (!mime) {
      setTutorError('This browser does not support audio recording (no supported MIME).');
      console.error('[VAD] MediaRecorder no supported MIME');
      return;
    }
    console.log('[VAD] using mime:', mime);
    const rec = new MediaRecorder(onlyAudio, { mimeType: mime });
    mediaRecorderRef.current = rec;
    turnChunksRef.current = [];
    captureActiveRef.current = true;
    startedSpeechRef.current = false;

    rec.ondataavailable = (e) => {
      if (!captureActiveRef.current) return;
      if (e.data && e.data.size > 0) turnChunksRef.current.push(e.data);
    };
    rec.onstart = () => console.log('[VAD] recorder started');
    rec.onstop = () => {
      console.warn('[VAD] recorder stopped');
      // Do NOT auto-restart here; persistent recorder per session
    };
    rec.onerror = (e) => {
      console.error('[VAD] recorder error', e);
      // unexpected death → restart unconditionally if active
      if (voiceActive) {
        restartPlannedRef.current = false;
        setTimeout(() => beginListeningTurn(), 300);
      }
    };
    try { rec.start(300); } catch (err) { console.error('[VAD] recorder.start failed', err); return; }

    // VAD setup
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const ensureResumed = async () => { try { if (ctx.state === 'suspended') await ctx.resume(); } catch {} };
    ensureResumed();
    const source = ctx.createMediaStreamSource(onlyAudio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyserRef.current = analyser;

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const RMS_THRESHOLD = 1.8;
    const SILENCE_MS = 1500;      // require ~1.5s quiet to close a turn
    const MIN_SPEECH_MS = 1200;   // require at least ~1.2s of speech before closing
    const GRACE_MS = 800;         // allow brief pause; cancel finalize if voice resumes
    const tick = async () => {
      try {
        await ensureResumed();
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const dv = buf[i] - 128; sum += dv * dv; }
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        if (rms > RMS_THRESHOLD) {
          if (!startedSpeechRef.current) {
            console.log('[VAD] speech detected');
            startedSpeechRef.current = true;
            speechStartTsRef.current = now;
          }
          lastVoiceTsRef.current = now;
          // Cancel any pending finalize if user resumed quickly
          if (finalizeTimerRef.current) {
            clearTimeout(finalizeTimerRef.current);
            finalizeTimerRef.current = null;
          }
        }
        const spokeLongEnough = startedSpeechRef.current && (now - (speechStartTsRef.current || now)) >= MIN_SPEECH_MS;
        const silentLongEnough = startedSpeechRef.current && (now - (lastVoiceTsRef.current || now)) >= SILENCE_MS;
        if (spokeLongEnough && silentLongEnough && captureActiveRef.current && !voiceBusy && !finalizeTimerRef.current) {
          // Soft-finalize with a grace window; cancel if user resumes within GRACE_MS
          finalizeTimerRef.current = setTimeout(async () => {
            finalizeTimerRef.current = null;
            if (!captureActiveRef.current || voiceBusy) return;
            console.log('[VAD] silence → finalize turn');
            captureActiveRef.current = false;
            try { mediaRecorderRef.current?.requestData(); } catch {}
            await new Promise(r => setTimeout(r, 600));
            const localChunks = turnChunksRef.current.slice();
            turnChunksRef.current = [];
            const blob = new Blob(localChunks, { type: mime });
            if (!blob || blob.size < 1500) {
              startedSpeechRef.current = false;
              captureActiveRef.current = true;
              return;
            }
            // Add a visible placeholder for the student's utterance immediately
            setMessages(prev => {
              pendingStudentIdxRef.current = prev.length;
              return [...prev, { role: 'student', text: '…' }];
            });
            await processTurn(blob);
          }, GRACE_MS);
        }
      } catch {}
    };
    vadTimerRef.current = setInterval(tick, 200);
  };

  const stopVoiceTutor = () => {
    console.log('[Tutor] stopVoiceTutor()');
    try { mediaRecorderRef.current?.stop(); } catch {}
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    turnChunksRef.current = [];
    cleanupVAD();
    try { clearInterval(window.__miila_guard); } catch {}
    window.__miila_guard = null;
    setVoiceActive(false);
    setVoiceBusy(false);
    setTutorError('');
  };

  const startVoiceTutor = async () => {
    console.log('[Tutor] startVoiceTutor()');
    try {
      setTutorError('');
      // Require API key in localStorage (set on Dashboard → API Key)
      const storedKey = localStorage.getItem('miila_api_key') || '';
      if (!storedKey) {
        setTutorError('Missing API key. Go to Dashboard → API Key and set your OpenAI key.');
        return;
      }
      // Ensure we have a local stream with audio
      let src = localStreamRef.current;
      if (!src) {
        try {
          src = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = src;
        } catch (e) {
          setTutorError('Microphone permission denied. Please allow mic access and try again.');
          return;
        }
      }
      let audioTracks = src.getAudioTracks ? src.getAudioTracks() : [];
      let hasLiveAudio = !!(audioTracks && audioTracks.some(t => t.readyState === 'live'));
      if (!hasLiveAudio) {
        try {
          const fresh = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = fresh;
          audioTracks = fresh.getAudioTracks ? fresh.getAudioTracks() : [];
          hasLiveAudio = !!(audioTracks && audioTracks.some(t => t.readyState === 'live'));
          console.log('[Tutor] obtained fresh audio-only stream');
        } catch (e) {
          setTutorError('Microphone permission denied or no mic available.');
          return;
        }
      }
      if (!hasLiveAudio) { setTutorError('No microphone detected.'); return; }

      setVoiceActive(true);
      beginListeningTurn();

      // start guard to keep mic alive
      try { clearInterval(window.__miila_guard); } catch {}
      window.__miila_guard = setInterval(() => {
        if (!voiceActive) return;
        ensureLiveMic();
      }, 1500);
    } catch (e) {
      // ignore
    }
  };

  const startNewLesson = () => {
    try { stopVoiceTutor(); } catch {}
    try { localStorage.removeItem('miila_tutor_messages'); } catch {}
    setMessages([]);
    messagesRef.current = [];
    setAnswer('');
    setTutorError('');
    autoRestartRef.current = true;
    setTimeout(() => { startVoiceTutor(); }, 250);
  };

  const ensureLiveMic = async () => {
    const s = localStreamRef.current;
    const live = !!(s && s.getAudioTracks && s.getAudioTracks().some(t => t.readyState === 'live'));
    if (!live) {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = newStream;
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
          beginListeningTurn();
        }
      } catch {
        // permission or device issue; ignore
      }
    }
  };

  const handleDeviceChange = async (e) => {
    const id = e.target.value;
    setSelectedDeviceId(id);
    if (connected && pcRef.current) {
      try {
        const newStream = await getStreamForDevice(id);
        const newTrack = newStream.getVideoTracks()[0];
        const sender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && newTrack) {
          await sender.replaceTrack(newTrack);
        }
        if (videoRef.current) videoRef.current.srcObject = newStream;
        try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
        localStreamRef.current = newStream;
      } catch {}
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center space-x-6 mb-4">
          <button onClick={() => setActiveTab('publisher')} className={`pb-2 text-sm font-medium ${activeTab==='publisher' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-black hover:text-black'}`}>Publisher</button>
          <button onClick={() => setActiveTab('tutor')} className={`pb-2 text-sm font-medium ${activeTab==='tutor' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-black hover:text-black'}`}>AI Tutor</button>
        </div>

        {activeTab === 'publisher' && (
          <div>
            <h1 className="text-lg font-semibold text-gray-900 mb-3">Student Publisher</h1>
            <label className="block text-sm text-gray-700 mb-1">Room</label>
            <input className="w-full border border-gray-300 rounded px-2 py-1 mb-3" value={room} onChange={e => setRoom(e.target.value)} />
            <div className="mb-3">
              <label className="block text-sm text-gray-700 mb-1">Camera</label>
              <select value={selectedDeviceId} onChange={handleDeviceChange} className="w-full border border-gray-300 rounded px-2 py-1">
                {videoDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(-4)}`}</option>
                ))}
              </select>
            </div>
            <div className="aspect-video bg-black rounded overflow-hidden mb-3">
              <video ref={videoRef} className="w-full h-full object-contain" autoPlay playsInline muted />
            </div>
            <div className="flex space-x-3">
              {!connected ? (
                <button onClick={start} className="bg-black hover:bg-gray-900 text-white font-medium py-2 px-4 rounded">Start</button>
              ) : (
                <>
                  <button onClick={sendReady} className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded">Send Ready</button>
                  <button onClick={listening ? stopListening : startListening} className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded">{listening ? 'Stop voice' : "Listen for 'ready'"}</button>
                  <button onClick={stop} className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded">Stop</button>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tutor' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-3">AI Voice Tutor</h2>
            <div className="flex items-center space-x-3 mb-3">
              {!voiceActive ? (
                <>
                  <button onClick={startVoiceTutor} disabled={voiceBusy} className="border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2 px-4 rounded inline-flex items-center">
                    <Mic className="h-4 w-4 mr-2"/> Start Voice Tutor
                  </button>
                  <button onClick={startNewLesson} disabled={voiceBusy} className="border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2 px-4 rounded">
                    Start New Lesson
                  </button>
                </>
              ) : (
                <>
                  <button onClick={stopVoiceTutor} disabled={voiceBusy} className="border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2 px-4 rounded inline-flex items-center">
                    <Square className="h-4 w-4 mr-2"/> Stop
                  </button>
                  <button onClick={startNewLesson} disabled={voiceBusy} className="border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2 px-4 rounded">
                    New Lesson
                  </button>
                </>
              )}
              {voiceActive && !voiceBusy && (<span className="text-sm text-gray-600">Listening… speak, then pause</span>)}
              {voiceBusy && (<span className="text-sm text-gray-600">Thinking…</span>)}
              {/* continue button removed */}
            </div>
            {tutorError && (
              <div className="bg-red-50 border border-red-200 rounded mb-3 p-2 text-sm text-red-700">{tutorError}</div>
            )}
            {(messages.length > 0 || answer) && (
              <div className="bg-gray-50 rounded border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Conversation</h3>
                <div className="space-y-3">
                  {messages.map((m, i) => (
                    <div key={i} className={m.role === 'tutor' ? 'bg-blue-50 p-3 rounded' : 'bg-white p-3 rounded border border-gray-200'}>
                      <div className="text-xs text-gray-500 mb-1">{m.role === 'tutor' ? 'Tutor' : 'Student'}</div>
                      <div className="text-gray-800 whitespace-pre-wrap">{m.text}</div>
                    </div>
                  ))}
                </div>
                {answer && (
                  <div className="mt-4 flex items-start justify-between">
                    <div className="pr-4">
                      <div className="text-sm font-semibold text-gray-900">Final Answer</div>
                      <div className="text-gray-800 whitespace-pre-wrap">{answer}</div>
                    </div>
                    <button onClick={() => speak(answer)} className="p-2 rounded bg-gray-100 hover:bg-gray-200" title="Play answer">
                      <Volume2 className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentPublisher;

import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, Volume2, Loader } from 'lucide-react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: ['turns:turn.miila.eu:5349', 'turn:turn.miila.eu:3478'],
    username: 'miila',
    credential: 'VeryStrongTurnPass123'
  }
];

const AskFromImage = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);

  // WebRTC subscriber (teacher)
  const remoteVideoRef = useRef(null);
  const subPcRef = useRef(null);
  const subWsRef = useRef(null);
  const [room, setRoom] = useState('default');

  // Local camera modal (optional capture)
  const [cameraOpen, setCameraOpen] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);

  const refreshDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      setVideoDevices(cams);
      if (!selectedDeviceId && cams[0]) setSelectedDeviceId(cams[0].deviceId);
    } catch {}
  };

  const startCamera = async (deviceId) => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return;
      stopCamera();
      const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch {}
      }
    } catch (e) {
      console.error('Camera start error:', e);
    }
  };

  const stopCamera = () => {
    try {
      const s = streamRef.current;
      if (s) s.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    } catch {}
  };

  const openCameraModal = async () => {
    setCameraOpen(true);
    await refreshDevices();
    await startCamera(selectedDeviceId);
  };

  const closeCameraModal = () => {
    stopCamera();
    try {
      setListening(false);
      const rec = recognitionRef.current;
      if (rec) {
        rec.onend = null;
        rec.stop();
      }
      recognitionRef.current = null;
    } catch {}
    setCameraOpen(false);
  };

  const handleDeviceChange = async (e) => {
    const id = e.target.value;
    setSelectedDeviceId(id);
    await startCamera(id);
  };

  const captureFromCamera = () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `tutor_capture_${Date.now()}.png`, { type: 'image/png' });
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target.result);
        reader.readAsDataURL(file);
        try {
          setListening(false);
          const rec = recognitionRef.current;
          if (rec) {
            rec.onend = null;
            rec.stop();
          }
          recognitionRef.current = null;
        } catch {}
        closeCameraModal();
      }, 'image/png');
    } catch (e) {
      console.error('Capture error:', e);
    }
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
            captureFromCamera();
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

  useEffect(() => () => stopCamera(), []);

  const onFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    setSelectedFile(file);
    setError('');
    const r = new FileReader();
    r.onload = e => setPreview(e.target.result);
    r.readAsDataURL(file);
  };

  const handleAsk = async () => {
    if (!selectedFile && stepIndex === 0) {
      setError('Please choose an image to upload.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      if (selectedFile) form.append('file', selectedFile);
      form.append('step_index', String(stepIndex));
      if (conversationId) form.append('conversation_id', conversationId);

      const apiBase = window.location.origin;
      const res = await axios.post(`${apiBase}/tutor/next`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const cid = res.data.conversation_id || conversationId;
      setConversationId(cid);

      const recognized = res.data.recognized_text || '';
      const tutor = res.data.tutor_message || '';
      const done = !!res.data.done;
      const finalAnswer = res.data.final_answer || '';

      if (recognized) setMessages(m => [...m, { role: 'student', text: recognized }]);
      if (tutor && !done) setMessages(m => [...m, { role: 'tutor', text: tutor }]);

      setExtracted(recognized);
      setAnswer(done ? finalAnswer : '');
      if (!done) {
        setStepIndex(s => s + 1);
        setSelectedFile(null);
        setPreview(null);
      }
    } catch (e) {
      setError(e.response?.data?.error || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const speak = () => {
    if (!answer) return;
    try {
      const utter = new SpeechSynthesisUtterance(answer);
      utter.lang = 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {}
  };

  // --- WebRTC subscribe (teacher side) ---
  const startSubscribe = async () => {
    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      subPcRef.current = pc;
      let remoteStream = new MediaStream();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

      pc.ontrack = (ev) => {
        if (ev.streams && ev.streams[0]) {
          ev.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
        } else if (ev.track) {
          remoteStream.addTrack(ev.track);
        }
      };

      pc.ondatachannel = (e) => {
        const dc = e.channel;
        if (dc.label !== 'signals') return;
        dc.onmessage = (msg) => {
          try {
            const data = JSON.parse(msg.data || '{}');
            if (data.type === 'ready') captureFromRemoteVideo();
          } catch {}
        };
      };

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/signal?room=${encodeURIComponent(room)}&role=sub`);
      subWsRef.current = ws;

      ws.onmessage = async (ev) => {
        const data = JSON.parse(ev.data || '{}');
        if (data.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
        } else if (data.type === 'ice') {
          try { await pc.addIceCandidate(data.candidate); } catch {}
        } else if (data.type === 'hello') {
          ws.send(JSON.stringify({ type: 'need-offer' }));
        }
      };

      const outQueue = [];
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const msg = { type: 'ice', candidate: e.candidate };
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        else outQueue.push(msg);
      };

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ type: 'need-offer' }));
          outQueue.forEach(m => ws.send(JSON.stringify(m)));
        } catch {}
      };
    } catch (e) {
      console.error('Subscribe error:', e);
    }
  };

  const stopSubscribe = () => {
    try { subWsRef.current?.close(); } catch {}
    try { subPcRef.current?.close(); } catch {}
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  };

  const captureFromRemoteVideo = () => {
    try {
      const v = remoteVideoRef.current;
      if (!v) return;
      const c = document.createElement('canvas');
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return;
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(v, 0, 0, w, h);
      c.toBlob((blob) => {
        if (!blob) return;
        const f = new File([blob], `remote_capture_${Date.now()}.png`, { type: 'image/png' });
        setSelectedFile(f);
        const r = new FileReader();
        r.onload = (e) => setPreview(e.target.result);
        r.readAsDataURL(f);
      }, 'image/png');
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-8">
      <div className="w-full max-w-3xl">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">AI Tutoring</h1>
          <p className="text-gray-600 mb-4">Upload your sheet for this step. The tutor will give a hint for the next one.</p>

          <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-gray-400" onClick={() => inputRef.current?.click()}>
            {preview ? (
              <img src={preview} alt="preview" className="max-h-64 mx-auto rounded" />
            ) : (
              <div className="text-gray-400">
                <Upload className="mx-auto h-12 w-12" />
                <p className="mt-2">Click to choose an image</p>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />

          <div className="mt-3 text-center">
            <input value={room} onChange={e => setRoom(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1 mr-2" placeholder="room" />
            <button type="button" onClick={startSubscribe} className="text-sm border border-gray-300 rounded px-2 py-1 mr-2">Connect remote stream</button>
            <button type="button" onClick={stopSubscribe} className="text-sm border border-gray-300 rounded px-2 py-1">Disconnect</button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded mt-4 p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="mt-4">
            <button onClick={handleAsk} disabled={loading || (!selectedFile && stepIndex===0)} className="bg-black hover:bg-gray-900 text-white font-medium py-2 px-4 rounded disabled:opacity-50">
              {loading ? (<span className="inline-flex items-center"><Loader className="h-4 w-4 mr-2 animate-spin"/>Processing...</span>) : 'Process Image'}
            </button>
          </div>
        </div>

        {(messages.length > 0 || answer) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Conversation</h2>
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'tutor' ? 'bg-blue-50 p-3 rounded' : 'bg-gray-50 p-3 rounded'}>
                  <div className="text-xs text-gray-500 mb-1">{m.role === 'tutor' ? 'Tutor' : 'Student'}</div>
                  <div className="text-gray-800 whitespace-pre-wrap">{m.text}</div>
                </div>
              ))}
            </div>

            {answer && (
              <div className="mt-6">
                <div className="flex items-start justify-between">
                  <div className="pr-4">
                    <h2 className="text-lg font-semibold text-gray-900">Final Answer</h2>
                    <div className="prose prose-sm max-w-none text-gray-800">
                      <p className="whitespace-pre-wrap">{answer}</p>
                    </div>
                  </div>
                  <button onClick={speak} className="p-2 rounded bg-gray-100 hover:bg-gray-200" title="Play answer">
                    <Volume2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-4">
                  <button onClick={() => { setConversationId(''); setStepIndex(0); setMessages([]); setExtracted(''); setAnswer(''); setSelectedFile(null); setPreview(null); }} className="text-sm text-black hover:text-black">Restart</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Remote stream preview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Remote Stream</h2>
          <div className="aspect-video bg-black rounded overflow-hidden">
            <video ref={remoteVideoRef} className="w-full h-full object-contain" autoPlay playsInline muted />
          </div>
          <div className="mt-3">
            <button onClick={captureFromRemoteVideo} className="bg-black hover:bg-gray-900 text-white font-medium py-2 px-4 rounded">Snap from stream</button>
          </div>
        </div>

        {/* Camera Modal */}
        {cameraOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold text-gray-900">Scan with camera</h4>
                <button onClick={closeCameraModal} className="text-gray-600 hover:text-gray-800">Close</button>
              </div>
              <div className="mb-3">
                <label className="block text-sm text-gray-700 mb-1">Camera device</label>
                <select value={selectedDeviceId} onChange={handleDeviceChange} className="w-full border border-gray-300 rounded px-2 py-1">
                  {videoDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(-4)}`}</option>
                  ))}
                </select>
              </div>
              <div className="aspect-video bg-black rounded overflow-hidden">
                <video ref={videoRef} className="w-full h-full object-contain" autoPlay playsInline muted />
              </div>
              <div className="flex items-center justify-between mt-4">
                <div>
                  <button onClick={listening ? stopListening : startListening} className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded mr-2">
                    {listening ? 'Stop voice trigger' : "Listen for 'ready'"}
                  </button>
                  <span className={`text-sm ${listening ? 'text-green-700' : 'text-gray-500'}`}>{listening ? 'Listening… say "ready"' : 'Voice trigger off'}</span>
                </div>
                <div className="flex space-x-3">
                  <button onClick={captureFromCamera} className="bg-black hover:bg-gray-900 text-white font-medium py-2 px-4 rounded">Capture</button>
                  <button onClick={closeCameraModal} className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded">Cancel</button>
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AskFromImage;

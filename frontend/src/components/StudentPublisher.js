import React, { useEffect, useRef, useState } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: ['turns:turn.miila.eu:5349', 'turn:turn.miila.eu:3478'],
    username: 'miila',
    credential: 'VeryStrongTurnPass123'
  }
];

const StudentPublisher = () => {
  const [room, setRoom] = useState('default');
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
    const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  };

  const start = async () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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

    ws.onmessage = async (ev) => {
      const data = JSON.parse(ev.data || '{}');
      if (data.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          try { await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }); } catch {}
        }
      } else if (data.type === 'ice') {
        try { await pc.addIceCandidate(data.candidate); } catch {}
      } else if (data.type === 'need-offer') {
        await sendOffer();
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

    pc.onnegotiationneeded = async () => { await sendOffer(); };
    ws.onopen = () => {
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
    try { wsRef.current?.close(); } catch {}
    try { pcRef.current?.close(); } catch {}
    try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    setConnected(false);
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
      <div className="w-full max-w-xl bg-white border border-gray-200 rounded-lg p-4">
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
    </div>
  );
};

export default StudentPublisher;

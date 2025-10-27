import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, FileText, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import ResultsDisplay from './ResultsDisplay';
import axios from 'axios';

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

const WorksheetUpload = ({ apiKey, onWorksheetAnalyzed }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [alignLoadingAnalyze, setAlignLoadingAnalyze] = useState(false);
  const [alignLoadingRemote, setAlignLoadingRemote] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  
  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  // Remote WebRTC subscribe (teacher side for math)
  const remoteVideoRef = useRef(null);
  const subPcRef = useRef(null);
  const subWsRef = useRef(null);
  const gotTrackRef = useRef(false);
  const negotiateTimerRef = useRef(null);
  const [room, setRoom] = useState('default');
  const remoteSectionRef = useRef(null);
  const scrollToRemote = () => {
    try { remoteSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  };
  const [activeTab, setActiveTab] = useState('analyze');
  const [lastAnalysis, setLastAnalysis] = useState(null);

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
      // Stop previous stream
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
      if (s) {
        s.getTracks().forEach(t => t.stop());
      }
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } catch {}
  };

  const openCameraModal = async () => {
    setCameraOpen(true);
    await refreshDevices();
    await startCamera(selectedDeviceId);
  };

  const closeCameraModal = () => {
    stopCamera();
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
        const fileName = `camera_capture_${Date.now()}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });
        setSelectedFile(file);
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target.result);
        reader.readAsDataURL(file);
        closeCameraModal();
      }, 'image/png');
    } catch (e) {
      console.error('Capture error:', e);
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      stopCamera();
    };
  }, []);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file) => {
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setError('');
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      setError('Please select a valid image file (PNG, JPG, JPEG)');
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!apiKey) {
      setError('Please enter your API key');
      return;
    }

    setAnalyzeLoading(true);
    setError('');

    try {
      console.log('Sending API key:', apiKey ? `${apiKey.substring(0, 10)}... (${apiKey.length} chars)` : 'No API key');
      
      const formData = new FormData();
      // If no file selected (fixed-mode), send a tiny dummy PNG to satisfy backend's required file
      let fileToSend = selectedFile;
      if (!fileToSend) {
        const c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        const blob = await new Promise(resolve => c.toBlob(resolve, 'image/png'));
        fileToSend = new File([blob], 'dummy.png', { type: 'image/png' });
      }
      formData.append('file', fileToSend);
      formData.append('api_key', apiKey);

      // Same-origin backend behind Nginx
      const response = await axios.post(`${window.location.origin}/analyze-worksheet`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data) {
        setLastAnalysis(response.data);
        setActiveTab('results');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      const detail = err.response?.data?.detail || err.response?.data?.error;
      setError(detail || 'Failed to analyze worksheet. Please try again.');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const handleAlignAndAnalyzeAnalyze = async () => {
    if (!selectedFile || !apiKey) {
      setError('Please capture or select a file and enter your API key');
      return;
    }

    setAlignLoadingAnalyze(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('api_key', apiKey);
      formData.append('align', '1');

      const response = await axios.post(`${window.location.origin}/analyze-worksheet`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data) {
        setLastAnalysis(response.data);
        setActiveTab('results');
      }
    } catch (err) {
      console.error('Align+Analyze error:', err);
      const detail = err.response?.data?.detail || err.response?.data?.error;
      setError(detail || 'Failed to align and analyze. Please try again.');
    } finally {
      setAlignLoadingAnalyze(false);
    }
  };

  const handleAlignAndAnalyzeRemote = async () => {
    if (!selectedFile || !apiKey) {
      setError('Please capture or select a file and enter your API key');
      return;
    }

    setAlignLoadingRemote(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('api_key', apiKey);
      formData.append('align', '1');

      const response = await axios.post(`${window.location.origin}/analyze-worksheet`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data) {
        setLastAnalysis(response.data);
        setActiveTab('results');
      }
    } catch (err) {
      console.error('Align+Analyze error:', err);
      const detail = err.response?.data?.detail || err.response?.data?.error;
      setError(detail || 'Failed to align and analyze. Please try again.');
    } finally {
      setAlignLoadingRemote(false);
    }
  };

  // --- WebRTC subscribe helpers (math side) ---
  const startSubscribe = async () => {
    try {
      // Ensure clean state before connecting again
      stopSubscribe();
      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      subPcRef.current = pc;
      let remoteStream = new MediaStream();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
      pc.ontrack = (ev) => {
        gotTrackRef.current = true;
        if (ev.streams && ev.streams[0]) {
          ev.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
        } else if (ev.track) {
          remoteStream.addTrack(ev.track);
        }
      };
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        if (dc.label !== 'signals') return;
        dc.onmessage = () => {
          // When student says ready, auto snap
          captureFromRemoteVideo();
        };
      };
      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        if (st === 'failed' || st === 'disconnected' || st === 'closed') {
          // Clear current preview; wait for new hello/offer
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        }
      };
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      // Prefer backend port 8000 for WS in local dev
      const host = window.location.hostname;
      const port = window.location.port;
      const wsBase = (host === 'localhost' || host === '127.0.0.1') && port && port !== '8000'
        ? `${proto}://localhost:8000`
        : `${proto}://${window.location.host}`;
      const ws = new WebSocket(`${wsBase}/ws/signal?room=${encodeURIComponent(room)}&role=sub`);
      subWsRef.current = ws;
      const outQueue = [];
      ws.onmessage = async (ev) => {
        const data = JSON.parse(ev.data || '{}');
        if (data.type === 'offer') {
          const desc = { type: 'offer', sdp: data.sdp };
          try {
            if (pc.signalingState !== 'stable') {
              try { await pc.setLocalDescription({ type: 'rollback' }); } catch {}
            }
            await pc.setRemoteDescription(desc);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
          } catch (e) {
            console.error('Offer handling error:', e);
          }
        } else if (data.type === 'ice') {
          try { await pc.addIceCandidate(data.candidate); } catch {}
        } else if (data.type === 'hello') {
          // Publisher (student) is online
          // If we previously had a frozen/blank view, rebuild the connection
          const hasVideo = remoteVideoRef.current && remoteVideoRef.current.srcObject && remoteVideoRef.current.srcObject.getTracks && remoteVideoRef.current.srcObject.getTracks().length > 0;
          if (!hasVideo) {
            try { pc.close(); } catch {}
            try { ws.close(); } catch {}
            // Recreate a fresh subscriber after a short tick
            setTimeout(() => startSubscribe(), 150);
            return;
          }
          // Otherwise, try renegotiation
          try { pc.restartIce?.(); } catch {}
          try { ws.send(JSON.stringify({ type: 'need-offer' })); } catch {}
        } else if (data.type === 'bye') {
          // Publisher stopped; clear and await next hello
          try { pc.getReceivers?.().forEach(r => { try { r.track?.stop(); } catch {} }); } catch {}
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
          gotTrackRef.current = false;
        }
      };
      pc.onicecandidate = (e) => {
        if (!e.candidate) return;
        const msg = { type: 'ice', candidate: e.candidate };
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        } else {
          outQueue.push(msg);
        }
      };
      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ type: 'need-offer' }));
          outQueue.forEach(m => ws.send(JSON.stringify(m)));
        } catch {}
        // Kick a short negotiation pinger until a track arrives
        gotTrackRef.current = false;
        let attempts = 0;
        clearInterval(negotiateTimerRef.current);
        negotiateTimerRef.current = setInterval(() => {
          attempts += 1;
          if (gotTrackRef.current || attempts > 10 || ws.readyState !== WebSocket.OPEN) {
            clearInterval(negotiateTimerRef.current);
            negotiateTimerRef.current = null;
            return;
          }
          try { ws.send(JSON.stringify({ type: 'need-offer' })); } catch {}
        }, 1000);
      };
      ws.onclose = () => {
        // Ensure UI is clean if signaling drops
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        clearInterval(negotiateTimerRef.current);
        negotiateTimerRef.current = null;
      };
    } catch (e) {
      console.error('Subscribe error:', e);
    }
  };

  const stopSubscribe = () => {
    try { subWsRef.current?.close(); } catch {}
    try { subPcRef.current?.getSenders?.().forEach(s => { try { s.track?.stop(); } catch {} }); } catch {}
    try { subPcRef.current?.close(); } catch {}
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    subWsRef.current = null;
    subPcRef.current = null;
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

  const handleCameraCapture = () => {
    // This would typically open camera interface
    // For now, just trigger file input
    fileInputRef.current?.click();
  };

  return (
    <div className="flex h-full">
      {/* Main Content Area */}
      <div className="flex-1 bg-white">
        {/* Tabs */}
        <div className="px-6 pt-2 mt-2">
          <nav className="flex space-x-8">
            <button onClick={() => setActiveTab('analyze')} className={`pb-3 text-sm font-medium ${activeTab==='analyze' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-black hover:text-black'}`}>
              Analyze
            </button>
            <button onClick={() => setActiveTab('remote')} className={`pb-3 text-sm font-medium ${activeTab==='remote' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-black hover:text-black'}`}>
              Remote stream
            </button>
            <button onClick={() => setActiveTab('results')} className={`pb-3 text-sm font-medium ${activeTab==='results' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-black hover:text-black'}`}>
              Results
            </button>
          </nav>
        </div>

        {/* Analyze Tab */}
        {activeTab === 'analyze' && (
        <div className="p-8">
          <div
            className={`border-2 border-dashed rounded-lg p-20 text-center transition-colors cursor-pointer ${dragActive ? 'border-gray-500 bg-gray-50' : selectedFile ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-gray-400'}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? (
              <div className="space-y-4">
                <img
                  src={preview}
                  alt="Worksheet preview"
                  className="max-h-64 mx-auto rounded-lg shadow-sm"
                />
                <div className="flex items-center justify-center text-green-600">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  <span className="font-medium">File selected: {selectedFile.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setPreview(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-gray-400">
                  <Upload className="mx-auto h-16 w-16" />
                </div>
                <div>
                  <p className="text-xl text-gray-700 mb-2">
                    Drop your worksheet here
                  </p>
                  <p className="text-gray-500">
                    or click to browse files
                  </p>
                </div>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start mt-4">
              <AlertCircle className="h-5 w-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
              <span className="text-red-700">{error}</span>
            </div>
          )}

          {/* Analyze Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
            <button
              onClick={handleAnalyze}
              disabled={!apiKey || analyzeLoading}
              className="w-full bg-black hover:bg-gray-900 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzeLoading ? (
                <div className="flex items-center justify-center">
                  <Loader className="animate-spin h-5 w-5 mr-2" />
                  Analyzing…
                </div>
              ) : (
                'Analyze Worksheet'
              )}
            </button>
            <button
              onClick={handleAlignAndAnalyzeAnalyze}
              disabled={!selectedFile || !apiKey || alignLoadingAnalyze}
              className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-3 px-6 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {alignLoadingAnalyze ? (
                <div className="flex items-center justify-center">
                  <Loader className="animate-spin h-5 w-5 mr-2" />
                  Aligning + analyzing…
                </div>
              ) : (
                'Align and analyze'
              )}
            </button>
          </div>

          {!apiKey && (
            <p className="text-orange-600 text-center mt-2">
              Please set your API key first in the API Key tab
            </p>
          )}
        </div>
        )}

        {/* Remote Tab (kept mounted to preserve stream) */}
        <div
          ref={remoteSectionRef}
          className="px-8 pb-8"
          style={activeTab === 'remote' ? {} : { position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }}
        >
          <div className="text-sm mb-2">
            <input value={room} onChange={e => setRoom(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1 mr-2" placeholder="room" />
            <button type="button" onClick={() => startSubscribe()} className="text-sm border border-gray-300 rounded px-2 py-1 mr-2">Start</button>
            <button type="button" onClick={() => stopSubscribe()} className="text-sm border border-gray-300 rounded px-2 py-1">Stop</button>
          </div>
          {/* Preview above controls for consistency */}
          {preview && (
            <div className="mb-2">
              <div className="text-sm text-gray-600 mb-1">Last snapped frame:</div>
              <img src={preview} alt="snapped preview" className="max-h-28 rounded border border-gray-200" />
            </div>
          )}
          <div className="flex items-center space-x-3 mb-2">
            <button onClick={() => captureFromRemoteVideo()} className="bg-black hover:bg-gray-900 text-white font-medium py-2 px-4 rounded">Snap from stream</button>
            {preview && (
              <button onClick={handleAlignAndAnalyzeRemote} disabled={alignLoadingRemote || !apiKey} className="border border-gray-300 hover:bg-gray-50 text-gray-900 font-medium py-2 px-4 rounded disabled:opacity-50">{alignLoadingRemote ? 'Analyzing…' : 'Align and analyze'}</button>
            )}
          </div>
          {activeTab === 'remote' && alignLoadingRemote && (
            <div className="text-sm text-gray-600 mb-3">Analyzing… please wait</div>
          )}
          {/* Live video smaller */}
          <div className="aspect-video bg-black rounded overflow-hidden max-w-3xl">
            <video ref={remoteVideoRef} className="w-full h-full object-contain" autoPlay playsInline muted />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3 text-sm text-red-700">{error}</div>
          )}
        </div>

        {activeTab === 'results' && lastAnalysis && (
          <div className="p-6">
            <ResultsDisplay results={lastAnalysis} />
          </div>
        )}
      </div>

      {/* Removed default Results sidebar on non-results tabs per request */}
      
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
            <div className="flex justify-end space-x-3 mt-4">
              <button onClick={captureFromCamera} className="bg-black hover:bg-gray-900 text-white font-medium py-2 px-4 rounded">Capture</button>
              <button onClick={closeCameraModal} className="border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded">Cancel</button>
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}
    </div>
  );
};

export default WorksheetUpload;

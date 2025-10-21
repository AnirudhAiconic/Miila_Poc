import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, FileText, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import axios from 'axios';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: ['turns:turn.miila.eu:5349', 'turn:turn.miila.eu:3478'],
    username: 'miila',
    credential: 'VeryStrongTurnPass123'
  }
];

const WorksheetUpload = ({ apiKey, onWorksheetAnalyzed }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
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
  const [room, setRoom] = useState('default');
  const remoteSectionRef = useRef(null);
  const scrollToRemote = () => {
    try { remoteSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
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
    if (!selectedFile || !apiKey) {
      setError('Please select a file and enter your API key');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('Sending API key:', apiKey ? `${apiKey.substring(0, 10)}... (${apiKey.length} chars)` : 'No API key');
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('api_key', apiKey);

      // Same-origin backend behind Nginx
      const response = await axios.post(`${window.location.origin}/analyze-worksheet`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data) {
        onWorksheetAnalyzed(response.data);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.response?.data?.error || 'Failed to analyze worksheet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // --- WebRTC subscribe helpers (math side) ---
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
        dc.onmessage = () => {
          // When student says ready, auto snap
          captureFromRemoteVideo();
        };
      };
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/signal?room=${encodeURIComponent(room)}&role=sub`);
      subWsRef.current = ws;
      const outQueue = [];
      ws.onmessage = async (ev) => {
        const data = JSON.parse(ev.data || '{}');
        if (data.type === 'offer') {
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
        } else if (data.type === 'ice') {
          try { await pc.addIceCandidate(data.candidate); } catch {}
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

  const handleCameraCapture = () => {
    // This would typically open camera interface
    // For now, just trigger file input
    fileInputRef.current?.click();
  };

  return (
    <div className="flex h-full">
      {/* Main Content Area */}
      <div className="flex-1 bg-white">
        {/* Tab Headers */}
        <div className="border-b border-gray-200 px-6 pt-4">
          <nav className="flex space-x-8">
            <button className="pb-3 text-sm font-medium text-gray-900 border-b-2 border-gray-900">
              Original Worksheet
            </button>
            <button className="pb-3 text-sm font-medium text-black hover:text-black" onClick={scrollToRemote}>
              Connect remote stream
            </button>
            <button className="pb-3 px-4 py-1 text-sm font-medium bg-black text-white rounded">
              Browse file
            </button>
            <button className="pb-3 text-sm font-medium text-gray-500 hover:text-gray-700">
              Digital Preview / Feedback
            </button>
          </nav>
        </div>

        {/* Upload Content Area */}
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

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={!selectedFile || !apiKey || loading}
            className="w-full bg-black hover:bg-gray-900 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <Loader className="animate-spin h-5 w-5 mr-2" />
                Analyzing worksheet...
              </div>
            ) : (
              'Analyze Worksheet'
            )}
          </button>

          {!apiKey && (
            <p className="text-orange-600 text-center mt-2">
              Please set your API key first in the API Key tab
            </p>
          )}
        </div>

        {/* Remote stream controls and preview */}
        <div ref={remoteSectionRef} className="px-8 pb-8">
          <div className="text-sm mb-2">
            <input value={room} onChange={e => setRoom(e.target.value)} className="text-sm border border-gray-300 rounded px-2 py-1 mr-2" placeholder="room" />
            <button type="button" onClick={() => startSubscribe()} className="text-sm border border-gray-300 rounded px-2 py-1 mr-2">Connect remote stream</button>
            <button type="button" onClick={() => stopSubscribe()} className="text-sm border border-gray-300 rounded px-2 py-1">Disconnect</button>
          </div>
          <div className="aspect-video bg-black rounded overflow-hidden">
            <video ref={remoteVideoRef} className="w-full h-full object-contain" autoPlay playsInline muted />
          </div>
          <div className="mt-3">
            <button onClick={() => captureFromRemoteVideo()} className="bg-black hover:bg-gray-900 text-white font-medium py-2 px-4 rounded">Snap from stream</button>
          </div>
        </div>
      </div>

      {/* Results Sidebar */}
      <div className="w-80 bg-white border-l border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Results</h3>
        <div className="space-y-6">
          <div className="text-right">
            <div className="text-4xl font-bold text-gray-900 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Total</div>
            <div className="text-xs text-gray-500">Total exercise fields</div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold text-green-600 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Perfect</div>
            <div className="text-xs text-gray-500">Right solution</div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold text-orange-600 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Need Steps</div>
            <div className="text-xs text-gray-500">Extra effort to make it done</div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold text-red-600 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Wrong</div>
            <div className="text-xs text-gray-500">Not right solution</div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold text-blue-600 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Empty</div>
            <div className="text-xs text-gray-500">No solution provided</div>
          </div>
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

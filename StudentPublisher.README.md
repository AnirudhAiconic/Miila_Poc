Title: frontend/src/components/StudentPublisher.js – WebRTC publisher and AI Voice Tutor

Overview
- Student-side page with two tabs:
  - Publisher: publishes camera/mic over WebRTC to a room; supports "Send Ready" data-channel signal and basic device switching.
  - AI Tutor: runs a local VAD-driven voice capture loop, sends each turn to the backend, and plays back TTS or uses Web Speech as fallback.

Technologies and libraries
- React hooks for state, refs, and effects.
- WebRTC (RTCPeerConnection, MediaStream, DataChannel) for the remote-stream publisher.
- WebSocket signaling (/ws/signal) to exchange SDP and ICE candidates.
- MediaRecorder for audio capture with MIME negotiation (webm or mp4 variants).
- Web Audio API (AudioContext, AnalyserNode) for simple VAD (RMS threshold-based).
- Web Speech APIs:
  - SpeechRecognition (prefixed webkit) for listening to the keyword "ready" in the publisher tab.
  - speechSynthesis as a TTS fallback when backend audio_b64 is not present.

Key behaviors
- Publisher tab:
  - getUserMedia gets audio+video, adds tracks to RTCPeerConnection, and shows a local preview.
  - Data channel "signals" allows sending a simple {type:'ready'} JSON message.
  - Signaling via WebSocket: sends offers, handles answers, exchanges ICE candidates, and responds to "need-offer" hints.
  - ICE servers include STUN and TURN; local dev only uses STUN.
- AI Tutor tab:
  - Conversation state is persisted to localStorage under miila_tutor_messages.
  - beginListeningTurn starts a MediaRecorder on the live audio track and a VAD loop:
    - Detects speech onset and waits for a minimum speech window.
    - Finalizes a turn after sustained silence and a short grace period.
  - processTurn sends recorded audio to /tutor/voice_turn with history and turn_cap=5:
    - Updates messages with the recognized student utterance and tutor reply.
    - Plays returned TTS (audio_b64) or uses speechSynthesis fallback, then debounces before re-arming.
    - Stops automatically when done=true or on user stop commands ("stop", "quit", etc.).
  - Start New Lesson clears the stored conversation and restarts listening.

Inputs and outputs
- Inputs:
  - URL query param room to prefill the room name.
  - Microphone and camera permissions for WebRTC and voice capture.
- Outputs:
  - Publishes media to a WebRTC room for remote viewing in the worksheet subscriber.
  - Sends per-turn audio to the backend and renders tutor responses locally.

Notes
- The VAD thresholds and timers (RMS_THRESHOLD, SILENCE_MS, MIN_SPEECH_MS, GRACE_MS) are tuned for a responsive classroom feel.
- The component prefers TTS from the backend; speechSynthesis is a graceful fallback when audio_b64 is absent or fails to play.
- ICE TURN servers are enabled in non-local environments to traverse NAT/firewall.



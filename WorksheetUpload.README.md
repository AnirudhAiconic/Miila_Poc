Title: frontend/src/components/WorksheetUpload.js – Upload, analyze, and remote stream capture

Overview
- Handles selecting or capturing a worksheet image, calling the backend analyzer, and showing results.
- Provides a second tab to subscribe to a remote WebRTC stream and snap an image from it for analysis.
- Supports both "analyze" and "align and analyze" actions.

Technologies and libraries
- React and hooks.
- axios for HTTP calls to the backend.
- WebRTC APIs: RTCPeerConnection, MediaStream, getUserMedia for camera and remote subscription.
- Tailwind CSS classes for styling.

Key features
- File selection with drag-and-drop and preview.
- Camera modal to capture a worksheet using a local camera device.
- Remote stream tab:
  - Connects to a room via the backend WebSocket /ws/signal for SDP/ICE exchange.
  - Creates an RTCPeerConnection with ICE servers:
    - STUN: stun.l.google.com:19302
    - TURN: turns:turn.miila.eu:5349 and turn:turn.miila.eu:3478 with a static demo username/password.
  - Receives tracks into a MediaStream and renders into a video element.
  - Offers a "Snap from stream" button to capture a frame as a PNG file for analysis.

Backend integration
- POST {origin}/analyze-worksheet with multipart form data:
  - file: selected or captured image
  - api_key: user-provided OpenAI key
  - align: "1" optional to enable alignment against the template
- The component:
  - For plain analyze: if no file is selected, sends a 1x1 PNG dummy to satisfy backend validation when using fixed template.
  - On success: stores the last analysis result and shows the Results tab.

Inputs and outputs
- Inputs:
  - apiKey prop from Dashboard.
  - Optional user interaction with the camera modal and remote tab.
- Outputs:
  - Emits final results to the parent via onWorksheetAnalyzed when Analyze is used from Dashboard context.
  - Internally shows ResultsDisplay when operating standalone within its own Results tab.

Notable calculations and heuristics
- For remote subscribe:
  - Uses a small retry loop via WebSocket "need-offer" messages to encourage renegotiation until a track arrives.
  - Clears tracks and restarts on certain ICE connection states.
- For camera capture:
  - Draws the current video frame onto a canvas, converts to a Blob, and then to a File for upload.

Performance considerations
- Keeps the remote tab mounted but visually hidden to maintain the connection state when switching tabs.
- Debounces and cleans up connections on tab switch or unmount.



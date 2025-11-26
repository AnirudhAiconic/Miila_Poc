Title: System architecture and end-to-end data flows

Scope
- Explains how the application functions from entry to exit.
- Details which files are used in each flow and which are not used at runtime.
- Shows the main function call sequences for each feature.

High-level overview
- Frontend: React single-page app (create-react-app) in frontend/.
  - Auth, worksheet analysis UI, results rendering.
  - Student publisher for WebRTC streaming and the AI voice tutor client.
  - Dev-only proxy for API and WebSocket to backend.
- Backend: FastAPI server in backend_api.py.
  - Endpoints for auth, worksheet analysis, voice tutor, and a simple signaling WebSocket.
  - Uses OpenAI for Whisper (STT), GPT-4o for reasoning, and gpt-4o-mini-tts for TTS.
  - Math pipeline in math_checker.py; ROI correction in roi_fixer.py.
- Optional Streamlit demo app in app.py (not part of the React flow).

Frontend runtime files
- frontend/src/index.js: Application entry; renders App.
- frontend/src/App.js: Router and auth guard. Routes:
  - /login → Login.js
  - /dashboard → Dashboard.js
  - /ask → AskFromImage.js (placeholder)
  - /student-publish → StudentPublisher.js
- frontend/src/index.css: Global styles and Tailwind utilities.
- frontend/tailwind.config.js: Tailwind configuration.
- frontend/src/components/Login.js: Login form; calls /auth/login.
- frontend/src/components/Dashboard.js: Main product dashboard with tabs.
- frontend/src/components/WorksheetUpload.js: Upload and analyze worksheets, and subscribe to a remote stream to snap an image.
- frontend/src/components/ResultsDisplay.js: Shows annotated image and per-problem details.
- frontend/src/components/AskFromImage.js: Teacher-side placeholder page.
- frontend/src/components/StudentPublisher.js: WebRTC publisher and AI voice tutor client.
- frontend/src/setupProxy.js: Dev-only proxy to backend for API and WebSocket.

Backend runtime files
- backend_api.py: FastAPI app and all endpoints.
- math_checker.py: SimpleMathChecker used by /analyze-worksheet.
- roi_fixer.py: ROIBoxFixer used to refine box positions after drawing.
- backend_requirements.txt: Backend dependency pins (install-time).

Non-runtime or optional files
- app.py: Streamlit demo app (not used by the React frontend).
- requirements.txt: Streamlit demo dependencies (not used by FastAPI backend).
- setup_and_run.bat and start_miila.bat: Local development launch scripts.

End-to-end flows

1) Login flow
- User visits /login → frontend/src/components/Login.js
  - on submit → App.js handleLogin
  - POST /auth/login with email and password (FormData)
- backend_api.py → auth_login
  - Compares against MIILA_ADMIN_EMAIL and MIILA_ADMIN_PASSWORD env variables.
  - On success: returns token and user info.
- App.js stores token and user in localStorage and navigates to /dashboard.

2) Worksheet analysis flow (analyze tab)
Frontend
- Dashboard.js renders WorksheetUpload with apiKey.
- WorksheetUpload.js handleAnalyze
  - If no file selected: generates a 1x1 PNG dummy to satisfy backend file requirement in fixed-template mode.
  - POST {origin}/analyze-worksheet with fields:
    - file (image)
    - api_key (OpenAI key)
    - align omitted for plain analyze
  - On success: saves response as lastAnalysis and shows results tab.
- ResultsDisplay.js reads results.problems and results.annotated_image to render the page.

Backend
- backend_api.py → analyze_worksheet
  - Validates and normalizes the API key received in api_key.
  - Uses uploads/fixed to pick the latest fixed worksheet template as input_path.
  - If align=1: aligns uploaded image to the template using OpenCV:
    - Optional perspective rectification based on page-like quad detection.
    - Feature-based homography (AKAZE then ORB; ratio test; RANSAC; best by inliers).
    - ECC homography fallback if features fail.
  - Initializes SimpleMathChecker(openai_api_key).
  - Calls checker.check_worksheet(use_path) which:
    - analyze_worksheet:
      - Re-encodes the image as PNG in-memory.
      - Sends to OpenAI chat.completions (model gpt-4o) with a vision prompt instructing the extraction of six problems and their box coordinates.
      - Parses JSON content from the response into analysis dict with problems.
    - draw_feedback:
      - Draws colored rectangles based on status (green, orange, red, blue) and short labels.
      - Saves an annotated image to a _checked path.
    - generate_report:
      - Builds a markdown-like report text for display or download.
    - Summary:
      - Counts problem statuses into total, perfect, correct_no_steps, wrong, empty.
    - ROI refinement (best effort):
      - roi_fixer.fix_worksheet_boxes(annotated_path) repositions boxes to known template areas and returns a _fixed path.
      - Returns fixed_path (or annotated_path on failure), report, summary, and analysis.
  - backend_api.py reads the resulting image and returns:
    - annotated_image base64
    - problems array
    - summary counts and used_source
    - performs cleanup of temporary files and prior *_checked artifacts.

3) Worksheet analysis flow (align and analyze)
- Frontend is identical to the above except WorksheetUpload.js sets align=1 and sends the actual captured/uploaded file.
- Backend follows the same path but enforces alignment before analysis.

4) Remote stream publish and subscribe
Publisher (student)
- StudentPublisher.js in the "Publisher" tab:
  - getUserMedia for audio+video, shows local preview.
  - Creates RTCPeerConnection with ICE servers:
    - Local dev: only STUN.
    - Non-local: STUN + TURN (turn.miila.eu).
  - Creates a data channel "signals" to send simple messages (like "ready").
  - Connects WebSocket to /ws/signal?room=...&role=pub:
    - Sends an offer, receives answer, exchanges ICE candidates.
    - Responds to "need-offer" messages to re-offer if needed.
  - Publishes the media to the room; the subscriber will receive tracks.

Subscriber (teacher)
- WorksheetUpload.js "Remote stream" tab:
  - Creates RTCPeerConnection and connects to /ws/signal as a subscriber.
  - When an offer is received from the publisher via the signaling bus:
    - Sets remote description, creates an answer, sends it back, and handles ICE.
  - Renders the remote video stream in a video element.
  - "Snap from stream" captures the current frame into a PNG file and can immediately "Align and analyze" that snapshot using the same analysis endpoint.

Signaling server
- backend_api.py → ws_signal
  - Broadcasts any text message to other WebSocket clients in the same room.
  - Used purely as a signaling relay; no media passes through the backend.

5) AI voice tutor flow (student)
Frontend
- StudentPublisher.js in the "AI Tutor" tab:
  - Maintains a conversation state array in localStorage under key miila_tutor_messages (each item {role, text}).
  - startVoiceTutor ensures a live mic stream and calls beginListeningTurn.
  - beginListeningTurn:
    - Selects a live audio track; starts MediaRecorder with supported MIME (webm or mp4).
    - Starts a VAD loop using an AudioContext + AnalyserNode and RMS thresholding:
      - Detects speech start; waits for minimum speech duration.
      - After sustained silence and a short grace window, finalizes a turn.
    - On finalize:
      - Adds a visible student placeholder "…" to the messages.
      - Calls processTurn(blob).
  - processTurn:
    - Sends POST {origin}/tutor/voice_turn with:
      - audio file blob
      - history (JSON stringified messages)
      - turn_cap=5 (default mini-lesson length)
      - api_key if present in localStorage
    - Receives:
      - recognized_text, tutor_message, done flag, final_answer when done, audio_b64 when TTS succeeded.
    - Updates messages (replaces the placeholder with recognized text; appends tutor reply).
    - Plays audio_b64 via HTMLAudio if present; otherwise uses speechSynthesis as a fallback.
    - Debounces for about 1 second then either stops (if done or user said stop) or auto-restarts for the next turn.
  - "Start New Lesson" clears messages and restarts the VAD recorder cleanly.

Backend
- backend_api.py → tutor_voice_turn
  - Normalizes API key from form or environment.
  - Stores audio in a temp file and transcribes with Whisper (model whisper-1).
  - Parses history (array of {role, text}).
  - Determines student_turns, applies turn_cap (default 5), computes next_is_final.
  - Builds a single system message with:
    - Guardrails for praise + one tiny fact + one question structure.
    - Topic continuity using the first meaningful student line and the last student line.
    - Stage line instructing either a final answer (no question) or the 3-part structure.
  - Enforces JSON-only output:
    - Non-final: expects {praise, tiny_fact, ab_question}.
    - Final: expects {final_answer}.
    - Detects "I don't know" and requests an easier clue + a simple question.
  - Calls GPT with _chat_json helper:
    - Tries gpt-4o with JSON mode, then gpt-4o-mini with JSON mode, then gpt-4o-mini without JSON.
  - Parses and formats:
    - _safe_json_parse attempts to extract JSON.
    - _format_from_json formats praise + fact + question or the final answer.
    - _generic_fallback shapes plain text into the required structure if JSON fails.
  - TTS generation:
    - Tries streaming TTS (gpt-4o-mini-tts) then non-streaming fallback.
    - Returns audio_b64 when available.
  - Returns:
    - recognized_text, tutor_message, done flag, final_answer if done, and audio_b64 when available.

What is used vs not used at runtime
Used in React + FastAPI runtime
- backend_api.py (all defined endpoints)
- math_checker.py (SimpleMathChecker used by /analyze-worksheet)
- roi_fixer.py (fix_worksheet_boxes used after drawing)
- frontend/src: index.js, App.js, index.css
- frontend/src/components: Login.js, Dashboard.js, WorksheetUpload.js, ResultsDisplay.js, StudentPublisher.js
- frontend/tailwind.config.js (build-time for CSS)
- frontend/src/setupProxy.js (dev-only; not used in production)

Used but optional or environment specific
- TURN servers in StudentPublisher.js and WorksheetUpload.js are used only when not on plain http://localhost.
- The teacher AskFromImage.js page is just a placeholder; it is rendered but has no backend calls.

Not used in the React flow
- app.py and requirements.txt: Streamlit demo only.
- backend_api.py /tutor/next: scripted POC conversation not wired to the current UI.
- backend_api.py /ask: returns rotating POC variants; not currently called by the React app.
- OCR helpers in backend_api.py (_perform_ocr, EasyOCR, TrOCR): present for POC and future use; not used in the current worksheet analyze path which relies on the LLM vision call and ROI fixer.

Operational notes
- CORS is liberal in the backend for development convenience; in production, requests are typically same-origin behind Nginx.
- Dev proxy (setupProxy.js) forwards API and /ws to the backend at port 8000 to avoid CORS during local development.
- LocalStorage keys:
  - miila_token and miila_user for auth.
  - miila_api_key for the OpenAI key used by worksheet analysis and the voice tutor.
  - miila_tutor_messages for storing the voice tutor conversation.

Entry-to-exit summaries
- Worksheet analyze:
  - UI click → WorksheetUpload.handleAnalyze → POST /analyze-worksheet → backend_api.analyze_worksheet → SimpleMathChecker.check_worksheet (gpt-4o vision + drawing + ROI fix) → JSONResponse → ResultsDisplay render.
- Remote stream:
  - StudentPublisher.start (Publisher) → /ws/signal offer/answer/ICE → teacher WorksheetUpload.startSubscribe receives tracks → teacher snaps frame → Align and analyze → same analyze flow as above.
- Voice tutor:
  - StudentPublisher.beginListeningTurn (VAD) → processTurn(blob) → POST /tutor/voice_turn → backend_api.tutor_voice_turn (Whisper + GPT-4o JSON + TTS) → response → play audio, append messages, and repeat until done.



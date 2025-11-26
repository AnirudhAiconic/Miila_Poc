Title: backend_api.py – FastAPI backend for worksheet analysis and voice tutor

Overview
- Provides the FastAPI application that serves REST endpoints and a WebSocket signaling server.
- Implements the math worksheet analysis flow that returns structured results and an annotated image.
- Implements a voice tutor endpoint: transcribes audio, generates a short tutor reply or final answer, and returns optional TTS audio.
- Serves uploads statically and enables CORS for the React frontend.

Technologies and libraries
- FastAPI for HTTP API and WebSocket endpoints.
- CORS middleware for cross-origin access from the React app.
- StaticFiles to serve uploaded assets.
- OpenAI Python SDK for:
  - Speech-to-Text (Whisper model).
  - Chat completions (GPT-4o and GPT-4o-mini).
  - Text-to-Speech (gpt-4o-mini-tts).
- httpx as the underlying HTTP client for OpenAI SDK.
- OpenCV and NumPy for image work (alignment, preprocessing).
- Pillow for image reading where needed.
- Optional OCR helpers:
  - transformers (TrOCR) for primary OCR when available.
  - easyocr with torch GPU toggle as fallback.
- Standard Python: json, re, math, tempfile, threading, uuid, time, os, base64, functools.lru_cache.

Endpoints
- GET /: Health message to confirm service is running.
- GET /health: Simple health check.
- POST /auth/login: Demo login with a single configured credential via environment variables.
- POST /analyze-worksheet:
  - Input: image UploadFile, api_key (Form), optional align flag.
  - Behavior: chooses the most-recent file from uploads/fixed as the template. If align=1, attempts to align the uploaded image to the template; else uses the template directly. Runs SimpleMathChecker, returns problems, summary stats, and an annotated image (base64).
- POST /ask:
  - Proof-of-concept question answerer that cycles stored variants from rag_store.json; OCR is not used here (fixed query text).
- POST /tutor/next:
  - Scripted proof-of-concept turn list (no model) for a simple stepwise conversation.
- POST /tutor/voice_turn:
  - Input: audio UploadFile (webm/ogg), history (array of {role: "student"|"tutor", text}), api_key, turn_cap (default 5).
  - Behavior: transcribes audio with Whisper; constructs a system prompt and merges conversation into a single system message; requests strictly JSON output (praise, tiny_fact, question) or a final_answer on the last turn; formats the model JSON into a human-readable tutor line; generates best-effort TTS audio; returns done=true on final turn.
- POST /validate-api-key:
  - Lightweight check of a provided OpenAI key by listing models.
- WebSocket /ws/signal:
  - Minimal signaling bus for WebRTC P2P: broadcasts SDP/ICE between clients joined by a room query param.

Key functions and logic
- Worksheet alignment (in POST /analyze-worksheet):
  - Loads fixed template from uploads/fixed.
  - Optional perspective rectification: attempts to detect a page-like quadrilateral and warp to template dimensions.
  - Feature matching:
    - Tries AKAZE and ORB, KNN matches with ratio test.
    - RANSAC homography with an inlier threshold; best warp kept by max inliers.
  - ECC fallback:
    - Attempts cv2.findTransformECC with a homography and normalized grayscale images.
  - On success: writes a temp aligned file and analyzes that; on failure: returns HTTP 422 with a clear message.
- OCR helpers (kept for POC and future use):
  - _preprocess_for_ocr: upscales small images, denoise, CLAHE, emphasize blue strokes, adaptive threshold, and morphology open to connect strokes.
  - _get_easyocr_reader: cached EasyOCR reader with GPU if torch.cuda is available.
  - _get_trocr_models: cached TrOCR processor and model.
  - _perform_ocr: tries TrOCR first, then EasyOCR; scores candidates and returns the best text.
- RAG store:
  - On first access, seeds rag_store.json with items and a few POC variants; returns items/variants via cached tuple getters.
- Voice tutor:
  - Transcription: Whisper model (client.audio.transcriptions.create).
  - Topic continuity: extracts the first meaningful student line and remembers the last student line to bias follow-ups.
  - Turn counting: counts prior student turns that were not empty or transcription-failed; next_is_final when (turns + 1) >= turn_cap.
  - JSON-only shaping:
    - For non-final turns, requires object with fields: praise, tiny_fact, ab_question.
    - For final turns, requires final_answer.
    - Detects "I don't know" and asks the model to provide an easier clue then a simple question.
  - Model call helper:
    - Tries GPT-4o with JSON mode, then 4o-mini with JSON, then 4o-mini without JSON. Returns raw content string.
  - Parsing and formatting:
    - _safe_json_parse: trims stray text and attempts to parse JSON segment.
    - _format_from_json: builds the final string with praise, fact, and question; caps sentences; fills simple defaults if fields are missing.
    - _generic_fallback: shapes non-JSON output into a predictable structure and removes A/B phrasing in the fallback question.
  - TTS: best-effort stereo path using streaming API, then a synchronous fallback; returns base64 audio when available.

Inputs and outputs
- analyze-worksheet:
  - Input file is ignored when ALWAYS_USE_FIXED is active; otherwise used for alignment when align=1.
  - Output includes:
    - annotated_image as base64 PNG (ephemeral file is deleted).
    - problems array with statuses and coordinates.
    - summary counts (perfect, correct_no_steps, wrong, empty).
    - used_source field: "fixed" or "aligned".
- tutor/voice_turn:
  - Input audio (binary), history (JSON array), turn_cap (int).
  - Output fields:
    - recognized_text
    - tutor_message
    - done (boolean)
    - final_answer only when done=true
    - audio_b64 when TTS succeeded

Notable calculations and heuristics
- Alignment:
  - Inliers threshold for RANSAC homography selection (minimum 6).
  - Scale-up for small images before preprocessing.
  - CLAHE to improve contrast on light ink.
  - ECC homography optimization with convergence criteria.
- OCR text scoring:
  - score = letters * (0.6 + 0.4 * ratio_of_letters), used to prefer cleaner text.
- Box cleanup:
  - After returning annotated image, scans uploads/fixed and deletes any prior *_checked artifacts.
- Tutor formatting:
  - For final answers, sentences are trimmed and normalized to end with a period.
  - For non-final turns, ensures a short praise, one tiny fact, and a single short question.

Configuration and environment
- CORS: allows localhost:3000 and wildcard for development.
- Admin login credentials via MIILA_ADMIN_EMAIL and MIILA_ADMIN_PASSWORD.
- Fixed worksheet file directory: uploads/fixed with MIILA_FIXED_WORKSHEET_FILE and MIILA_ALWAYS_USE_FIXED toggles.
- OpenAI API key precedence: api_key form field, then MIILA_OPENAI_API_KEY, then OPENAI_API_KEY.

Security notes
- API key is parsed from input and only the first characters are printed for debugging.
- Uploaded temp files are removed in finally blocks.
- Scripted login is demo-only.

Performance considerations
- Caches OCR models/readers and RAG items.
- Uses short max_tokens for tutor replies and a low temperature to keep responses focused.
- Avoids heavy OCR in the current worksheet analysis path by delegating detection to the LLM and using ROI fixers as fallback.



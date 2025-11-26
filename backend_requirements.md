Title: backend_requirements.txt – Backend dependency pinning

Overview
- Locked dependency versions for the FastAPI backend and analysis pipeline.

Pinned libraries
- fastapi: web framework used by backend_api.py
- uvicorn[standard]: ASGI server
- python-multipart: form-data parsing for file uploads
- openai: OpenAI Python SDK for Whisper, chat, and TTS
- httpx: HTTP client used by the OpenAI SDK
- opencv-python: image operations for alignment and drawing
- numpy: numeric arrays used by OpenCV and image logic
- Pillow: image reading and format conversions

Notes
- These versions target the backend server and are installed by setup_and_run.bat during the backend phase.



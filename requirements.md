Title: requirements.txt – Streamlit demo dependency pinning

Overview
- Locked dependencies for the Streamlit demo app in app.py and the original local analysis flow.

Pinned libraries
- openai: OpenAI Python SDK for the LLM calls in math_checker.py
- streamlit: UI framework for the demo application
- pillow: image decoding and rendering
- opencv-python: drawing and simple image operations
- numpy: numerical array operations

Notes
- The backend API uses backend_requirements.txt instead; keep the two lists in sync where possible.



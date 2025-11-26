Title: app.py – Streamlit demo application

Overview
- Provides a Streamlit-based demo UI to upload a worksheet image, run the analysis, and show the annotated output plus a report and summary metrics.
- Targets local experimentation and demonstrations independent from the React frontend.

Technologies and libraries
- Streamlit for a quick, interactive UI.
- Pillow for reading and displaying images.
- tempfile for managing temporary files.
- SimpleMathChecker from math_checker.py to perform the core analysis.

Main flow
- Sidebar collects the OpenAI API key as a password field.
- The main page has two columns:
  - Left: upload component and an action button to invoke the checker.
  - Right: results section with metrics, annotated image, detailed report, and a download button.
- The analysis runs when the user clicks the button:
  - The uploaded image is saved to a temporary path.
  - SimpleMathChecker is invoked to get the annotated image path, report text, and summary dict.
  - Results are stored in st.session_state to persist after render.

Inputs and outputs
- Input: a worksheet image file (PNG, JPG, JPEG).
- Output: displays annotated image, text report, and summary metrics (total, perfect, correct_no_steps, wrong, empty).
- Allows downloading the annotated image as PNG.

Notes
- This file is a self-contained demo; the production UI is the React app in frontend/.
- The API key must be provided by the user for every local run.



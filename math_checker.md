Title: math_checker.py – Core worksheet analysis engine

Overview
- Encapsulates the workflow to analyze a German elementary math worksheet image using an LLM with vision.
- Produces a structured analysis, draws color-coded feedback boxes, and generates a human-readable report.
- Provides a convenience method to run the end-to-end pipeline and summary statistics.

Technologies and libraries
- OpenAI Python SDK for GPT-4o vision chat completions.
- httpx as the HTTP client for the OpenAI SDK.
- Pillow for image reading and PNG encoding.
- OpenCV and NumPy for drawing and geometry operations.

Key classes and methods
- class SimpleMathChecker:
  - __init__(openai_api_key):
    - Creates the OpenAI client with a provided API key.
    - Removes legacy OPENAI_PROXY env var if present to avoid SDK issues.
  - analyze_worksheet(image_path) -> dict:
    - Reads and re-encodes the image to PNG in-memory for consistent input.
    - Sends a single chat.completions.create request to GPT-4o with:
      - A specific instruction block explaining how to extract six problems.
      - Exact example coordinates for where the answer boxes are found on the known template.
    - Parses the JSON object from the model response and returns a dict with “problems”.
    - Fallback: returns {"problems": []} if parsing fails or model returns nothing.
  - draw_feedback(image_path, analysis) -> str:
    - Draws thick rectangles in color based on problem status:
      - perfect: green
      - correct_no_steps: orange
      - wrong: red
      - empty: blue
    - Writes small corner markers and an optional short feedback line when space allows.
    - Saves output to a “_checked” variant of the input filename and returns that path.
  - generate_report(analysis) -> str:
    - Builds a markdown-like string with per-problem details:
      - problem, handwritten, correct_answer, status, any steps_shown, solution steps, and a short tip.
  - check_worksheet(image_path) -> (str, str, dict, dict):
    - Orchestrates the full flow:
      1) analyze_worksheet
      2) when no problems are returned, builds six placeholder boxes using ROIBoxFixer.find_answer_locations
      3) draw_feedback
      4) generate_report
      5) compute summary counts: total, perfect, correct_no_steps, wrong, empty
      6) attempts to refine the box positions by calling fix_worksheet_boxes on the annotated image (best-effort)
    - Returns (result_image_path, report_text, summary_dict, analysis_dict)

Inputs and outputs
- Input image file path (PNG, JPG, JPEG).
- Output dict "analysis" with problems and normalized coordinates.
- Annotated image with colored rectangles around detected answer boxes.
- Human-readable report and a summary count dict.

Notable calculations and heuristics
- Fixed coordinates in the prompt:
  - The initial call instructs the model with known fractional positions of answer boxes for each of the six problems.
  - Normalized box positions are provided to the frontend using fractions of width and height.
- Drawing choices:
  - Rectangle thickness is increased for clarity.
  - Short feedback snippet is written under the box (only if it fits).
- Summary:
  - Counts statuses by filtering the “problems” array.

Performance considerations
- Uses a single GPT-4o call with the image embedded as data URL.
- Re-encodes to PNG to avoid invalid encodings from non-standard JPEGs.



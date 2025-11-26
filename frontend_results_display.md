Title: frontend/src/components/ResultsDisplay.js – Worksheet results renderer

Overview
- Presents the worksheet analysis returned by the backend in a clear, visual way.
- Shows the annotated image and a list of problems with per-item details expandable on click.

Technologies and libraries
- React functional component and hooks.
- lucide-react icons.
- Tailwind CSS classes with a small set of semantic utility classes defined in index.css.

Data contract
- Expects a results object with:
  - problems: array of items with fields including problem, handwritten, correct_answer, status, correct_steps, feedback.
  - annotated_image: base64 PNG string when present.

Key behaviors
- Exports the annotated image as a PNG file by creating a temporary anchor tag with a data URL.
- Maps problem status to an icon, color label class, and short status text.
- Expands a problem to reveal the correct answer, solution steps, and any feedback.

Inputs and outputs
- Input: results prop set by the parent Dashboard or WorksheetUpload.
- Output: purely presentational; emits no events.

Notes
- Uses small utility classes like status-perfect and status-wrong from index.css.
- Expects the backend to supply normalized and consistent problem structures.



Title: roi_fixer.py – ROI-based box position fixer

Overview
- Contains utilities to detect colored boxes drawn on an annotated worksheet and to reposition them precisely to expected answer areas.
- Provides a helper function to create a corrected output image with boxes aligned to fixed, known locations for six problems.

Technologies and libraries
- OpenCV for image reading, color space transforms, masking, drawing.
- NumPy for array operations.

Key classes and functions
- class ROIBoxFixer:
  - detect_colored_boxes(image_path) -> List[dict]:
    - Searches six heuristic problem regions (left/right, three rows).
    - Converts each region to HSV and applies threshold masks for four colors: orange, red, green, blue.
    - Counts colored pixels per mask; if above a threshold, records that region as a detected box with the most likely color.
  - find_answer_locations(image_path) -> List[(x, y, w, h)]:
    - Returns hard-coded fractional positions for six expected answer areas matched to a known worksheet template.
    - Converts the fractional positions into pixel boxes based on image width and height.
  - fix_box_positions(image_path, output_path) -> str:
    - Reads the checked image with colored boxes.
    - Detects the colored boxes and sorts them by problem index.
    - Maps them to precise answer locations returned by find_answer_locations.
    - Redraws clean boxes with status symbols near the target positions and saves to output_path.
- fix_worksheet_boxes(input_image) -> str:
  - Convenience function: calls ROIBoxFixer().fix_box_positions on “input_image”, writing a “_fixed” variant.

Inputs and outputs
- Input: path to an already annotated worksheet image (with colored boxes).
- Output: path to a corrected image with boxes moved to fixed, known answer locations.

Notable calculations and heuristics
- Problem regions are coarse bounding boxes covering expected areas of the six problems.
- Color selection is based on HSV pixel counts above a small threshold.
- Symbol mapping follows a qualitative status representation:
  - green: "✓✓"
  - orange: "✓?"
  - red: "✗"
  - blue: "?"
- Fractional positions and sizes are tuned for a specific worksheet template and then scaled to the actual image dimensions.

Performance considerations
- Scans only specific subregions of the image, not the entire frame.
- Simple color masking without heavy computation.



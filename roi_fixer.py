"""
ROI-based box position fixer
Takes the current colored boxes and moves them to actual answer locations
"""
import cv2
import numpy as np
from typing import List, Tuple, Dict

class ROIBoxFixer:
    """Fixes box positions using ROI detection"""
    
    def __init__(self):
        pass
    
    def detect_colored_boxes(self, image_path: str) -> List[Dict]:
        """
        Detect existing colored boxes in the image by looking for rectangular outlines
        """
        image = cv2.imread(image_path)
        height, width = image.shape[:2]
        
        detected_boxes = []
        
        # Look for rectangular colored outlines in specific regions
        # Focus on areas where we expect problems to be
        problem_regions = [
            (int(0.1 * width), int(0.25 * height), int(0.4 * width), int(0.15 * height)),  # Top left area
            (int(0.55 * width), int(0.25 * height), int(0.4 * width), int(0.15 * height)), # Top right area
            (int(0.1 * width), int(0.45 * height), int(0.4 * width), int(0.15 * height)),  # Mid left area
            (int(0.55 * width), int(0.45 * height), int(0.4 * width), int(0.15 * height)), # Mid right area
            (int(0.1 * width), int(0.65 * height), int(0.4 * width), int(0.15 * height)),  # Bottom left area
            (int(0.55 * width), int(0.65 * height), int(0.4 * width), int(0.15 * height)), # Bottom right area
        ]
        
        for i, (rx, ry, rw, rh) in enumerate(problem_regions):
            # Extract region
            region = image[ry:ry+rh, rx:rx+rw]
            
            # Convert to HSV
            hsv_region = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
            
            # Look for colored rectangles (not filled, just outlines)
            # Define more precise color ranges
            color_ranges = {
                'orange': ([8, 100, 100], [20, 255, 255]),   # Orange boxes
                'red': ([0, 100, 100], [8, 255, 255]),       # Red boxes  
                'green': ([50, 100, 100], [70, 255, 255]),   # Green boxes
                'blue': ([110, 100, 100], [130, 255, 255])   # Blue boxes
            }
            
            best_color = None
            max_pixels = 0
            
            for color_name, (lower, upper) in color_ranges.items():
                lower = np.array(lower)
                upper = np.array(upper)
                mask = cv2.inRange(hsv_region, lower, upper)
                
                # Count colored pixels
                colored_pixels = cv2.countNonZero(mask)
                
                if colored_pixels > max_pixels and colored_pixels > 50:  # Minimum threshold
                    max_pixels = colored_pixels
                    best_color = color_name
            
            if best_color:
                detected_boxes.append({
                    'color': best_color,
                    'problem_index': i,
                    'region': (rx, ry, rw, rh),
                    'pixels': max_pixels
                })
                print(f"Region {i+1}: Detected {best_color} ({max_pixels} pixels)")
        
        return detected_boxes
    
    def find_answer_locations(self, image_path: str) -> List[Tuple[int, int, int, int]]:
        """
        HARD-CODED answer box positions (relative fractions) tuned for this worksheet.
        This avoids any detection instability and guarantees boxes sit on the
        handwritten answer lines.
        """
        image = cv2.imread(image_path)
        height, width = image.shape[:2]

        # Tunable constants (fractions of width/height)
        LEFT_X = 0.285    # shift ~2% towards left
        RIGHT_X = 0.715   # shift ~2% towards left
        # Move rows ~1 cm up from previous (subtract ≈0.033 from Y)
        ROW_Y = [0.365 + 0.134 - 0.033, 0.515 + 0.134 - 0.033, 0.665 + 0.134 - 0.033]
        # Widen boxes further
        BOX_W = 0.190
        BOX_H = 0.040

        boxes: List[Tuple[int, int, int, int]] = []
        # Row 1 left/right
        boxes.append((int(LEFT_X*width), int(ROW_Y[0]*height), int(BOX_W*width), int(BOX_H*height)))
        boxes.append((int(RIGHT_X*width), int(ROW_Y[0]*height), int(BOX_W*width), int(BOX_H*height)))
        # Row 2 left/right
        boxes.append((int(LEFT_X*width), int(ROW_Y[1]*height), int(BOX_W*width), int(BOX_H*height)))
        boxes.append((int(RIGHT_X*width), int(ROW_Y[1]*height), int(BOX_W*width), int(BOX_H*height)))
        # Row 3 left/right
        boxes.append((int(LEFT_X*width), int(ROW_Y[2]*height), int(BOX_W*width), int(BOX_H*height)))
        boxes.append((int(RIGHT_X*width), int(ROW_Y[2]*height), int(BOX_W*width), int(BOX_H*height)))

        return boxes
    
    def fix_box_positions(self, image_path: str, output_path: str) -> str:
        """
        Main function: detect colored boxes and move them to correct positions
        """
        # Load original image
        image = cv2.imread(image_path)
        height, width = image.shape[:2]
        
        # Detect existing colored boxes
        detected_boxes = self.detect_colored_boxes(image_path)
        print(f"Detected {len(detected_boxes)} colored boxes")
        
        # Get correct answer locations
        answer_locations = self.find_answer_locations(image_path)
        
        # Create clean image (load original without boxes)
        clean_image = cv2.imread(image_path.replace('_checked', ''))  # Remove boxes
        if clean_image is None:
            clean_image = image.copy()
        
        # Color mapping
        colors_bgr = {
            'green': (0, 255, 0),
            'orange': (0, 140, 255),  
            'red': (0, 0, 255),
            'blue': (255, 0, 0)
        }
        
        status_symbols = {
            'green': "✓✓",
            'orange': "✓?",
            'red': "✗", 
            'blue': "?"
        }
        
        # Sort detected boxes by problem index to maintain order
        detected_boxes.sort(key=lambda x: x['problem_index'])
        
        # Draw boxes at correct answer positions
        for i, box in enumerate(detected_boxes):
            if i < len(answer_locations):
                x, y, w, h = answer_locations[i]
                color_name = box['color']
                color = colors_bgr.get(color_name, (128, 128, 128))
                symbol = status_symbols.get(color_name, "?")
                
                print(f"Problem {i+1}: Drawing {color_name} box at answer location ({x}, {y})")
                
                # Draw rectangle at correct answer position
                cv2.rectangle(clean_image, (x, y), (x + w, y + h), color, 3)
                
                # Add status symbol
                cv2.putText(clean_image, symbol, (x, y-5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        # Save corrected image
        cv2.imwrite(output_path, clean_image)
        print(f"Fixed image saved to: {output_path}")
        
        return output_path

# Usage function
def fix_worksheet_boxes(input_image: str) -> str:
    """
    Quick function to fix box positions
    """
    fixer = ROIBoxFixer()
    output_path = input_image.replace('.', '_fixed.')
    return fixer.fix_box_positions(input_image, output_path)

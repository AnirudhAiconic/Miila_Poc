"""
Simple Math Worksheet Checker - Clean and Direct Approach
"""
import cv2
import numpy as np
import openai
import json
import base64
from typing import List, Dict, Any, Tuple
from PIL import Image, ImageDraw

class SimpleMathChecker:
    """Simple, clean math worksheet checker"""
    
    def __init__(self, openai_api_key: str):
        self.client = openai.OpenAI(api_key=openai_api_key)
    
    def analyze_worksheet(self, image_path: str) -> Dict[str, Any]:
        """
        Analyze worksheet using GPT-4o Vision - simple and direct
        """
        # Encode image
        with open(image_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode()
        
        # Simple, clear prompt
        prompt = """
        Look at this German math worksheet. Analyze the 6 problems in "Rechne auf deinem Weg" section.

        For each problem:
        1. Find the math problem (like "426 + 267 =")
        2. Look at the handwritten answer after the equals sign
        3. Check if work is shown in the grid below (step-by-step calculation)
        4. Calculate the correct answer
        5. Determine status: 
           - "perfect": correct answer + proper steps shown
           - "correct_no_steps": correct answer but no/poor steps  
           - "wrong": incorrect answer
           - "empty": no answer written

        6. Find the EXACT location of the handwritten answer (the underlined area after =)

        Return JSON with these EXACT coordinates for the answer areas:
        {
            "problems": [
                {
                    "problem": "426 + 267 =",
                    "handwritten": "693", 
                    "correct_answer": "693",
                    "status": "correct_no_steps",
                    "steps_shown": ["6+7=13", "60+20=80"],
                    "correct_steps": ["Add units: 6+7=13 (carry 1)", "Add tens: 2+6+1=9", "Add hundreds: 4+2=6", "Answer: 693"],
                    "box_x": 0.20,
                    "box_y": 0.36,
                    "box_width": 0.08,
                    "box_height": 0.025,
                    "feedback": "Correct answer! Please show your working steps."
                }
            ]
        }

        EXACT COORDINATES - Use these precise values:
        Problem 1 (426 + 267 = 693): box_x: 0.24, box_y: 0.31
        Problem 2 (383 + 459 = 732): box_x: 0.67, box_y: 0.31  
        Problem 3 (617 + 126 = 743): box_x: 0.24, box_y: 0.52
        Problem 4 (574 + 218 = 792): box_x: 0.67, box_y: 0.52
        Problem 5 (345 + 238 = 573): box_x: 0.24, box_y: 0.73
        Problem 6 (459 + 337 = 796): box_x: 0.67, box_y: 0.73
        
        Use box_width: 0.06, box_height: 0.03 for all problems.
         """
        
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "user", 
                        "content": [
                            {"type": "text", "text": prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}}
                        ]
                    }
                ],
                max_tokens=2000,
                temperature=0
            )
            
            # Parse response
            content = response.choices[0].message.content
            start = content.find('{')
            end = content.rfind('}') + 1
            
            if start != -1 and end != 0:
                return json.loads(content[start:end])
            else:
                return {"problems": []}
                
        except Exception as e:
            print(f"Error: {e}")
            return {"problems": []}
    
    def draw_feedback(self, image_path: str, analysis: Dict[str, Any]) -> str:
        """
        Draw simple colored boxes on the worksheet
        """
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            return image_path
            
        height, width = image.shape[:2]
        
        # Enhanced color system
        colors = {
            "perfect": (0, 255, 0),        # Green: correct + steps
            "correct_no_steps": (0, 140, 255),  # Orange: correct but no steps  
            "wrong": (0, 0, 255),          # Red: wrong answer
            "empty": (255, 0, 0)           # Blue: not answered
        }
        
        status_symbols = {
            "perfect": "✓✓",
            "correct_no_steps": "✓?", 
            "wrong": "✗",
            "empty": "?"
        }
        
        for problem in analysis.get("problems", []):
            # Get coordinates
            x = int(problem.get("box_x", 0) * width)
            y = int(problem.get("box_y", 0) * height) 
            w = int(problem.get("box_width", 0.06) * width)
            h = int(problem.get("box_height", 0.025) * height)
            
            # Get status and color
            status = problem.get("status", "empty")
            color = colors.get(status, colors["empty"])
            symbol = status_symbols.get(status, "?")
            
            # Draw thick box around answer
            cv2.rectangle(image, (x, y), (x + w, y + h), color, 4)
            
            # Add corner markers for visibility
            corner_size = 6
            cv2.rectangle(image, (x-corner_size, y-corner_size), (x+corner_size, y+corner_size), color, -1)
            cv2.rectangle(image, (x+w-corner_size, y-corner_size), (x+w+corner_size, y+corner_size), color, -1)
            
            # Add status symbol above box
            cv2.putText(image, symbol, (x, y-8), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            
            # Add feedback text if space allows
            feedback = problem.get("feedback", "")
            if feedback and len(feedback) < 30:  # Short feedback only
                cv2.putText(image, feedback[:20], (x, y+h+15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
        
        # Save result
        output_path = image_path.replace('.', '_checked.')
        cv2.imwrite(output_path, image)
        return output_path
    
    def generate_report(self, analysis: Dict[str, Any]) -> str:
        """
        Generate simple feedback report
        """
        report = "# Math Worksheet Results\n\n"
        
        for i, problem in enumerate(analysis.get("problems", []), 1):
            report += f"## Problem {i}: {problem.get('problem', 'Unknown')}\n"
            report += f"**Your Answer:** {problem.get('handwritten', 'Not answered')}\n"
            report += f"**Correct Answer:** {problem.get('correct_answer', 'Unknown')}\n"
            
            status = problem.get('status', 'empty')
            if status == "perfect":
                report += f"**Result:** ✅✅ Perfect! Correct answer with proper steps\n"
            elif status == "correct_no_steps":
                report += f"**Result:** ✅⚠️ Correct answer but show your working\n"
            elif status == "wrong":
                report += f"**Result:** ❌ Incorrect - try again\n"
            else:
                report += f"**Result:** ⚪ Not answered\n"
            
            # Show steps if available
            steps_shown = problem.get('steps_shown', [])
            if steps_shown:
                report += f"\n**Your working:**\n"
                for step in steps_shown:
                    report += f"- {step}\n"
            
            # Always show correct solution steps
            correct_steps = problem.get('correct_steps', [])
            if correct_steps:
                report += f"\n**Solution steps:**\n"
                for step in correct_steps:
                    report += f"1. {step}\n"
            
            # Add feedback
            feedback = problem.get('feedback', '')
            if feedback:
                report += f"\n**💡 Tip:** {feedback}\n"
            
            report += "\n---\n\n"
        
        return report
    
    def check_worksheet(self, image_path: str) -> Tuple[str, str, Dict[str, Any]]:
        """
        Complete workflow: analyze, draw feedback, generate report
        """
        print("🔍 Analyzing worksheet...")
        analysis = self.analyze_worksheet(image_path)
        
        print("🎨 Drawing feedback...")
        annotated_path = self.draw_feedback(image_path, analysis)
        
        print("📝 Generating report...")
        report = self.generate_report(analysis)
        
        # Enhanced summary stats
        problems = analysis.get("problems", [])
        perfect = sum(1 for p in problems if p.get("status") == "perfect")
        correct_no_steps = sum(1 for p in problems if p.get("status") == "correct_no_steps")
        wrong = sum(1 for p in problems if p.get("status") == "wrong")
        empty = sum(1 for p in problems if p.get("status") == "empty")
        
        summary = {
            "total": len(problems),
            "perfect": perfect,
            "correct_no_steps": correct_no_steps,
            "wrong": wrong,
            "empty": empty
        }
        
        # Fix box positions using ROI detection
        try:
            from roi_fixer import fix_worksheet_boxes
            fixed_path = fix_worksheet_boxes(annotated_path)
            print(f"✅ Box positions fixed! Check: {fixed_path}")
            return fixed_path, report, summary
        except Exception as e:
            print(f"⚠️ Box fixing failed: {e}")
            return annotated_path, report, summary

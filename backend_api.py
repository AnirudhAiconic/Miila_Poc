from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import base64
import io
import os
from PIL import Image
import tempfile
from math_checker import SimpleMathChecker
import re
from openai import OpenAI

app = FastAPI(title="Miila Math Checker API", version="1.0.0")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Miila Math Checker API is running!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "miila-math-checker"}

@app.post("/analyze-worksheet")
async def analyze_worksheet(
    file: UploadFile = File(...),
    api_key: str = Form(...)
):
    """
    Analyze a math worksheet image and return results with feedback
    """
    try:
        # Validate file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        # Read the uploaded file
        contents = await file.read()
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp_file:
            tmp_file.write(contents)
            temp_path = tmp_file.name
        
        try:
            # Normalize API key (handle 'OPENAI_API_KEY=sk-...' or quotes)
            raw = (api_key or "").strip().strip('"').strip("'")
            # Support newer project keys like sk-proj-... and variants
            match = re.search(r"(sk-[A-Za-z0-9_\-]{20,})", raw)
            normalized_key = match.group(1) if match else None
            if not normalized_key:
                raise HTTPException(status_code=400, detail="API key must contain a valid sk- token")
            # Debug: Log API key format (first 10 chars only for security)
            print(f"Received API key: {normalized_key[:10]}... (length: {len(normalized_key)})")
            
            # Initialize math checker with API key
            checker = SimpleMathChecker(openai_api_key=normalized_key)
            
            # Analyze the worksheet
            result_path, report, summary, analysis = checker.check_worksheet(temp_path)
            
            # Read the annotated image
            annotated_image_b64 = None
            if result_path and os.path.exists(result_path):
                with open(result_path, 'rb') as img_file:
                    img_data = img_file.read()
                    annotated_image_b64 = base64.b64encode(img_data).decode('utf-8')
                
                # Clean up the result file
                os.unlink(result_path)
            
            # Parse the report to extract problems
            problems = analysis.get('problems', []) if isinstance(analysis, dict) else []
            
            # Prepare response
            response_data = {
                "success": True,
                "problems": problems,
                "summary": summary,
                "annotated_image": annotated_image_b64,
                "total_problems": len(problems),
                "stats": {
                    "perfect": len([p for p in problems if p.get('status') == 'perfect']),
                    "correct_no_steps": len([p for p in problems if p.get('status') == 'correct_no_steps']),
                    "wrong": len([p for p in problems if p.get('status') == 'wrong']),
                    "empty": len([p for p in problems if p.get('status') == 'empty'])
                }
            }
            
            return JSONResponse(content=response_data)
            
        except Exception as e:
            err = str(e)
            # Avoid printing emoji content to Windows console
            try:
                print("Analysis error")
            except Exception:
                pass
            # Detect invalid API key and return 401
            if "invalid_api_key" in err or "Incorrect API key provided" in err:
                raise HTTPException(status_code=401, detail="Invalid OpenAI API key")
            raise HTTPException(status_code=500, detail=f"Analysis failed: {err}")
        
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.unlink(temp_path)
                
    except Exception as e:
        # Avoid emoji in console
        try:
            print("Upload error")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/validate-api-key")
async def validate_api_key(api_key: str = Form(...)):
    """
    Validate OpenAI API key by attempting a lightweight API call
    """
    try:
        raw = (api_key or "").strip().strip('"').strip("'")
        match = re.search(r"(sk-[A-Za-z0-9_\-]{20,})", raw)
        normalized_key = match.group(1) if match else None
        if not normalized_key:
            return {"valid": False, "message": "API key must contain a valid sk- token"}

        # Try a minimal call: list models (cheap and fast)
        client = OpenAI(api_key=normalized_key)
        try:
            _ = client.models.list()
        except Exception as e:
            err = str(e)
            if "invalid_api_key" in err or "Incorrect API key provided" in err:
                return {"valid": False, "message": "Invalid OpenAI API key"}
            return {"valid": False, "message": f"OpenAI error: {err}"}

        return {"valid": True, "message": "API key is valid"}
        
    except Exception as e:
        return {"valid": False, "message": f"Validation error: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

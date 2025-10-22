from fastapi import FastAPI, File, UploadFile, Form, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi import Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import base64
import io
import os
from PIL import Image
import cv2
try:
    import torch
except Exception:
    torch = None
try:
    import easyocr
except Exception:
    easyocr = None
try:
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel
except Exception:
    TrOCRProcessor = None
    VisionEncoderDecoderModel = None
from openai import OpenAI
import tempfile
from math_checker import SimpleMathChecker
from model.processing.video.SinglePageMatcher import SinglePageMatcher
import re
import json
import math
from functools import lru_cache
import threading
import uuid

app = FastAPI(title="Miila Math Checker API", version="1.0.0")
# -------------------------------
# Simple WebSocket signaling for WebRTC (POC)
# -------------------------------
_room_lock = threading.Lock()
_room_to_clients: dict[str, set] = {}

@app.websocket("/ws/signal")
async def ws_signal(websocket: WebSocket, room: str = Query(..., min_length=1), role: str | None = Query(None)):
    # Accept connection
    await websocket.accept()
    try:
        with _room_lock:
            clients = _room_to_clients.get(room)
            if clients is None:
                clients = set()
                _room_to_clients[room] = clients
            clients.add(websocket)
        # Relay any incoming text messages to other peers in the same room
        while True:
            msg = await websocket.receive_text()
            # Broadcast to all other clients in the room
            with _room_lock:
                targets = list(_room_to_clients.get(room, set()))
            for ws in targets:
                if ws is websocket:
                    continue
                try:
                    await ws.send_text(msg)
                except Exception:
                    # Drop broken connections
                    try:
                        with _room_lock:
                            _room_to_clients.get(room, set()).discard(ws)
                    except Exception:
                        pass
    except WebSocketDisconnect:
        pass
    except Exception:
        # swallow other errors to keep server healthy
        pass
    finally:
        try:
            with _room_lock:
                group = _room_to_clients.get(room)
                if group is not None:
                    group.discard(websocket)
                    if not group:
                        _room_to_clients.pop(room, None)
        except Exception:
            pass

# Fixed worksheet configuration (always process the same image if enabled)
FIXED_WORKSHEET_DIR = os.path.join(os.path.dirname(__file__), "uploads", "fixed")
FIXED_WORKSHEET_FILE = os.getenv("MIILA_FIXED_WORKSHEET_FILE")  # filename or absolute path
ALWAYS_USE_FIXED = os.getenv("MIILA_ALWAYS_USE_FIXED", "0").lower() in ("1", "true", "yes")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def _print_registered_routes():
    try:
        paths = [getattr(r, "path", str(r)) for r in app.router.routes]
        print("Registered routes:", paths)
    except Exception as _e:
        print("Could not list routes")

@app.on_event("startup")
async def startup_event():
    app.state.page_matcher = SinglePageMatcher("worksheet", verbose=False)

@app.get("/")
async def root():
    return {"message": "Miila Math Checker API is running!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "miila-math-checker"}

def get_page_matcher(request: Request) -> SinglePageMatcher:
    return request.app.state.page_matcher       

@app.post("/analyze-worksheet")
async def analyze_worksheet(
    file: UploadFile = File(...),
    api_key: str = Form(...),
    page_matcher: SinglePageMatcher = Depends(get_page_matcher)
):
    """
    Analyze a math worksheet image and return results with feedback
    """
    try:
        # Validate file type (frontend may still send a dummy image)
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")

        # Always use the most recently pre-uploaded worksheet from uploads/fixed
        upload_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'fixed')
        os.makedirs(upload_dir, exist_ok=True)
        try:
            candidates = [
                os.path.join(upload_dir, name)
                for name in os.listdir(upload_dir)
                if name.lower().endswith((".png", ".jpg", ".jpeg"))
            ]
        except Exception:
            candidates = []
        if not candidates:
            raise HTTPException(status_code=400, detail=f"No pre-uploaded worksheet found in {upload_dir}. Place a PNG/JPG there.")
        input_path = max(candidates, key=lambda p: os.path.getmtime(p))
        
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
            
            #Transform the uploaded image to the original worksheet
            img_filled = None # open here
            img_matched = page_matcher.match(img_filled)
            cv2.imwrite(input_path, img_matched)

            # Analyze the worksheet (always use pre-uploaded image)
            result_path, report, summary, analysis = checker.check_worksheet(input_path)
            
            # Read the annotated image
            annotated_image_b64 = None
            if result_path and os.path.exists(result_path):
                with open(result_path, 'rb') as img_file:
                    img_data = img_file.read()
                    annotated_image_b64 = base64.b64encode(img_data).decode('utf-8')

                # Clean up the result file immediately (do not persist reports)
                try:
                    os.unlink(result_path)
                except Exception:
                    pass

                # Extra cleanup: remove ANY '*_checked*' artifacts in uploads/fixed
                try:
                    fixed_dir = os.path.join(os.path.dirname(__file__), 'uploads', 'fixed')
                    if os.path.isdir(fixed_dir):
                        for fname in os.listdir(fixed_dir):
                            fn_lower = fname.lower()
                            if ('_checked' in fn_lower) and fn_lower.endswith(('.png', '.jpg', '.jpeg')):
                                try:
                                    os.unlink(os.path.join(fixed_dir, fname))
                                except Exception:
                                    pass
                except Exception:
                    pass
            
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
            pass
                
    except Exception as e:
        # Avoid emoji in console
        try:
            print("Upload error")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# -------------------------------
# Simple POC variant rotation (no LLM)
# -------------------------------

RAG_STORE_PATH = os.path.join(os.path.dirname(__file__), "rag_store.json")
_variant_lock = threading.Lock()
_variant_counter = 0

# ---------- OCR utilities ----------
def _preprocess_for_ocr(img_bgr):
    if img_bgr is None:
        return None
    try:
        # upscale
        h, w = img_bgr.shape[:2]
        scale = 2 if max(h, w) < 1800 else 1
        if scale != 1:
            img_bgr = cv2.resize(img_bgr, (w*scale, h*scale), interpolation=cv2.INTER_CUBIC)
        # denoise and grayscale
        img_d = cv2.bilateralFilter(img_bgr, 7, 50, 50)
        gray = cv2.cvtColor(img_d, cv2.COLOR_BGR2GRAY)
        # contrast boost (helps light-blue ink)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        gray = clahe.apply(gray)
        # emphasize blue/cyan strokes
        hsv = cv2.cvtColor(img_d, cv2.COLOR_BGR2HSV)
        lower_blue = (85, 30, 30)
        upper_blue = (135, 255, 255)
        blue_mask = cv2.inRange(hsv, lower_blue, upper_blue)
        blue_focus = cv2.bitwise_and(gray, gray, mask=blue_mask)
        # blend gray and blue-focused for robust binarization
        mix = cv2.max(gray, blue_focus)
        # adaptive threshold to handle uneven lighting
        th = cv2.adaptiveThreshold(mix, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 31, 5)
        # morphology to connect strokes
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        th = cv2.morphologyEx(th, cv2.MORPH_OPEN, kernel, iterations=1)
        return th
    except Exception:
        return img_bgr

def _clean_text(s: str) -> str:
    if not s:
        return ""
    # Keep letters, digits, punctuation that appear in questions
    import re
    s = s.replace("\n", " ")
    s = re.sub(r"[^A-Za-z0-9 ,.?!'\-]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _score_text(s: str) -> float:
    if not s:
        return 0.0
    import re
    letters = len(re.findall(r"[A-Za-z]", s))
    ratio = letters / max(1, len(s))
    return letters * (0.6 + 0.4 * ratio)

@lru_cache(maxsize=1)
def _get_easyocr_reader():
    if easyocr is None:
        return None
    try:
        return easyocr.Reader(['en'], gpu=(hasattr(torch,"cuda") and torch.cuda.is_available()))
    except Exception:
        return None

@lru_cache(maxsize=1)
def _get_trocr_models():
    if TrOCRProcessor is None or VisionEncoderDecoderModel is None:
        return (None, None)
    try:
        proc = TrOCRProcessor.from_pretrained("microsoft/trocr-base-handwritten")
        model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-handwritten")
        return (proc, model)
    except Exception:
        return (None, None)

def _perform_ocr(image_path: str) -> str:
    texts = []
    try:
        img_bgr = cv2.imread(image_path)
        prep = _preprocess_for_ocr(img_bgr)
        # TrOCR PRIMARY
        proc, model = _get_trocr_models()
        if proc is not None and model is not None:
            try:
                from PIL import Image as PILImage
                image = PILImage.open(image_path).convert("RGB")
                pixel_values = proc(images=image, return_tensors="pt").pixel_values
                generated_ids = model.generate(pixel_values)
                o_text = proc.batch_decode(generated_ids, skip_special_tokens=True)[0]
                o_text = _clean_text(o_text)
                if o_text:
                    texts.append((o_text, _score_text(o_text) + 3))
            except Exception:
                pass
        # EasyOCR fallback
        reader = _get_easyocr_reader()
        if reader is not None:
            try:
                res = reader.readtext(image_path, detail=0, paragraph=False,
                                       text_threshold=0.3, low_text=0.2, contrast_ths=0.05)
                e_text = _clean_text(" ".join(res))
                if e_text:
                    texts.append((e_text, _score_text(e_text)))
            except Exception:
                pass
            # Band crop attempt for EasyOCR
            try:
                if img_bgr is not None:
                    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
                    h, w = gray.shape[:2]
                    band = img_bgr[0:int(0.4*h), :]
                    res2 = reader.readtext(band, detail=0, paragraph=False,
                                            text_threshold=0.3, low_text=0.2, contrast_ths=0.05)
                    e2 = _clean_text(" ".join(res2))
                    if e2:
                        texts.append((e2, _score_text(e2)))
            except Exception:
                pass
        if not texts:
            return ""
        texts.sort(key=lambda x: x[1], reverse=True)
        return texts[0][0]
    except Exception:
        return ""

def _cosine_similarity(a, b):
    # retained for backwards compatibility if needed elsewhere
    if not a or not b:
        return 0.0
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)

def _load_rag_store() -> list:
    if not os.path.exists(RAG_STORE_PATH):
        # Seed with 10 simple variants if file not present
        seed_items = [
            {"id": 1, "title": "Build a paper rocket", "content": "To build a simple paper rocket: roll paper into a tube, tape fins, add a cone, and launch with a straw or compressed air."},
            {"id": 2, "title": "Model rocket basics", "content": "Model rockets use a body tube, nose cone, fins, and a solid motor. Follow safety code: stable center of gravity ahead of center of pressure."},
            {"id": 3, "title": "Spacecraft subsystems", "content": "A spacecraft needs power, propulsion, guidance, communication, thermal control, and structure. Trade mass, power, and reliability."},
            {"id": 4, "title": "Propulsion overview", "content": "Chemical rockets provide high thrust; electric propulsion provides high efficiency but low thrust for deep space."},
            {"id": 5, "title": "Safety first", "content": "Never build or ignite engines without certified kits and adult supervision. Use model rocketry standards and safe launch sites."},
            {"id": 6, "title": "Aerodynamics", "content": "Fins stabilize flight. Keep them symmetric and aligned. Reduce drag with smooth surfaces and a pointed nose cone."},
            {"id": 7, "title": "Materials", "content": "For hobby builds use cardboard, balsa, PLA prints, and epoxy. For real aerospace: aluminum, carbon fiber, and space-rated electronics."},
            {"id": 8, "title": "Guidance basics", "content": "Simple rockets use passive stabilization. Advanced systems use IMU sensors, flight computers, and thrust vector control."},
            {"id": 9, "title": "Power systems", "content": "Small projects use LiPo batteries with proper BMS and fuses. Spacecraft often use solar panels with MPPT and battery packs."},
            {"id": 10, "title": "Learning path", "content": "Start with model rocket kits, then avionics (altimeters, GPS), then small liquid engines in university teams under supervision."}
        ]
        seed = {
            "items": seed_items,
            "poc_variants": [
                "You can build a simple paper rocket. Roll paper into a tube, tape on three fins, make a small cone for the nose, and launch it by blowing through a straw.",
                "Try a straw rocket: tape a small paper tube onto a straw, add fins and a pointed nose, then use a bigger straw as a launcher to puff it into the air.",
                "Start with a safe model rocket kit. It has a tube, fins, and a small engine. Follow the instructions and adult supervision to launch it.",
                "Think like a spaceship: you need a body, fins to keep it straight, and power. For a kid project, air power from a straw or a soda-bottle launcher is perfect.",
                "Make it stable: keep the heavy part (nose) a little forward, and fins at the back nice and straight. Smooth tape reduces drag for higher flights."
            ]
        }
        with open(RAG_STORE_PATH, "w", encoding="utf-8") as f:
            json.dump(seed, f, ensure_ascii=False, indent=2)
    try:
        with open(RAG_STORE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Backward compatibility if file previously stored list
            if isinstance(data, list):
                data = {"items": data, "poc_variants": []}
            # Ensure keys exist
            data.setdefault("items", [])
            data.setdefault("poc_variants", [])
            return data
    except Exception:
        return {"items": [], "poc_variants": []}

@lru_cache(maxsize=1)
def _get_rag_items_tuple():
    # kept for future use; not used in POC mode
    data = _load_rag_store()
    items = data.get("items", [])
    return tuple((item.get("id"), item.get("title", ""), item.get("content", "")) for item in items)

@lru_cache(maxsize=1)
def _get_poc_variants_tuple():
    data = _load_rag_store()
    return tuple(v for v in data.get("poc_variants", []))

# ---------- Simple auth (single credential) ----------
VALID_EMAIL = os.getenv("MIILA_ADMIN_EMAIL", "admin@miila.ai")
VALID_PASSWORD = os.getenv("MIILA_ADMIN_PASSWORD", "Miila@123")

@app.post("/auth/login")
async def auth_login(email: str = Form(...), password: str = Form(...)):
    try:
        if email == VALID_EMAIL and password == VALID_PASSWORD:
            token = f"demo_{uuid.uuid4()}"
            return {
                "success": True,
                "token": token,
                "user": {
                    "email": email,
                    "name": email.split('@')[0],
                }
            }
        raise HTTPException(status_code=401, detail="Invalid credentials")
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.post("/ask")
async def ask(file: UploadFile = File(...)):
    """
    Read a question image (OCR best-effort) and return a rotating stored answer.
    """
    try:
        contents = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp_file:
            tmp_file.write(contents)
            temp_path = tmp_file.name

        # Hardcoded recognized text (POC)
        query_text = "What is life like on a spaceship?"

        simplified = query_text

        # POC mode: cycle through predefined variants and skip embeddings
        variants = list(_get_poc_variants_tuple())
        if variants:
            global _variant_counter
            with _variant_lock:
                idx = _variant_counter % len(variants)
                _variant_counter += 1
            best_answer = variants[idx]
            top = [{"id": idx + 1, "title": "POC Variant", "content": variants[idx], "score": 1.0}]
            kid_friendly = best_answer
        else:
            # If no variants configured, fall back to the first rag item text if present; else generic.
            items = list(_get_rag_items_tuple())
            if items:
                best_answer = items[0][2]
                top = [{"id": items[0][0], "title": items[0][1], "content": best_answer, "score": 1.0}]
            else:
                best_answer = "No answers configured. Please add text in rag_store.json under 'poc_variants'."
                top = []
            kid_friendly = best_answer

        return {
            "success": True,
            "extracted_text": query_text,
            "simplified_question": simplified,
            "answer": kid_friendly,
            "base_answer": best_answer
        }
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})
    finally:
        try:
            if 'temp_path' in locals() and os.path.exists(temp_path):
                os.unlink(temp_path)
        except Exception:
            pass

# -------------------------------
# Conversational tutor (POC scripted)
# -------------------------------

SCRIPTED_STEPS = [
    {
        "recognized": "What is life like on a spaceship?",
        "tutor": "Great question! Think daily life. Start by naming two things astronauts do every day.",
    },
    {
        "recognized": "They eat and exercise.",
        "tutor": "Good! Why is exercise so important in space? Write your reason in one short line.",
    },
    {
        "recognized": "To keep muscles and bones strong.",
        "tutor": "Right. Now, how do they get power and clean air/water? One short line.",
    },
    {
        "recognized": "Solar panels for power, recycling for air and water.",
        "tutor": "Nice. Last: name one feeling and one teamwork skill that help crews.",
    },
    {
        "recognized": "They feel lonely sometimes; teamwork and calm talking help.",
        "final": (
            "Life on a spaceship is busy and careful. Astronauts follow a routine: they eat special meals, "
            "exercise every day to keep muscles and bones strong, and do science and maintenance jobs. "
            "Power comes from solar panels, and systems recycle air and water to save resources. "
            "Teams practice calm, clear communication and help each other, which matters when people miss family or feel lonely."
        ),
    },
]

@app.post("/tutor/next")
async def tutor_next(
    step_index: int = Form(...),
    conversation_id: str | None = Form(None),
    file: UploadFile | None = File(None),
):
    """POC conversational step. Accepts an optional image, returns scripted hint.
    This endpoint does not persist state; the client holds conversation_id.
    """
    try:
        # swallow uploaded file; not used in POC
        if file is not None:
            try:
                _ = await file.read()
            except Exception:
                pass

        if conversation_id is None or conversation_id.strip() == "":
            conversation_id = str(uuid.uuid4())

        # clamp index
        idx = max(0, min(len(SCRIPTED_STEPS) - 1, int(step_index)))
        node = SCRIPTED_STEPS[idx]
        done = idx >= len(SCRIPTED_STEPS) - 1

        payload = {
            "conversation_id": conversation_id,
            "step_index": idx,
            "recognized_text": node.get("recognized", ""),
            "tutor_message": node.get("tutor", "") if not done else "Great work! Here's a summary.",
            "done": done,
        }
        if done:
            payload["final_answer"] = node.get("final", "")

        return JSONResponse(content=payload)
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

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
    # Use import string so reload works reliably on newer uvicorn
    uvicorn.run("backend_api:app", host="0.0.0.0", port=8000, reload=True)

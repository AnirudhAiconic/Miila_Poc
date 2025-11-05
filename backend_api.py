from fastapi import FastAPI, File, UploadFile, Form, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import base64
import io
import os
from PIL import Image
import cv2
import numpy as np
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
import httpx
import tempfile
from math_checker import SimpleMathChecker
import re
import json
import math
from functools import lru_cache
import threading
import uuid
import time

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

# Serve static uploads (e.g., splash image for login)
try:
    _uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(_uploads_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=_uploads_dir), name="uploads")
except Exception:
    # If static mounting fails, continue without blocking the API
    pass

@app.on_event("startup")
def _print_registered_routes():
    try:
        paths = [getattr(r, "path", str(r)) for r in app.router.routes]
        print("Registered routes:", paths)
    except Exception as _e:
        print("Could not list routes")

@app.get("/")
async def root():
    return {"message": "Miila Math Checker API is running!"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "miila-math-checker"}

@app.post("/analyze-worksheet")
async def analyze_worksheet(
    file: UploadFile = File(...),
    api_key: str = Form(...),
    align: str | None = Form(None)
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
        aligned_temp_path = None
        
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
            
            # Optional alignment: if requested, try aligning uploaded file to template
            used_source = "fixed"
            if align is not None and str(align).lower() in ("1", "true", "yes"):
                contents = await file.read()
                if not contents:
                    raise HTTPException(status_code=422, detail="Alignment failed: empty upload")
                # Default to fail unless we succeed aligning
                use_path = None
                try:
                        # Decode captured image
                        np_buf = np.frombuffer(contents, dtype=np.uint8)
                        captured = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
                        template = cv2.imread(input_path, cv2.IMREAD_COLOR)
                        if captured is not None and template is not None:
                            # Optional: first detect and rectify the page region to reduce background influence
                            tw, th = template.shape[1], template.shape[0]
                            try:
                                gray = cv2.cvtColor(captured, cv2.COLOR_BGR2GRAY)
                                gray = cv2.GaussianBlur(gray, (5,5), 0)
                                edges = cv2.Canny(gray, 50, 150)
                                contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
                                contours = sorted(contours, key=cv2.contourArea, reverse=True)[:15]
                                quad = None
                                for cnt in contours:
                                    peri = cv2.arcLength(cnt, True)
                                    approx = cv2.approxPolyDP(cnt, 0.02*peri, True)
                                    if len(approx) == 4:
                                        area = cv2.contourArea(approx)
                                        if area < 0.2 * (captured.shape[0]*captured.shape[1]):
                                            continue
                                        box = approx.reshape(4,2).astype(np.float32)
                                        # aspect filter against template
                                        w = np.linalg.norm(box[1]-box[0])
                                        h = np.linalg.norm(box[3]-box[0])
                                        asp = (w / max(1e-6,h)) if h>0 else 1.0
                                        tmpl_asp = tw / max(1, th)
                                        if 0.6*tmpl_asp <= asp <= 1.4*tmpl_asp:
                                            quad = box
                                            break
                                if quad is not None:
                                    # Order points (tl,tr,br,bl)
                                    s = quad.sum(axis=1)
                                    diff = np.diff(quad, axis=1).reshape(-1)
                                    tl = quad[np.argmin(s)]
                                    br = quad[np.argmax(s)]
                                    tr = quad[np.argmin(diff)]
                                    bl = quad[np.argmax(diff)]
                                    src_quad = np.float32([tl, tr, br, bl])
                                    dst_quad = np.float32([[0,0],[tw-1,0],[tw-1,th-1],[0,th-1]])
                                    M = cv2.getPerspectiveTransform(src_quad, dst_quad)
                                    captured_rect = cv2.warpPerspective(captured, M, (tw, th))
                                else:
                                    captured_rect = captured
                            except Exception:
                                captured_rect = captured

                            # Feature-based homography with rotations and AKAZE→ORB fallback
                            warped = None
                            align_logs = []
                            def try_feature_align(img):
                                detectors = []
                                try:
                                    detectors.append(cv2.AKAZE_create())
                                except Exception:
                                    pass
                                detectors.append(cv2.ORB_create(7000))
                                best = None
                                best_inliers = -1
                                for det in detectors:
                                    try:
                                        kp1, des1 = det.detectAndCompute(img, None)
                                        kp2, des2 = det.detectAndCompute(template, None)
                                        if des1 is None or des2 is None or len(kp1) < 8 or len(kp2) < 8:
                                            continue
                                        bf = cv2.BFMatcher(cv2.NORM_HAMMING)
                                        matches = bf.knnMatch(des1, des2, k=2)
                                        ratio = 0.88 if det.__class__.__name__.lower().startswith('akaze') else 0.82
                                        good = [m for m, n in matches if m.distance < ratio * n.distance]
                                        if len(good) < 8:
                                            continue
                                        src = np.float32([kp1[m.queryIdx].pt for m in good])
                                        dst = np.float32([kp2[m.trainIdx].pt for m in good])
                                        H, inliers = cv2.findHomography(src, dst, cv2.RANSAC, 6.0)
                                        inl = int(inliers.sum()) if inliers is not None else 0
                                        # Debug counters
                                        try:
                                            msg = f"align: det={det.__class__.__name__} good={len(good)} inliers={inl}"
                                            align_logs.append(msg)
                                            print(msg)
                                        except Exception:
                                            pass
                                        if H is None or inl < 6:
                                            continue
                                        if inl > best_inliers:
                                            best_inliers = inl
                                            best = cv2.warpPerspective(img, H, (tw, th))
                                    except Exception:
                                        continue
                                return best

                            # Try multiple rotations of captured_rect
                            rotations = [captured_rect,
                                         cv2.rotate(captured_rect, cv2.ROTATE_90_CLOCKWISE),
                                         cv2.rotate(captured_rect, cv2.ROTATE_180),
                                         cv2.rotate(captured_rect, cv2.ROTATE_90_COUNTERCLOCKWISE)]
                            for img_r in rotations:
                                warped = try_feature_align(img_r)
                                if warped is not None:
                                    break

                            # ECC fallback if features fail
                            if warped is None:
                                try:
                                    gray_t = cv2.cvtColor(template, cv2.COLOR_BGR2GRAY)
                                    gray_i = cv2.cvtColor(captured_rect, cv2.COLOR_BGR2GRAY)
                                    gray_t = cv2.normalize(gray_t.astype(np.float32), None, 0.0, 1.0, cv2.NORM_MINMAX)
                                    gray_i = cv2.normalize(gray_i.astype(np.float32), None, 0.0, 1.0, cv2.NORM_MINMAX)
                                    warp_matrix = np.eye(3, dtype=np.float32)
                                    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
                                    try:
                                        cc, warp_matrix = cv2.findTransformECC(gray_t, gray_i, warp_matrix, cv2.MOTION_HOMOGRAPHY, criteria, None, 5)
                                        warped = cv2.warpPerspective(captured_rect, warp_matrix, (tw, th))
                                        try:
                                            align_logs.append(f"align: ECC cc={cc:.4f}")
                                        except Exception:
                                            pass
                                    except Exception:
                                        warped = None
                                except Exception:
                                    warped = None

                            if warped is not None:
                                with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as t:
                                    cv2.imwrite(t.name, warped)
                                    aligned_temp_path = t.name
                                    use_path = aligned_temp_path
                                    used_source = "aligned"
                except HTTPException:
                    raise
                except Exception:
                    # Unknown alignment exception: surface a clear 422 instead of falling back
                    raise HTTPException(status_code=422, detail="Alignment failed: internal alignment error")

                if use_path is None:
                    # Explicitly fail if we didn't produce an aligned image
                    log_msg = "; ".join(align_logs[-5:]) if 'align_logs' in locals() and align_logs else "no matches"
                    raise HTTPException(status_code=422, detail=f"Alignment failed: could not compute homography ({log_msg})")
            else:
                use_path = input_path

            # Analyze the worksheet (use aligned image if available; else fixed template)
            result_path, report, summary, analysis = checker.check_worksheet(use_path)
            
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
                "used_source": used_source,
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
            # Propagate exact analysis error for easier debugging
            raise HTTPException(status_code=500, detail=f"Analysis failed: {err}")
        
        finally:
            try:
                if aligned_temp_path and os.path.exists(aligned_temp_path):
                    os.unlink(aligned_temp_path)
            except Exception:
                pass
                
    except HTTPException as he:
        # Don't re-wrap HTTPExceptions; return exact detail/status
        raise he
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

@app.post("/tutor/voice_turn")
async def tutor_voice_turn(
    audio: UploadFile = File(...),
    history: str = Form("[]"),
    api_key: str | None = Form(None),
    turn_cap: int | None = Form(5),
):
    """
    Transcribe student's voice, generate a short kid-friendly follow-up (until turn_cap),
    or a concise final answer after that. Returns text and base64-encoded TTS audio.
    Stateless: the client sends prior turns in `history` (array of {role: 'student'|'tutor', text}).
    """
    tmp_path = None
    try:
        # Determine API key (prefer provided; else env)
        raw_key = (api_key or os.getenv("MIILA_OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip().strip('"').strip("'")
        match = re.search(r"(sk-[A-Za-z0-9_\-]{20,})", raw_key)
        normalized_key = match.group(1) if match else None
        if not normalized_key:
            raise HTTPException(status_code=400, detail="Missing OpenAI API key. Set MIILA_OPENAI_API_KEY or send api_key.")

        # Persist upload to temp file for Whisper
        contents = await audio.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty audio upload")
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as t:
            t.write(contents)
            tmp_path = t.name

        # Avoid legacy env that can inject unsupported 'proxies' kw
        try:
            os.environ.pop("OPENAI_PROXY", None)
        except Exception:
            pass
        # Transcribe with Whisper
        client = OpenAI(api_key=normalized_key, http_client=httpx.Client())
        recognized_text = ""
        try:
            with open(tmp_path, "rb") as f:
                tr = client.audio.transcriptions.create(model="whisper-1", file=f)
                recognized_text = (getattr(tr, "text", None) or "").strip()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

        # Prepare conversation for LLM
        try:
            h = json.loads(history or "[]")
            if not isinstance(h, list):
                h = []
        except Exception:
            h = []
        # Helper: extract topic from first meaningful student turn
        def _first_meaningful_student(msgs: list[dict]) -> str:
            for m in msgs:
                if isinstance(m, dict) and m.get("role") == "student":
                    txt = (m.get("text") or "").strip()
                    if len(txt) >= 6 and txt.lower() not in ("hi", "hello", "hey", "i want to learn something", "i want to learn", "i would like to learn something today."):
                        return txt
            return ""
        topic_hint = _first_meaningful_student(h)
        last_student = ""
        for m in reversed(h):
            if isinstance(m, dict) and m.get("role") == "student":
                last_student = (m.get("text") or "").strip()
                if last_student:
                    break

        # If transcription failed, ask the student to repeat without advancing the turn
        if not (recognized_text or "").strip():
            tutor_text = (
                f"Sorry, I didn't catch that. Still on '{topic_hint or last_student or 'our topic'}', could you repeat in one short sentence?"
            )
            # TTS best-effort
            audio_b64 = None
            try:
                with client.audio.speech.with_streaming_response.create(
                    model="gpt-4o-mini-tts",
                    voice="alloy",
                    input=tutor_text,
                ) as resp:
                    audio_bytes = resp.read()
                    if audio_bytes:
                        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            except Exception:
                pass
            payload = {
                "recognized_text": "",
                "tutor_message": tutor_text,
                "done": False,
            }
            if audio_b64:
                payload["audio_b64"] = audio_b64
            return JSONResponse(content=payload)

        # Count student turns so far (plus this one) — ignore empty or transcribe-fail turns
        def _valid_student_text(txt: str) -> bool:
            if not txt:
                return False
            t = txt.strip().lower()
            if t in ("(could not transcribe)", "…", "..."):
                return False
            return len(t) >= 2
        student_turns = sum(
            1 for m in h
            if isinstance(m, dict) and m.get("role") == "student" and _valid_student_text((m.get("text") or ""))
        )
        TURN_CAP = int(turn_cap or 5)
        next_is_final = (student_turns + 1) >= TURN_CAP

        system_prompt = (
            "You are a friendly elementary tutor.\n"
        "Each turn MUST follow this exact shape:\n"
        "1) Praise the student's last answer in 2-6 words (e.g., 'Nice thought!', 'Good start!').\n"
        "2) Give ONE tiny, concrete fact that advances the SAME topic (no more than one sentence).\n"
        "3) Ask ONE short, targeted question (prefer A/B choices).\n"
        "If the student says 'I don't know', give an easier clue and a simple A/B question.\n"
        "Never ask meta-questions (e.g., 'What topic?'). Never switch topics.\n"
        "Keep replies ≤ 2 sentences before the question; the question is the last sentence.\n"
        "After the configured number of student turns, DO NOT ask a question; give a concise final answer (≤ 3 sentences).\n"
        )

        messages_llm = [{"role": "system", "content": system_prompt}]

        # tiny few-shot to anchor the shape
        fewshot = [
            {"role": "user", "content": "What is life like on a spaceship?"},
            {"role": "assistant", "content": "Great start! Astronauts keep routines every day. Tiny fact: they must exercise to stay strong. Choose one: A) exercise daily B) skip exercise?"}
        ]
        messages_llm += fewshot

        # append prior history
        for m in h:
            role = m.get("role")
            txt = (m.get("text") or "").strip()
            if not txt:
                continue
            if role == "student":
                messages_llm.append({"role": "user", "content": txt})
            elif role == "tutor":
                messages_llm.append({"role": "assistant", "content": txt})
        # Append the newly recognized student utterance
        if recognized_text:
            messages_llm.append({"role": "user", "content": recognized_text})

        # Lock topic and merge guardrails + stage into the same system message
        topic = (topic_hint or last_student or recognized_text or "the student's original question")
        try:
            student_only = [
                (m.get("text") or "").strip()
                for m in h
                if isinstance(m, dict) and m.get("role") == "student" and (m.get("text") or "").strip()
            ]
            convo_mem = "; ".join(student_only[-4:])
        except Exception:
            convo_mem = ""
        guardrails = (
            "Conversation so far (student turns): " + convo_mem + ". "
            f"Stay strictly on topic: '{topic}'. "
            f"Your next line must reference the student's last message: '{last_student or recognized_text}'. "
            "Do NOT ask generic/meta questions."
        )
        if next_is_final:
            stage_line = (
                f"Topic: {topic}. NOW OUTPUT ONLY the final elaborated answer (≤ 5 sentences). Do not ask any question."
            )
        else:
            stage_line = (
                f"Topic: {topic}. Use the required 3-part shape: Praise → ONE tiny fact → ONE short A/B question."
            )
        messages_llm[0]["content"] = system_prompt + "\n" + guardrails + "\n" + stage_line

        # JSON-only shaping (non-hardcoded)
        # Detect simple "I don't know" so we can nudge the model for an easier clue + A/B
        is_idk = bool(re.search(r"\bi don['’]?t know\b", (recognized_text or '').strip().lower()))

        if next_is_final:
            schema_instructions = (
                "Return ONLY valid minified JSON with this shape:\n"
                '{"final_answer":"<=5 sentences, elaborated, no question"}'
            )
        else:
            schema_instructions = (
                "Return ONLY valid minified JSON with this shape:\n"
                '{"praise":"2-6 words",'
                '"tiny_fact":"ONE short fact that advances exactly this topic",'
                '"ab_question":"ONE short A/B question ending with a question mark"}'
            )
            if is_idk:
                schema_instructions += " The student said 'I don't know'. Give one easier clue, then a simple A/B question."

        # Merge schema and rules into the existing single system message to avoid dilution
        messages_llm[0]["content"] += (
            "\nYou must output JSON ONLY for the next reply.\n"
            "Rules:\n"
            "- Never switch topics and never ask meta-questions.\n"
            "- For non-final turns: Praise (2–6 words) → ONE tiny fact (≤1 sentence) → ONE short A/B question (end with '?').\n"
            f"- The tiny_fact MUST directly address the student's last message: '{(last_student or recognized_text).strip()}'. If that last line is a question, give a 1‑sentence direct answer before the A/B question; if it is a statement (e.g., 'bat and ball'), acknowledge it and add ONE small related fact.\n"
            f"- The ab_question MUST reuse at least one noun from the student's last line: '{(last_student or recognized_text).strip()}'.\n"
            "- For the final turn: Elaborate with a 3–4 sentence answer, no question.\n"
            "- Output strictly JSON (no prose, no Markdown, no code fences).\n"
            f"{schema_instructions}"
        )

        def _safe_json_parse(s: str):
            try:
                return json.loads(s)
            except Exception:
                try:
                    start = s.find("{"); end = s.rfind("}")
                    if start != -1 and end != -1 and end > start:
                        return json.loads(s[start:end+1])
                except Exception:
                    pass
            return None

        def _format_from_json(payload: dict, final_phase: bool) -> str:
            if final_phase:
                ans = (payload or {}).get("final_answer", "").strip()
                parts = [p.strip() for p in re.split(r"[.?!]", ans) if p.strip()]
                out = ". ".join(parts[:3]).strip()
                if out and out.endswith("?"): out = out.rstrip("?") + "."
                if out and not out.endswith("."): out += "."
                return out or "Here’s a quick summary."
            praise = ((payload or {}).get("praise") or "").strip()
            fact  = ((payload or {}).get("tiny_fact") or "").strip()
            q     = ((payload or {}).get("ab_question") or "").strip()
            if q and not q.endswith("?"): q += "?"
            if not praise: praise = "Nice thinking!"
            if not fact:   fact   = "Tiny fact: a small step helps a lot."
            if not q:      q      = "Choose one: A) this B) that?"
            return f"{praise} {fact} {q}"

        def _generic_fallback(text: str, final_phase: bool) -> str:
            t = (text or "").strip().replace("\n", " ")
            if final_phase:
                parts = [p.strip() for p in re.split(r"[.?!]", t) if p.strip()]
                out = ". ".join(parts[:3]).strip()
                if out and out.endswith("?"): out = out.rstrip("?") + "."
                if out and not out.endswith("."): out += "."
                return out or "Here’s a quick summary."
            first = re.split(r"[.?!]", t, maxsplit=1)[0].strip()
            keep = first + "." if 6 <= len(first.split()) <= 18 else ""
            pieces = [
                "Great job!",
                keep or "Tiny fact: one simple habit improves results.",
                "Choose one: A) this B) that?"
            ]
            out = " ".join(pieces).strip()
            return re.sub(r"\s+", " ", out)

        # Helper that tries 4o with JSON, falls back to 4o-mini with JSON, then 4o-mini without JSON
        def _chat_json(client_obj, msgs, temp, max_tok):
            attempts = [
                ("gpt-4o", True),
                ("gpt-4o-mini", True),
                ("gpt-4o-mini", False),
            ]
            last_err = None
            for model_name, use_json in attempts:
                try:
                    kwargs = dict(model=model_name, messages=msgs, temperature=temp, max_tokens=max_tok)
                    if use_json:
                        kwargs["response_format"] = {"type": "json_object"}
                    cmp_local = client_obj.chat.completions.create(**kwargs)
                    return (cmp_local.choices[0].message.content or "").strip()
                except Exception as ex:
                    last_err = ex
                    continue
            raise HTTPException(status_code=500, detail=f"LLM failed: {last_err}")

        # First attempt
        raw = _chat_json(client, messages_llm, 0.15, 180)

        payload = _safe_json_parse(raw)

        # Retry once if JSON invalid
        if payload is None:
            messages_llm.append({"role": "system", "content": "Your previous output was not valid JSON. Return ONLY the JSON object now."})
            try:
                raw2 = _chat_json(client, messages_llm, 0.05, 160)
                payload = _safe_json_parse(raw2)
            except Exception:
                payload = None

        # Format final tutor_text deterministically
        if payload is not None:
            tutor_text = _format_from_json(payload, next_is_final)
        else:
            tutor_text = _generic_fallback(raw, next_is_final)

        # TTS generation (best-effort)
        audio_b64 = None
        try:
            # Prefer streaming when available
            with client.audio.speech.with_streaming_response.create(
                model="gpt-4o-mini-tts",
                voice="alloy",
                input=tutor_text or "",
            ) as resp:
                audio_bytes = resp.read()
                if audio_bytes:
                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        except Exception:
            try:
                # Fallback non-streaming
                resp2 = client.audio.speech.create(
                    model="gpt-4o-mini-tts",
                    voice="alloy",
                    input=tutor_text or "",
                )
                audio_bytes = resp2.read()
                if audio_bytes:
                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            except Exception:
                audio_b64 = None

        payload = {
            "recognized_text": recognized_text,
            "tutor_message": tutor_text,
            "done": bool(next_is_final),
        }
        if next_is_final:
            payload["final_answer"] = tutor_text
        if audio_b64:
            payload["audio_b64"] = audio_b64
        return JSONResponse(content=payload)
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})
    finally:
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except Exception:
            pass

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
        try:
            os.environ.pop("OPENAI_PROXY", None)
        except Exception:
            pass
        client = OpenAI(api_key=normalized_key, http_client=httpx.Client())
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

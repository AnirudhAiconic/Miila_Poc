Title: setup_and_run.bat – One-shot setup and local launch (Windows)

Overview
- Installs backend and frontend dependencies, then starts both servers in separate terminal windows.
- Intended for local Windows development.

Steps
1) pip install -r backend_requirements.txt
2) npm install in frontend/
3) Starts uvicorn backend on port 8000 with auto-reload.
4) Starts the React dev server on port 3000.

Behavior
- Kills any existing process bound to port 8000 before launching uvicorn.
- Waits briefly between starting backend and frontend to allow the backend to bind to the port.

Notes
- Requires Python and Node.js installed on the system PATH.
- React dev server will typically open a browser to http://localhost:3000; backend at http://localhost:8000.



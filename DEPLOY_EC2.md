Title: EC2 deployment and redeploy guide

Overview
- This document captures how the app is deployed on an Ubuntu EC2 instance, including directory layout, systemd service for the backend, Nginx configuration for the frontend and proxying, environment variables, permissions, and step-by-step redeploy instructions.

Assumptions
- OS: Ubuntu 20.04+ (similar for 22.04)
- App checkout path: `/opt/miila`
- Backend bound to `127.0.0.1:8000` via systemd (uvicorn)
- Frontend built to `frontend/build` and served by Nginx
- Domain DNS points to the EC2 public IP (optional for TLS)

Packages to install (once)

```bash
sudo apt update
sudo apt install -y git nginx python3 python3-pip python3-venv nodejs npm
# Optional: ensure node 18+ (use nvm if needed)
node -v && npm -v
```

Directory layout
- `/opt/miila` – git working copy of this repository
  - `backend_api.py`, `math_checker.py`, `roi_fixer.py`
  - `backend_requirements.txt`
  - `frontend/` – React app
    - `build/` – production static files after `npm run build`
- `/etc/systemd/system/miila-backend.service` – backend systemd unit
- `/etc/nginx/sites-available/miila` – Nginx server config
- `/etc/nginx/sites-enabled/miila` – symlink to sites-available

Clone or refresh the repo

```bash
sudo mkdir -p /opt/miila
sudo chown -R ubuntu:ubuntu /opt/miila
cd /opt/miila
git clone https://github.com/<your_org>/<your_repo>.git .   # or set remote and pull
```

Common permission fixes
- If you see git permission errors:

```bash
cd /opt/miila
sudo chattr -i -R .git 2>/dev/null || true
sudo rm -f .git/index.lock 2>/dev/null || true
sudo chown -R ubuntu:ubuntu .git .
```

Backend dependencies

```bash
cd /opt/miila
python3 -m venv .venv
source .venv/bin/activate
pip install --no-cache-dir -r backend_requirements.txt
deactivate
```

Systemd service (backend)
Create `/etc/systemd/system/miila-backend.service`:

```ini
[Unit]
Description=Miila Backend (uvicorn)
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/opt/miila
Environment=PYTHONUNBUFFERED=1
# Optional: set your OpenAI key here (or use system-wide env.d)
# Environment=OPENAI_API_KEY=sk-xxxxx
ExecStart=/opt/miila/.venv/bin/python -m uvicorn backend_api:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable miila-backend
sudo systemctl restart miila-backend
sudo systemctl status miila-backend --no-pager -l
sudo journalctl -u miila-backend -n 100 --no-pager
```

If the venv path changes, update `ExecStart` accordingly (e.g., use `/usr/bin/python3` if not using venv, but then install backend packages globally).

Frontend build

```bash
cd /opt/miila/frontend
npm ci || npm install
npm run build
# Ensure readable by Nginx user
sudo chown -R www-data:www-data /opt/miila/frontend/build
```

Nginx configuration
Create `/etc/nginx/sites-available/miila`:

```nginx
server {
    listen 80;
    server_name _;  # replace with your domain if you have one

    # Serve React build
    root /opt/miila/frontend/build;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    # Proxy API to backend
    location ~ ^/(auth|ask|analyze-worksheet|tutor|validate-api-key|health|openapi\.json|docs|redoc) {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket signaling proxy (/ws)
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable the site and reload Nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/miila /etc/nginx/sites-enabled/miila
sudo nginx -t
sudo systemctl reload nginx
```

TLS (optional)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your.domain.com
```

Environment variables
- Backend reads the OpenAI key in this order:
  - `api_key` form field on requests that support it
  - `MIILA_OPENAI_API_KEY`
  - `OPENAI_API_KEY`
- You can set env at the systemd unit (Environment=...) or in `/etc/environment` and then reload.

Redeploy steps (git pull and rebuild)

```bash
# 1) Pull latest
cd /opt/miila
sudo chattr -i -R .git 2>/dev/null || true
sudo rm -f .git/index.lock 2>/dev/null || true
sudo chown -R ubuntu:ubuntu .git .
git fetch --all
git reset --hard origin/main

# 2) Backend deps (only if requirements changed)
source .venv/bin/activate
pip install --no-cache-dir -r backend_requirements.txt
deactivate

# 3) Frontend build
cd /opt/miila/frontend
npm ci || npm install
npm run build
sudo chown -R www-data:www-data /opt/miila/frontend/build

# 4) Restart services
sudo systemctl restart miila-backend
sudo systemctl reload nginx
```

Troubleshooting
- Permission denied on git:
  - Run chown/chattr/rm lock steps above under “Redeploy steps”.
- Backend service can’t find Python or packages:
  - Ensure the `ExecStart` matches the actual venv path.
  - Try `which python` and `ls /opt/miila/.venv/bin/python`.
  - Check logs: `journalctl -u miila-backend -n 200 --no-pager`.
- Nginx shows 502:
  - Confirm miila-backend is running: `curl -s http://127.0.0.1:8000/health`.
  - Validate Nginx config with `nginx -t`, then reload.
- WebSocket disconnects:
  - Ensure the `/ws` location has Upgrade/Connection headers as shown.
  - Check security groups to allow port 80 (and 443 if TLS).

Security notes
- Avoid committing secrets. Prefer environment variables for keys.
- Limit inbound ports to 80/443 via security groups; backend listens on 127.0.0.1:8000 only.
- Consider tightening CORS in `backend_api.py` in production to your domain.



Title: frontend/src/setupProxy.js – Dev proxy for API and WebSocket

Overview
- Configures the development proxy for create-react-app to forward API requests and WebSocket traffic to the backend running on http://localhost:8000.
- Avoids CORS issues during local development by serving frontend and backend under the same origin at runtime.

Technologies and libraries
- http-proxy-middleware: used by CRA to implement request and WebSocket proxying.

Behavior
- Proxies these paths to the backend: /auth, /ask, /analyze-worksheet, /tutor, /validate-api-key, /health, /openapi.json, /docs, /redoc.
- Proxies /ws with ws: true to enable WebSocket upgrades for the signaling channel.
- changeOrigin: true so the Host header matches the target.

Notes
- Only applies in development when running react-scripts start.
- The StudentPublisher and WorksheetUpload components can also connect directly to :8000 for WebSocket and API during dev if needed; this proxy provides a same-origin alternative.



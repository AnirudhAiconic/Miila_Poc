const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = 'http://localhost:8000';

  const apiPaths = [
    '/auth',
    '/ask',
    '/analyze-worksheet',
    '/tutor',
    '/validate-api-key',
    '/health',
    '/openapi.json',
    '/docs',
    '/redoc',
  ];

  apiPaths.forEach((p) => {
    app.use(p, createProxyMiddleware({ target, changeOrigin: true }));
  });

  // WebSocket for signaling
  app.use('/ws', createProxyMiddleware({ target, changeOrigin: true, ws: true }));
};



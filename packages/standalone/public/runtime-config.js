// Local dev / non-chart-deploy fallback for /runtime-config.js. When deployed
// via kubernaut-operator or kubernaut's own Helm chart, their nginx
// ConfigMap serves an exact-match `location = /runtime-config.js` response
// templated from their own values, which nginx always prefers over a
// same-path static file -- this copy only takes effect for
// `vite dev`/`vite preview` and any other serving path that doesn't go
// through that chart-managed nginx config.
window.__KUBERNAUT_CONFIG__ = window.__KUBERNAUT_CONFIG__ || {
  enableRawThinking: true,
};

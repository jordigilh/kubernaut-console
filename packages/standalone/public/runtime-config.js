// Local dev / non-Helm-chart fallback for /runtime-config.js. When deployed
// via chart/, the nginx ConfigMap (templates/configmap-nginx.yaml) serves an
// exact-match `location = /runtime-config.js` response templated from
// values.yaml, which nginx always prefers over a same-path static file --
// this copy only takes effect for `vite dev`/`vite preview` and any other
// serving path that doesn't go through that chart-managed nginx config.
window.__KUBERNAUT_CONFIG__ = window.__KUBERNAUT_CONFIG__ || {
  enableRawThinking: true,
};

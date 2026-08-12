function applySecurityHeaders(res, requestId) {
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://js.stripe.com https://cdn.socket.io; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.razorpay.com https://*.stripe.com; connect-src 'self' https://*.razorpay.com https://*.stripe.com; frame-src https://api.razorpay.com https://checkout.razorpay.com https://checkout.stripe.com https://js.stripe.com; frame-ancestors 'none'"
  );
}

function applyCorsHeaders(req, res, url, { allowedOrigins, isProd }) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  return Boolean(origin && isProd && !allowedOrigins.has(origin) && url.pathname.startsWith('/api/'));
}

function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;
  res.writeHead(204);
  res.end();
  return true;
}

module.exports = { applySecurityHeaders, applyCorsHeaders, handleOptions };

const fs = require('fs');
const path = require('path');

function loadEnv(rootDir) {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    const quoted = (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"));
    if (process.env[key] === undefined) process.env[key] = quoted ? rawValue.slice(1, -1) : rawValue;
  }
}

function createAppConfig(rootDir) {
  const port = Number(process.env.PORT || 3000);
  const dataFile = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(rootDir, 'data.json');
  return {
    root: rootDir,
    publicDir: path.join(rootDir, 'public'),
    dataFile,
    mongodbUri: process.env.DATA_FILE ? '' : String(process.env.MONGODB_URI || '').trim(),
    port,
    isProd: process.env.NODE_ENV === 'production',
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'ridego-local-development-secret-change-me',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_ACCESS_SECRET || 'ridego-local-development-secret-change-me',
    clientUrl: process.env.CLIENT_URL,
    adminUrl: process.env.ADMIN_URL,
    razorpayKeyId: String(process.env.RAZORPAY_KEY_ID || '').trim(),
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET
  };
}

module.exports = { loadEnv, createAppConfig };

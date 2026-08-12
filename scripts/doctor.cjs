const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const required = [
  'server.cjs',
  'public/index.html',
  'public/app.js',
  'public/phase5.js',
  'public/phase6.js',
  'public/phase7.js',
  'public/sw.js',
  'public/manifest.json'
];

function pass(message) {
  console.log(`  ✓ ${message}`);
}

function fail(message) {
  console.error(`  ✗ ${message}`);
  process.exitCode = 1;
}

async function main() {
  console.log('\nRideGo system check\n');
  const major = Number(process.versions.node.split('.')[0]);
  major >= 18 ? pass(`Node.js ${process.version}`) : fail(`Node.js 18+ is required; found ${process.version}`);

  for (const file of required) {
    fs.existsSync(path.join(root, file)) ? pass(file) : fail(`Missing ${file}`);
  }
  if (process.exitCode) return;

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ridego-doctor-'));
  const dataFile = path.join(temporaryRoot, 'data.json');
  const port = 33000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['server.cjs'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_FILE: dataFile,
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: 'doctor-access-secret',
      JWT_REFRESH_SECRET: 'doctor-refresh-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let diagnostics = '';
  child.stdout.on('data', chunk => { diagnostics += chunk; });
  child.stderr.on('data', chunk => { diagnostics += chunk; });

  try {
    const base = `http://127.0.0.1:${port}`;
    let health;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        health = await fetch(`${base}/api/health`);
        if (health.ok) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    if (!health?.ok) throw new Error(`Server did not become healthy. ${diagnostics.trim()}`);
    const healthData = await health.json();
    healthData.ok ? pass('API health endpoint') : fail('API health endpoint returned an error');
    health.headers.get('x-request-id') ? pass('Request IDs and security headers') : fail('Security headers are missing');

    const page = await fetch(base);
    const html = await page.text();
    page.ok && html.includes('id="app"') ? pass('Customer/driver frontend') : fail('Frontend could not be served');

    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: 'customer@ridego.local', password: 'Customer@123' })
    });
    const session = await login.json();
    login.ok && session.token ? pass('Authentication and demo seed') : fail(session.error || 'Authentication failed');

    const config = await fetch(`${base}/api/config`);
    const configData = await config.json();
    config.ok && configData.categories?.length === 4 ? pass('Fare and vehicle configuration') : fail('Vehicle configuration failed');

    const testFiles = fs.readdirSync(path.join(root, 'tests')).filter(file => file.endsWith('.test.cjs')).map(file => path.join('tests', file));
    const tests = spawn(process.execPath, ['--test', ...testFiles], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let testOutput = '';
    tests.stdout.on('data', chunk => { testOutput += chunk; });
    tests.stderr.on('data', chunk => { testOutput += chunk; });
    const testCode = await new Promise(resolve => tests.on('exit', resolve));
    testCode === 0 ? pass('Automated acceptance tests') : fail(`Automated tests failed.\n${testOutput.trim()}`);
  } catch (error) {
    fail(error.message);
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    const resolvedTemp = path.resolve(temporaryRoot);
    if (resolvedTemp.startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }

  if (!process.exitCode) console.log('\nRideGo is ready. Run: node server.cjs\n');
}

main().catch(error => {
  fail(error.stack || error.message);
});

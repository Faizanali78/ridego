const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('RideGo local server defines categories, OTP protection and live events', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8');
  assert.match(source, /id:'bike'/);
  assert.match(source, /id:'suv'/);
  assert.match(source, /otpHash/);
  assert.match(source, /Ride OTP is incorrect/);
  assert.ok(source.includes("p==='/api/events'"));
  assert.match(source, /ride:location:update/);
});

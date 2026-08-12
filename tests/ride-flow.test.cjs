const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('customer request reaches a nearby driver and can be accepted', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ridego-test-'));
  const port = 32100 + Math.floor(Math.random() * 500);
  const server = spawn(process.execPath, ['server.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(temp, 'data.json') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => {
    server.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) break;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
    if (attempt === 39) throw new Error('Test server did not start');
  }

  const call = async (url, options = {}, token = '') => {
    const response = await fetch(base + url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    const data = await response.json();
    assert.equal(response.ok, true, data.error);
    return data;
  };
  const customer = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ identity: 'customer@ridego.local', password: 'Customer@123' }) });
  const driver = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ identity: 'driver@ridego.local', password: 'Driver@123' }) });
  const pickupLocation = { lat: 28.6139, lng: 77.209 };
  const destinationLocation = { lat: 28.623, lng: 77.219 };
  const fares = await call('/api/fares/estimate', { method: 'POST', body: JSON.stringify({ pickupLocation, destinationLocation }) }, customer.token);
  assert.ok(fares.options.find(option => option.id === 'bike').nearbyDrivers >= 1);
  const booking = await call('/api/rides', { method: 'POST', body: JSON.stringify({ category: 'bike', pickup: 'Connaught Place', destination: 'India Gate', pickupLocation, destinationLocation }) }, customer.token);
  assert.equal(booking.ride.status, 'searching');
  const requests = await call('/api/drivers/requests', {}, driver.token);
  assert.equal(requests.requests.length, 1);
  await call(`/api/rides/${booking.ride.id}/accept`, { method: 'POST', body: '{}' }, driver.token);
  const rides = await call('/api/rides', {}, customer.token);
  assert.equal(rides.rides[0].status, 'driver_assigned');
  assert.match(rides.rides[0].rideOtp, /^\d{4}$/);
  assert.equal('otpHash' in rides.rides[0], false);
  const prematureComplete = await fetch(`${base}/api/rides/${booking.ride.id}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driver.token}` },
    body: '{}'
  });
  assert.equal(prematureComplete.status, 409);
  await call('/api/drivers/location', { method: 'POST', body: JSON.stringify({ location: { lat: 28.617, lng: 77.213 }, heading: 45 }) }, driver.token);
  const tracking = await call(`/api/rides/${booking.ride.id}/tracking`, {}, customer.token);
  assert.deepEqual(tracking.driver.location, { lat: 28.617, lng: 77.213 });
  await call(`/api/rides/${booking.ride.id}/arriving`, { method: 'POST', body: '{}' }, driver.token);
  const arrivingRide = await call('/api/rides', {}, customer.token);
  assert.equal(arrivingRide.rides[0].status, 'driver_arriving');
  const earlyStart = await fetch(`${base}/api/rides/${booking.ride.id}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driver.token}` },
    body: JSON.stringify({ otp: rides.rides[0].rideOtp })
  });
  assert.equal(earlyStart.status, 409);
  await call(`/api/rides/${booking.ride.id}/arrive`, { method: 'POST', body: '{}' }, driver.token);
  const wrongOtp = await fetch(`${base}/api/rides/${booking.ride.id}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driver.token}` },
    body: JSON.stringify({ otp: '0000' })
  });
  assert.equal(wrongOtp.status, 400);
  await call(`/api/rides/${booking.ride.id}/start`, { method: 'POST', body: JSON.stringify({ otp: rides.rides[0].rideOtp }) }, driver.token);
  await call(`/api/rides/${booking.ride.id}/complete`, { method: 'POST', body: '{}' }, driver.token);
  const completed = await call('/api/rides', {}, customer.token);
  assert.equal(completed.rides[0].status, 'ride_completed');
  assert.equal('rideOtp' in completed.rides[0], false);

  const topup = await call('/api/wallets/topup', { method: 'POST', body: JSON.stringify({ amount: 100, idempotencyKey: 'topup_test_once' }) }, customer.token);
  const duplicateTopup = await call('/api/wallets/topup', { method: 'POST', body: JSON.stringify({ amount: 100, idempotencyKey: 'topup_test_once' }) }, customer.token);
  assert.equal(duplicateTopup.balance, topup.balance);

  const bookingTwo = await call('/api/rides', { method: 'POST', body: JSON.stringify({ category: 'bike', pickup: 'Connaught Place', destination: 'India Gate', pickupLocation, destinationLocation, paymentMethod: 'upi' }) }, customer.token);
  await call(`/api/rides/${bookingTwo.ride.id}/accept`, { method: 'POST', body: '{}' }, driver.token);
  const secondAssigned = await call('/api/rides', {}, customer.token);
  const secondRide = secondAssigned.rides.find(ride => ride.id === bookingTwo.ride.id);
  await call(`/api/rides/${secondRide.id}/arriving`, { method: 'POST', body: '{}' }, driver.token);
  await call(`/api/rides/${secondRide.id}/arrive`, { method: 'POST', body: '{}' }, driver.token);
  await call(`/api/rides/${secondRide.id}/start`, { method: 'POST', body: JSON.stringify({ otp: secondRide.rideOtp }) }, driver.token);
  await call(`/api/rides/${secondRide.id}/complete`, { method: 'POST', body: '{}' }, driver.token);
  const order = await call('/api/payments/orders', { method: 'POST', body: JSON.stringify({ rideId: secondRide.id, idempotencyKey: 'ride_payment_once' }) }, customer.token);
  const duplicateOrder = await call('/api/payments/orders', { method: 'POST', body: JSON.stringify({ rideId: secondRide.id, idempotencyKey: 'ride_payment_once' }) }, customer.token);
  assert.equal(duplicateOrder.order.orderId, order.order.orderId);
  const invalidPayment = await fetch(`${base}/api/payments/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
    body: JSON.stringify({ orderId: order.order.orderId, paymentId: order.testPayment.paymentId, signature: 'invalid' })
  });
  assert.equal(invalidPayment.status, 400);
  await call('/api/payments/verify', { method: 'POST', body: JSON.stringify({ orderId: order.order.orderId, paymentId: order.testPayment.paymentId, signature: order.testPayment.signature }) }, customer.token);
  const paidRides = await call('/api/rides', {}, customer.token);
  assert.equal(paidRides.rides.find(ride => ride.id === secondRide.id).paymentStatus, 'completed');

  const admin = await call('/api/auth/login', { method: 'POST', body: JSON.stringify({ identity: 'admin@ridego.local', password: 'Admin@123' }) });
  const walletBeforeWithdrawal = await call('/api/wallets', {}, driver.token);
  assert.ok(walletBeforeWithdrawal.transactions.some(t => t.reason === 'ride_earning' && t.rideId === booking.ride.id));
  const withdrawal = await call('/api/withdrawals', { method: 'POST', body: JSON.stringify({ amount: 500, method: 'upi', destination: 'driver@upi' }) }, driver.token);
  await call(`/api/admin/withdrawals/${withdrawal.withdrawal.id}/approve`, { method: 'POST', body: '{}' }, admin.token);
  const walletAfterWithdrawal = await call('/api/wallets', {}, driver.token);
  assert.equal(walletAfterWithdrawal.balance, walletBeforeWithdrawal.balance - 500);

  const unauthorizedAdmin = await fetch(`${base}/api/admin/customers`, { headers: { Authorization: `Bearer ${customer.token}` } });
  assert.equal(unauthorizedAdmin.status, 403);
  const customers = await call('/api/admin/customers?q=Aarav', {}, admin.token);
  assert.equal(customers.total, 1);
  const balanceBeforeAdjustment = customers.items[0].wallet;
  await call(`/api/admin/customers/${customer.user.id}/wallet`, { method: 'POST', body: JSON.stringify({ amount: 25, reason: 'Test service credit' }) }, admin.token);
  const customersAfterAdjustment = await call('/api/admin/customers?q=Aarav', {}, admin.token);
  assert.equal(customersAfterAdjustment.items[0].wallet, balanceBeforeAdjustment + 25);
  await call(`/api/admin/users/${customer.user.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'blocked', reason: 'Test block' }) }, admin.token);
  const blockedRequest = await fetch(`${base}/api/wallets`, { headers: { Authorization: `Bearer ${customer.token}` } });
  assert.equal(blockedRequest.status, 401);
  await call(`/api/admin/users/${customer.user.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'active' }) }, admin.token);

  await call('/api/admin/pricing', { method: 'POST', body: JSON.stringify({ categoryId: 'bike', base: 30, perKm: 9, perMin: 1.5, min: 40, enabled: true }) }, admin.token);
  const pricing = await call('/api/admin/pricing', {}, admin.token);
  assert.equal(pricing.categories.find(category => category.id === 'bike').base, 30);
  const coupon = await call('/api/admin/coupons', { method: 'POST', body: JSON.stringify({ code: 'ADMIN25', kind: 'fixed', value: 25, max: 25, min: 100, usageLimit: 50, active: true }) }, admin.token);
  assert.equal(coupon.coupon.code, 'ADMIN25');
  await call(`/api/admin/rides/${secondRide.id}/note`, { method: 'POST', body: JSON.stringify({ text: 'Payment reviewed by test admin' }) }, admin.token);
  const managedRides = await call(`/api/admin/rides?q=${secondRide.rideCode}`, {}, admin.token);
  assert.equal(managedRides.items[0].internalNotes.length, 1);

  const support = await call('/api/support', { method: 'POST', body: JSON.stringify({ category: 'payment', subject: 'Payment question', description: 'Please review the payment for my latest ride.' }) }, customer.token);
  await call(`/api/admin/support/${support.ticket.id}/reply`, { method: 'POST', body: JSON.stringify({ message: 'Payment has been reviewed.', status: 'resolved' }) }, admin.token);
  const tickets = await call('/api/support', {}, customer.token);
  assert.equal(tickets.tickets[0].status, 'resolved');
  assert.equal(tickets.tickets[0].messages[0].text, 'Payment has been reviewed.');

  await call('/api/ratings', { method: 'POST', body: JSON.stringify({ rideId: secondRide.id, rating: 5, tags: ['Safe driving'], review: 'Excellent ride' }) }, customer.token);
  await call('/api/ratings', { method: 'POST', body: JSON.stringify({ rideId: secondRide.id, rating: 4, tags: ['Polite customer'] }) }, driver.token);
  const driverRatings = await call('/api/ratings', {}, driver.token);
  assert.equal(driverRatings.ratings[0].rating, 5);
  const notifications = await call('/api/notifications', {}, customer.token);
  assert.ok(notifications.items.length >= 3);
  await call('/api/notifications/read', { method: 'POST', body: JSON.stringify({ all: true }) }, customer.token);
  const readNotifications = await call('/api/notifications', {}, customer.token);
  assert.equal(readNotifications.items.every(item => item.read), true);

  const incentive = await call('/api/admin/incentives', { method: 'POST', body: JSON.stringify({ name: 'Two ride test', description: 'Complete two rides', targetRides: 2, reward: 50, active: true }) }, admin.token);
  const incentives = await call('/api/incentives', {}, driver.token);
  assert.equal(incentives.incentives.find(item => item.id === incentive.incentive.id).completed, true);
  const claimed = await call(`/api/incentives/${incentive.incentive.id}/claim`, { method: 'POST', body: '{}' }, driver.token);
  assert.equal(claimed.balance, walletAfterWithdrawal.balance + 50);
  const zones = await call('/api/admin/zones', {}, admin.token);
  assert.ok(zones.zones.some(zone => zone.id === 'zone_delhi'));
  const outsideZone = await fetch(`${base}/api/rides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customer.token}` },
    body: JSON.stringify({ category: 'bike', pickup: 'Outside', destination: 'Outside', pickupLocation: { lat: 20, lng: 70 }, destinationLocation: { lat: 20.1, lng: 70.1 } })
  });
  assert.equal(outsideZone.status, 400);

  const sharedBooking = await call('/api/rides', { method: 'POST', body: JSON.stringify({ category: 'bike', pickup: 'Connaught Place', destination: 'India Gate', pickupLocation, destinationLocation }) }, customer.token);
  await call(`/api/rides/${sharedBooking.ride.id}/accept`, { method: 'POST', body: '{}' }, driver.token);
  const driverCancelled = await call(`/api/rides/${sharedBooking.ride.id}/cancel`, { method: 'POST', body: '{}' }, driver.token);
  assert.equal(driverCancelled.ride.status, 'cancelled_by_driver');
  const sharedBookingTwo = await call('/api/rides', { method: 'POST', body: JSON.stringify({ category: 'bike', pickup: 'Connaught Place', destination: 'India Gate', pickupLocation, destinationLocation }) }, customer.token);
  await call(`/api/rides/${sharedBookingTwo.ride.id}/accept`, { method: 'POST', body: '{}' }, driver.token);
  const contact = await call('/api/emergency-contacts', { method: 'POST', body: JSON.stringify({ name: 'Mother', relationship: 'Family', phone: '9111111111' }) }, customer.token);
  assert.equal(contact.contacts.length, 1);
  const share = await call(`/api/rides/${sharedBooking.ride.id}/share`, { method: 'POST', body: '{}' }, customer.token);
  const publicRide = await call(`/api/public/rides/share/${encodeURIComponent(share.token)}`);
  assert.equal(publicRide.ride.rideCode, sharedBooking.ride.rideCode);
  assert.equal('phone' in publicRide.driver, false);
  const sos = await call('/api/safety/sos', { method: 'POST', body: JSON.stringify({ rideId: sharedBookingTwo.ride.id, location: pickupLocation, message: 'Test emergency' }) }, customer.token);
  assert.equal(sos.incident.status, 'open');
  assert.equal(sos.incident.contactNotifications.length, 1);
  const adminNotifications = await call('/api/notifications', {}, admin.token);
  assert.ok(adminNotifications.items.some(item => item.type === 'sos'));
  await call(`/api/rides/${sharedBookingTwo.ride.id}/cancel`, { method: 'POST', body: '{}' }, customer.token);

  const cookieLogin = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'customer@ridego.local', password: 'Customer@123' })
  });
  assert.equal(cookieLogin.status, 200);
  const loginCookies = cookieLogin.headers.getSetCookie ? cookieLogin.headers.getSetCookie() : [cookieLogin.headers.get('set-cookie')];
  assert.ok(loginCookies.some(cookie => cookie.includes('ridego_refresh=') && cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict')));
  const oldCookieHeader = loginCookies.map(cookie => cookie.split(';')[0]).join('; ');
  const refresh = await fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: oldCookieHeader }, body: '{}' });
  assert.equal(refresh.status, 200);
  const refreshedBody = await refresh.json();
  assert.match(refreshedBody.token, /^[^.]+\.[^.]+\.[^.]+$/);
  const replay = await fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: oldCookieHeader }, body: '{}' });
  assert.equal(replay.status, 401);
  const securedHealth = await fetch(`${base}/api/health`, { headers: { Origin: base } });
  assert.ok(securedHealth.headers.get('x-request-id'));
  assert.match(securedHealth.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(securedHealth.headers.get('access-control-allow-origin'), base);

  const report = await fetch(`${base}/api/admin/reports/rides`, { headers: { Authorization: `Bearer ${admin.token}` } });
  assert.equal(report.status, 200);
  assert.match(report.headers.get('content-type'), /text\/csv/);
  assert.match(await report.text(), /Ride ID/);
});

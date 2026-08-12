const controllerGroups = [
  {
    name: 'authController',
    owns: ['/api/auth/register', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout', '/api/me']
  },
  {
    name: 'rideController',
    owns: ['/api/fares/estimate', '/api/rides', '/api/rides/:id/*', '/api/drivers/requests']
  },
  {
    name: 'driverController',
    owns: ['/api/drivers/online', '/api/drivers/location', '/api/drivers/earnings', '/api/incentives']
  },
  {
    name: 'paymentController',
    owns: ['/api/wallets', '/api/payments', '/api/withdrawals', '/api/admin/refunds']
  },
  {
    name: 'safetyController',
    owns: ['/api/safety/sos', '/api/emergency-contacts', '/api/rides/:id/share', '/api/public/rides/share/:token']
  },
  {
    name: 'supportController',
    owns: ['/api/support', '/api/admin/support/:id/reply', '/api/notifications', '/api/ratings']
  },
  {
    name: 'adminController',
    owns: ['/api/admin/*']
  }
];

module.exports = { controllerGroups };

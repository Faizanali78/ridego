const RIDE_CATEGORIES = [
  { id: 'bike', name: 'Bike', icon: '\uD83C\uDFCD\uFE0F', seats: 1, base: 25, perKm: 8, perMin: 1.2, min: 35, eta: 3, enabled: true },
  { id: 'economy', name: 'Economy', icon: '\uD83D\uDE95', seats: 4, base: 45, perKm: 12, perMin: 1.6, min: 65, eta: 5, enabled: true },
  { id: 'sedan', name: 'Sedan', icon: '\uD83D\uDE96', seats: 4, base: 70, perKm: 16, perMin: 2, min: 95, eta: 7, enabled: true },
  { id: 'suv', name: 'SUV', icon: '\uD83D\uDE99', seats: 6, base: 110, perKm: 22, perMin: 2.6, min: 145, eta: 9, enabled: true }
];

const MONGO_COLLECTIONS = [
  'users',
  'rides',
  'payments',
  'walletTransactions',
  'driverEarnings',
  'withdrawals',
  'refunds',
  'supportTickets',
  'adminLogs',
  'notifications',
  'ratings',
  'safetyIncidents',
  'refreshSessions',
  'serviceZones',
  'incentives',
  'categories',
  'coupons'
];

const ACTIVE_RIDE_STATUSES = ['driver_assigned', 'driver_arriving', 'driver_arrived', 'ride_started'];
const CUSTOMER_BLOCKING_RIDE_STATUSES = ['searching', ...ACTIVE_RIDE_STATUSES];
const DRIVER_BUSY_RIDE_STATUSES = ACTIVE_RIDE_STATUSES;
const SOS_RIDE_STATUSES = ACTIVE_RIDE_STATUSES;

const RIDE_STATE_MACHINE = {
  searching: ['driver_assigned', 'cancelled_by_customer', 'no_driver_found'],
  driver_assigned: ['driver_arriving', 'cancelled_by_customer', 'cancelled_by_driver', 'cancelled_by_admin'],
  driver_arriving: ['driver_arrived', 'cancelled_by_customer', 'cancelled_by_driver', 'cancelled_by_admin'],
  driver_arrived: ['ride_started', 'cancelled_by_customer', 'cancelled_by_driver', 'cancelled_by_admin'],
  ride_started: ['ride_completed']
};

module.exports = {
  RIDE_CATEGORIES,
  MONGO_COLLECTIONS,
  ACTIVE_RIDE_STATUSES,
  CUSTOMER_BLOCKING_RIDE_STATUSES,
  DRIVER_BUSY_RIDE_STATUSES,
  SOS_RIDE_STATUSES,
  RIDE_STATE_MACHINE
};

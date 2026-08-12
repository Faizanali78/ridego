# RideGo API reference

All JSON endpoints return an appropriate HTTP status and either a response object or `{ "error": "message" }`. Protected routes accept the access token in `Authorization: Bearer <token>` or the secure `ridego_access` cookie. Browser sessions use rotating HttpOnly refresh cookies.

## Authentication and configuration

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Register a customer or driver |
| POST | `/api/auth/login` | Public | Password login and secure cookie issue |
| POST | `/api/auth/refresh` | Refresh cookie | Rotate the refresh session |
| POST | `/api/auth/logout` | Public | Revoke refresh session and clear cookies |
| GET | `/api/me` | Signed in | Current safe profile |
| GET | `/api/config` | Public | Categories, fare settings and offers |
| GET | `/api/health` | Public | Deployment health check |
| GET | `/api/events` | Signed in | Authenticated live event stream |

## Rides and drivers

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/fares/estimate` | Customer | Server-calculated category fares |
| POST | `/api/rides` | Customer | Create nearby-driver request |
| GET | `/api/rides` | Signed in | Role-filtered ride history |
| GET | `/api/rides/:id/tracking` | Ride participant/admin | Live tracking state |
| POST | `/api/rides/:id/accept` | Eligible driver | Accept a pending request |
| POST | `/api/rides/:id/reject` | Eligible driver | Reject a pending request |
| POST | `/api/rides/:id/arriving` | Assigned driver | Mark driver as heading to pickup |
| POST | `/api/rides/:id/arrive` | Assigned driver | Mark pickup arrival |
| POST | `/api/rides/:id/start` | Assigned driver | Verify OTP and start |
| POST | `/api/rides/:id/complete` | Assigned driver | Complete and calculate earnings |
| POST | `/api/rides/:id/cancel` | Ride participant/admin | Cancel an eligible ride |
| GET | `/api/drivers/requests` | Driver | Pending nearby requests |
| POST | `/api/drivers/online` | Driver | Set availability |
| POST | `/api/drivers/location` | Driver | Publish a live location |

Ride state changes are validated as a strict state machine:

```text
searching -> driver_assigned -> driver_arriving -> driver_arrived -> ride_started -> ride_completed
```

Cancellation creates role-specific terminal states such as `cancelled_by_customer`, `cancelled_by_driver`, or `cancelled_by_admin`. Invalid jumps like `searching -> ride_completed` are rejected by the backend.

## Socket.IO realtime tracking

The backend also exposes Socket.IO on the same server. Browser clients load `/socket.io/socket.io.js` and connect with the access token:

```js
const socket = io({ auth: { token } });
```

Drivers can stream live coordinates for their assigned ride:

```js
socket.emit('driverLocation', {
  rideId,
  latitude: 28.6139,
  longitude: 77.2090
});
```

Customers tracking that ride receive:

```js
socket.on('driverLocationUpdated', data => {
  updateDriverMarker(data.location);
});
```

Driver matching filters approved, online, same-category drivers who are not already on an active ride, calculates distance from the pickup, limits results to `settings.searchRadius` km, and sorts nearest first. Driver locations are stored with `lat/lng`, `latitude/longitude`, and a GeoJSON `locationGeo` point so MongoDB deployments can add:

```js
db.users.createIndex({ locationGeo: '2dsphere' });
```

Ride accept uses a conditional MongoDB `findOneAndUpdate` in Mongo mode so only one driver can claim a searching ride.

## Money

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/wallets` | Signed in | Balance and transaction history |
| POST | `/api/wallets/topup` | Customer | Offline test wallet top-up |
| GET | `/api/payments` | Customer/admin | Payment history |
| POST | `/api/payments/orders` | Customer | Create server-authoritative order |
| POST | `/api/payments/verify` | Customer | Verify provider signature |
| POST | `/api/payments/wallet` | Customer | Pay completed ride from wallet |
| GET | `/api/drivers/earnings` | Driver | Gross, commission and net earnings |
| GET/POST | `/api/withdrawals` | Driver/admin | List or request payouts |

Payments are never captured from a client-side boolean. UPI/card-style payments require a server order and signature verification before `paymentStatus` becomes `completed`. If `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are configured, `/api/payments/orders` creates a Razorpay order and the frontend opens Razorpay Checkout; otherwise the local signed gateway is used for offline demos/tests. Wallet changes are stored as a ledger in `walletTransactions` with `credit`/`debit`, amount, reason, reference, optional `rideId`, balance-after, and timestamp. Driver ride earnings are stored separately in `driverEarnings` with ride fare, platform fee, and net driver earning.

Withdrawals enforce `settings.minWithdrawal` (`₹500` by default), daily limits, bank/UPI destination details, pending-balance checks, and terminal `completed` / `rejected` states.

## Safety, support and engagement

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET/POST | `/api/support` | Signed in | List or raise support tickets |
| GET/POST | `/api/ratings` | Signed in | Received ratings or rate a ride |
| GET | `/api/notifications` | Signed in | Notification inbox |
| POST | `/api/notifications/read` | Signed in | Mark notifications read |
| POST | `/api/safety/sos` | Ride participant | Create emergency incident |
| POST | `/api/rides/:id/share` | Customer | Create six-hour share token |
| GET | `/api/public/rides/share/:token` | Public token | Privacy-limited ride state |
| GET/POST | `/api/emergency-contacts` | Customer | List or save trusted SOS contacts |
| GET | `/api/incentives` | Driver | Incentive progress |
| POST | `/api/incentives/:id/claim` | Driver | One-time reward claim |
| GET | `/api/service-zones` | Public | Active GeoJSON zones |

SOS incidents capture ride, customer, driver, location, timestamp, triggering user, and queued emergency-contact notifications. Admin dashboard responses include `activeSos` for operations visibility.

## Administration

Admin endpoints cover dashboard metrics, customers, drivers, rides, pricing, coupons, zones, incentives, support, payments, refunds, withdrawals, audit logs and CSV reports. The main collections are:

- `GET /api/admin/customers`, `/api/admin/drivers`, `/api/admin/rides`
- `GET|POST /api/admin/pricing`, `/api/admin/coupons`, `/api/admin/zones`, `/api/admin/incentives`
- `POST /api/admin/users/:id/status`, `/api/admin/customers/:id/wallet`, `/api/admin/rides/:id/note`
- `POST /api/admin/support/:id/reply`, `/api/admin/refunds`, `/api/admin/withdrawals/:id/:action`
- `GET /api/admin/logs`, `/api/admin/reports/:type`

List routes support `page`, `limit`, `q`, and relevant `status` or `category` query parameters. CSV report types are `rides`, `customers`, `drivers`, `payments`, `withdrawals`, and `support`.

`GET /api/admin/dashboard` includes metrics for total users, active drivers, today rides/revenue, completed/cancelled rides, average fare, average rating, cancellation rate, category distribution, seven-day rides/revenue series, driver verification counts, and active SOS incidents.

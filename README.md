# RideGo

RideGo is a working full-stack ride-booking starter with a responsive single-page web app. By default it persists to a local MongoDB database; `DATA_FILE` can be set for an isolated JSON-backed test or offline run.

## Run locally

1. Install Node.js 18+ and run a local MongoDB server.
2. Run `npm install` once, then set `MONGODB_URI=mongodb://127.0.0.1:27017/ridego` in `.env`.
3. In this folder, run `node server.cjs` and open `http://localhost:3000`.

On Windows, you can also double-click `start-ridego.cmd`. The launcher automatically selects the next free port if port 3000 is occupied and displays the correct URL. Double-click `check-ridego.cmd` for a clean diagnostic and acceptance-test run. RideGo reads a local `.env` automatically without needing the `dotenv` package.

On first MongoDB startup, the server imports the existing `data.json` seed data into the database named by `MONGODB_URI`. `data.json` remains available only when `DATA_FILE` is explicitly set, which keeps automated tests isolated.

Demo accounts:

- Customer: `customer@ridego.local` / `Customer@123`
- Driver: `driver@ridego.local` / `Driver@123`
- Admin: `admin@ridego.local` / `Admin@123`

## Included working flows

- Customer/driver registration, signed-token login, role-based access and login rate limiting.
- Browser geolocation, coordinate-based distance estimates, configurable search radius and distance-sorted nearby-driver matching.
- Fare estimation with configurable categories, fee, tax, surge and coupon validation.
- Booking requests with 45-second expiry, driver accept/reject, first-acceptance protection, securely encrypted-and-hashed ride OTP, arrival, start, completion, cancellation and a status timeline.
- Authenticated server-sent live events with automatic browser reconnection for requests, assignment, arrival, location, start, completion and cancellation.
- Dedicated customer/driver live ride screen with moving driver marker, remaining distance, ETA, call action and status controls.
- Driver online/offline, incoming-request screen and continuous five-second browser location updates; driver earnings on completion.
- OTP attempt limits and enforced ride-state transitions prevent skipping arrival or starting/completing a ride out of order.
- Server-authoritative ride payments, signed order verification, retry-safe idempotency and duplicate-payment protection.
- Customer wallet top-ups, wallet ride payments, credit/debit history and admin refund credits.
- Ride-wise driver gross fare, platform commission and net earnings accounting.
- Driver withdrawal limits, reserved pending balances, admin approval/rejection and payout references.
- Full admin operations workspace for searchable/paginated customers, driver verification, rides, payments, payouts, pricing, coupons and support.
- Customer block/suspend controls, admin wallet adjustments, internal ride notes and account-state enforcement on every authenticated request.
- Editable server-side vehicle pricing and global fare rules, usage-limited coupons and immediate customer fare updates.
- Support ticket replies/statuses, persistent admin activity logs and authenticated CSV exports for six report types.
- Persistent notification inboxes and live alerts for ride, payment, refund, support, rating and emergency events.
- Customer/driver ratings with tags, duplicate prevention and recalculated averages.
- SOS incidents, customer-only expiring share links and a privacy-limited public tracking page.
- GeoJSON service zones enforced during booking, plus admin zone creation.
- Driver incentive progress and one-time wallet reward claims.
- Installable PWA metadata, offline asset caching and automatic service-worker updates.
- Fifteen-minute access tokens, rotating 30-day refresh sessions, replay revocation and secure HttpOnly SameSite cookies.
- Exact-origin production CORS, request IDs, CSP/permissions headers and graceful shutdown handling.
- Admin operations dashboard, driver approval/rejection and commission setting.
- Mobile-first customer, driver and admin views plus a PWA manifest.

## API map

In addition to the authentication, ride and live tracking routes, finance endpoints are available at `GET /api/wallets`, `POST /api/wallets/topup`, `GET /api/payments`, `POST /api/payments/orders`, `POST /api/payments/verify`, `POST /api/payments/wallet`, `GET /api/drivers/earnings`, `GET|POST /api/withdrawals`, `POST /api/admin/withdrawals/:id/:action`, and `POST /api/admin/refunds`.

The offline build uses a local HMAC-signed test payment provider so the complete order and verification flow works without internet access. When Stripe credentials are configured, `/api/payments/orders` creates a Stripe Checkout Session and the app verifies the returned session with Stripe before marking the ride paid. Razorpay credentials remain supported as a fallback. Fare and payment amounts remain server-controlled.

Admin management APIs live under `/api/admin/customers`, `/api/admin/drivers`, `/api/admin/rides`, `/api/admin/pricing`, `/api/admin/coupons`, `/api/admin/logs`, `/api/admin/reports/:type`, `/api/admin/users/:id/status`, and `/api/admin/support/:id/reply`. List endpoints use `page`, `limit`, `q`, and relevant status/category filters.

Final feature APIs include `/api/notifications`, `/api/ratings`, `/api/safety/sos`, `/api/rides/:id/share`, `/api/public/rides/share/:token`, `/api/incentives`, `/api/service-zones`, `/api/admin/zones`, and `/api/admin/incentives`.

See `DEPLOYMENT.md` for Render, Vercel, MongoDB Atlas, Google Maps, Stripe/Razorpay, Cloudinary, email and SMS setup. The application runs fully offline as a demonstration, but the local JSON repository and signed test-payment provider must be replaced before handling real users or money.

See `API.md` for the complete route and authorization reference.

## Production migration

For an internet-enabled production deployment, keep the API contracts and replace `data.json` with MongoDB/Mongoose collections (including `2dsphere` driver locations), add Socket.IO rooms for live tracking, and connect the credentials in `.env.example` to Google Maps, Stripe, Cloudinary, email and SMS providers. Put secrets in Render/Vercel environment settings, use HTTPS + secure HttpOnly refresh cookies, and use a managed database; never use the local JSON store for production.

# RideGo deployment guide

## Recommended Render deployment

Deploy the complete application to Render from this repository. `render.yaml` installs Node dependencies, runs syntax validation, starts the app with `npm start`, and checks `/api/health`.

1. Push the project to a Git repository.
2. In Render, choose **New Blueprint** and select the repository.
3. Render will read `render.yaml`; for a manual web service use build command `npm install && node --check server.cjs` and start command `npm start`.
4. Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to long random values, then add provider credentials from `.env.example`.
5. Set `CLIENT_URL` and `ADMIN_URL` to the exact HTTPS origins that may call the API.
6. Set `MONGODB_URI` for persistent data. Razorpay variables are optional until real payments are enabled.
7. Deploy and verify `/api/health`.

The bundled JSON repository is appropriate for demonstrations and local development. Render's free filesystem can be replaced at any time, so it must not hold production accounts or payments. For persistent production use, replace the repository calls with MongoDB Atlas collections and transactions before accepting real users.

## Vercel frontend

`vercel.json` publishes the `public` PWA as a static frontend. The current install-free build intentionally uses same-origin `/api` calls, so the fully working application should remain on Render unless a production API base URL is added to the frontend. When splitting deployments:

1. Deploy the API to Render.
2. Add a runtime API base setting to the frontend.
3. Allow only the exact Vercel and admin origins in backend CORS.
4. Deploy `public` to Vercel.

## MongoDB Atlas migration

Create a database user with least-privilege access, allow Render's outbound network, and set `MONGODB_URI`. Move each array collection in `data.json` to its corresponding Mongoose model. Use a `2dsphere` index for driver locations and service-zone geometry, unique indexes for ride/payment IDs, and transactions for wallet, payment, refund, incentive and withdrawal mutations.

## Google Maps

Enable Maps JavaScript, Places, Routes, Geocoding and Distance Matrix APIs. Restrict `GOOGLE_MAPS_API_KEY` to the deployed frontend origins. Replace the install-free visual map with the Google Maps adapter while keeping the existing coordinate API contract.

## Razorpay

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Replace local signed order creation with Razorpay Orders, pass the returned order to Checkout, and send its payment ID and signature to `/api/payments/verify`. Configure the webhook URL on HTTPS and preserve the existing idempotency keys and server-authoritative amount checks.

## Cloudinary, email and SMS

Set the Cloudinary variables for driver documents and avatars. Restrict upload formats and size, use signed uploads, and never return document URLs to unrelated users. Configure SMTP and Twilio variables for verification, receipts and ride alerts. OTP hashes and attempt limits should remain server-side.

## Production checklist

- Replace JSON storage with MongoDB Atlas and transactional repositories.
- Keep the built-in secure HttpOnly access/refresh cookies and refresh replay protection enabled; add CSRF tokens if the frontend and API are split across origins.
- Restrict CORS instead of the local wildcard.
- Add Razorpay webhook verification and provider-side refunds.
- Store uploads in Cloudinary with signed access.
- Add Google Maps key/domain restrictions.
- Put the application behind HTTPS and a managed rate limiter.
- Configure backups, structured logs, monitoring and emergency-response procedures.
- Run `node --test tests/*.test.cjs` before each deployment.

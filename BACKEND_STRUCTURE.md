# RideGo backend structure

RideGo now uses a controller/model/middleware-oriented backend layout while keeping `server.cjs` as the executable entry point.

## Entry point

- `server.cjs` starts the HTTP server, Socket.IO server, persistence, and route dispatcher.

## Config

- `config/env.cjs`
  - Loads `.env`
  - Builds app config such as port, MongoDB URI, JWT secrets, Razorpay keys, and public/data paths

## Models

- `models/domainModels.cjs`
  - Ride categories
  - Mongo collection names
  - Ride status groups
  - Ride state-machine constants

These model constants are imported by `server.cjs` so ride matching, active ride checks, Mongo persistence, and pricing categories are no longer hardcoded only inside the entry file.

## Middleware

- `middleware/httpMiddleware.cjs`
  - Security headers
  - Razorpay-compatible CSP
  - CORS
  - OPTIONS/preflight handling

`server.cjs` calls these middleware helpers before API/static routing.

## Controllers

- `controllers/index.cjs`
  - Documents controller ownership for route groups:
    - `authController`
    - `rideController`
    - `driverController`
    - `paymentController`
    - `safetyController`
    - `supportController`
    - `adminController`

The current server still dispatches routes from `server.cjs` for stability, but the route groups are now mapped and exposed at:

```text
GET /api/controllers
```

This gives a clean next step: move each route group from `server.cjs` into its matching controller file one by one without changing the public API.

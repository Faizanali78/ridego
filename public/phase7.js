function professionalRideIcon(id) {
  const icons = {
    bike: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="12" cy="34" r="7"/><circle cx="36" cy="34" r="7"/><path d="M12 34l8-15h8l8 15M18 23h14M22 19l-3-5h-5M25 34l-8-10"/></svg>',
    economy: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 31v-8l5-10h22l5 10v8"/><path d="M7 27h34v8H7z"/><circle cx="13" cy="36" r="4"/><circle cx="35" cy="36" r="4"/><path d="M14 17h20l3 7H11z"/></svg>',
    sedan: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 31v-7l7-4 6-8h13l7 9 4 3v7"/><path d="M7 27h35v7H7z"/><circle cx="13" cy="35" r="4"/><circle cx="36" cy="35" r="4"/><path d="M19 16h12l4 6H15z"/></svg>',
    suv: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 31V17h8l4-6h17l7 8 2 12"/><path d="M6 26h37v8H6z"/><circle cx="13" cy="35" r="4"/><circle cx="36" cy="35" r="4"/><path d="M17 16h17l4 6H13z"/></svg>'
  };
  return icons[id] || icons.economy;
}

window.nav = function () {
  const accountLabel = state.user?.role === 'admin' ? 'Admin console' : state.user?.role === 'driver' ? 'Driver hub' : 'Account';
  const roleLinks = state.user?.role === 'customer'
    ? `<button onclick="go('rides')">My rides</button><button onclick="safetyPage()">Safety</button><button onclick="supportPage()">Support</button>`
    : state.user?.role === 'driver'
      ? `<button onclick="go('rides')">Requests</button><button onclick="incentivesPage()">Incentives</button><button onclick="supportPage()">Support</button>`
      : state.user?.role === 'admin'
        ? `<button onclick="go('dashboard')">Operations</button>`
        : '';
  return `<header class="pro-nav"><div class="nav-inner"><button class="pro-brand" onclick="go('home')" aria-label="RideGo home"><span class="brand-emblem">R</span><span>Ride<span>Go</span></span></button><div class="nav-location"><span class="location-pulse"></span><div><small>Service area</small><b>Delhi NCR</b></div></div><nav class="nav-links">${state.user ? `${roleLinks}<button class="alert-link" onclick="notificationsPage()">Alerts</button><button class="account-link" onclick="go('dashboard')"><span class="account-avatar">${escapeHtml(state.user.name?.charAt(0) || 'U')}</span>${escapeHtml(accountLabel)}</button><button class="nav-signout" onclick="logout()">Sign out</button>` : `<button onclick="document.querySelector('.how-section')?.scrollIntoView({behavior:'smooth'})">How it works</button><button onclick="go('login')">Log in</button><button class="nav-cta" onclick="go('register')">Get started</button>`}</nav></div></header>`;
};

window.home = function () {
  const b = state.booking;
  layout(`<div class="pro-home">
    <section class="pro-hero">
      <div class="hero-content">
        <div class="hero-badge"><span></span> Trusted rides across your city</div>
        <h1>Your city.<br><em>Your ride.</em><br>On your terms.</h1>
        <p class="hero-lead">From quick bike trips to spacious family rides, move around the city with verified drivers, transparent fares and live safety features.</p>
        <div class="hero-proof">
          <div class="proof-faces"><span>AS</span><span>RV</span><span>PS</span><span>+2k</span></div>
          <div><b>4.9 out of 5</b><small>from happy RideGo customers</small></div>
        </div>
      </div>
      <div class="hero-visual" aria-label="Live RideGo route preview">
        <div class="visual-grid"></div>
        <svg class="visual-route" viewBox="0 0 520 520" aria-hidden="true"><path d="M98 397C149 330 123 259 213 237C302 215 288 114 411 98"/><path class="route-progress" d="M98 397C149 330 123 259 213 237C302 215 288 114 411 98"/></svg>
        <span class="visual-marker pickup-marker"><i></i><b>Pickup</b><small>${escapeHtml(b.pickup)}</small></span>
        <span class="visual-marker destination-marker"><i></i><b>Destination</b><small>${escapeHtml(b.destination)}</small></span>
        <div class="moving-car">${professionalRideIcon('economy')}</div>
        <div class="driver-float"><span class="driver-photo">RV</span><div><small>Your driver</small><b>Rahul · 4.9 ★</b></div><span class="verified-check">✓</span></div>
        <div class="eta-float"><span>Arriving in</span><b>3 min</b></div>
        <div class="visual-shape one"></div><div class="visual-shape two"></div>
      </div>
      <div class="pro-booking card">
        <div class="booking-head"><div><span class="booking-kicker">BOOK A RIDE</span><h2>Where are you headed?</h2></div><button class="locate-button" onclick="useMyLocation()" title="Use current location"><span>⌖</span> Locate me</button></div>
        <div class="route-inputs">
          <div class="route-guide"><span></span><i></i><span></span></div>
          <label><small>PICKUP LOCATION</small><input id="pickup" value="${escapeHtml(b.pickup)}" aria-label="Pickup location"></label>
          <button class="swap-button" onclick="swapRideLocations()" title="Swap pickup and destination">⇅</button>
          <label><small>DESTINATION</small><input id="destination" value="${escapeHtml(b.destination)}" aria-label="Destination"></label>
        </div>
        <div class="booking-options">
          <label><small>ESTIMATED DISTANCE</small><span class="option-input"><b>↗</b><input id="distance" type="number" value="${b.distance}" min="1"><i>km</i></span></label>
          <label><small>PAYMENT METHOD</small><span class="option-input"><b>₹</b><select id="payment"><option value="cash" ${b.paymentMethod === 'cash' ? 'selected' : ''}>Cash</option><option value="upi" ${b.paymentMethod === 'upi' ? 'selected' : ''}>UPI / Card</option><option value="wallet" ${b.paymentMethod === 'wallet' ? 'selected' : ''}>RideGo Wallet</option></select></span></label>
          <button class="search-rides" onclick="getFares()"><span>Find a ride</span><i>→</i></button>
        </div>
        <div class="booking-meta"><span><i>✓</i> No hidden charges</span><span><i>✓</i> Free cancellation before acceptance</span></div>
      </div>
    </section>
    <section class="trust-strip">
      <div><b>50K+</b><span>rides completed</span></div><i></i>
      <div><b>2,000+</b><span>verified drivers</span></div><i></i>
      <div><b>24 × 7</b><span>safety support</span></div><i></i>
      <div><b>4.9 ★</b><span>average rating</span></div>
    </section>
    ${state.options.length ? fareCards() : `<section class="ride-range"><div class="section-heading"><div><span class="section-label">RIDE YOUR WAY</span><h2>One app. Every kind of journey.</h2></div><p>Pick the ride that fits your moment—from beating traffic alone to travelling together.</p></div><div class="range-grid">${[
      ['bike','Bike','Beat the traffic','From ₹35'],
      ['economy','Economy','Smart everyday rides','From ₹65'],
      ['sedan','Sedan','A little more comfort','From ₹95'],
      ['suv','SUV','Space for everyone','From ₹145']
    ].map(([id,name,copy,price])=>`<button class="range-card" onclick="quickChoose('${id}')"><span class="range-icon">${professionalRideIcon(id)}</span><span class="range-copy"><b>${name}</b><small>${copy}</small></span><span class="range-price">${price}<i>→</i></span></button>`).join('')}</div></section>`}
    <section class="popular-section">
      <div class="section-heading compact"><div><span class="section-label">POPULAR NEAR YOU</span><h2>Frequent routes, ready to go</h2></div></div>
      <div class="popular-grid">
        ${[['Airport drop','IGI Airport, New Delhi',16,'AIR'],['Evening outing','Hauz Khas Village',9,'HK'],['Office commute','Cyber City, Gurugram',22,'CC']].map(([tag,name,km,mark])=>`<button class="popular-card" onclick="pickPopular('${name}',${km})"><span class="place-mark">${mark}</span><span><small>${tag}</small><b>${name}</b><i>${km} km away</i></span><strong>→</strong></button>`).join('')}
      </div>
    </section>
    <section class="how-section">
      <div class="how-copy"><span class="section-label">SIMPLE BY DESIGN</span><h2>From here to there<br>in three easy steps.</h2><p>No confusing choices or surprise costs. RideGo keeps every part of your journey clear.</p><button class="text-action" onclick="document.querySelector('.pro-booking')?.scrollIntoView({behavior:'smooth'})">Book your first ride <span>→</span></button></div>
      <div class="steps-list">
        <article><span>01</span><div><b>Set your route</b><p>Choose pickup and destination, or use your live location.</p></div></article>
        <article><span>02</span><div><b>Choose your ride</b><p>Compare transparent fares, arrival times and vehicle options.</p></div></article>
        <article><span>03</span><div><b>Track every moment</b><p>Meet your verified driver and follow the trip live with safety tools.</p></div></article>
      </div>
    </section>
    <section class="safety-banner">
      <div class="safety-art"><span class="shield-ring">✓</span><i class="orbit one"></i><i class="orbit two"></i></div>
      <div><span class="section-label light">SAFETY, BUILT IN</span><h2>Someone has your back<br>on every ride.</h2><p>Ride OTP, verified driver profiles, live sharing and a 24 × 7 SOS response are included—not added extras.</p><div class="safety-points"><span>Verified drivers</span><span>Live ride sharing</span><span>Emergency SOS</span></div></div>
      <button onclick="${state.user?.role === 'customer' ? 'safetyPage()' : "go('register')"}">Explore safety <span>→</span></button>
    </section>
    <footer class="pro-footer"><button class="pro-brand" onclick="go('home')"><span class="brand-emblem">R</span><span>Ride<span>Go</span></span></button><p>Move freely. Ride safely.</p><span>© ${new Date().getFullYear()} RideGo</span></footer>
  </div>`);
};

window.fareCards = function () {
  const selected = state.options[0];
  return `<section class="fare-results" id="fare-results"><div class="section-heading compact"><div><span class="section-label">AVAILABLE NOW</span><h2>Choose your ride</h2></div><p>${selected.distance} km · about ${selected.minutes} min</p></div><div class="professional-choices">${state.options.map((option, index) => `<button class="professional-ride ${index === 0 ? 'selected' : ''}" onclick="choose('${option.id}')"><span class="professional-icon">${professionalRideIcon(option.id)}</span><span class="professional-info"><b>${escapeHtml(option.name)}</b><small>${option.seats} ${option.seats === 1 ? 'seat' : 'seats'} · ${option.eta} min pickup</small><i><span></span>${option.nearbyDrivers} nearby</i></span><span class="professional-fare"><b>${money(option.fare)}</b><small>estimated</small></span><span class="choice-check">${index === 0 ? '✓' : ''}</span></button>`).join('')}</div><div class="confirm-panel card"><div><label>COUPON CODE</label><span><input id="coupon" placeholder="Try WELCOME50"><button onclick="toast('Coupon will be checked when you request the ride.')">Apply</button></span></div><div class="confirm-summary"><small>Your selection</small><b>${professionalRideIcon(selected.id)} ${escapeHtml(selected.name)} <span>${money(selected.fare)}</span></b></div><button class="confirm-ride" onclick="bookRide()">Request ${escapeHtml(selected.name)} <span>→</span></button></div></section>`;
};

window.swapRideLocations = function () {
  rememberBooking();
  [state.booking.pickup, state.booking.destination] = [state.booking.destination, state.booking.pickup];
  [state.pickupLocation, state.destinationLocation] = [state.destinationLocation, state.pickupLocation];
  state.options = [];
  home();
};

window.pickPopular = function (destination, distance) {
  rememberBooking();
  state.booking.destination = destination;
  state.booking.distance = distance;
  state.destinationLocation = { lat: state.pickupLocation.lat + distance / 111, lng: state.pickupLocation.lng + distance / 180 };
  state.options = [];
  home();
  setTimeout(() => document.querySelector('.pro-booking')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
};

window.quickChoose = async function (categoryId) {
  if (!state.user) {
    go('login');
    return toast('Sign in to see live fares.');
  }
  if (state.user.role !== 'customer') return toast('Use a customer account to book rides.', true);
  rememberBooking();
  try {
    const data = await api('/api/fares/estimate', { method: 'POST', body: JSON.stringify({ distance: state.booking.distance, pickupLocation: state.pickupLocation, destinationLocation: state.destinationLocation }) });
    state.options = data.options.sort((a, b) => a.id === categoryId ? -1 : b.id === categoryId ? 1 : 0);
    home();
    setTimeout(() => document.querySelector('#fare-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  } catch (error) {
    toast(error.message, true);
  }
};

window.authPage = function (register = false) {
  layout(`<section class="professional-auth"><div class="auth-story"><span class="hero-badge"><span></span> MOVE WITH CONFIDENCE</span><h1>${register ? 'Create your account and start moving.' : 'Welcome back to RideGo.'}</h1><p>${register ? 'Book safer rides or join our verified driver network in a few simple steps.' : 'Your rides, payments and live safety tools are ready when you are.'}</p><div class="auth-benefits"><span><i>✓</i> Verified drivers</span><span><i>✓</i> Transparent fares</span><span><i>✓</i> Live ride tracking</span></div></div><div class="auth-panel card"><span class="booking-kicker">${register ? 'JOIN RIDEGO' : 'SECURE SIGN IN'}</span><h2>${register ? 'Create your account' : 'Welcome back'}</h2><p class="muted">${register ? 'Choose how you want to use RideGo.' : 'Use your details or choose a verified demo account.'}</p>${!register ? `<div class="demo-login"><small>ONE-CLICK DEMO LOGIN</small><div><button type="button" onclick="demoLogin('customer')"><span>AS</span><b>Customer</b><i>Book a ride</i></button><button type="button" onclick="demoLogin('driver')"><span>RV</span><b>Driver</b><i>Accept rides</i></button><button type="button" onclick="demoLogin('admin')"><span>RG</span><b>Admin</b><i>Manage platform</i></button></div></div><div class="auth-divider"><span>or use your credentials</span></div>` : ''}<form class="form-grid professional-auth-form" onsubmit="submitAuth(event,${register})">${register ? `<div class="field"><label>FULL NAME</label><input name="name" autocomplete="name" required></div><div class="field"><label>I WANT TO</label><select name="role"><option value="customer">Book rides as a customer</option><option value="driver">Drive with RideGo</option></select></div><div class="field"><label>PHONE NUMBER</label><input name="phone" autocomplete="tel" required pattern="[0-9]{10}"></div><div class="field"><label>DRIVING LICENCE</label><input name="drivingLicence" placeholder="For driver applications"></div><div class="field"><label>VEHICLE NUMBER</label><input name="vehicleNumber" placeholder="DL 01 AB 1234"></div><div class="field"><label>VEHICLE TYPE</label><select name="vehicleType"><option value="bike">Bike</option><option value="economy">Economy</option><option value="sedan">Sedan</option><option value="suv">SUV</option></select></div><div class="field"><label>RC NUMBER</label><input name="rcNumber" placeholder="Vehicle RC reference"></div>` : ''}<div class="field"><label>${register ? 'EMAIL ADDRESS' : 'EMAIL OR PHONE'}</label><input name="identity" type="text" autocomplete="username" required></div><div class="field password-field"><label>PASSWORD</label><input id="auth-password" name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="8"><button type="button" onclick="togglePassword()">Show</button></div><button class="search-rides auth-submit" type="submit"><span>${register ? 'Create account' : 'Sign in securely'}</span><i>→</i></button></form><p class="auth-switch">${register ? 'Already have an account?' : 'New to RideGo?'} <button onclick="go('${register ? 'login' : 'register'}')">${register ? 'Sign in' : 'Create account'}</button></p></div></section>`);
};

window.demoLogin = async function (role) {
  const accounts = {
    customer: { identity: 'customer@ridego.local', password: 'Customer@123' },
    driver: { identity: 'driver@ridego.local', password: 'Driver@123' },
    admin: { identity: 'admin@ridego.local', password: 'Admin@123' }
  };
  const account = accounts[role];
  if (!account) return;
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(account) });
    state.token = result.token;
    state.user = result.user;
    localStorage.token = result.token;
    connectEvents();
    startDriverTracking();
    toast(`Signed in as ${result.user.name}.`);
    go(result.user.role === 'customer' ? 'home' : 'dashboard');
  } catch (error) {
    toast(error.message, true);
  }
};

window.togglePassword = function () {
  const input = document.querySelector('#auth-password');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  const button = input.parentElement.querySelector('button');
  if (button) button.textContent = input.type === 'password' ? 'Show' : 'Hide';
};

/* Rider convenience tools: local saved places and server-backed scheduled rides. */
(function () {
  const originalHome = window.home;
  const originalBookRide = window.bookRide;
  const storageKey = () => `ridego.saved-places.${state.user?.id || 'guest'}`;
  const defaultPlaces = [
    { label: 'Home', address: 'Connaught Place, New Delhi', distance: 5, icon: '⌂' },
    { label: 'Work', address: 'Cyber City, Gurugram', distance: 22, icon: '▣' }
  ];

  function savedPlaces() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || '[]');
      return Array.isArray(saved) ? saved.slice(0, 6) : [];
    } catch { return []; }
  }

  function setSavedPlaces(places) {
    localStorage.setItem(storageKey(), JSON.stringify(places.slice(0, 6)));
  }

  function closeRideModal() { document.querySelector('.ride-modal')?.remove(); }

  function rideModal(content) {
    closeRideModal();
    const modal = document.createElement('div');
    modal.className = 'ride-modal';
    modal.innerHTML = `<button class="modal-backdrop" aria-label="Close" onclick="closeRideModal()"></button><section class="ride-modal-card">${content}</section>`;
    document.body.append(modal);
  }

  function readableTime(value) {
    return new Date(value).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function enhanceHome() {
    const booking = document.querySelector('.pro-booking');
    if (!booking || booking.querySelector('.convenience-row')) return;
    const schedule = state.rideLater ? `<span class="schedule-chip">◷ Pickup ${readableTime(state.rideLater)}</span>` : '';
    const row = document.createElement('div');
    row.className = 'convenience-row';
    row.innerHTML = `<button onclick="openSavedPlaces()"><span>★</span> Saved places</button><button onclick="openRideLater()"><span>◷</span> ${state.rideLater ? 'Change time' : 'Ride later'}</button>${schedule}`;
    booking.querySelector('.booking-meta')?.after(row);
  }

  window.home = function () { originalHome(); enhanceHome(); };

  const originalRides = window.rides;
  window.rides = async function () {
    await originalRides();
    document.querySelectorAll('.tag.scheduled').forEach(tag => {
      const action = tag.closest('tr')?.lastElementChild;
      if (!action || action.querySelector('button')) return;
      action.innerHTML = '<button class="secondary" onclick="cancelScheduledFromRow(this)">Cancel</button>';
    });
  };

  window.cancelScheduledFromRow = function (button) {
    const row = button.closest('tr');
    const code = row?.querySelector('td b')?.textContent;
    if (!code) return;
    api('/api/rides').then(data => {
      const ride = data.rides.find(item => item.rideCode === code);
      if (ride) return rideAct(ride.id, 'cancel');
    }).catch(error => toast(error.message, true));
  };

  window.openSavedPlaces = function () {
    const places = [...defaultPlaces, ...savedPlaces()];
    rideModal(`<button class="modal-close" onclick="closeRideModal()">×</button><span class="modal-kicker">YOUR SHORTCUTS</span><h2>Saved places</h2><p>Set a destination in one tap, then compare live ride fares.</p><div class="saved-place-list">${places.map((place, index) => `<button onclick="useSavedPlace(${index})"><span>${place.icon || '●'}</span><div><b>${escapeHtml(place.label)}</b><small>${escapeHtml(place.address)}</small></div><i>${place.distance} km ›</i></button>`).join('')}</div><button class="add-place" onclick="openAddPlace()">+ Add a place</button>`);
  };

  window.useSavedPlace = function (index) {
    const place = [...defaultPlaces, ...savedPlaces()][index];
    if (!place) return;
    rememberBooking();
    state.booking.destination = place.address;
    state.booking.distance = Number(place.distance) || 5;
    state.destinationLocation = { lat: state.pickupLocation.lat + state.booking.distance / 111, lng: state.pickupLocation.lng + state.booking.distance / 180 };
    state.options = [];
    closeRideModal();
    home();
    setTimeout(() => document.querySelector('.pro-booking')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
  };

  window.openAddPlace = function () {
    rideModal(`<button class="modal-close" onclick="closeRideModal()">×</button><span class="modal-kicker">NEW SHORTCUT</span><h2>Save a destination</h2><form class="place-form" onsubmit="savePlace(event)"><label>PLACE NAME<input name="label" maxlength="24" placeholder="e.g. Gym" required></label><label>ADDRESS<input name="address" maxlength="100" placeholder="Enter destination" required></label><label>APPROX. DISTANCE (KM)<input name="distance" type="number" min="1" max="100" value="5" required></label><button class="search-rides" type="submit"><span>Save place</span><i>→</i></button></form>`);
  };

  window.savePlace = function (event) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.target));
    const places = savedPlaces();
    places.push({ label: form.label.trim(), address: form.address.trim(), distance: Number(form.distance), icon: '●' });
    setSavedPlaces(places);
    toast('Place saved for faster booking.');
    openSavedPlaces();
  };

  window.openRideLater = function () {
    const minimum = new Date(Date.now() + 5 * 60 * 1000);
    const localMinimum = new Date(minimum.getTime() - minimum.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const existing = state.rideLater ? new Date(new Date(state.rideLater).getTime() - new Date(state.rideLater).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : localMinimum;
    rideModal(`<button class="modal-close" onclick="closeRideModal()">×</button><span class="modal-kicker">PLAN AHEAD</span><h2>When should we pick you up?</h2><p>We’ll start finding a driver at your selected pickup time.</p><form class="place-form" onsubmit="setRideLater(event)"><label>PICKUP DATE & TIME<input name="time" type="datetime-local" min="${localMinimum}" value="${existing}" required></label><button class="search-rides" type="submit"><span>Set pickup time</span><i>→</i></button>${state.rideLater ? '<button class="text-only" type="button" onclick="clearRideLater()">Book now instead</button>' : ''}</form>`);
  };

  window.setRideLater = function (event) {
    event.preventDefault();
    const selected = new Date(new FormData(event.target).get('time'));
    if (selected.getTime() < Date.now() + 5 * 60 * 1000) return toast('Choose a time at least 5 minutes from now.', true);
    state.rideLater = selected.toISOString();
    closeRideModal();
    home();
    toast(`Pickup set for ${readableTime(state.rideLater)}.`);
  };

  window.clearRideLater = function () { state.rideLater = null; closeRideModal(); home(); toast('Ride set to book now.'); };
  window.closeRideModal = closeRideModal;

  window.bookRide = async function () {
    if (!state.rideLater) return originalBookRide();
    const option = state.options[0];
    if (!option) return;
    const coupon = document.querySelector('#coupon')?.value || '';
    rememberBooking();
    try {
      const data = await api('/api/rides', { method: 'POST', body: JSON.stringify({ category: option.id, distance: option.distance, minutes: option.minutes, pickup: state.booking.pickup, destination: state.booking.destination, pickupLocation: state.pickupLocation, destinationLocation: state.destinationLocation, paymentMethod: state.booking.paymentMethod, coupon, scheduledAt: state.rideLater }) });
      state.ride = data.ride;
      state.rideLater = null;
      toast(data.message);
      go('rides');
    } catch (error) { toast(error.message, true); }
  };
}());

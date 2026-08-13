const root = document.querySelector('#shared-ride');
const token = new URLSearchParams(location.search).get('token');
const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

async function updateSharedRide() {
  try {
    if (!token) throw Error('This tracking link is incomplete.');
    const base = window.RIDEGO_API_BASE || ((location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('.onrender.com')) ? '' : 'https://ridego-lnqf.onrender.com');
    const response = await fetch(`${base}/api/public/rides/share/${encodeURIComponent(token)}`);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Unable to load this ride.');
    const ride = data.ride, driver = data.driver;
    root.innerHTML = `<span class="eyebrow">LIMITED LIVE VIEW</span><h1>${safe(ride.rideCode)}</h1><p><span class="tag ${safe(ride.status)}">${safe(ride.status.replaceAll('_', ' '))}</span></p><div class="divider"></div><p><b>${safe(ride.pickup)}</b><br>→ ${safe(ride.destination)}</p>${driver ? `<div class="notice"><b>${safe(driver.name)}</b> · ★ ${safe(driver.rating)}<br>${safe(driver.vehicle)}<br>Location updated: ${driver.lastLocationAt ? new Date(driver.lastLocationAt).toLocaleTimeString() : 'waiting for update'}</div>` : '<p class="muted">Waiting for a driver assignment.</p>'}<p class="muted">This link hides phone numbers, customer identity, payments and private ride data. It expires automatically.</p>`;
  } catch (error) {
    root.innerHTML = `<h2>Link unavailable</h2><p>${safe(error.message)}</p>`;
  }
}

updateSharedRide();
setInterval(updateSharedRide, 5000);

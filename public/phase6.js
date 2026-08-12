window.notificationsPage = async function () {
  state.view = 'notifications';
  try {
    const data = await api('/api/notifications?limit=100');
    layout(`<div class="row"><div><span class="eyebrow">INBOX</span><h1>Notifications</h1></div><button class="secondary" onclick="markAllNotifications()">Mark all read</button></div><div class="notification-list">${data.items.map(n => `<article class="card notification ${n.read ? '' : 'unread'}"><span class="notification-icon">${notificationIcon(n.type)}</span><div><b>${escapeHtml(n.title)}</b><p>${escapeHtml(n.message)}</p><small>${new Date(n.createdAt).toLocaleString()}</small></div></article>`).join('') || '<div class="card empty">You are all caught up.</div>'}</div>`);
  } catch (error) {
    toast(error.message, true);
  }
};

function notificationIcon(type) {
  return ({ ride: '🚕', payment: '₹', refund: '↩', rating: '★', support: '💬', sos: 'SOS' })[type] || '●';
}

window.markAllNotifications = async function () {
  try {
    await api('/api/notifications/read', { method: 'POST', body: JSON.stringify({ all: true }) });
    notificationsPage();
  } catch (error) {
    toast(error.message, true);
  }
};

window.supportPage = async function () {
  state.view = 'support';
  try {
    const data = await api('/api/support');
    layout(`<div class="row"><div><span class="eyebrow">HELP CENTRE</span><h1>Support</h1></div><button class="primary" onclick="createTicket()">+ Raise ticket</button></div><div class="faq-grid"><div class="card"><b>Emergency assistance</b><p class="muted">For an active ride emergency, use the red SOS control in the Safety Centre.</p></div><div class="card"><b>Payment problem</b><p class="muted">Include the related ride ID so our team can reconcile it quickly.</p></div><div class="card"><b>Driver verification</b><p class="muted">Document reviews and rejection reasons appear in your driver profile.</p></div></div><h2 class="section-title">Your tickets</h2><div class="support-board">${data.tickets.map(t => `<article class="card ticket"><div class="row"><h3>${escapeHtml(t.ticketCode)} · ${escapeHtml(t.subject)}</h3><span class="tag ${t.status === 'resolved' ? 'approved' : 'searching'}">${t.status}</span></div><p>${escapeHtml(t.description)}</p><div class="ticket-messages">${t.messages.map(m => `<p><b>${escapeHtml(m.senderRole)}:</b> ${escapeHtml(m.text)}</p>`).join('')}</div></article>`).join('') || '<div class="card empty">You have no support tickets.</div>'}</div>`);
  } catch (error) {
    toast(error.message, true);
  }
};

window.createTicket = async function () {
  const category = prompt('Issue category', 'ride');
  if (!category) return;
  const subject = prompt('Short subject', 'Help with my ride');
  if (!subject) return;
  const description = prompt('Describe the issue in detail');
  if (!description) return;
  try {
    const result = await api('/api/support', { method: 'POST', body: JSON.stringify({ category, subject, description }) });
    toast(result.message);
    supportPage();
  } catch (error) {
    toast(error.message, true);
  }
};

window.safetyPage = async function () {
  state.view = 'safety';
  try {
    const [data, contactsData] = await Promise.all([api('/api/rides'), api('/api/emergency-contacts').catch(() => ({ contacts: [] }))]);
    const active = data.rides.find(r => ['driver_assigned', 'driver_arriving', 'driver_arrived', 'ride_started'].includes(r.status));
    layout(`<span class="eyebrow">SAFETY CENTRE</span><h1>Your safety comes first</h1><div class="safety-hero card"><div><h2>24 x 7 emergency support</h2><p>RideGo records the active ride, user, time and available location whenever SOS is used.</p><a href="tel:+9118000001234">Call +91 1800 000 1234</a></div><span>SAFETY</span></div><div class="safety-grid"><article class="card"><h3>Emergency SOS</h3><p class="muted">Notify RideGo operations, your driver and saved emergency contacts.</p>${active ? `<button class="sos-button" onclick="triggerSOS('${active.id}')">Send SOS now</button>` : '<span class="tag">Available during an active ride</span>'}</article><article class="card"><h3>Share live ride</h3><p class="muted">Create a limited six-hour tracking link. No account is required to view it.</p>${active ? `<button class="secondary" onclick="shareRide('${active.id}')">Share with a trusted contact</button>` : '<span class="tag">Available during an active ride</span>'}</article><article class="card"><h3>Emergency contacts</h3><p class="muted">Saved contacts are queued whenever SOS is triggered.</p><div class="ticket-messages">${contactsData.contacts.map(c => `<p><b>${escapeHtml(c.name)}</b> ${escapeHtml(c.relationship)} - ${escapeHtml(c.phone)}</p>`).join('') || '<p>No contacts added yet.</p>'}</div><button class="secondary" onclick="addEmergencyContact()">+ Add contact</button></article><article class="card"><h3>Ride OTP</h3><p class="muted">Tell the OTP only after entering the correct vehicle at the pickup.</p></article></div>`);
  } catch (error) {
    toast(error.message, true);
  }
};


window.addEmergencyContact = async function () {
  const name = prompt('Contact name', 'Mother');
  if (!name) return;
  const phone = prompt('Phone number');
  if (!phone) return;
  const relationship = prompt('Relationship', 'Family') || 'Trusted contact';
  try {
    await api('/api/emergency-contacts', { method: 'POST', body: JSON.stringify({ name, phone, relationship }) });
    toast('Emergency contact saved.');
    safetyPage();
  } catch (error) {
    toast(error.message, true);
  }
};
window.triggerSOS = async function (rideId) {
  if (!confirm('Send an emergency SOS to RideGo support?')) return;
  let location = null;
  try { location = await browserLocation(); } catch {}
  try {
    const result = await api('/api/safety/sos', { method: 'POST', body: JSON.stringify({ rideId, location, message: 'Emergency assistance requested from the RideGo app' }) });
    toast(result.message);
  } catch (error) {
    toast(error.message, true);
  }
};

window.shareRide = async function (rideId) {
  try {
    const result = await api(`/api/rides/${rideId}/share`, { method: 'POST', body: '{}' });
    const url = new URL(result.path, location.origin).href;
    if (navigator.share) await navigator.share({ title: 'Track my RideGo ride', text: 'Follow my live ride safely:', url });
    else if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      toast('Secure tracking link copied.');
    } else prompt('Copy this secure tracking link', url);
  } catch (error) {
    if (error.name !== 'AbortError') toast(error.message, true);
  }
};

window.rateRide = async function (rideId) {
  const rating = Number(prompt('Rating from 1 to 5', '5'));
  if (!rating) return;
  const tags = prompt('Feedback tags, separated by commas', 'Safe driving, Polite') || '';
  const review = prompt('Optional review', '') || '';
  try {
    await api('/api/ratings', { method: 'POST', body: JSON.stringify({ rideId, rating, tags: tags.split(',').map(x => x.trim()).filter(Boolean), review }) });
    toast('Thank you for your feedback.');
    rides();
  } catch (error) {
    toast(error.message, true);
  }
};

window.incentivesPage = async function () {
  state.view = 'incentives';
  try {
    const data = await api('/api/incentives');
    layout(`<span class="eyebrow">DRIVER REWARDS</span><h1>Incentives</h1><div class="incentive-grid">${data.incentives.map(i => { const percent = Math.round(i.progress / i.targetRides * 100); return `<article class="card incentive"><div class="row"><div><h3>${escapeHtml(i.name)}</h3><p class="muted">${escapeHtml(i.description)}</p></div><b class="fare">${money(i.reward)}</b></div><div class="progress"><span style="width:${percent}%"></span></div><p><b>${i.progress} / ${i.targetRides}</b> rides completed</p>${i.claimed ? '<span class="tag approved">claimed</span>' : i.completed ? `<button class="primary" onclick="claimIncentive('${i.id}')">Claim reward</button>` : '<span class="tag searching">in progress</span>'}</article>`; }).join('') || '<div class="card empty">No active incentives.</div>'}</div>`);
  } catch (error) {
    toast(error.message, true);
  }
};

window.claimIncentive = async function (id) {
  try {
    const result = await api(`/api/incentives/${id}/claim`, { method: 'POST', body: '{}' });
    state.user.wallet = result.balance;
    toast(result.message);
    incentivesPage();
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminZones = async function () {
  try {
    const data = await api('/api/admin/zones');
    adminShell('zones', 'Service zones', `<div class="notice">Zones use GeoJSON polygons. Pickups outside every active polygon are rejected by the booking API.</div><div class="zone-list">${data.zones.map(z => `<article class="card"><div class="row"><div><h3>${escapeHtml(z.name)}</h3><p class="muted">${escapeHtml(z.city)} · ${z.geometry.coordinates[0].length - 1} polygon edges</p></div><span class="tag ${z.active ? 'approved' : ''}">${z.active ? 'active' : 'disabled'}</span></div><code>${escapeHtml(JSON.stringify(z.geometry))}</code></article>`).join('')}</div>`, '<button class="primary" onclick="createZone()">+ Add rectangular zone</button>');
  } catch (error) {
    toast(error.message, true);
  }
};

window.createZone = async function () {
  const name = prompt('Zone name', 'New service zone'), city = prompt('City', 'Delhi');
  if (!name || !city) return;
  const minLng = Number(prompt('Minimum longitude', '77.10')), minLat = Number(prompt('Minimum latitude', '28.50')), maxLng = Number(prompt('Maximum longitude', '77.35')), maxLat = Number(prompt('Maximum latitude', '28.75'));
  const coordinates = [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]];
  try {
    await api('/api/admin/zones', { method: 'POST', body: JSON.stringify({ name, city, active: true, geometry: { type: 'Polygon', coordinates } }) });
    toast('Service zone created.');
    adminZones();
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminIncentives = async function () {
  try {
    const data = await api('/api/admin/incentives');
    adminShell('incentives', 'Driver incentives', `<div class="incentive-grid">${data.incentives.map(i => `<article class="card"><div class="row"><div><h3>${escapeHtml(i.name)}</h3><p class="muted">${escapeHtml(i.description)}</p></div><span class="tag ${i.active ? 'approved' : ''}">${i.active ? 'active' : 'disabled'}</span></div><p>Target: <b>${i.targetRides} rides</b> · Reward: <b>${money(i.reward)}</b></p></article>`).join('')}</div>`, '<button class="primary" onclick="createIncentive()">+ New incentive</button>');
  } catch (error) {
    toast(error.message, true);
  }
};

window.createIncentive = async function () {
  const name = prompt('Incentive name', 'Weekend boost'), description = prompt('Description', 'Complete 5 rides and earn a bonus'), targetRides = Number(prompt('Ride target', '5')), reward = Number(prompt('Reward amount', '150'));
  if (!name || !targetRides || !reward) return;
  try {
    await api('/api/admin/incentives', { method: 'POST', body: JSON.stringify({ name, description, targetRides, reward, active: true }) });
    toast('Incentive created.');
    adminIncentives();
  } catch (error) {
    toast(error.message, true);
  }
};

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

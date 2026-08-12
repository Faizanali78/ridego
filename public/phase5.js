function adminNav(active) {
  const items = [
    ['dashboard', 'Dashboard', "go('dashboard')"],
    ['customers', 'Customers', 'adminCustomers()'],
    ['drivers', 'Drivers', 'adminDrivers()'],
    ['rides', 'Rides', 'adminRides()'],
    ['pricing', 'Pricing', 'adminPricing()'],
    ['coupons', 'Coupons', 'adminCoupons()'],
    ['zones', 'Service zones', 'adminZones()'],
    ['incentives', 'Incentives', 'adminIncentives()'],
    ['finance', 'Finance & payouts', 'adminFinance()'],
    ['support', 'Support', 'adminSupport()'],
    ['reports', 'Reports', 'adminReports()']
  ];
  return `<aside class="side card admin-side"><div class="admin-label">ADMIN CONSOLE</div>${items.map(([id, label, action]) => `<button class="${active === id ? 'on' : ''}" onclick="${action}">${label}</button>`).join('')}<button onclick="logout()">Sign out</button></aside>`;
}

function adminShell(active, title, content, toolbar = '') {
  state.view = `admin-${active}`;
  layout(`<div class="dashboard">${adminNav(active)}<section class="admin-content"><div class="row admin-heading"><div><span class="eyebrow">RIDEGO OPERATIONS</span><h1>${title}</h1></div>${toolbar}</div>${content}</section></div>`);
}

window.admin = async function () {
  try {
    const [dashboard, logs] = await Promise.all([api('/api/admin/dashboard'), api('/api/admin/logs?limit=8')]);
    state.admin = dashboard;
    const cards = [
      ['Customers', dashboard.metrics.customers],
      ['Drivers', dashboard.metrics.drivers],
      ['Online now', dashboard.metrics.online],
      ['Pending review', dashboard.metrics.pending],
      ['All rides', dashboard.metrics.rides],
      ['Active rides', dashboard.metrics.active],
      ['Platform revenue', money(dashboard.metrics.revenue)],
      ['Today revenue', money(dashboard.metrics.todayRevenue)],
      ['Today rides', dashboard.metrics.todayRides],
      ['Average fare', money(dashboard.metrics.averageFare)],
      ['Average rating', `${dashboard.metrics.averageRating || 0} star`],
      ['Cancellation', `${dashboard.metrics.cancellationRate}%`],
      ['Active SOS', dashboard.activeSos?.length || 0],
      ['Commission', `${dashboard.settings.commission}%`]
    ];
    adminShell('dashboard', 'Operations dashboard', `<div class="metrics">${cards.map(([label, value]) => `<div class="card metric"><small>${label}</small><b>${value}</b></div>`).join('')}</div>
      <div class="admin-grid">
        <div><h2 class="section-title">Recent rides</h2><div class="card table-wrap"><table class="table"><tr><th>Ride</th><th>Category</th><th>Fare</th><th>Status</th></tr>${dashboard.rides.slice(0, 8).map(r => `<tr><td>${escapeHtml(r.rideCode)}</td><td>${escapeHtml(r.category)}</td><td>${money(r.finalFare)}</td><td><span class="tag ${r.status}">${r.status.replaceAll('_', ' ')}</span></td></tr>`).join('') || '<tr><td colspan="4">No rides yet</td></tr>'}</table></div></div>
        <div><h2 class="section-title">Admin activity</h2><div class="card activity-list">${logs.items.map(log => `<div><b>${escapeHtml(log.action)}</b><small>${escapeHtml(log.targetType)} · ${new Date(log.createdAt).toLocaleString()}</small></div>`).join('') || '<p class="muted">No admin changes yet.</p>'}</div></div>
      </div>`);
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminCustomers = async function (page = 1) {
  try {
    const currentQuery = document.querySelector('#admin-search')?.value || '';
    const data = await api(`/api/admin/customers?page=${page}&q=${encodeURIComponent(currentQuery)}`);
    adminShell('customers', 'Customer management', `<div class="card filter-bar"><input id="admin-search" placeholder="Search name, email or phone" value="${escapeHtml(currentQuery)}"><button class="secondary" onclick="adminCustomers()">Search</button></div>
      <div class="card table-wrap"><table class="table"><tr><th>Customer</th><th>Status</th><th>Rides</th><th>Payments</th><th>Wallet</th><th>Actions</th></tr>${data.items.map(u => `<tr><td><b>${escapeHtml(u.name)}</b><br><small>${escapeHtml(u.phone)} · ${escapeHtml(u.email)}</small></td><td><span class="tag ${u.status === 'active' ? 'approved' : ''}">${u.status}</span></td><td>${u.rideCount}</td><td>${money(u.paymentTotal)}</td><td>${money(u.wallet)}</td><td class="actions"><button class="secondary" onclick="adminWallet('${u.id}')">Adjust wallet</button>${u.status !== 'blocked' ? `<button class="ghost" onclick="adminUserStatus('${u.id}','blocked','customers')">Block</button>` : `<button class="ghost" onclick="adminUserStatus('${u.id}','active','customers')">Unblock</button>`}</td></tr>`).join('') || '<tr><td colspan="6">No customers found</td></tr>'}</table></div>${adminPager(data, 'adminCustomers')}`);
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminDrivers = async function (page = 1) {
  try {
    const currentQuery = document.querySelector('#admin-search')?.value || '';
    const data = await api(`/api/admin/drivers?page=${page}&q=${encodeURIComponent(currentQuery)}`);
    adminShell('drivers', 'Driver verification', `<div class="card filter-bar"><input id="admin-search" placeholder="Search driver or vehicle" value="${escapeHtml(currentQuery)}"><button class="secondary" onclick="adminDrivers()">Search</button></div>
      <div class="card table-wrap"><table class="table"><tr><th>Driver</th><th>Vehicle</th><th>Online</th><th>Status</th><th>Rides</th><th>Actions</th></tr>${data.items.map(u => `<tr><td><b>${escapeHtml(u.name)}</b><br><small>${escapeHtml(u.phone)}</small></td><td>${escapeHtml(u.vehicle || 'Not submitted')}<br><small>${escapeHtml(u.category || 'No category')}</small></td><td>${u.online ? '<span class="online-dot">● online</span>' : 'offline'}</td><td><span class="tag ${u.status}">${u.status}</span></td><td>${u.rideCount}</td><td class="actions"><button class="secondary" onclick="adminUserStatus('${u.id}','approved','drivers')">Approve</button><button class="ghost" onclick="adminUserStatus('${u.id}','rejected','drivers')">Reject</button><button class="ghost" onclick="adminUserStatus('${u.id}','suspended','drivers')">Suspend</button></td></tr>`).join('') || '<tr><td colspan="6">No drivers found</td></tr>'}</table></div>${adminPager(data, 'adminDrivers')}`);
  } catch (error) {
    toast(error.message, true);
  }
};

function adminPager(data, handler) {
  if (data.pages <= 1) return '';
  return `<div class="pager"><button class="secondary" ${data.page <= 1 ? 'disabled' : ''} onclick="${handler}(${data.page - 1})">Previous</button><span>Page ${data.page} of ${data.pages}</span><button class="secondary" ${data.page >= data.pages ? 'disabled' : ''} onclick="${handler}(${data.page + 1})">Next</button></div>`;
}

window.adminUserStatus = async function (userId, status, section) {
  const reason = status === 'active' || status === 'approved' ? '' : prompt(`Reason for ${status}`, 'Admin review');
  if (reason === null) return;
  try {
    await api(`/api/admin/users/${userId}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) });
    toast(`Account marked ${status}.`);
    section === 'drivers' ? adminDrivers() : adminCustomers();
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminWallet = async function (customerId) {
  const amount = Number(prompt('Wallet adjustment. Use a negative number to deduct.', '100'));
  if (!amount) return;
  const reason = prompt('Reason for adjustment', 'Customer service adjustment');
  if (!reason) return;
  try {
    await api(`/api/admin/customers/${customerId}/wallet`, { method: 'POST', body: JSON.stringify({ amount, reason }) });
    toast('Wallet adjusted and customer notified.');
    adminCustomers();
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminRides = async function (page = 1) {
  try {
    const query = document.querySelector('#ride-search')?.value || '';
    const status = document.querySelector('#ride-status')?.value || '';
    const data = await api(`/api/admin/rides?page=${page}&q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`);
    const statuses = ['', 'searching', 'driver_assigned', 'driver_arriving', 'driver_arrived', 'ride_started', 'ride_completed', 'cancelled_by_customer', 'cancelled_by_driver', 'cancelled_by_admin', 'no_driver_found'];
    adminShell('rides', 'Ride management', `<div class="card filter-bar"><input id="ride-search" placeholder="Ride ID, pickup or destination" value="${escapeHtml(query)}"><select id="ride-status">${statuses.map(value => `<option value="${value}" ${status === value ? 'selected' : ''}>${value ? value.replaceAll('_', ' ') : 'All statuses'}</option>`).join('')}</select><button class="secondary" onclick="adminRides()">Filter</button></div>
      <div class="card table-wrap"><table class="table"><tr><th>Ride</th><th>Route</th><th>Customer / driver</th><th>Fare</th><th>Payment</th><th>Status</th><th>Actions</th></tr>${data.items.map(r => `<tr><td><b>${escapeHtml(r.rideCode)}</b><br><small>${new Date(r.createdAt).toLocaleString()}</small></td><td>${escapeHtml(r.pickup)}<br>→ ${escapeHtml(r.destination)}</td><td><small>${escapeHtml(r.customerId)}<br>${escapeHtml(r.driverId || 'unassigned')}</small></td><td>${money(r.finalFare)}</td><td>${escapeHtml(r.paymentStatus)}</td><td><span class="tag ${r.status}">${r.status.replaceAll('_', ' ')}</span></td><td class="actions"><button class="ghost" onclick="adminRideNote('${r.id}')">Add note</button>${['searching', 'driver_assigned', 'driver_arriving', 'driver_arrived'].includes(r.status) ? `<button class="ghost" onclick="adminCancelRide('${r.id}')">Cancel</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">No rides found</td></tr>'}</table></div>${adminPager(data, 'adminRides')}`);
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminRideNote = async function (rideId) {
  const text = prompt('Internal note (not visible to customer or driver)');
  if (!text) return;
  try {
    await api(`/api/admin/rides/${rideId}/note`, { method: 'POST', body: JSON.stringify({ text }) });
    toast('Internal note saved.');
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminCancelRide = async function (rideId) {
  if (!confirm('Cancel this active ride?')) return;
  try {
    await api(`/api/rides/${rideId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Cancelled by operations' }) });
    toast('Ride cancelled.');
    adminRides();
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminPricing = async function () {
  try {
    const data = await api('/api/admin/pricing');
    adminShell('pricing', 'Pricing management', `<div class="notice">Prices are used immediately by the server fare calculator. Customer-supplied fares are ignored.</div><div class="pricing-grid">${data.categories.map(c => `<article class="card pricing-card"><div class="row"><div><span class="icon">${c.icon}</span><h3>${escapeHtml(c.name)}</h3></div><label class="toggle"><input id="price-${c.id}-enabled" type="checkbox" ${c.enabled ? 'checked' : ''}> Enabled</label></div><div class="pricing-fields"><label>Base fare<input id="price-${c.id}-base" type="number" value="${c.base}"></label><label>Per km<input id="price-${c.id}-perKm" type="number" value="${c.perKm}"></label><label>Per minute<input id="price-${c.id}-perMin" type="number" value="${c.perMin}"></label><label>Minimum<input id="price-${c.id}-min" type="number" value="${c.min}"></label></div><button class="primary" onclick="savePricing('${c.id}')">Save ${escapeHtml(c.name)}</button></article>`).join('')}</div><h2 class="section-title">Global fare rules</h2><div class="card pricing-fields global-pricing"><label>Platform fee<input id="global-platformFee" type="number" value="${data.settings.platformFee}"></label><label>Tax percentage<input id="global-taxPct" type="number" value="${data.settings.taxPct}"></label><label>Surge multiplier<input id="global-surge" type="number" step=".1" value="${data.settings.surge}"></label><label>Search radius km<input id="global-searchRadius" type="number" value="${data.settings.searchRadius}"></label><button class="primary" onclick="saveGlobalPricing()">Save global rules</button></div>`);
  } catch (error) {
    toast(error.message, true);
  }
};

window.savePricing = async function (categoryId) {
  const value = field => Number(document.querySelector(`#price-${categoryId}-${field}`).value);
  try {
    await api('/api/admin/pricing', { method: 'POST', body: JSON.stringify({ categoryId, base: value('base'), perKm: value('perKm'), perMin: value('perMin'), min: value('min'), enabled: document.querySelector(`#price-${categoryId}-enabled`).checked }) });
    toast('Category pricing saved.');
  } catch (error) {
    toast(error.message, true);
  }
};

window.saveGlobalPricing = async function () {
  try {
    await api('/api/admin/settings', { method: 'POST', body: JSON.stringify({ platformFee: Number($('#global-platformFee').value), taxPct: Number($('#global-taxPct').value), surge: Number($('#global-surge').value), searchRadius: Number($('#global-searchRadius').value) }) });
    toast('Global fare rules saved.');
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminCoupons = async function () {
  try {
    const data = await api('/api/admin/coupons');
    state.adminCoupons = data.coupons;
    adminShell('coupons', 'Coupons and offers', `<div class="card table-wrap"><table class="table"><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Usage</th><th>Status</th><th>Action</th></tr>${data.coupons.map(c => `<tr><td><b>${escapeHtml(c.code)}</b></td><td>${c.kind === 'percent' ? `${c.value}% up to ${money(c.max)}` : money(c.value)}</td><td>${money(c.min)}</td><td>${c.used || 0} / ${c.usageLimit || '∞'}</td><td><span class="tag ${c.active ? 'approved' : ''}">${c.active ? 'active' : 'disabled'}</span></td><td><button class="secondary" onclick="editCoupon('${c.id}')">Edit</button></td></tr>`).join('')}</table></div>`, '<button class="primary" onclick="editCoupon()">+ New coupon</button>');
  } catch (error) {
    toast(error.message, true);
  }
};

window.editCoupon = async function (couponId) {
  const old = state.adminCoupons?.find(c => c.id === couponId) || {};
  const code = prompt('Coupon code', old.code || 'NEWRIDE');
  if (!code) return;
  const value = Number(prompt('Discount value', old.value || '20'));
  const min = Number(prompt('Minimum ride value', old.min || '100'));
  const max = Number(prompt('Maximum discount', old.max || value));
  const usageLimit = Number(prompt('Total usage limit', old.usageLimit || '1000'));
  try {
    await api('/api/admin/coupons', { method: 'POST', body: JSON.stringify({ id: couponId, code, kind: old.kind || 'percent', value, min, max, usageLimit, active: old.active !== false }) });
    toast('Coupon saved.');
    adminCoupons();
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminSupport = async function () {
  try {
    const data = await api('/api/support');
    adminShell('support', 'Support tickets', `<div class="support-board">${data.tickets.map(t => `<article class="card ticket"><div class="row"><div><span class="tag ${t.priority === 'urgent' ? 'cancelled_by_customer' : ''}">${t.priority}</span><h3>${escapeHtml(t.ticketCode)} · ${escapeHtml(t.subject)}</h3></div><span class="tag ${t.status === 'resolved' ? 'approved' : 'searching'}">${t.status}</span></div><p>${escapeHtml(t.description)}</p><small class="muted">${escapeHtml(t.userRole)} · ${new Date(t.createdAt).toLocaleString()}</small><div class="ticket-messages">${t.messages.map(m => `<p><b>${escapeHtml(m.senderRole)}:</b> ${escapeHtml(m.text)}</p>`).join('')}</div><div class="actions"><button class="secondary" onclick="replyTicket('${t.id}')">Reply</button><button class="ghost" onclick="resolveTicket('${t.id}')">Resolve</button></div></article>`).join('') || '<div class="card empty">No support tickets.</div>'}</div>`);
  } catch (error) {
    toast(error.message, true);
  }
};

window.replyTicket = async function (ticketId) {
  const message = prompt('Reply to the user');
  if (!message) return;
  try {
    await api(`/api/admin/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ message, status: 'waiting_for_user' }) });
    toast('Reply sent.');
    adminSupport();
  } catch (error) {
    toast(error.message, true);
  }
};

window.resolveTicket = async function (ticketId) {
  try {
    await api(`/api/admin/support/${ticketId}/reply`, { method: 'POST', body: JSON.stringify({ status: 'resolved' }) });
    toast('Ticket resolved.');
    adminSupport();
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminReports = function () {
  const reports = [['rides', 'Ride operations'], ['customers', 'Customers'], ['drivers', 'Drivers'], ['payments', 'Payments'], ['withdrawals', 'Driver payouts'], ['support', 'Support tickets']];
  adminShell('reports', 'Reports and exports', `<div class="report-grid">${reports.map(([type, label]) => `<article class="card"><span class="report-icon">⇩</span><h3>${label}</h3><p class="muted">Export the current ${label.toLowerCase()} dataset as a spreadsheet-compatible CSV.</p><button class="primary" onclick="downloadReport('${type}')">Download CSV</button></article>`).join('')}</div>`);
};

window.downloadReport = async function (type) {
  try {
    const response = await fetch(`/api/admin/reports/${type}`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!response.ok) throw Error((await response.json()).error || 'Export failed');
    const blob = await response.blob(), link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ridego-${type}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast('Report downloaded.');
  } catch (error) {
    toast(error.message, true);
  }
};

window.adminFinance = async function () {
  try {
    const [payments, withdrawals] = await Promise.all([api('/api/payments'), api('/api/withdrawals')]);
    adminShell('finance', 'Finance and payouts', `<h2 class="section-title">Withdrawal requests</h2><div class="card table-wrap"><table class="table"><tr><th>Requested</th><th>Driver</th><th>Amount</th><th>Method</th><th>Status</th><th>Action</th></tr>${withdrawals.withdrawals.map(w => `<tr><td>${new Date(w.createdAt).toLocaleDateString()}</td><td>${escapeHtml(w.driverId)}</td><td>${money(w.amount)}</td><td>${w.method}</td><td><span class="tag ${w.status === 'completed' ? 'approved' : ''}">${w.status}</span></td><td>${w.status === 'requested' ? `<button class="secondary" onclick="payoutAction('${w.id}','approve')">Approve</button> <button class="ghost" onclick="payoutAction('${w.id}','reject')">Reject</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="6">No payout requests</td></tr>'}</table></div><h2 class="section-title">Payments and refunds</h2><div class="card table-wrap"><table class="table"><tr><th>Payment</th><th>Type</th><th>Amount</th><th>Provider</th><th>Status</th><th>Action</th></tr>${payments.payments.map(p => `<tr><td>${escapeHtml(p.id)}</td><td>${p.type}</td><td>${money(p.amount)}</td><td>${p.provider}</td><td><span class="tag ${p.status === 'captured' ? 'approved' : ''}">${p.status}</span></td><td>${p.status === 'captured' ? `<button class="ghost" onclick="refundPayment('${p.id}',${p.amount})">Refund</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="6">No payments yet</td></tr>'}</table></div>`);
  } catch (error) {
    toast(error.message, true);
  }
};

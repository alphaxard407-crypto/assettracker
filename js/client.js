/* ============================================================
   CLIENT DASHBOARD
   Features:
   - View assigned assets
   - Browse available assets
   - Request available assets using dropdown or browse cards
   - Report issue / request return
   - View submitted requests
   - Print assigned assets receipt
============================================================ */

import {
  supabase,
  requireAuth,
  toast,
  esc,
  money,
  fmtDate,
  paintUser,
  initShell,
  openModal,
  closeModal,
  isOverdue
} from './config.js';

import { bindField, validateAll } from './validation.js';

let me = null;
let myAssets = [];
let myHistory = [];
let myRequests = [];
let availableAssets = [];

init();

async function init() {
  const ctx = await requireAuth('client');
  if (!ctx) return;

  me = ctx.profile;

  paintUser(me);
  initShell();
  wire();
  fillProfile();

  await loadAll();
}

/* ============================================================
   EVENT WIRING
============================================================ */
function wire() {
  document.getElementById('refreshBtn').onclick = loadAll;

  document.getElementById('myAssets').addEventListener('click', onAssetClick);
  document.getElementById('availableAssets').addEventListener('click', onAvailableAssetClick);

  document.getElementById('reqForm').onsubmit = submitRequest;
  document.getElementById('requestAssetForm').onsubmit = submitAssetRequest;

  document.getElementById('printMyAssets').onclick = printMyAssets;

  document.getElementById('newRequestBtn').onclick = () => openRequestModal(null, 'request');
  document.getElementById('newRequestBtn2').onclick = () => openRequestModal(null, 'request');

  document.getElementById('searchAvailable').oninput = renderAvailableAssets;
  document.getElementById('filterCategory').onchange = renderAvailableAssets;

  // ✅ When request type changes, load correct assets into dropdown
  document.getElementById('reqTypeSelect').addEventListener('change', function () {
    populateAssetDropdown(this.value);
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.onclick = () => closeModal(btn.dataset.close);
  });

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  bindField(document.getElementById('pName'), 'fullName');

  bindField(document.getElementById('pPhone'), 'phone', {
    counter: document.getElementById('pPhoneCount')
  });

  document.getElementById('profileForm').onsubmit = saveProfile;
}

/* ============================================================
   LOAD DATA
============================================================ */
async function loadAll() {
  const [assigned, historyRes, requestsRes, available] = await Promise.all([
    supabase
      .from('assets')
      .select('*')
      .eq('assigned_to', me.id)
      .order('name'),

    supabase
      .from('assignments')
      .select('*, assets(name,asset_tag)')
      .eq('client_id', me.id)
      .order('assigned_at', { ascending: false }),

    supabase
      .from('requests')
      .select('*, assets(name,asset_tag)')
      .eq('client_id', me.id)
      .order('created_at', { ascending: false }),

    supabase
      .from('assets')
      .select('*')
      .eq('status', 'available')
      .order('name')
  ]);

  const error =
    assigned.error ||
    historyRes.error ||
    requestsRes.error ||
    available.error;

  if (error) {
    toast(error.message, 'err');
    return;
  }

  myAssets = assigned.data || [];
  myHistory = historyRes.data || [];
  myRequests = requestsRes.data || [];
  availableAssets = available.data || [];

  renderStats();
  renderAssets();
  renderAvailableAssets();
  renderHistory();
  renderRequests();

  // Load dropdown based on current selected request type
  const currentType = document.getElementById('reqTypeSelect')?.value || 'request';
  populateAssetDropdown(currentType);
}

/* ============================================================
   HELPERS
============================================================ */
function activeAssignment(assetId) {
  return myHistory.find(h => h.asset_id === assetId && !h.returned_at);
}

function hasPendingRequest(assetId) {
  return myRequests.some(r =>
    r.asset_id === assetId &&
    r.type === 'request' &&
    r.status === 'open'
  );
}

/* ============================================================
   STATS
============================================================ */
function renderStats() {
  const overdue = myHistory.filter(h =>
    isOverdue(h.due_date, h.returned_at)
  ).length;

  const totalValue = myAssets.reduce((sum, asset) => {
    return sum + Number(asset.purchase_cost || 0);
  }, 0);

  document.getElementById('sHeld').textContent = myAssets.length;
  document.getElementById('sValue').textContent = money(totalValue);
  document.getElementById('sOverdue').textContent = overdue;
  document.getElementById('sOpen').textContent =
    myRequests.filter(r => r.status === 'open').length;
}

/* ============================================================
   MY ASSIGNED ASSETS
============================================================ */
function renderAssets() {
  const empty = document.getElementById('mineEmpty');
  const grid = document.getElementById('myAssets');

  empty.classList.toggle('hidden', myAssets.length > 0);

  grid.innerHTML = myAssets.map(asset => {
    const assignment = activeAssignment(asset.id);
    const late = assignment && isOverdue(assignment.due_date, assignment.returned_at);

    return `
      <div class="asset-card">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div>
            <h3>${esc(asset.name)}</h3>
            <span class="tag">${esc(asset.asset_tag)}</span>
          </div>

          <span class="badge ${late ? 'b-overdue' : 'b-assigned'}">
            ${late ? 'overdue' : 'assigned'}
          </span>
        </div>

        <div style="margin:12px 0">
          <div class="kv">
            <span>Category</span>
            <span>${esc(asset.category)}</span>
          </div>

          <div class="kv">
            <span>Serial</span>
            <span>${esc(asset.serial_number || '—')}</span>
          </div>

          <div class="kv">
            <span>Location</span>
            <span>${esc(asset.location || '—')}</span>
          </div>

          <div class="kv">
            <span>Assigned</span>
            <span>${fmtDate(assignment?.assigned_at)}</span>
          </div>

          <div class="kv">
            <span>Due back</span>
            <span>${fmtDate(assignment?.due_date)}</span>
          </div>

          <div class="kv">
            <span>Value</span>
            <span>${money(asset.purchase_cost)}</span>
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-ghost btn-sm" data-act="issue" data-id="${asset.id}">
            🛠️ Report issue
          </button>

          <button class="btn btn-primary btn-sm" data-act="return" data-id="${asset.id}">
            ↩ Request return
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function onAssetClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;

  const asset = myAssets.find(a => a.id === btn.dataset.id);
  if (!asset) return;

  const type = btn.dataset.act === 'return' ? 'return' : 'issue';

  openRequestModal(asset.id, type);
}

/* ============================================================
   BROWSE AVAILABLE ASSETS
============================================================ */
function renderAvailableAssets() {
  const search = document.getElementById('searchAvailable').value.trim().toLowerCase();
  const category = document.getElementById('filterCategory').value;

  const filtered = availableAssets.filter(asset => {
    const matchesCategory = !category || asset.category === category;

    const matchesSearch =
      !search ||
      [
        asset.name,
        asset.asset_tag,
        asset.serial_number,
        asset.category,
        asset.location
      ].some(value => (value || '').toLowerCase().includes(search));

    return matchesCategory && matchesSearch;
  });

  document.getElementById('availableEmpty').classList.toggle(
    'hidden',
    filtered.length > 0
  );

  document.getElementById('availableAssets').innerHTML = filtered.map(asset => {
    const pending = hasPendingRequest(asset.id);

    return `
      <div class="asset-card">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
          <div>
            <h3>${esc(asset.name)}</h3>
            <span class="tag">${esc(asset.asset_tag)}</span>
          </div>

          <span class="badge b-available">available</span>
        </div>

        <div style="margin:12px 0">
          <div class="kv">
            <span>Category</span>
            <span>${esc(asset.category)}</span>
          </div>

          <div class="kv">
            <span>Serial</span>
            <span>${esc(asset.serial_number || '—')}</span>
          </div>

          <div class="kv">
            <span>Location</span>
            <span>${esc(asset.location || '—')}</span>
          </div>

          <div class="kv">
            <span>Value</span>
            <span>${money(asset.purchase_cost)}</span>
          </div>
        </div>

        <div class="actions">
          ${
            pending
              ? `<button class="btn btn-ghost btn-sm" style="width:100%" disabled>
                  ⏳ Request Pending
                </button>`
              : `<button class="btn btn-primary btn-sm" data-req-id="${asset.id}" style="width:100%">
                  🛒 Request This Asset
                </button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

function onAvailableAssetClick(e) {
  const btn = e.target.closest('button[data-req-id]');
  if (!btn) return;

  const asset = availableAssets.find(a => a.id === btn.dataset.reqId);
  if (!asset) return;

  if (hasPendingRequest(asset.id)) {
    toast('You already have a pending request for this asset.', 'info');
    return;
  }

  document.getElementById('raAssetId').value = asset.id;

  document.getElementById('raAssetInfo').innerHTML = `
    <strong>${esc(asset.asset_tag)}</strong> — ${esc(asset.name)}<br>
    <span class="muted small">
      Category: ${esc(asset.category)} • Location: ${esc(asset.location || 'N/A')}
    </span>
  `;

  document.getElementById('raMessage').value = '';
  document.getElementById('raMessageErr').textContent = '';
  document.getElementById('raMessage').classList.remove('invalid');

  openModal('requestAssetModal');
}

async function submitAssetRequest(e) {
  e.preventDefault();

  const assetId = document.getElementById('raAssetId').value;
  const msgEl = document.getElementById('raMessage');
  const message = msgEl.value.trim();

  if (!assetId) {
    toast('Please select an asset.', 'err');
    return;
  }

  if (message.length < 3) {
    document.getElementById('raMessageErr').textContent =
      'Please enter at least 3 characters.';
    msgEl.classList.add('invalid');
    return;
  }

  msgEl.classList.remove('invalid');
  document.getElementById('raMessageErr').textContent = '';

  const btn = document.getElementById('submitAssetReqBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const { error } = await supabase.from('requests').insert({
    asset_id: assetId,
    client_id: me.id,
    type: 'request',
    message
  });

  btn.disabled = false;
  btn.textContent = 'Submit Request';

  if (error) {
    toast(error.message, 'err');
    return;
  }

  closeModal('requestAssetModal');
  toast('Asset request submitted! The admin will review it.', 'ok');

  await loadAll();
}

/* ============================================================
   REQUEST DROPDOWN — FIXED EMPTY STATE
============================================================ */
function populateAssetDropdown(type = 'request') {
  const select = document.getElementById('reqAssetSelect');
  const label = document.getElementById('reqAssetSelectLabel');
  const hint = document.getElementById('reqAssetHint');
  const submitBtn = document.getElementById('submitReqBtn');

  if (!select || !label || !hint || !submitBtn) return;

  select.innerHTML = '';
  select.disabled = false;
  submitBtn.disabled = false;

  let assetsToShow = [];

  if (type === 'request') {
    label.textContent = 'Select Available Asset *';
    assetsToShow = availableAssets;

    hint.textContent = assetsToShow.length
      ? 'These assets are currently available for request.'
      : 'No available assets found at the moment.';
  } else {
    label.textContent = 'Select Assigned Asset *';
    assetsToShow = myAssets;

    hint.textContent = assetsToShow.length
      ? 'These assets are currently assigned to you.'
      : 'No assets have been assigned to your account yet. Ask the admin to assign one first.';
  }

  // ✅ Show clear message if there are no assets
  if (!assetsToShow.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent =
      type === 'request'
        ? 'No available assets found'
        : 'No assigned assets found';

    option.disabled = true;
    option.selected = true;

    select.appendChild(option);
    select.disabled = true;
    submitBtn.disabled = true;

    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- Choose an asset --';
  select.appendChild(placeholder);

  assetsToShow.forEach(asset => {
    const option = document.createElement('option');
    option.value = asset.id;

    if (type === 'request' && hasPendingRequest(asset.id)) {
      option.textContent = `${asset.asset_tag} — ${asset.name} (Pending)`;
      option.disabled = true;
    } else {
      option.textContent = `${asset.asset_tag} — ${asset.name}`;
    }

    select.appendChild(option);
  });
}

/* ============================================================
   OPEN REQUEST MODAL
============================================================ */
function openRequestModal(assetId = null, type = 'request') {
  const form = document.getElementById('reqForm');
  if (form) form.reset();

  document.getElementById('reqMessageErr').textContent = '';
  document.getElementById('reqAssetSelectErr').textContent = '';

  document.getElementById('reqMessage').classList.remove('invalid');
  document.getElementById('reqAssetSelect').classList.remove('invalid');

  document.getElementById('reqTypeSelect').value = type;

  populateAssetDropdown(type);

  if (assetId) {
    document.getElementById('reqAssetSelect').value = assetId;
  }

  if (type === 'request') {
    document.getElementById('reqTitle').textContent = 'Request New Asset';
  } else if (type === 'return') {
    document.getElementById('reqTitle').textContent = 'Request Asset Return';
  } else {
    document.getElementById('reqTitle').textContent = 'Report Asset Issue';
  }

  openModal('reqModal');
}

/* ============================================================
   SUBMIT REQUEST
============================================================ */
async function submitRequest(e) {
  e.preventDefault();

  const assetSelect = document.getElementById('reqAssetSelect');
  const typeSelect = document.getElementById('reqTypeSelect');
  const msgEl = document.getElementById('reqMessage');

  const assetId = assetSelect.value;
  const type = typeSelect.value;
  const message = msgEl.value.trim();

  if (assetSelect.disabled || !assetId) {
    document.getElementById('reqAssetSelectErr').textContent =
      type === 'request'
        ? 'No available assets found to request.'
        : 'No assigned assets found. Ask the admin to assign one first.';
    assetSelect.classList.add('invalid');
    return;
  }

  assetSelect.classList.remove('invalid');
  document.getElementById('reqAssetSelectErr').textContent = '';

  if (type === 'request' && hasPendingRequest(assetId)) {
    document.getElementById('reqAssetSelectErr').textContent =
      'You already have a pending request for this asset.';
    return;
  }

  if (message.length < 3) {
    document.getElementById('reqMessageErr').textContent =
      'Please enter at least 3 characters.';
    msgEl.classList.add('invalid');
    return;
  }

  msgEl.classList.remove('invalid');
  document.getElementById('reqMessageErr').textContent = '';

  const btn = document.getElementById('submitReqBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const { error } = await supabase.from('requests').insert({
    asset_id: assetId,
    client_id: me.id,
    type,
    message
  });

  btn.disabled = false;
  btn.textContent = 'Submit Request';

  if (error) {
    toast(error.message, 'err');
    return;
  }

  closeModal('reqModal');
  toast('Request submitted successfully!', 'ok');

  await loadAll();
}

/* ============================================================
   HISTORY
============================================================ */
function renderHistory() {
  const tbody = document.getElementById('myHistory');

  tbody.innerHTML = myHistory.length
    ? myHistory.map(item => {
        const late = isOverdue(item.due_date, item.returned_at);

        return `
          <tr>
            <td><strong>${esc(item.assets?.name || '—')}</strong></td>
            <td><span class="tag">${esc(item.assets?.asset_tag || '')}</span></td>
            <td>${fmtDate(item.assigned_at)}</td>
            <td>${fmtDate(item.due_date)}</td>
            <td>
              ${
                item.returned_at
                  ? fmtDate(item.returned_at)
                  : '<span class="muted">not yet</span>'
              }
            </td>
            <td>
              <span class="badge ${
                item.returned_at
                  ? 'b-resolved'
                  : late
                    ? 'b-overdue'
                    : 'b-assigned'
              }">
                ${
                  item.returned_at
                    ? 'returned'
                    : late
                      ? 'overdue'
                      : 'active'
                }
              </span>
            </td>
          </tr>
        `;
      }).join('')
    : `<tr><td colspan="6" class="empty">No history yet.</td></tr>`;
}

/* ============================================================
   REQUESTS I SUBMITTED
============================================================ */
function renderRequests() {
  const empty = document.getElementById('requestsEmpty');
  const tbody = document.getElementById('myRequests');

  if (!myRequests.length) {
    empty.classList.remove('hidden');
    tbody.innerHTML = '';
    return;
  }

  empty.classList.add('hidden');

  tbody.innerHTML = myRequests.map(request => {
    let typeBadge = '';

    if (request.type === 'return') {
      typeBadge = '<span class="badge b-maintenance">↩ Return</span>';
    } else if (request.type === 'request') {
      typeBadge = '<span class="badge b-available">🛒 New Asset</span>';
    } else {
      typeBadge = '<span class="badge b-assigned">🛠️ Issue</span>';
    }

    return `
      <tr>
        <td>
          <strong>${esc(request.assets?.name || '—')}</strong>
          <div class="muted small">${esc(request.assets?.asset_tag || '')}</div>
        </td>

        <td>${typeBadge}</td>

        <td style="max-width:300px">
          ${esc(request.message)}
        </td>

        <td>${fmtDate(request.created_at)}</td>

        <td>
          <span class="badge b-${request.status}">
            ${request.status}
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

/* ============================================================
   PROFILE
============================================================ */
function fillProfile() {
  document.getElementById('pName').value = me.full_name || '';
  document.getElementById('pPhone').value = me.phone || '';
  document.getElementById('pEmail').value = me.email || '';

  document.getElementById('pPhoneCount').textContent =
    `${(me.phone || '').length}/10`;
}

async function saveProfile(e) {
  e.preventDefault();

  const name = document.getElementById('pName');
  const phone = document.getElementById('pPhone');

  if (!validateAll([ [name, 'fullName'], [phone, 'phone'] ])) return;

  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: name.value.trim().replace(/\s+/g, ' '),
      phone: phone.value
    })
    .eq('id', me.id)
    .select()
    .single();

  btn.disabled = false;
  btn.textContent = 'Save changes';

  const box = document.getElementById('profileAlert');
  box.classList.remove('hidden');

  if (error) {
    box.className = 'alert alert-error';
    box.textContent = error.message;
    return;
  }

  me = data;
  paintUser(me);

  box.className = 'alert alert-ok';
  box.textContent = 'Profile updated successfully.';

  toast('Profile saved.', 'ok');
}

/* ============================================================
   PRINT MY ASSETS RECEIPT
============================================================ */
function printMyAssets() {
  const dateStr = new Date().toLocaleDateString('en-GB');

  const rows = myAssets.length
    ? myAssets.map((asset, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(asset.name)}</td>
          <td>${esc(asset.asset_tag)}</td>
          <td>${esc(asset.serial_number || 'N/A')}</td>
          <td>Good</td>
        </tr>
      `).join('')
    : '<tr><td colspan="5" style="text-align:center">No assets currently assigned.</td></tr>';

  const win = window.open('', '_blank');

  win.document.write(`
    <html>
    <head>
      <title>Equipment Receipt - ${esc(me.full_name)}</title>
      <style>
        body {
          font-family: 'Segoe UI', sans-serif;
          padding: 30px;
          color: #333;
        }

        h1 {
          text-align: center;
          text-transform: uppercase;
          font-size: 1.3rem;
        }

        .info {
          margin-bottom: 20px;
          font-size: 0.95rem;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 40px;
        }

        th, td {
          border: 1px solid #333;
          padding: 10px;
          text-align: left;
          font-size: 13px;
        }

        th {
          background: #f5f5f5;
        }

        .statement {
          margin-top: 40px;
          font-size: 1rem;
          line-height: 1.6;
        }

        .sig {
          margin-top: 60px;
          border-top: 1px solid #333;
          width: 280px;
          padding-top: 5px;
          text-align: center;
          font-size: 0.9rem;
        }

        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 0.8rem;
          color: #888;
        }

        .print-btn {
          padding: 10px 20px;
          margin-top: 30px;
          cursor: pointer;
          background: #4f46e5;
          color: white;
          border: none;
          border-radius: 5px;
        }

        @media print {
          .print-btn {
            display: none;
          }

          body {
            padding: 10px;
          }
        }
      </style>
    </head>

    <body>
      <h1>Equipment Handover Receipt</h1>

      <div class="info">
        <strong>Client Name:</strong> ${esc(me.full_name)}<br>
        <strong>Phone:</strong> ${esc(me.phone)}<br>
        <strong>Date:</strong> ${dateStr}
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th>Asset Tag</th>
            <th>Serial No.</th>
            <th>Condition</th>
          </tr>
        </thead>

        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="statement">
        I, <strong>${esc(me.full_name)}</strong>, acknowledge receipt of the above items in good working condition.
        I agree to take proper care of them and return them upon request or termination of assignment.
      </div>

      <div class="sig">Client Signature & Date</div>

      <div class="footer">
        Generated by AssetTrack • ${dateStr}
      </div>

      <center>
        <button class="print-btn" onclick="window.print()">🖨️ Print Receipt</button>
      </center>
    </body>
    </html>
  `);

  win.document.close();
}
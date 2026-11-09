/* ============================================================
   ADMIN DASHBOARD
   ============================================================ */
import {
  supabase, requireAuth, toast, esc, money, fmtDate,
  paintUser, initShell, openModal, closeModal, isOverdue
} from './config.js';

let me = null;
let assets = [], clients = [], history = [], requests = [];

init();

async function init() {
  const ctx = await requireAuth('admin');
  if (!ctx) return;
  me = ctx.profile;
  paintUser(me);
  initShell();
  wire();
  await loadAll();
}

function wire() {
  document.getElementById('refreshBtn').onclick = loadAll;
  document.getElementById('newAssetBtn').onclick = () => assetForm();
  document.getElementById('searchAsset').oninput = renderAssets;
  document.getElementById('filterStatus').onchange = renderAssets;
  document.getElementById('searchClient').oninput = renderClients;
  document.getElementById('exportBtn').onclick = exportCSV;
  document.getElementById('assetForm').onsubmit = saveAsset;
  document.getElementById('assignForm').onsubmit = doAssign;
  document.getElementById('reportBtn').onclick = generateReport; // 📄 NEW

  document.querySelectorAll('[data-close]').forEach(b =>
    b.onclick = () => closeModal(b.dataset.close));
  document.querySelectorAll('.modal').forEach(m =>
    m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); }));

  document.getElementById('assetRows').addEventListener('click', onAssetAction);
  document.getElementById('requestRows').addEventListener('click', onRequestAction);
}

/* ------------------------------ DATA ------------------------------ */
async function loadAll() {
  const [a, c, h, r] = await Promise.all([
    supabase.from('assets').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('role', 'client').order('full_name'),
    supabase.from('assignments')
      .select('*, assets(name,asset_tag), client:profiles!assignments_client_id_fkey(full_name,phone)')
      .order('assigned_at', { ascending: false }),
    supabase.from('requests')
      .select('*, assets(name,asset_tag), client:profiles!requests_client_id_fkey(full_name)')
      .order('created_at', { ascending: false })
  ]);

  const err = a.error || c.error || h.error || r.error;
  if (err) { toast(err.message, 'err'); return; }

  assets = a.data || []; clients = c.data || [];
  history = h.data || []; requests = r.data || [];

  renderStats(); renderAssets(); renderClients(); renderHistory(); renderRequests();
}

const clientName = id => clients.find(c => c.id === id)?.full_name || '—';

function renderStats() {
  const by = s => assets.filter(a => a.status === s).length;
  document.getElementById('sTotal').textContent     = assets.length;
  document.getElementById('sAvailable').textContent = by('available');
  document.getElementById('sAssigned').textContent  = by('assigned');
  document.getElementById('sMaint').textContent     = by('maintenance');
  document.getElementById('sReq').textContent       = requests.filter(r => r.status === 'open').length;
}

/* ------------------------------ ASSETS ------------------------------ */
function renderAssets() {
  const q = document.getElementById('searchAsset').value.trim().toLowerCase();
  const st = document.getElementById('filterStatus').value;
  const rows = assets.filter(a =>
    (!st || a.status === st) &&
    (!q || [a.asset_tag, a.name, a.serial_number, a.category, a.location]
      .some(v => (v || '').toLowerCase().includes(q))));

  document.getElementById('assetEmpty').classList.toggle('hidden', rows.length > 0);

  document.getElementById('assetRows').innerHTML = rows.map(a => `
    <tr>
      <td><span class="tag">${esc(a.asset_tag)}</span></td>
      <td><strong>${esc(a.name)}</strong><div class="muted small">${esc(a.serial_number || 'no serial')}</div></td>
      <td>${esc(a.category)}</td>
      <td><span class="badge b-${a.status}">${a.status}</span></td>
      <td>${a.assigned_to ? esc(clientName(a.assigned_to)) : '<span class="muted">—</span>'}</td>
      <td>${esc(a.location || '—')}</td>
      <td>${money(a.purchase_cost)}</td>
      <td><div class="actions">
        ${a.status === 'assigned'
          ? `<button class="btn btn-ok btn-sm" data-act="return" data-id="${a.id}">Return</button>`
          : (a.status !== 'retired'
              ? `<button class="btn btn-primary btn-sm" data-act="assign" data-id="${a.id}">Assign</button>` : '')}
        <button class="btn btn-ghost btn-sm" data-act="edit" data-id="${a.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-act="del" data-id="${a.id}">Delete</button>
      </div></td>
    </tr>`).join('');
}

function assetForm(a = null) {
  document.getElementById('assetModalTitle').textContent = a ? 'Edit Asset' : 'New Asset';
  document.getElementById('assetId').value   = a?.id || '';
  document.getElementById('aTag').value      = a?.asset_tag || nextTag();
  document.getElementById('aName').value     = a?.name || '';
  document.getElementById('aCategory').value = a?.category || 'Laptop';
  document.getElementById('aStatus').value   = (a?.status === 'assigned' ? 'available' : a?.status) || 'available';
  document.getElementById('aSerial').value   = a?.serial_number || '';
  document.getElementById('aLocation').value = a?.location || '';
  document.getElementById('aDate').value     = a?.purchase_date || '';
  document.getElementById('aCost').value     = a?.purchase_cost ?? 0;
  document.getElementById('aNotes').value    = a?.notes || '';
  document.getElementById('aStatus').disabled = a?.status === 'assigned';
  openModal('assetModal');
}

function nextTag() {
  const nums = assets.map(a => parseInt((a.asset_tag.match(/(\d+)$/) || [])[1] || 0, 10));
  return 'AST-' + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, '0');
}

async function saveAsset(e) {
  e.preventDefault();
  const id = document.getElementById('assetId').value;
  const payload = {
    asset_tag:     document.getElementById('aTag').value.trim().toUpperCase(),
    name:          document.getElementById('aName').value.trim(),
    category:      document.getElementById('aCategory').value,
    serial_number: document.getElementById('aSerial').value.trim() || null,
    location:      document.getElementById('aLocation').value.trim() || null,
    purchase_date: document.getElementById('aDate').value || null,
    purchase_cost: Number(document.getElementById('aCost').value || 0),
    notes:         document.getElementById('aNotes').value.trim() || null,
    updated_at:    new Date().toISOString()
  };
  if (!document.getElementById('aStatus').disabled)
    payload.status = document.getElementById('aStatus').value;

  if (!payload.asset_tag || !payload.name) { toast('Tag and name are required.', 'err'); return; }
  if (payload.purchase_cost < 0) { toast('Cost cannot be negative.', 'err'); return; }

  const btn = document.getElementById('saveAssetBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  const res = id
    ? await supabase.from('assets').update(payload).eq('id', id)
    : await supabase.from('assets').insert({ ...payload, created_by: me.id });

  btn.disabled = false; btn.textContent = 'Save asset';

  if (res.error) {
    toast(/duplicate/i.test(res.error.message) ? 'That asset tag already exists.' : res.error.message, 'err');
    return;
  }
  closeModal('assetModal');
  toast(id ? 'Asset updated.' : 'Asset added.', 'ok');
  loadAll();
}

async function onAssetAction(e) {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const a = assets.find(x => x.id === btn.dataset.id); if (!a) return;

  if (btn.dataset.act === 'edit') return assetForm(a);

  if (btn.dataset.act === 'del') {
    if (!confirm(`Delete "${a.name}" (${a.asset_tag})? This also removes its history.`)) return;
    const { error } = await supabase.from('assets').delete().eq('id', a.id);
    if (error) return toast(error.message, 'err');
    toast('Asset deleted.', 'ok'); return loadAll();
  }

  if (btn.dataset.act === 'assign') {
    if (!clients.length) return toast('No registered clients yet.', 'err');
    document.getElementById('assignAssetId').value = a.id;
    document.getElementById('assignAssetInfo').textContent = `${a.asset_tag} — ${a.name}`;
    document.getElementById('assignClient').innerHTML = clients
      .map(c => `<option value="${c.id}">${esc(c.full_name)} · ${esc(c.phone)}</option>`).join('');
    document.getElementById('assignDue').value = '';
    document.getElementById('assignNotes').value = '';
    return openModal('assignModal');
  }

  if (btn.dataset.act === 'return') {
    const cond = prompt('Condition on return (good / damaged / needs repair):', 'good');
    if (cond === null) return;
    const { error } = await supabase.rpc('return_asset', { p_asset_id: a.id, p_condition: cond });
    if (error) return toast(error.message, 'err');
    toast('Asset returned to inventory.', 'ok'); loadAll();
  }
}

async function doAssign(e) {
  e.preventDefault();
  const { error } = await supabase.rpc('assign_asset', {
    p_asset_id:  document.getElementById('assignAssetId').value,
    p_client_id: document.getElementById('assignClient').value,
    p_due_date:  document.getElementById('assignDue').value || null,
    p_notes:     document.getElementById('assignNotes').value.trim() || null
  });
  if (error) return toast(error.message, 'err');
  closeModal('assignModal');
  toast('Asset assigned successfully.', 'ok');
  loadAll();
}

/* ------------------------------ CLIENTS ------------------------------ */
function renderClients() {
  const q = document.getElementById('searchClient').value.trim().toLowerCase();
  const rows = clients.filter(c =>
    !q || c.full_name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email || '').includes(q));

  document.getElementById('clientRows').innerHTML = rows.length ? rows.map(c => `
    <tr>
      <td><strong>${esc(c.full_name)}</strong></td>
      <td>${esc(c.phone)}</td>
      <td>${esc(c.email || '—')}</td>
      <td>${assets.filter(a => a.assigned_to === c.id).length}</td>
      <td>${fmtDate(c.created_at)}</td>
    </tr>`).join('')
    : `<tr><td colspan="5" class="empty">No clients found.</td></tr>`;
}

/* ------------------------------ HISTORY ------------------------------ */
function renderHistory() {
  document.getElementById('historyRows').innerHTML = history.length ? history.map(h => {
    const late = isOverdue(h.due_date, h.returned_at);
    return `<tr>
      <td><strong>${esc(h.assets?.name || '—')}</strong>
          <div class="muted small">${esc(h.assets?.asset_tag || '')}</div></td>
      <td>${esc(h.client?.full_name || '—')}<div class="muted small">${esc(h.client?.phone || '')}</div></td>
      <td>${fmtDate(h.assigned_at)}</td>
      <td>${fmtDate(h.due_date)}</td>
      <td>${h.returned_at ? fmtDate(h.returned_at) : '<span class="muted">not yet</span>'}</td>
      <td><span class="badge ${h.returned_at ? 'b-resolved' : (late ? 'b-overdue' : 'b-assigned')}">
        ${h.returned_at ? 'returned' : (late ? 'overdue' : 'active')}</span></td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" class="empty">No assignments yet.</td></tr>`;
}

/* ------------------------------ REQUESTS ------------------------------ */
function renderRequests() {
  document.getElementById('requestRows').innerHTML = requests.length ? requests.map(r => `
    <tr>
      <td><strong>${esc(r.assets?.name || '—')}</strong>
          <div class="muted small">${esc(r.assets?.asset_tag || '')}</div></td>
      <td>${esc(r.client?.full_name || '—')}</td>
      <td><span class="badge ${r.type === 'return' ? 'b-maintenance' : 'b-assigned'}">${r.type}</span></td>
      <td style="max-width:280px">${esc(r.message)}</td>
      <td>${fmtDate(r.created_at)}</td>
      <td><span class="badge b-${r.status}">${r.status}</span></td>
      <td><div class="actions">
        ${r.status === 'open' ? `
          <button class="btn btn-ok btn-sm" data-act="resolve" data-id="${r.id}">
            ${r.type === 'return' ? 'Approve return' : 'Resolve'}</button>
          <button class="btn btn-danger btn-sm" data-act="reject" data-id="${r.id}">Reject</button>` : '—'}
      </div></td>
    </tr>`).join('') : `<tr><td colspan="7" class="empty">No requests submitted.</td></tr>`;
}

async function onRequestAction(e) {
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const r = requests.find(x => x.id === btn.dataset.id); if (!r) return;

  if (btn.dataset.act === 'resolve' && r.type === 'return') {
    const { error } = await supabase.rpc('return_asset', { p_asset_id: r.asset_id, p_condition: 'good' });
    if (error) return toast(error.message, 'err');
    toast('Return approved & asset restocked.', 'ok');
    return loadAll();
  }

  const status = btn.dataset.act === 'resolve' ? 'resolved' : 'rejected';
  const { error } = await supabase.from('requests')
    .update({ status, resolved_at: new Date().toISOString() }).eq('id', r.id);
  if (error) return toast(error.message, 'err');
  toast(`Request ${status}.`, 'ok');
  loadAll();
}

/* ------------------------------ CSV EXPORT ------------------------------ */
function exportCSV() {
  const head = ['Tag','Name','Category','Serial','Status','Assigned To','Location','Cost (KSh)','Purchase Date'];
  const lines = assets.map(a => [
    a.asset_tag, a.name, a.category, a.serial_number || '', a.status,
    a.assigned_to ? clientName(a.assigned_to) : '', a.location || '',
    a.purchase_cost, a.purchase_date || ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const blob = new Blob([head.join(',') + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `assets-${Date.now()}.csv` });
  link.click(); URL.revokeObjectURL(url);
  toast('CSV exported.', 'ok');
}

/* ------------------------------ 📄 REPORT GENERATION ------------------------------ */
function generateReport() {
  const dateStr = new Date().toLocaleDateString('en-GB');
  const activeAssignments = history.filter(h => !h.returned_at).map(h => {
    const asset = assets.find(a => a.id === h.asset_id);
    return {
      tag: asset?.asset_tag || 'N/A',
      name: asset?.name || 'Unknown',
      client: h.client?.full_name || 'Unknown Client',
      assigned: fmtDate(h.assigned_at),
      due: fmtDate(h.due_date),
      value: asset?.purchase_cost || 0
    };
  });

  const totalValue = activeAssignments.reduce((sum, r) => sum + r.value, 0);

  const w = window.open('', '_blank');
  w.document.write(`
    <html>
    <head>
      <title>Asset Report - ${dateStr}</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 30px; color: #333; }
        h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 5px; }
        .meta { text-align: center; margin-bottom: 30px; color: #666; font-size: 0.9rem; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .summary { margin-top: 20px; text-align: right; font-weight: bold; font-size: 1.1rem; }
        .signatures { margin-top: 60px; display: flex; justify-content: space-between; }
        .sig-box { width: 45%; border-top: 1px solid #333; padding-top: 5px; text-align: center; font-size: 0.9rem; }
        .print-btn { padding: 10px 20px; margin-top: 30px; cursor: pointer; background: #4f46e5; color: white; border: none; border-radius: 5px; font-size: 14px; }
        @media print { .print-btn { display: none; } body { padding: 0; } }
      </style>
    </head>
    <body>
      <h1>ASSET ASSIGNMENT REPORT</h1>
      <div class="meta">Generated on: ${dateStr} • AssetTrack System</div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Asset Tag</th>
            <th>Item Name</th>
            <th>Assigned To</th>
            <th>Date Issued</th>
            <th>Return Due</th>
            <th>Value (KSh)</th>
          </tr>
        </thead>
        <tbody>
          ${activeAssignments.length ? activeAssignments.map((r, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${r.tag}</td>
              <td>${r.name}</td>
              <td>${r.client}</td>
              <td>${r.assigned}</td>
              <td>${r.due}</td>
              <td>${money(r.value)}</td>
            </tr>
          `).join('') : '<tr><td colspan="7" style="text-align:center">No assets currently assigned.</td></tr>'}
        </tbody>
      </table>

      <div class="summary">
        Total Items Assigned: ${activeAssignments.length} <br>
        Total Fleet Value: ${money(totalValue)}
      </div>

      <div class="signatures">
        <div class="sig-box">Administrator Signature</div>
        <div class="sig-box">Date</div>
      </div>

      <center>
        <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
      </center>
    </body>
    </html>
  `);
  w.document.close();
}
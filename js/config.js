/* ============================================================
   Supabase client + shared helpers
   👉 REPLACE the two values below with your own project keys
   ============================================================ */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL      = 'https://nvdqrfmmazgwdznuuigb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZHFyZm1tYXpnd2R6bnV1aWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMDkzMTYsImV4cCI6MjEwOTc4NTMxNn0.L8GVYynGCOSHJIRmrKoVsBhO52fo1NoVdsSvH7VrT4M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- Route guard: makes sure the right role is logged in ---------- */
export async function requireAuth(role) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { location.replace('index.html'); return null; }

  const { data: profile, error } = await supabase
    .from('profiles').select('*').eq('id', session.user.id).single();

  if (error || !profile) {
    await supabase.auth.signOut();
    location.replace('index.html');
    return null;
  }
  if (role && profile.role !== role) {
    location.replace(profile.role === 'admin' ? 'admin.html' : 'client.html');
    return null;
  }
  return { session, profile };
}

export async function logout() {
  await supabase.auth.signOut();
  location.replace('index.html');
}

/* ---------- UI helpers ---------- */
export function toast(message, type = 'info', ms = 3200) {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// Change the '$' to 'KSh '
export const money = (n) => 'KSh ' + Number(n || 0).toLocaleString(undefined,
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' })
  : '—';

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2)
  .map(w => w[0]?.toUpperCase() || '').join('') || 'U';

export const isOverdue = (due, returned) =>
  !!due && !returned && new Date(due) < new Date(new Date().toDateString());

export function paintUser(p) {
  const av = document.getElementById('avatar');
  const nm = document.getElementById('userName');
  const rl = document.getElementById('userRole');
  if (av) av.textContent = initials(p.full_name);
  if (nm) nm.textContent = p.full_name;
  if (rl) rl.textContent = p.role;
}

/* ---------- Tab + sidebar wiring shared by both dashboards ---------- */
export function initShell(onTab) {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('[data-panel]').forEach(p =>
        p.classList.toggle('hidden', p.dataset.panel !== tab));
      document.getElementById('pageTitle').textContent = btn.dataset.title || 'Dashboard';
      document.getElementById('sidebar').classList.remove('open');
      onTab?.(tab);
    });
  });
  document.getElementById('menuBtn')?.addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open'));
  document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', logout));
}

export function openModal(id){ document.getElementById(id).classList.remove('hidden'); }
export function closeModal(id){ document.getElementById(id).classList.add('hidden'); }
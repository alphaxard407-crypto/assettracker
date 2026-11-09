/* ============================================================
   LOGIN + SIGN UP
   ============================================================ */
import { supabase, toast } from './config.js';
import { bindField, validateAll, showError, clearError, RULES } from './validation.js';

/* Show / hide password buttons */
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = document.getElementById(btn.dataset.toggle);
    const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.textContent = show ? 'HIDE' : 'SHOW';
  });
});

function alertBox(id, msg, type = 'error') {
  const el = document.getElementById(id);
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideAlert(id){ document.getElementById(id).classList.add('hidden'); }

function busy(btn, on, label) {
  btn.disabled = on;
  if (on) { btn.dataset.txt = btn.textContent; btn.textContent = label || 'Please wait…'; }
  else btn.textContent = btn.dataset.txt;
}

/* ============================ SIGN UP ============================ */
const signupForm = document.getElementById('signupForm');
if (signupForm) {
  const fullName = document.getElementById('fullName');
  const email    = document.getElementById('email');
  const phone    = document.getElementById('phone');
  const password = document.getElementById('password');
  const confirm  = document.getElementById('confirmPassword');

  bindField(fullName, 'fullName');
  bindField(email,    'email');
  bindField(phone,    'phone',    { counter: document.getElementById('phoneCount') });
  bindField(password, 'pin',      { counter: document.getElementById('pwCount') });
  bindField(confirm,  'pin',      { counter: document.getElementById('cpwCount') });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('signupAlert');

    // 🛠️ FIXED: Array of pairs
    const ok = validateAll([
      [fullName, 'fullName'],
      [email,    'email'],
      [phone,    'phone'],
      [password, 'pin']
    ]);

    let match = true;
    if (confirm.value !== password.value) {
      showError(confirm, 'Passwords do not match.'); match = false;
    } else if (!RULES.pin.test(confirm.value)) {
      showError(confirm, RULES.pin.message); match = false;
    } else clearError(confirm);

    if (!ok || !match) { alertBox('signupAlert', 'Please fix the highlighted fields.'); return; }

    const btn = document.getElementById('signupBtn');
    busy(btn, true, 'Creating account…');

    const { data, error } = await supabase.auth.signUp({
      email: email.value.trim().toLowerCase(),
      password: password.value,
      options: {
        data: {
          full_name: fullName.value.trim().replace(/\s+/g, ' '),
          phone: phone.value
        }
      }
    });

    busy(btn, false);

    if (error) { alertBox('signupAlert', error.message); return; }

    if (data.session) {
      toast('Account created. Welcome!', 'ok');
      setTimeout(() => location.replace('client.html'), 700);
    } else {
      alertBox('signupAlert',
        'Account created! Check your email to confirm, then sign in.', 'ok');
      signupForm.reset();
      document.querySelectorAll('.counter').forEach(c => c.textContent = `0/${c.dataset.max}`);
      setTimeout(() => location.replace('index.html'), 2600);
    }
  });
}

/* ============================= LOGIN ============================= */
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  const email = document.getElementById('loginEmail');
  const pw    = document.getElementById('loginPassword');

  bindField(email, 'email');
  bindField(pw, 'pin', { counter: document.getElementById('loginPwCount') });

  // Already signed in? Jump to dashboard.
  (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: p } = await supabase.from('profiles')
      .select('role').eq('id', session.user.id).single();
    if (p) location.replace(p.role === 'admin' ? 'admin.html' : 'client.html');
  })();

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert('loginAlert');

    // 🛠️ FIXED: Array of pairs
    if (!validateAll([ [email, 'email'], [pw, 'pin'] ])) return;

    const btn = document.getElementById('loginBtn');
    busy(btn, true, 'Signing in…');

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value.trim().toLowerCase(),
      password: pw.value
    });

    if (error) {
      busy(btn, false);
      alertBox('loginAlert',
        /confirm/i.test(error.message)
          ? 'Please confirm your email address first.'
          : 'Invalid email or password.');
      return;
    }

    const { data: profile, error: pErr } = await supabase
      .from('profiles').select('role, full_name').eq('id', data.user.id).single();

    busy(btn, false);

    if (pErr || !profile) {
      alertBox('loginAlert', 'Profile not found. Contact the administrator.');
      await supabase.auth.signOut();
      return;
    }

    toast(`Welcome, ${profile.full_name}!`, 'ok');
    setTimeout(() => location.replace(profile.role === 'admin' ? 'admin.html' : 'client.html'), 500);
  });
}
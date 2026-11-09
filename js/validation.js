/* ============================================================
   DATA INTEGRITY RULES
   fullName → letters only  |  phone → 10 digits  |  pin → 6 digits
   ============================================================ */
export const RULES = {
  fullName: {
    allowedChar: /[A-Za-z '\-]/,
    clean: v => v.replace(/[^A-Za-z '\-]/g, '').replace(/ {2,}/g, ' ').replace(/^ +/, '').slice(0, 60),
    test:  v => /^[A-Za-z]{2,}(?:[ '\-][A-Za-z]+)*$/.test(v.trim()),
    message: "Letters only — numbers & symbols are not allowed (min 2 letters)."
  },
  phone: {
    allowedChar: /[0-9]/,
    clean: v => v.replace(/\D/g, '').slice(0, 10),
    test:  v => /^[0-9]{10}$/.test(v),
    message: 'Phone number must be exactly 10 digits (numbers only).'
  },
  pin: {
    allowedChar: /[0-9]/,
    clean: v => v.replace(/\D/g, '').slice(0, 6),
    test:  v => /^[0-9]{6}$/.test(v),
    message: 'Password must be 6 digits (numbers only).'
  },
  email: {
    allowedChar: null,
    clean: v => v.trim().toLowerCase(),
    test:  v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
    message: 'Enter a valid email address.'
  }
};

/* ---------- Helpers ---------- */
function errorNode(input) {
  if (!input || !input.id) return null;
  return document.getElementById(input.id + 'Err')
      || input.parentElement?.parentElement?.querySelector('.error')
      || null;
}

export function showError(input, msg) {
  if (!input || !input.classList) return;
  input.classList.add('invalid');
  input.classList.remove('valid');
  const e = errorNode(input);
  if (e) e.textContent = msg;
}

export function clearError(input, markValid = true) {
  if (!input || !input.classList) return;
  input.classList.remove('invalid');
  if (markValid && input.value) input.classList.add('valid');
  const e = errorNode(input);
  if (e) e.textContent = '';
}

/** Attach live filtering + validation to an input */
export function bindField(input, ruleName, { counter = null, live = false } = {}) {
  const rule = RULES[ruleName];
  if (!input || !rule) return;

  input.addEventListener('beforeinput', (e) => {
    if (!rule.allowedChar || !e.data) return;
    if ([...e.data].some(ch => !rule.allowedChar.test(ch))) {
      e.preventDefault();
      showError(input, rule.message);
    }
  });

  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const cleaned = rule.clean(input.value);
    if (cleaned !== input.value) {
      input.value = cleaned;
      try { input.setSelectionRange(Math.max(0, pos - 1), Math.max(0, pos - 1)); } catch {}
    }
    if (counter) counter.textContent = `${input.value.length}/${counter.dataset.max}`;

    if (input.value === '') {
      input.classList.remove('valid', 'invalid');
      const e = errorNode(input);
      if (e) e.textContent = '';
    } else if (live || input.classList.contains('invalid')) {
      validateField(input, ruleName);
    }
  });

  input.addEventListener('blur', () => {
    if (input.value) validateField(input, ruleName);
  });
}

export function validateField(input, ruleName) {
  if (!input || !input.classList) return false;
  const rule = RULES[ruleName];
  if (!rule) return false;

  const ok = rule.test(input.value);
  ok ? clearError(input) : showError(input, rule.message);
  return ok;
}

/**
 * 🛠️ FIXED: Accepts an ARRAY of [element, ruleName] pairs.
 * Example: validateAll([[nameEl, 'fullName'], [phoneEl, 'phone']])
 */
export function validateAll(pairs) {
  let ok = true, first = null;

  for (const [el, rule] of pairs) {
    if (!validateField(el, rule)) {
      ok = false;
      first = first || el;
    }
  }

  if (first && first.focus) first.focus();
  return ok;
}
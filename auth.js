'use strict';

// ── Auth config ────────────────────────────────────────────────────────────
const AUTH_URL = 'https://rmucbgujvmmtmftxtgxk.supabase.co';
const AUTH_KEY = 'sb_publishable_c1jV7_vPvYm_UDoWzVsc7w_jbbbl0uW';

// ── Session ────────────────────────────────────────────────────────────────
let currentUser = null;
let currentRole = null; // 'gestor' or 'colaborador'

function getSession() {
  try {
    const s = localStorage.getItem('reports_session');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}
function saveSession(session, role) {
  localStorage.setItem('reports_session', JSON.stringify({ ...session, role }));
}
function clearSession() {
  localStorage.removeItem('reports_session');
}

// ── Login ──────────────────────────────────────────────────────────────────
async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');

  if (!email || !password) { errEl.textContent = 'Preencha e-mail e senha.'; return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Entrando...';
  errEl.textContent = '';

  try {
    const res = await fetch(`${AUTH_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': AUTH_KEY
      },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Credenciais inválidas.');

    // Get role from user_roles table
    const roleRes = await fetch(`${AUTH_URL}/rest/v1/user_roles?user_id=eq.${data.user.id}&select=role`, {
      headers: {
        'apikey': AUTH_KEY,
        'Authorization': `Bearer ${data.access_token}`
      }
    });
    const roleData = await roleRes.json();
    console.log('DEBUG user.id:', data.user.id);
    console.log('DEBUG roleRes status:', roleRes.status);
    console.log('DEBUG roleData:', roleData);
    const role = roleData?.[0]?.role || 'colaborador';
    console.log('DEBUG role escolhida:', role);

    currentUser = data.user;
    currentRole = role;
    saveSession(data, role);
    showApp();
  } catch(e) {
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-login"></i> Entrar';
  }
}

// ── Logout ─────────────────────────────────────────────────────────────────
async function logout() {
  const session = getSession();
  if (session?.access_token) {
    await fetch(`${AUTH_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'apikey': AUTH_KEY, 'Authorization': `Bearer ${session.access_token}` }
    }).catch(() => {});
  }
  clearSession();
  currentUser = null;
  currentRole = null;
  showLogin();
}

// ── Access token for API calls ─────────────────────────────────────────────
function getAccessToken() {
  return getSession()?.access_token || AUTH_KEY;
}

// ── Show/hide ──────────────────────────────────────────────────────────────
function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // Show/hide nav items based on role
  const isGestor = currentRole === 'gestor';
  document.querySelectorAll('.nav-gestors-only').forEach(el => {
    el.style.display = isGestor ? 'flex' : 'none';
  });

  // Show user info
  document.getElementById('userEmail').textContent = currentUser?.email || '';
  document.getElementById('userRole').textContent = isGestor ? 'Gestor' : 'Colaborador';

  // Navigate based on role
  if (isGestor) {
    navigate('dashboard');
  } else {
    navigate('upload');
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
function initAuth() {
  const session = getSession();
  if (session?.access_token && session?.user) {
    currentUser = session.user;
    currentRole = session.role || 'colaborador';
    showApp();
  } else {
    showLogin();
  }
}

// Enter key on login form
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') {
    login();
  }
});

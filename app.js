'use strict';

// ── Supabase config ────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://rmucbgujvmmtmftxtgxk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_c1jV7_vPvYm_UDoWzVsc7w_jbbbl0uW';
const BUCKET = 'arquivos';

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  return res;
}

// ── State ──────────────────────────────────────────────────────────────────
const SECTORS = ['Financeiro','Comercial','Marketing','Operações','RH','TI','Jurídico','Logística'];
let reports = [];
let selectedFile = null;

// ── Status logic ───────────────────────────────────────────────────────────
// 'ontime'  → enviado no mesmo dia ou antes da data de referência
// 'late'    → enviado após a data de referência
// 'critical'→ enviado 7+ dias após a data de referência
function getStatus(submittedAt, refDate) {
  const submitted = new Date(submittedAt);

  // Corrige parsing da data no formato DD/MM/YYYY
  const [day, month, year] = refDate.split('/');
  const ref = new Date(`${year}-${month}-${day}T23:59:59`);

  const refPlus7 = new Date(ref);
  refPlus7.setDate(refPlus7.getDate() + 7);

  if (submitted <= ref) return 'ontime';
  if (submitted > refPlus7) return 'critical';
  return 'late';
}

function statusBadge(status) {
  if (status === 'ontime')   return `<span class="badge badge-teal"><i class="ti ti-circle-check"></i> No prazo</span>`;
  if (status === 'critical') return `<span class="badge badge-red"><i class="ti ti-alert-triangle"></i> Crítico</span>`;
  return `<span class="badge badge-amber"><i class="ti ti-clock-exclamation"></i> Atrasado</span>`;
}

function statusLabel(status) {
  if (status === 'ontime')   return `<i class="ti ti-circle-check" style="color:var(--teal)"></i> No prazo`;
  if (status === 'critical') return `<i class="ti ti-alert-triangle" style="color:var(--red)"></i> Crítico`;
  return `<i class="ti ti-clock-exclamation" style="color:var(--amber)"></i> Atrasado`;
}

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setWeekLabel();
  setDefaultDate();
  loadReports();
  registerSW();
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ── Navigation ─────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.remove('hidden');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  const titles = { dashboard: 'Dashboard', upload: 'Enviar report', reports: 'Todos os reports' };
  document.getElementById('mobileTitle').textContent = titles[page];
  if (page === 'dashboard') renderDashboard();
  if (page === 'reports') renderReportsPage();
  if (window.innerWidth <= 680) closeSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('open');
}

// ── Supabase: Load reports ─────────────────────────────────────────────────
async function loadReports() {
  showLoading(true);
  try {
    const res = await sbFetch('/rest/v1/reports?select=*&order=submitted_at.desc', {
      headers: { 'Prefer': 'return=representation' }
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    reports = data.map(r => ({
      id: r.id,
      titulo: r.titulo,
      responsavel: r.responsavel,
      setor: r.setor,
      data: r.data_referencia,
      fileName: r.file_name,
      fileSize: r.file_size,
      fileType: r.file_type,
      status: getStatus(r.submitted_at, r.data_referencia),
      submittedAt: r.submitted_at,
      submittedLabel: new Date(r.submitted_at).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
      fileUrl: r.file_url
    }));
    renderAll();
  } catch(e) {
    showToast('Erro ao carregar reports: ' + e.message);
  } finally {
    showLoading(false);
  }
}

function showLoading(show) {
  const btn = document.getElementById('btnSubmit');
  if (btn) btn.disabled = show;
}

// ── Supabase: Upload file ──────────────────────────────────────────────────
async function uploadFile(file) {
  const ext = file.name.split('.').pop();
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: file
  });
  if (!res.ok) throw new Error('Erro no upload do arquivo: ' + await res.text());
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ── Supabase: Insert report ────────────────────────────────────────────────
async function insertReport(record) {
  const res = await sbFetch('/rest/v1/reports', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify(record)
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

// ── Utils ───────────────────────────────────────────────────────────────────
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff); d.setHours(0,0,0,0);
  return d;
}
function getCurrentWeekKey() {
  return getWeekStart(new Date()).toISOString().split('T')[0];
}
function formatDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function formatSize(b) {
  return b > 1048576 ? (b/1048576).toFixed(1)+' MB' : (b/1024).toFixed(0)+' KB';
}
function setWeekLabel() {
  const now = new Date();
  const s = getWeekStart(now);
  const e = new Date(s); e.setDate(e.getDate() + 4);
  const fmt = d => d.toLocaleDateString('pt-BR', {day:'2-digit', month:'short'});
  document.getElementById('weekLabel').textContent = `${fmt(s)} – ${fmt(e)}`;
}
function setDefaultDate() {
  document.getElementById('fData').value = new Date().toISOString().split('T')[0];
}

// ── File handling ────────────────────────────────────────────────────────────
function handleDrag(e, over) {
  e.preventDefault();
  document.getElementById('dropZone').classList.toggle('over', over);
}
function handleDrop(e) {
  e.preventDefault();
  handleDrag(e, false);
  const f = e.dataTransfer.files[0];
  if (f) selectFile(f);
}
function selectFile(f) {
  if (!f) return;
  const valid = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (!valid.includes(f.type) && !f.name.match(/\.(pdf|doc|docx)$/i)) {
    showToast('Formato inválido. Use PDF ou Word.'); return;
  }
  if (f.size > 20 * 1024 * 1024) { showToast('Arquivo muito grande. Máx. 20 MB.'); return; }
  selectedFile = f;
  const isPdf = f.name.toLowerCase().endsWith('.pdf');
  document.getElementById('filePreviewName').textContent = f.name;
  document.getElementById('filePreviewSize').textContent = formatSize(f.size);
  document.getElementById('filePreviewIcon').innerHTML = `<i class="ti ${isPdf ? 'ti-file-type-pdf' : 'ti-file-type-doc'}"></i>`;
  document.getElementById('filePreview').classList.add('show');
}
function removeFile() {
  selectedFile = null;
  document.getElementById('filePreview').classList.remove('show');
  document.getElementById('fFile').value = '';
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function submitReport() {
  const resp = document.getElementById('fResponsavel').value.trim();
  const setor = document.getElementById('fSetor').value.trim();
  const data = document.getElementById('fData').value;
  const titulo = document.getElementById('fTitulo').value.trim();
  if (!resp || !setor || !data || !titulo || !selectedFile) {
    showToast('Preencha todos os campos e anexe um arquivo.'); return;
  }

  const btn = document.getElementById('btnSubmit');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Enviando...';

  try {
    const fileUrl = await uploadFile(selectedFile);
    const now = new Date();
    const record = {
      titulo, responsavel: resp, setor,
      data_referencia: data,
      file_name: selectedFile.name,
      file_size: formatSize(selectedFile.size),
      file_type: selectedFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
      file_url: fileUrl,
      on_time: getStatus(now.toISOString(), data) === 'ontime',
      submitted_at: now.toISOString()
    };
    await insertReport(record);
    document.getElementById('fResponsavel').value = '';
    document.getElementById('fSetor').value = '';
    setDefaultDate();
    document.getElementById('fTitulo').value = '';
    removeFile();
    showToast('Report enviado com sucesso!');
    await loadReports();
    navigate('dashboard');
  } catch(e) {
    showToast('Erro ao enviar: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> Enviar report';
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderReportsPage();
}

// Returns the most recent Friday at 23:59:59
function getLastFriday() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun ... 6=Sat
  const daysBack = day === 5 ? 0 : (day + 2) % 7; // days since last Friday
  const friday = new Date(now);
  friday.setDate(now.getDate() - daysBack);
  friday.setHours(23, 59, 59, 999);
  return friday;
}

// A sector is "em alerta" if the last Friday deadline passed 10+ days ago
// without any report submitted after that Friday
function isSectorAlert(lastReport) {
  const lastFriday = getLastFriday();
  const alertThreshold = new Date(lastFriday);
  alertThreshold.setDate(alertThreshold.getDate() - 10); // 10 days before last Friday

  // No report ever → alert only if last Friday was 10+ days ago
  if (!lastReport) {
    return lastFriday < alertThreshold ? false : (Date.now() - lastFriday) / (1000*60*60*24) >= 10;
  }

  // Has a report: check if the last submitted report was before the alert threshold
  const lastSubmitted = new Date(lastReport.submittedAt);
  return lastSubmitted < alertThreshold;
}

function renderDashboard() {
  const onTime   = reports.filter(r => r.status === 'ontime').length;
  const late     = reports.filter(r => r.status === 'late').length;
  const critical = reports.filter(r => r.status === 'critical').length;
  const total    = reports.length;

  // Count sectors in alert (no report in 10+ days or never)
  const alertSectors = SECTORS.filter(sector => {
    const last = reports.find(r => r.setor === sector);
    return isSectorAlert(last);
  }).length;

  document.getElementById('kpiOnTime').textContent  = onTime;
  document.getElementById('kpiLate').textContent    = late + (critical > 0 ? ` (+${critical} crítico${critical>1?'s':''})` : '');
  document.getElementById('kpiPending').textContent = alertSectors;
  document.getElementById('kpiTotal').textContent   = total;
  document.getElementById('dashSub').textContent    = total === 0
    ? 'Nenhum report enviado ainda'
    : `${total} report${total !== 1 ? 's' : ''} no total — semana atual`;

  renderSectorGrid();
  renderTimeline();
}

function renderSectorGrid() {
  const grid = document.getElementById('sectorGrid');

  // Always show all sectors
  const stats = SECTORS.map(sector => {
    const sr = reports.filter(r => r.setor === sector);
    const onTime   = sr.filter(r => r.status === 'ontime').length;
    const late     = sr.filter(r => r.status === 'late').length;
    const critical = sr.filter(r => r.status === 'critical').length;
    const total    = sr.length;
    const pct = total > 0 ? Math.round((onTime / total) * 100) : null;
    const lastReport = sr[0] || null;
    const alert = isSectorAlert(lastReport);
    return { sector, total, onTime, late, critical, pct, lastReport, alert };
  }).sort((a, b) => {
    // Sort: ontime first, then late, then alert/never
    if (a.alert && !b.alert) return 1;
    if (!a.alert && b.alert) return -1;
    return (b.pct ?? -1) - (a.pct ?? -1);
  });

  grid.innerHTML = stats.map(s => {
    const pct = s.pct ?? 0;
    const lastStatus = s.lastReport?.status;

    let cardClass, dotClass, ringColor, pctColor, labelHtml;

    if (s.alert) {
      cardClass = 'alert';
      dotClass  = 'dot-orange';
      ringColor = '#F97316';
      pctColor  = '#FB923C';
      const lastFriday = getLastFriday();
      const daysSinceFriday = Math.floor((Date.now() - lastFriday) / (1000*60*60*24));
      const sinceLabel = s.lastReport
        ? `${daysSinceFriday}d desde o prazo`
        : 'nunca enviou';
      labelHtml = `<i class="ti ti-bell-exclamation" style="color:#F97316"></i> Em alerta · ${sinceLabel}`;
    } else if (lastStatus === 'ontime') {
      cardClass = 'ontime'; dotClass = 'dot-teal'; ringColor = '#1D9E75'; pctColor = '#5DCAA5';
      labelHtml = statusLabel(lastStatus) + ' · ' + formatDate(s.lastReport.data);
    } else if (lastStatus === 'critical') {
      cardClass = 'critical'; dotClass = 'dot-red'; ringColor = '#E24B4A'; pctColor = '#f07171';
      labelHtml = statusLabel(lastStatus) + ' · ' + formatDate(s.lastReport.data);
    } else {
      cardClass = 'late'; dotClass = 'dot-amber'; ringColor = '#EF9F27'; pctColor = '#EF9F27';
      labelHtml = statusLabel(lastStatus) + ' · ' + formatDate(s.lastReport.data);
    }

    const r = 22, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
    const fileLink = s.lastReport?.fileUrl
      ? `<a href="${s.lastReport.fileUrl}" target="_blank" style="color:var(--teal-light);font-size:11px;text-decoration:none;margin-top:4px;display:inline-flex;align-items:center;gap:4px"><i class="ti ti-download"></i> Último arquivo</a>`
      : '';

    return `<div class="sector-card ${cardClass}">
      <div class="sector-top">
        <span class="sector-name">${s.sector}</span>
        <span class="sector-status-dot ${dotClass}"></span>
      </div>
      <div class="sector-ring-wrap">
        <svg class="ring-svg" width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
          <circle cx="28" cy="28" r="${r}" fill="none"
            stroke="${ringColor}" stroke-width="4"
            stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
            stroke-dashoffset="${(circ/4).toFixed(1)}"
            stroke-linecap="round"/>
          <text x="28" y="32" text-anchor="middle" font-size="11" font-weight="600"
            fill="${pctColor}" font-family="Inter,sans-serif">${s.total > 0 ? pct+'%' : '—'}</text>
        </svg>
        <div class="sector-stats">
          <span class="stat-line"><span class="stat-num">${s.onTime}</span> no prazo</span>
          <span class="stat-line"><span class="stat-num">${s.late}</span> atrasado</span>
          <span class="stat-line"><span class="stat-num">${s.critical}</span> crítico</span>
          <span class="stat-line"><span class="stat-num">${s.total}</span> total</span>
        </div>
      </div>
      <div class="sector-label">${labelHtml}</div>
      ${fileLink}
    </div>`;
  }).join('');
}

function renderTimeline() {
  const list = document.getElementById('timelineList');
  const slice = reports.slice(0, 8);
  if (!slice.length) {
    list.innerHTML = `<div class="empty-state"><i class="ti ti-inbox"></i><p>Nenhum report enviado ainda.</p></div>`;
    return;
  }
  list.innerHTML = slice.map(r => {
    const ftClass = r.fileType === 'pdf' ? 'ft-pdf' : 'ft-docx';
    const ftIcon  = r.fileType === 'pdf' ? 'ti-file-type-pdf' : 'ti-file-type-doc';
    const submittedDate = new Date(r.submittedAt).toLocaleDateString('pt-BR', {day:'2-digit', month:'short'});
    const dlBtn = r.fileUrl
      ? `<a href="${r.fileUrl}" target="_blank" style="color:var(--text-3);font-size:18px;margin-left:8px" title="Baixar arquivo"><i class="ti ti-download"></i></a>`
      : '';
    return `<div class="timeline-item">
      <div class="timeline-filetype ${ftClass}"><i class="ti ${ftIcon}"></i></div>
      <div class="timeline-info">
        <div class="timeline-title">${r.titulo}</div>
        <div class="timeline-meta">
          <span>${r.responsavel}</span>
          <span class="badge badge-gray">${r.setor}</span>
          <span>Ref: ${formatDate(r.data)}</span>
        </div>
      </div>
      <div class="timeline-right" style="display:flex;align-items:center;gap:4px">
        <div>
          ${statusBadge(r.status)}
          <div class="timeline-date" style="margin-top:4px">${submittedDate}</div>
        </div>
        ${dlBtn}
      </div>
    </div>`;
  }).join('');
}

// ── Reports page ───────────────────────────────────────────────────────────────
function renderReportsPage() {
  const q  = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const sf = document.getElementById('filterSetor')?.value || '';
  const ss = document.getElementById('filterStatus')?.value || '';
  const filtered = reports.filter(r => {
    const matchQ  = !q  || (r.titulo + r.responsavel + r.setor).toLowerCase().includes(q);
    const matchS  = !sf || r.setor === sf;
    const matchSt = !ss || r.status === ss;
    return matchQ && matchS && matchSt;
  });
  const tbody = document.getElementById('reportsTableBody');
  const empty = document.getElementById('reportsEmpty');
  if (!filtered.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = filtered.map(r => {
    const submittedDate = new Date(r.submittedAt).toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'});
    const dl = r.fileUrl
      ? `<a href="${r.fileUrl}" target="_blank" class="btn-download" title="Baixar"><i class="ti ti-download"></i></a>`
      : '—';
    return `<tr>
      <td class="cell-title">${r.titulo}</td>
      <td>${r.responsavel}</td>
      <td><span class="badge badge-gray">${r.setor}</span></td>
      <td>${formatDate(r.data)}</td>
      <td>${submittedDate}</td>
      <td>${statusBadge(r.status)}</td>
      <td>${dl}</td>
    </tr>`;
  }).join('');
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

const style = document.createElement('style');
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

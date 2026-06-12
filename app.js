'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const SECTORS = ['Financeiro','Comercial','Marketing','Operações','RH','TI','Jurídico','Logística'];
const DEADLINE_DAY = 5; // Friday (0=Sun...6=Sat)
let reports = [];
let selectedFile = null;

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  setWeekLabel();
  setDefaultDate();
  renderAll();
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

// ── Storage ─────────────────────────────────────────────────────────────────
function saveToStorage() {
  try { localStorage.setItem('reports_pwa', JSON.stringify(reports)); } catch(e) {}
}
function loadFromStorage() {
  try {
    const d = localStorage.getItem('reports_pwa');
    if (d) reports = JSON.parse(d);
  } catch(e) { reports = []; }
}

// ── Utils ───────────────────────────────────────────────────────────────────
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
}
function getWeekEnd(date) {
  const s = getWeekStart(date);
  s.setDate(s.getDate() + 4); // Friday
  s.setHours(23,59,59,999);
  return s;
}
function isOnTime(submittedAt, refDate) {
  const ref = new Date(refDate);
  const deadline = getWeekEnd(ref);
  return new Date(submittedAt) <= deadline;
}
function getCurrentWeekKey() {
  const now = new Date();
  const s = getWeekStart(now);
  return s.toISOString().split('T')[0];
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
  const e = getWeekEnd(now);
  const fmt = (d) => d.toLocaleDateString('pt-BR', {day:'2-digit', month:'short'});
  document.getElementById('weekLabel').textContent = `${fmt(s)} – ${fmt(e)}`;
}
function setDefaultDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('fData').value = today;
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
function submitReport() {
  const resp = document.getElementById('fResponsavel').value.trim();
  const setor = document.getElementById('fSetor').value;
  const data = document.getElementById('fData').value;
  const titulo = document.getElementById('fTitulo').value.trim();
  if (!resp || !setor || !data || !titulo || !selectedFile) {
    showToast('Preencha todos os campos e anexe um arquivo.'); return;
  }
  const now = new Date();
  const r = {
    id: Date.now(),
    responsavel: resp, setor, data, titulo,
    fileName: selectedFile.name,
    fileSize: formatSize(selectedFile.size),
    fileType: selectedFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
    submittedAt: now.toISOString(),
    submittedLabel: now.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
    onTime: isOnTime(now.toISOString(), data)
  };
  reports.unshift(r);
  saveToStorage();
  // Reset form
  document.getElementById('fResponsavel').value = '';
  document.getElementById('fSetor').value = '';
  setDefaultDate();
  document.getElementById('fTitulo').value = '';
  removeFile();
  showToast('Report enviado com sucesso!');
  navigate('dashboard');
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderReportsPage();
}

function renderDashboard() {
  const onTime = reports.filter(r => r.onTime).length;
  const late = reports.filter(r => !r.onTime).length;
  const total = reports.length;

  // Pending: sectors with no report this week
  const weekKey = getCurrentWeekKey();
  const thisWeekSectors = new Set(
    reports
      .filter(r => getWeekStart(r.data).toISOString().split('T')[0] === weekKey)
      .map(r => r.setor)
  );
  const pending = SECTORS.filter(s => !thisWeekSectors.has(s)).length;

  document.getElementById('kpiOnTime').textContent = onTime;
  document.getElementById('kpiLate').textContent = late;
  document.getElementById('kpiPending').textContent = pending;
  document.getElementById('kpiTotal').textContent = total;

  const sub = total === 0
    ? 'Nenhum report enviado ainda'
    : `${total} report${total !== 1 ? 's' : ''} no total — semana atual`;
  document.getElementById('dashSub').textContent = sub;

  renderSectorGrid();
  renderTimeline();
}

function renderSectorGrid() {
  const grid = document.getElementById('sectorGrid');
  if (!reports.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <i class="ti ti-sparkles"></i>
      <p>Clique em <strong>✦ Gerar dados demo</strong> ou envie o primeiro report.</p>
    </div>`;
    return;
  }

  // Build per-sector stats
  const stats = SECTORS.map(sector => {
    const sectorReports = reports.filter(r => r.setor === sector);
    const onTime = sectorReports.filter(r => r.onTime).length;
    const late = sectorReports.filter(r => !r.onTime).length;
    const total = sectorReports.length;
    const pct = total > 0 ? Math.round((onTime / total) * 100) : null;
    const lastReport = sectorReports[0];
    return { sector, total, onTime, late, pct, lastReport };
  }).filter(s => s.total > 0)
    .sort((a,b) => (b.pct ?? -1) - (a.pct ?? -1));

  if (!stats.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-inbox"></i><p>Nenhum report enviado ainda.</p></div>`;
    return;
  }

  grid.innerHTML = stats.map(s => {
    const pct = s.pct ?? 0;
    const statusClass = pct >= 80 ? 'ontime' : pct >= 50 ? 'late' : 'missing';
    const dotClass = pct >= 80 ? 'dot-teal' : pct >= 50 ? 'dot-amber' : 'dot-gray';
    const pctClass = pct >= 80 ? 'teal' : pct >= 50 ? 'amber' : 'gray';
    const r = 22, circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    const lastDate = s.lastReport ? formatDate(s.lastReport.data) : '—';
    const lastLabel = s.lastReport?.onTime
      ? `<i class="ti ti-circle-check" style="color:var(--teal)"></i> No prazo`
      : `<i class="ti ti-clock-exclamation" style="color:var(--amber)"></i> Em atraso`;

    return `<div class="sector-card ${statusClass}">
      <div class="sector-top">
        <span class="sector-name">${s.sector}</span>
        <span class="sector-status-dot ${dotClass}"></span>
      </div>
      <div class="sector-ring-wrap">
        <svg class="ring-svg" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
          <circle cx="28" cy="28" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="4"/>
          <circle cx="28" cy="28" r="${r}" fill="none"
            stroke="${pct >= 80 ? '#1D9E75' : pct >= 50 ? '#EF9F27' : '#5c6474'}"
            stroke-width="4"
            stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
            stroke-dashoffset="${(circ / 4).toFixed(1)}"
            stroke-linecap="round"
            style="transition:stroke-dasharray 0.6s ease"/>
          <text x="28" y="32" text-anchor="middle" font-size="11" font-weight="600"
            fill="${pct >= 80 ? '#5DCAA5' : pct >= 50 ? '#EF9F27' : '#5c6474'}"
            font-family="Inter,sans-serif">${pct}%</text>
        </svg>
        <div class="sector-stats">
          <span class="stat-line"><span class="stat-num">${s.onTime}</span> no prazo</span>
          <span class="stat-line"><span class="stat-num">${s.late}</span> em atraso</span>
          <span class="stat-line"><span class="stat-num">${s.total}</span> total</span>
        </div>
      </div>
      <div class="sector-label">${lastLabel} · ${lastDate}</div>
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
    const badge = r.onTime
      ? `<span class="badge badge-teal"><i class="ti ti-circle-check"></i> No prazo</span>`
      : `<span class="badge badge-amber"><i class="ti ti-clock-exclamation"></i> Em atraso</span>`;
    const ftClass = r.fileType === 'pdf' ? 'ft-pdf' : 'ft-docx';
    const ftIcon = r.fileType === 'pdf' ? 'ti-file-type-pdf' : 'ti-file-type-doc';
    const submittedDate = new Date(r.submittedAt).toLocaleDateString('pt-BR', {day:'2-digit', month:'short'});
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
      <div class="timeline-right">
        ${badge}
        <div class="timeline-date" style="margin-top:4px">${submittedDate}</div>
      </div>
    </div>`;
  }).join('');
}

// ── Reports page ───────────────────────────────────────────────────────────────
function renderReportsPage() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const sf = document.getElementById('filterSetor')?.value || '';
  const ss = document.getElementById('filterStatus')?.value || '';

  const filtered = reports.filter(r => {
    const matchQ = !q || (r.titulo + r.responsavel + r.setor).toLowerCase().includes(q);
    const matchS = !sf || r.setor === sf;
    const matchSt = !ss || (ss === 'ontime' ? r.onTime : !r.onTime);
    return matchQ && matchS && matchSt;
  });

  const tbody = document.getElementById('reportsTableBody');
  const empty = document.getElementById('reportsEmpty');

  if (!filtered.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = filtered.map(r => {
    const badge = r.onTime
      ? `<span class="badge badge-teal"><i class="ti ti-circle-check"></i> No prazo</span>`
      : `<span class="badge badge-amber"><i class="ti ti-clock-exclamation"></i> Em atraso</span>`;
    const submittedDate = new Date(r.submittedAt).toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'});
    return `<tr>
      <td class="cell-title">${r.titulo}</td>
      <td>${r.responsavel}</td>
      <td><span class="badge badge-gray">${r.setor}</span></td>
      <td>${formatDate(r.data)}</td>
      <td>${submittedDate}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

// ── Seed demo data ─────────────────────────────────────────────────────────────
function seedData() {
  const now = new Date();
  const thisWeek = getWeekStart(now);

  const makeDate = (weeksAgo, dayOffset) => {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - (weeksAgo * 7) + dayOffset);
    return d.toISOString().split('T')[0];
  };
  const makeSubmit = (refDate, hoursDelay) => {
    const d = new Date(refDate);
    d.setHours(9 + hoursDelay, Math.floor(Math.random()*60));
    return d.toISOString();
  };

  const seed = [
    // This week — mix of on time and late
    { setor:'Financeiro', responsavel:'Ana Souza', titulo:'Report financeiro – semana atual', data: makeDate(0,0), submittedAt: makeSubmit(makeDate(0,4), 2), fileType:'pdf' },
    { setor:'TI', responsavel:'Carlos Lima', titulo:'TI – relatório de incidentes', data: makeDate(0,0), submittedAt: makeSubmit(makeDate(0,4), 8), fileType:'docx' },
    { setor:'RH', responsavel:'Beatriz Nunes', titulo:'RH – movimentações semanais', data: makeDate(0,0), submittedAt: makeSubmit(makeDate(0,7), 3), fileType:'pdf' },
    { setor:'Comercial', responsavel:'Diego Ramos', titulo:'Vendas semanais – Comercial', data: makeDate(0,0), submittedAt: makeSubmit(makeDate(0,4), 1), fileType:'docx' },
    // Last week
    { setor:'Financeiro', responsavel:'Ana Souza', titulo:'Report financeiro – semana 23', data: makeDate(1,0), submittedAt: makeSubmit(makeDate(1,4), 3), fileType:'pdf' },
    { setor:'Marketing', responsavel:'Fernanda Costa', titulo:'Marketing – campanhas ativas', data: makeDate(1,0), submittedAt: makeSubmit(makeDate(1,4), 5), fileType:'pdf' },
    { setor:'Operações', responsavel:'Gustavo Pereira', titulo:'Ops – KPIs semanais', data: makeDate(1,0), submittedAt: makeSubmit(makeDate(1,5), 10), fileType:'docx' },
    { setor:'TI', responsavel:'Carlos Lima', titulo:'TI – deploys e uptime', data: makeDate(1,0), submittedAt: makeSubmit(makeDate(1,4), 4), fileType:'docx' },
    { setor:'RH', responsavel:'Beatriz Nunes', titulo:'RH – relatório semana 23', data: makeDate(1,0), submittedAt: makeSubmit(makeDate(1,6), 8), fileType:'pdf' },
    { setor:'Jurídico', responsavel:'Helena Matos', titulo:'Jurídico – contratos semana 23', data: makeDate(1,0), submittedAt: makeSubmit(makeDate(1,3), 6), fileType:'docx' },
    // 2 weeks ago
    { setor:'Logística', responsavel:'Igor Alves', titulo:'Logística – entregas e prazos', data: makeDate(2,0), submittedAt: makeSubmit(makeDate(2,4), 2), fileType:'pdf' },
    { setor:'Comercial', responsavel:'Diego Ramos', titulo:'Vendas – semana 22', data: makeDate(2,0), submittedAt: makeSubmit(makeDate(2,5), 12), fileType:'docx' },
    { setor:'Marketing', responsavel:'Fernanda Costa', titulo:'Marketing – resultados semana 22', data: makeDate(2,0), submittedAt: makeSubmit(makeDate(2,7), 4), fileType:'pdf' },
    { setor:'Financeiro', responsavel:'Ana Souza', titulo:'Report financeiro – semana 22', data: makeDate(2,0), submittedAt: makeSubmit(makeDate(2,4), 6), fileType:'pdf' },
  ];

  const existing = new Set(reports.map(r => r.titulo + r.setor));
  const newOnes = seed
    .filter(s => !existing.has(s.titulo + s.setor))
    .map((s, i) => ({
      id: Date.now() + i,
      ...s,
      fileName: s.titulo.replace(/\s+/g,'-').toLowerCase() + '.' + s.fileType,
      fileSize: (Math.random() * 3 + 0.5).toFixed(1) + ' MB',
      onTime: isOnTime(s.submittedAt, s.data),
      submittedLabel: new Date(s.submittedAt).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})
    }));

  if (!newOnes.length) { showToast('Dados demo já foram gerados.'); return; }
  reports = [...newOnes, ...reports].sort((a,b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  saveToStorage();
  renderAll();
  showToast(`${newOnes.length} reports demo adicionados!`);
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

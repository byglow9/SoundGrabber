'use strict';

// =============================================================================
// Section 1: State variables
// =============================================================================

let state = 'IDLE';
let jobId = null;
let pollTimer = null;
let timeoutTimer = null;
let countdownTimer = null;
let isPolling = false;  // WR-03: flag de guarda contra chamadas concorrentes ao pollStatus
let currentMode = 'baixar'; // 'baixar' | 'analisar'

// =============================================================================
// Section 2: DOM refs
// =============================================================================

const $ = id => document.getElementById(id);

// =============================================================================
// Section 3: setState(newState, payload)
// Central dispatcher — calls the appropriate show*() function.
// =============================================================================

function setState(newState, payload = {}) {
  state = newState;
  switch (newState) {
    case 'IDLE':              showIdle(); break;
    case 'SUBMITTING':        showSubmitting(); break;
    case 'POLLING':           showPolling(payload.label || 'Processando...'); break;
    case 'DONE':              showDone(payload); break;
    case 'ERROR_VALIDATION':  showErrorValidation(payload.message || ''); break;
    case 'ERROR_RATE_LIMIT':  showErrorRateLimit(payload.retryAfter || 60); break;
    case 'ERROR_JOB':         showErrorJob(payload.message || 'Algo deu errado. Tente novamente.'); break;
    case 'ERROR_TIMEOUT':     showErrorTimeout(); break;
  }
}

// =============================================================================
// Section 4: API functions
// =============================================================================

function switchMode(mode) {
  currentMode = mode;
  setState('IDLE');
  $('mode-btn').textContent = mode === 'baixar' ? 'ANALISAR' : 'BAIXAR';
}

async function uploadFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['wav', 'mp3', 'flac', 'm4a'].includes(ext)) {
    setState('ERROR_VALIDATION', { message: 'Formato inválido. Use WAV, MP3, FLAC ou M4A.' });
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    setState('ERROR_VALIDATION', { message: 'Arquivo muito grande. Máximo 50 MB.' });
    return;
  }

  $('selected-file').textContent = file.name;
  clearAllTimers();
  setState('SUBMITTING');

  try {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/analyze', { method: 'POST', body: formData });

    if (response.status === 202) {
      const data = await response.json();
      if (!data.job_id) { setState('ERROR_JOB', { message: 'Algo deu errado. Tente novamente.' }); return; }
      setState('POLLING', { label: 'Processando...' });
      startPolling(data.job_id);
      return;
    }
    if (response.status === 413) { setState('ERROR_VALIDATION', { message: 'Arquivo muito grande. Máximo 50 MB.' }); return; }
    if (response.status === 422) {
      const data = await response.json();
      setState('ERROR_VALIDATION', { message: data.error || 'Formato inválido.' });
      return;
    }
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
      setState('ERROR_RATE_LIMIT', { retryAfter });
      return;
    }
    setState('ERROR_JOB', { message: 'Algo deu errado. Tente novamente.' });
  } catch (err) {
    setState('ERROR_JOB', { message: 'Erro de conexão. Verifique sua internet e tente novamente.' });
  }
}

// =============================================================================
// Section 4b: Análise em lote (modo ANALISAR — até 5 arquivos, sequencial)
// Fluxo promise-based dedicado; NÃO usa a state machine single-result nem os
// timers globais, para não interferir no fluxo de download/arquivo único.
// =============================================================================

const SG_MAX_BATCH = 5;
const SG_ALLOWED_EXT = ['wav', 'mp3', 'flac', 'm4a'];
const SG_MAX_BYTES = 50 * 1024 * 1024;

function sgSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retorna mensagem de erro curta se inválido, ou null se ok.
function sgValidateAudioFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!SG_ALLOWED_EXT.includes(ext)) return 'formato inválido';
  if (file.size > SG_MAX_BYTES) return 'maior que 50 MB';
  return null;
}

// Envia 1 arquivo e aguarda o resultado do job (polling dedicado).
// onStatus(label) é chamado a cada etapa. Resolve { ok, data } ou { ok:false, message }.
async function sgAnalyzeOne(file, onStatus) {
  let response;
  try {
    const formData = new FormData();
    formData.append('file', file);
    response = await fetch('/analyze', { method: 'POST', body: formData });
  } catch (err) {
    return { ok: false, message: 'erro de conexão' };
  }

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
    return { ok: false, message: `limite atingido, aguarde ${retryAfter}s` };
  }
  if (response.status === 413) return { ok: false, message: 'maior que 50 MB' };
  if (response.status === 422) {
    let msg = 'formato inválido';
    try { const d = await response.json(); if (d.error) msg = d.error; } catch (e) { /* ignore */ }
    return { ok: false, message: msg };
  }
  if (response.status !== 202) return { ok: false, message: 'falha no envio' };

  let jid;
  try { jid = (await response.json()).job_id; } catch (e) { /* ignore */ }
  if (!jid) return { ok: false, message: 'falha no envio' };

  const started = Date.now();
  const TIMEOUT_MS = 180 * 1000;
  while (Date.now() - started < TIMEOUT_MS) {
    await sgSleep(2000);
    let r;
    try { r = await fetch(`/jobs/${jid}`); } catch (e) { return { ok: false, message: 'erro de conexão' }; }
    if (!r.ok) return { ok: false, message: 'erro ao consultar status' };
    let d;
    try { d = await r.json(); } catch (e) { return { ok: false, message: 'resposta inválida' }; }
    if (d.status === 'done') return { ok: true, data: d };
    if (d.status === 'failed') {
      return { ok: false, message: d.error_type === 'internal_error' ? 'erro interno' : 'falha na análise' };
    }
    if (onStatus) onStatus(stageLabel(d.status, d.stage));
  }
  return { ok: false, message: 'tempo esgotado' };
}

// Mostra a tabela de lote e esconde as outras áreas (fluxo próprio, fora da state machine).
function sgShowBatch() {
  $('form-area').hidden = true;
  $('submit-btn').hidden = true;
  $('progress-area').hidden = true;
  $('result-card').hidden = true;
  $('error-area').hidden = true;
  $('validation-error').hidden = true;
  $('batch-area').hidden = false;
}

function sgSetCell(row, cls, text) {
  const cell = row.querySelector('.' + cls);
  if (cell) cell.textContent = text;
}

// Cria uma linha da tabela de resultados. Retorna o <tr>.
function sgAddBatchRow(name) {
  const tr = document.createElement('tr');
  ['file', 'bpm', 'key', 'cam', 'status'].forEach((k) => {
    const td = document.createElement('td');
    td.className = 'batch-cell-' + k;
    tr.appendChild(td);
  });
  $('batch-tbody').appendChild(tr);
  sgSetCell(tr, 'batch-cell-file', name);
  sgSetCell(tr, 'batch-cell-bpm', '-');
  sgSetCell(tr, 'batch-cell-key', '-');
  sgSetCell(tr, 'batch-cell-cam', '-');
  sgSetCell(tr, 'batch-cell-status', 'na fila');
  return tr;
}

// Motor da fila: valida, monta a tabela e processa em série (1 arquivo por vez).
async function analyzeQueue(fileList) {
  const all = Array.from(fileList);
  const files = all.slice(0, SG_MAX_BATCH);

  // 1 arquivo → mantém o card detalhado atual (sem regressão de UX).
  if (files.length === 1) {
    uploadFile(files[0]);
    return;
  }

  clearAllTimers();
  $('batch-tbody').textContent = '';
  $('batch-note').textContent = all.length > SG_MAX_BATCH
    ? `Máximo de ${SG_MAX_BATCH} arquivos por vez, analisando os ${SG_MAX_BATCH} primeiros.`
    : '';
  sgShowBatch();

  // Monta as linhas; inválidos já marcados com erro (não travam o lote).
  const rows = files.map((file) => ({
    file,
    tr: sgAddBatchRow(file.name),
    invalid: sgValidateAudioFile(file),
  }));

  // Processa em série.
  for (const item of rows) {
    if (item.invalid) {
      item.tr.classList.add('batch-row-error');
      sgSetCell(item.tr, 'batch-cell-status', item.invalid);
      continue;
    }
    sgSetCell(item.tr, 'batch-cell-status', 'analisando...');
    const res = await sgAnalyzeOne(item.file, (label) => {
      sgSetCell(item.tr, 'batch-cell-status', label);
    });
    if (res.ok) {
      sgSetCell(item.tr, 'batch-cell-bpm', res.data.bpm ?? '-');
      sgSetCell(item.tr, 'batch-cell-key', res.data.key ?? '-');
      sgSetCell(item.tr, 'batch-cell-cam', res.data.camelot ?? '-');
      sgSetCell(item.tr, 'batch-cell-status', 'concluído');
    } else {
      item.tr.classList.add('batch-row-error');
      sgSetCell(item.tr, 'batch-cell-status', res.message);
    }
  }
}

// clearAllTimers() — called at start of submitJob() to prevent ghost timers (Pitfall 4)
function clearAllTimers() {
  stopPolling();
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
}

async function submitJob(url) {
  // Clear ALL timers before anything else (Pitfall 4)
  clearAllTimers();

  try {
    const response = await fetch('/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url: url })  // FIELD: youtube_url, NOT "url" (Pitfall 1)
    });

    if (response.status === 202) {
      const data = await response.json();
      if (!data.job_id) {
        // WR-04: resposta malformada sem job_id — evitar polling em /jobs/undefined
        setState('ERROR_JOB', { message: 'Algo deu errado. Tente novamente.' });
        return;
      }
      setState('POLLING', { label: 'Processando...' });
      startPolling(data.job_id);
      return;
    }

    if (response.status === 422) {
      const data = await response.json();
      let message;
      if (data.error_type === 'validation_error') {
        if (data.error && data.error.includes('YouTube')) {
          message = 'URL inválida. Use um link do YouTube (youtube.com ou youtu.be).';
        } else if (data.error && (data.error.includes('too long') || data.error.includes('15'))) {
          message = 'Vídeo com mais de 15 minutos. Escolha um vídeo mais curto.';
        } else {
          message = 'URL inválida. Verifique o link e tente novamente.';
        }
      } else {
        message = 'URL inválida. Verifique o link e tente novamente.';
      }
      setState('ERROR_VALIDATION', { message });
      return;
    }

    if (response.status === 429) {
      // Pitfall 6: parseInt with fallback in case header is null or filtered by proxy
      const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
      setState('ERROR_RATE_LIMIT', { retryAfter });
      return;
    }

    // Unexpected HTTP status
    setState('ERROR_JOB', { message: 'Algo deu errado. Tente novamente.' });

  } catch (err) {
    // Pitfall 5: fetch() throws TypeError for network failures — not caught by response.ok check
    setState('ERROR_JOB', { message: 'Erro de conexão. Verifique sua internet e tente novamente.' });
  }
}

function startPolling(id) {
  jobId = id;
  pollTimer = setInterval(pollStatus, 2000);
  timeoutTimer = setTimeout(() => {
    stopPolling();
    setState('ERROR_TIMEOUT');
  }, 180 * 1000);
}

function stopPolling() {
  clearInterval(pollTimer);
  clearTimeout(timeoutTimer);
  pollTimer = null;
  timeoutTimer = null;
  isPolling = false;  // WR-03: resetar flag ao parar o polling
}

async function pollStatus() {
  if (isPolling) return;  // WR-03: prevenir chamada concorrente
  isPolling = true;
  try {
    const response = await fetch(`/jobs/${jobId}`);
    if (!response.ok) {
      stopPolling();
      setState('ERROR_JOB', { message: 'Erro ao consultar status do job.' });
      return;
    }
    const data = await response.json();
    const { status, stage } = data;

    if (status === 'done') {
      stopPolling();
      setState('DONE', data);
      return;
    }

    if (status === 'failed') {
      stopPolling();
      let message;
      if (data.error_type === 'download_error') {
        message = 'Não foi possível baixar o vídeo. O YouTube pode ter bloqueado o acesso. Tente novamente.';
      } else if (data.error_type === 'internal_error') {
        message = 'Erro interno. Tente novamente.';
      } else {
        message = 'Algo deu errado. Tente novamente.';
      }
      setState('ERROR_JOB', { message });
      return;
    }

    // queued / downloading / converting / analyzing — update progress label, continue polling
    setState('POLLING', { label: stageLabel(status, stage) });

  } catch (err) {
    stopPolling();
    setState('ERROR_JOB', { message: 'Erro de conexão. Verifique sua internet e tente novamente.' });
  } finally {
    isPolling = false;  // WR-03: sempre liberar a flag ao concluir
  }
}

// =============================================================================
// Section 5: UI updaters (one per state)
// =============================================================================

function showIdle() {
  $('url-input').classList.remove('sg-url-input--error');  // D-04: remove error highlight
  $('url-input').disabled = false;
  $('url-input').value = '';
  $('submit-btn').disabled = false;
  $('submit-btn').textContent = 'Baixar Beat';
  $('submit-btn').hidden = currentMode === 'analisar';
  $('form-area').hidden = currentMode === 'analisar';
  $('dropzone-area').hidden = currentMode === 'baixar';
  $('progress-area').hidden = true;
  $('result-card').hidden = true;
  $('batch-area').hidden = true;
  $('error-area').hidden = true;
  $('validation-error').hidden = true;
  $('dropzone').classList.remove('sg-dropzone--active');
  $('selected-file').textContent = '';
}

function showSubmitting() {
  $('url-input').classList.remove('sg-url-input--error');  // D-04: remove error highlight
  $('url-input').disabled = true;
  $('submit-btn').disabled = true;
  $('submit-btn').textContent = 'Enviando...';
  $('submit-btn').hidden = currentMode === 'analisar';
  if (currentMode === 'analisar') {
    $('progress-area').hidden = false;
    $('progress-label').textContent = 'Enviando arquivo...';
  } else {
    $('progress-area').hidden = true;
  }
  $('result-card').hidden = true;
  $('error-area').hidden = true;
  $('validation-error').hidden = true;
}

function showPolling(label) {
  $('url-input').disabled = true;
  $('submit-btn').disabled = true;
  $('submit-btn').textContent = 'Processando...';
  $('submit-btn').hidden = false;
  $('progress-area').hidden = false;
  $('progress-label').textContent = label;
  $('result-card').hidden = true;
  $('error-area').hidden = true;
  $('validation-error').hidden = true;
}

function showDone(data) {
  $('form-area').hidden = currentMode === 'analisar';
  $('dropzone-area').hidden = currentMode === 'baixar';
  if (currentMode === 'baixar') {
    $('submit-btn').hidden = false;
    $('submit-btn').disabled = true;
    $('submit-btn').textContent = 'Concluído';
  } else {
    $('submit-btn').hidden = true;
  }
  $('progress-area').hidden = true;
  $('result-card').hidden = false;
  $('error-area').hidden = true;
  $('validation-error').hidden = true;

  // Populate result values using textContent — XSS mitigation (T-04-04)
  $('bpm-value').textContent = data.bpm ?? '';
  $('bpm-half-value').textContent = data.bpm_half ?? '';
  $('bpm-double-value').textContent = data.bpm_double ?? '';
  $('key-value').textContent = data.key ?? '';
  $('camelot-value').textContent = data.camelot ?? '';
  $('size-value').textContent = formatSizeMB(estimateSizeMB(data.duration_sec ?? 0));

  if (data.download_url) {
    const downloadHref = data.download_url.startsWith('/files/') ? data.download_url : '/files/' + jobId;
    $('download-link').href = downloadHref;
    $('download-area').hidden = false;
  } else {
    $('download-area').hidden = true;
  }
}

function showErrorValidation(msg) {
  if (currentMode === 'analisar') {
    $('error-area').hidden = false;
    $('retry-btn').hidden = true;
    $('error-message').textContent = msg;
    $('progress-area').hidden = true;
    $('result-card').hidden = true;
    $('validation-error').hidden = true;
    return;
  }
  // D-04: highlight input field visually
  $('url-input').classList.add('sg-url-input--error');
  $('url-input').disabled = false;
  $('submit-btn').disabled = false;
  $('submit-btn').textContent = 'Baixar Beat';
  $('submit-btn').hidden = false;
  $('validation-error').hidden = false;
  $('validation-error').textContent = msg;  // textContent — XSS mitigation (T-04-04)
  $('progress-area').hidden = true;
  $('result-card').hidden = true;
  $('error-area').hidden = true;
}

function showErrorRateLimit(retryAfter) {
  $('url-input').disabled = true;
  $('submit-btn').disabled = true;
  $('error-area').hidden = false;
  $('retry-btn').hidden = true;
  $('progress-area').hidden = true;
  $('result-card').hidden = true;
  $('validation-error').hidden = true;

  // Countdown: clear any existing countdownTimer first (Pitfall 4)
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }

  let remaining = retryAfter;

  function updateCountdown() {
    $('error-message').textContent = `Limite atingido. Tente novamente em ${remaining}s.`;
    $('submit-btn').textContent = `Tente novamente em ${remaining}s`;
  }

  updateCountdown();

  countdownTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      setState('IDLE');
    } else {
      updateCountdown();
    }
  }, 1000);
}

function showErrorJob(msg) {
  $('url-input').classList.remove('sg-url-input--error');  // remover highlight de validacao
  $('url-input').disabled = false;
  $('submit-btn').hidden = true;
  $('retry-btn').hidden = currentMode === 'analisar'; // no analyze mode, just drop a new file
  $('error-area').hidden = false;
  $('error-message').textContent = msg;  // textContent — XSS mitigation (T-04-04)
  $('progress-area').hidden = true;
  $('result-card').hidden = true;
  $('validation-error').hidden = true;
}

function showErrorTimeout() {
  $('url-input').disabled = false;
  $('submit-btn').disabled = false;
  $('submit-btn').textContent = 'Baixar Beat';
  $('submit-btn').hidden = currentMode === 'analisar';
  $('error-area').hidden = false;
  $('retry-btn').hidden = true;
  $('error-message').textContent = 'Processamento demorou mais que o esperado. Tente novamente.';
  $('progress-area').hidden = true;
  $('result-card').hidden = true;
  $('validation-error').hidden = true;
}

// =============================================================================
// Section 6: Helper functions
// =============================================================================

// D-08: WAV size estimate — 44100 Hz × 2 channels × 2 bytes (16-bit PCM)
function estimateSizeMB(durationSec) {
  return durationSec * 44100 * 2 * 2 / 1_000_000;
}

// D-08: Human-readable format with ~ prefix to indicate estimate
function formatSizeMB(mb) {
  if (mb >= 10) return `~${Math.round(mb)} MB`;
  return `~${mb.toFixed(1)} MB`;
}

function clearFeaturedSidebar() {
  ensureFeaturedSidebar();
  const sidebar = $('featured-sidebar');
  const separator = $('featured-separator');
  if (sidebar) { sidebar.textContent = ''; sidebar.hidden = true; }
  if (separator) separator.hidden = true;
}

function ensureFeaturedSidebar() {
  const existing = $('featured-sidebar');
  if (existing) return existing;

  const wrapper = $('wrapper');
  const app = $('app');
  if (!wrapper || !app) return null;

  const shell = document.createElement('table');
  shell.id = 'featured-shell';
  shell.setAttribute('align', 'center');
  shell.setAttribute('cellpadding', '0');
  shell.setAttribute('cellspacing', '0');

  const row = document.createElement('tr');
  const appCell = document.createElement('td');
  appCell.id = 'featured-main-cell';
  appCell.setAttribute('valign', 'top');
  const sidebar = document.createElement('td');
  sidebar.id = 'featured-sidebar';
  sidebar.setAttribute('valign', 'top');

  const separator = document.createElement('td');
  separator.id = 'featured-separator';
  separator.setAttribute('valign', 'top');
  const sepImg = document.createElement('img');
  sepImg.src = '/static/bordas/borda7.png';
  sepImg.alt = '';
  separator.appendChild(sepImg);

  shell.appendChild(row);
  row.appendChild(appCell);
  row.appendChild(separator);
  row.appendChild(sidebar);
  wrapper.insertBefore(shell, app);
  appCell.appendChild(app);

  return sidebar;
}

// Construcao do card (kicker/titulo/artistas/produtores/player/genero/
// descricao/links) vive em static/featured-card.js::sgBuildFeaturedCard —
// compartilhada com o preview da aba Submissões no painel Yonkou.
function renderFeatured(data) {
  if (!data || Object.keys(data).length === 0) {
    clearFeaturedSidebar();
    return;
  }

  const sidebar = ensureFeaturedSidebar();
  if (!sidebar) return;
  const separator = $('featured-separator');
  if (separator) separator.hidden = false;
  sidebar.hidden = false;
  sidebar.textContent = '';
  sidebar.appendChild(sgBuildFeaturedCard(data));
}

async function loadFeatured() {
  try {
    const response = await fetch('/featured');
    if (response.status === 204) {
      clearFeaturedSidebar();
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    renderFeatured(data);
  } catch (err) {
    clearFeaturedSidebar();
  }
}

function renderLatestUpdate(entries) {
  const shell = $('updates-teaser-shell');
  const list = $('updates-teaser-list');
  if (!shell || !list) return;
  if (!Array.isArray(entries) || entries.length === 0) {
    shell.hidden = true;
    return;
  }
  // Mostra no máximo as 3 últimas atualizações (data + título).
  // A primeira (mais recente) exibe também o resumo.
  list.textContent = '';
  entries.slice(0, 3).forEach((entry, index) => {
    const item = document.createElement('div');
    item.className = 'updates-teaser-item';

    const date = document.createElement('div');
    date.className = 'updates-teaser-item-date';
    date.textContent = sgUpdateDate(entry.data_publicacao);
    item.appendChild(date);

    const title = document.createElement('div');
    title.className = 'updates-teaser-item-title';
    title.textContent = entry.titulo || '';
    item.appendChild(title);

    if (index === 0 && entry.resumo) {
      const summary = document.createElement('div');
      summary.className = 'updates-teaser-item-summary';
      summary.textContent = entry.resumo;
      item.appendChild(summary);
    }

    list.appendChild(item);
  });
  // Só exibe na aba Início — se um sub-painel (sobre/privacidade/participar)
  // estiver aberto, mantém oculto mesmo que o fetch resolva depois da navegação.
  const pageContent = $('page-content');
  shell.hidden = !!(pageContent && !pageContent.hidden);
}

// Converte data ISO (YYYY-MM-DD) para DD/MM/YYYY; devolve string vazia se ausente.
function sgUpdateDate(value) {
  if (!value) return '';
  const parts = String(value).split('-');
  if (parts.length !== 3) return String(value);
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

// Renderiza a lista de atualizações dentro da seção in-page (#updates-inline),
// usando a mesma tipografia das outras abas (.about-section: h2 + p + ul).
function renderUpdatesInto(container, entries) {
  container.textContent = '';
  if (!entries || entries.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Nenhuma atualização publicada ainda.';
    container.appendChild(empty);
    return;
  }
  entries.forEach((entry) => {
    const meta = document.createElement('p');
    meta.className = 'update-inline-meta';
    meta.textContent = sgUpdateDate(entry.data_publicacao) + ' / ' + (entry.categoria || 'sistema');
    container.appendChild(meta);

    const title = document.createElement('h2');
    title.textContent = entry.titulo || '';
    container.appendChild(title);

    if (entry.resumo) {
      const summary = document.createElement('p');
      summary.textContent = entry.resumo;
      container.appendChild(summary);
    }

    const bullets = Array.isArray(entry.bullets) ? entry.bullets : [];
    if (bullets.length > 0) {
      const list = document.createElement('ul');
      bullets.forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        list.appendChild(li);
      });
      container.appendChild(list);
    }
  });
}

// Carrega as atualizações na seção in-page. Exposta globalmente para o nav.js.
function sgLoadUpdatesSection() {
  const container = $('updates-inline');
  if (!container) return;
  container.textContent = 'Carregando atualizações...';
  fetch('/updates?limit=50').then((response) => {
    if (response.status === 204) return [];
    if (!response.ok) throw new Error('updates unavailable');
    return response.json();
  }).then((data) => {
    renderUpdatesInto(container, Array.isArray(data) ? data : []);
  }).catch(() => {
    renderUpdatesInto(container, []);
  });
}
window.sgLoadUpdatesSection = sgLoadUpdatesSection;

async function loadLatestUpdate() {
  try {
    const response = await fetch('/updates?limit=3');
    if (response.status === 204) {
      renderLatestUpdate([]);
      return;
    }
    if (!response.ok) return;
    const data = await response.json();
    renderLatestUpdate(data);
  } catch (err) {
    renderLatestUpdate([]);
  }
}

// Stage labels per UI-SPEC.md Copywriting Contract (Progress Stage Labels)
function stageLabel(status, stage) {
  if (status === 'queued') return 'Na fila...';
  if (status === 'downloading') {
    if (stage === 'checking_duration') return 'Verificando duração...';
    if (stage === 'downloading') return 'Baixando áudio...';
    return 'Baixando...';
  }
  if (status === 'converting') return 'Convertendo para WAV...';
  if (status === 'analyzing') return 'Analisando BPM e tonalidade...';
  return 'Processando...';
}

// =============================================================================
// Section 7: Event listeners and init
// =============================================================================

function init() {
  loadFeatured();
  loadLatestUpdate();

  // Wire submit button
  $('submit-btn').addEventListener('click', () => {
    const url = $('url-input').value.trim();
    if (!url) return;
    setState('SUBMITTING');
    submitJob(url);
  });

  // Wire clear button — reset to IDLE
  $('clear-btn').addEventListener('click', () => {
    setState('IDLE');
  });

  // Wire retry button (ERROR_JOB state — D-06: reuse URL already in field, resubmit directly)
  $('retry-btn').addEventListener('click', () => {
    const url = $('url-input').value.trim();
    if (!url) return;
    setState('SUBMITTING');
    submitJob(url);
  });

  // Enter key on input field triggers submit
  $('url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('submit-btn').click();
  });

  // Mode toggle button
  $('mode-btn').addEventListener('click', () => {
    switchMode(currentMode === 'baixar' ? 'analisar' : 'baixar');
  });

  // Dropzone click → file picker
  $('dropzone').addEventListener('click', () => $('file-input').click());

  // Drag & drop
  $('dropzone').addEventListener('dragover', (e) => {
    e.preventDefault();
    $('dropzone').classList.add('sg-dropzone--active');
  });
  $('dropzone').addEventListener('dragleave', () => {
    $('dropzone').classList.remove('sg-dropzone--active');
  });
  $('dropzone').addEventListener('drop', (e) => {
    e.preventDefault();
    $('dropzone').classList.remove('sg-dropzone--active');
    const files = e.dataTransfer.files;
    if (files && files.length) analyzeQueue(files);
  });

  // File input change
  $('file-input').addEventListener('change', () => {
    const files = $('file-input').files;
    if (files && files.length) analyzeQueue(files);
    $('file-input').value = '';  // reset so same file can be re-selected
  });
}

document.addEventListener('DOMContentLoaded', init);

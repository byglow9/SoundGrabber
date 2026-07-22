'use strict';

var _submitMethod = 'POST';
var _KNOWN_LABELS = ['Youtube', 'Soundcloud', 'Spotify', 'Instagram'];

function yonkouMessage(text) {
  var node = document.getElementById('yonkou-message');
  if (node) node.textContent = text;
}

function csrfToken() {
  var wrapper = document.getElementById('yonkou-wrapper');
  return wrapper && wrapper.dataset ? wrapper.dataset.csrfToken || '' : '';
}

function csrfHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken()
  };
}

function showYonkouTab(tabName) {
  var panels = {
    som: document.getElementById('tab-som-panel'),
    updates: document.getElementById('tab-updates-panel'),
    submissoes: document.getElementById('tab-submissoes-panel')
  };
  var buttons = {
    som: document.getElementById('tab-som-btn'),
    updates: document.getElementById('tab-updates-btn'),
    submissoes: document.getElementById('tab-submissoes-btn')
  };
  if (!panels.som || !panels.updates || !panels.submissoes ||
      !buttons.som || !buttons.updates || !buttons.submissoes) return;

  Object.keys(panels).forEach(function(key) {
    panels[key].style.display = key === tabName ? '' : 'none';
    buttons[key].className = key === tabName ? 'yonkou-tab yonkou-tab-active' : 'yonkou-tab';
  });

  if (tabName === 'submissoes') {
    loadSubmissoes();
  }
}

function wireYonkouTabs() {
  var somBtn = document.getElementById('tab-som-btn');
  var updatesBtn = document.getElementById('tab-updates-btn');
  var submissoesBtn = document.getElementById('tab-submissoes-btn');
  if (somBtn) {
    somBtn.addEventListener('click', function() {
      showYonkouTab('som');
    });
  }
  if (updatesBtn) {
    updatesBtn.addEventListener('click', function() {
      showYonkouTab('updates');
    });
  }
  if (submissoesBtn) {
    submissoesBtn.addEventListener('click', function() {
      showYonkouTab('submissoes');
    });
  }
}

function initialFeaturedList(key) {
  var form = document.getElementById('featured-editor');
  if (!form || !form.dataset || !form.dataset[key]) return [];
  try {
    var data = JSON.parse(form.dataset[key]);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

// ── Link helpers ──────────────────────────────────────────────────────────────

function getLinkLabel(i) {
  var select = document.getElementById('featured-link-label-' + i);
  if (!select) return '';
  if (select.value === 'Outros') {
    var custom = document.getElementById('featured-link-label-custom-' + i);
    return custom ? custom.value.trim() : '';
  }
  return select.value;
}

function featuredLinksFromForm() {
  var links = [];
  for (var i = 1; i <= 4; i++) {
    var url = document.getElementById('featured-link-url-' + i);
    if (!url) continue;
    var labelValue = getLinkLabel(i);
    var urlValue = url.value.trim();
    if (labelValue || urlValue) {
      links.push({ label: labelValue, url: urlValue });
    }
  }
  return links;
}

function wireSelectLabels() {
  for (var i = 1; i <= 4; i++) {
    (function(idx) {
      var select = document.getElementById('featured-link-label-' + idx);
      var custom = document.getElementById('featured-link-label-custom-' + idx);
      if (!select || !custom) return;
      select.addEventListener('change', function() {
        custom.style.display = select.value === 'Outros' ? '' : 'none';
        if (select.value !== 'Outros') custom.value = '';
      });
    })(i);
  }
}

function clearLinkInputs() {
  for (var i = 1; i <= 4; i++) {
    var select = document.getElementById('featured-link-label-' + i);
    var custom = document.getElementById('featured-link-label-custom-' + i);
    var urlInput = document.getElementById('featured-link-url-' + i);
    if (select) select.value = '';
    if (custom) { custom.style.display = 'none'; custom.value = ''; }
    if (urlInput) urlInput.value = '';
  }
}

// ── Artistas helpers ──────────────────────────────────────────────────────────

function createArtistaRow(nome, url) {
  var row = document.createElement('div');
  row.className = 'artista-row';

  var nomeInput = document.createElement('input');
  nomeInput.className = 'yonkou-input artista-nome';
  nomeInput.placeholder = 'nome';
  nomeInput.value = nome || '';

  var urlInput = document.createElement('input');
  urlInput.className = 'yonkou-input artista-url';
  urlInput.placeholder = 'link (opcional)';
  urlInput.value = url || '';

  var removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'artista-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', function() {
    var list = document.getElementById('artistas-list');
    if (list && list.querySelectorAll('.artista-row').length > 1) row.remove();
  });

  row.appendChild(nomeInput);
  row.appendChild(urlInput);
  row.appendChild(removeBtn);
  return row;
}

function initArtistasList() {
  var list = document.getElementById('artistas-list');
  if (!list) return;
  var artistas = initialFeaturedList('artistas');
  list.innerHTML = '';
  if (artistas.length === 0) {
    list.appendChild(createArtistaRow('', ''));
  } else {
    artistas.forEach(function(a) {
      list.appendChild(createArtistaRow(a.nome || '', a.url || ''));
    });
  }
}

function clearArtistasList() {
  var list = document.getElementById('artistas-list');
  if (!list) return;
  list.innerHTML = '';
  list.appendChild(createArtistaRow('', ''));
}

function wireArtistasList() {
  var addBtn = document.getElementById('add-artista-btn');
  var list = document.getElementById('artistas-list');
  if (!addBtn || !list) return;
  addBtn.addEventListener('click', function() {
    list.appendChild(createArtistaRow('', ''));
  });
}

function artistasFromForm() {
  var artistas = [];
  document.querySelectorAll('#artistas-list .artista-row').forEach(function(row) {
    var nomeInput = row.querySelector('.artista-nome');
    var urlInput = row.querySelector('.artista-url');
    if (!nomeInput || !urlInput) return;
    var nome = nomeInput.value.trim();
    var url = urlInput.value.trim();
    if (nome || url) artistas.push({ nome: nome, url: url });
  });
  return artistas;
}

// ── Produtores helpers ────────────────────────────────────────────────────────

function createProdutorRow(nome, url) {
  var row = document.createElement('div');
  row.className = 'produtor-row';

  var nomeInput = document.createElement('input');
  nomeInput.className = 'yonkou-input produtor-nome';
  nomeInput.placeholder = 'nome';
  nomeInput.value = nome || '';

  var urlInput = document.createElement('input');
  urlInput.className = 'yonkou-input produtor-url';
  urlInput.placeholder = 'link (opcional)';
  urlInput.value = url || '';

  var removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'artista-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', function() {
    var list = document.getElementById('produtores-list');
    if (list && list.querySelectorAll('.produtor-row').length > 1) row.remove();
  });

  row.appendChild(nomeInput);
  row.appendChild(urlInput);
  row.appendChild(removeBtn);
  return row;
}

function initProdutoresList() {
  var list = document.getElementById('produtores-list');
  if (!list) return;
  var produtores = initialFeaturedList('produtores');
  list.innerHTML = '';
  if (produtores.length === 0) {
    list.appendChild(createProdutorRow('', ''));
  } else {
    produtores.forEach(function(p) {
      list.appendChild(createProdutorRow(p.nome || '', p.url || ''));
    });
  }
}

function clearProdutoresList() {
  var list = document.getElementById('produtores-list');
  if (!list) return;
  list.innerHTML = '';
  list.appendChild(createProdutorRow('', ''));
}

function wireProdutoresList() {
  var addBtn = document.getElementById('add-produtor-btn');
  var list = document.getElementById('produtores-list');
  if (!addBtn || !list) return;
  addBtn.addEventListener('click', function() {
    list.appendChild(createProdutorRow('', ''));
  });
}

function produtoresFromForm() {
  var produtores = [];
  document.querySelectorAll('#produtores-list .produtor-nome').forEach(function(nomeInput) {
    var row = nomeInput.closest('.produtor-row');
    var urlInput = row ? row.querySelector('.produtor-url') : null;
    var nome = nomeInput.value.trim();
    var url = urlInput ? urlInput.value.trim() : '';
    if (nome || url) produtores.push({ nome: nome, url: url });
  });
  return produtores;
}

// ── Modos EDITAR / NOVO SOM ───────────────────────────────────────────────────

function showFormSection() {
  var dashboard = document.getElementById('yonkou-dashboard');
  var section = document.getElementById('form-section');
  if (dashboard) dashboard.style.display = 'none';
  if (section) section.style.display = '';
}

function hideFormSection() {
  var dashboard = document.getElementById('yonkou-dashboard');
  var section = document.getElementById('form-section');
  if (section) section.style.display = 'none';
  if (dashboard) dashboard.style.display = '';
  yonkouMessage('');
}

function showUpdatesFormSection() {
  var dashboard = document.getElementById('yonkou-dashboard');
  var section = document.getElementById('updates-form-section');
  if (dashboard) dashboard.style.display = 'none';
  if (section) section.style.display = '';
  showYonkouTab('updates');
  yonkouMessage('');
}

function hideUpdatesFormSection() {
  var dashboard = document.getElementById('yonkou-dashboard');
  var section = document.getElementById('updates-form-section');
  if (section) section.style.display = 'none';
  if (dashboard) dashboard.style.display = '';
  showYonkouTab('updates');
  yonkouMessage('');
}

function wireVoltarButton() {
  var btn = document.getElementById('voltar-btn');
  if (!btn) return;
  btn.addEventListener('click', hideFormSection);
}

function wireUpdatesVoltarButton() {
  var btn = document.getElementById('updates-voltar-btn');
  if (!btn) return;
  btn.addEventListener('click', hideUpdatesFormSection);
}

function wireLogoutButton() {
  var btn = document.getElementById('logout-btn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    fetch('/yonkou/logout', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify({ logout: true })
    }).then(function() {
      window.location.href = '/';
    }).catch(function() {
      window.location.href = '/';
    });
  });
}

function wireEditButton() {
  var btn = document.getElementById('edit-btn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    _submitMethod = 'PATCH';
    var title = document.getElementById('form-title');
    if (title) title.textContent = 'Editar Som Atual';
    initArtistasList();
    initProdutoresList();
    showFormSection();
    yonkouMessage('');
  });
}

function wireNewButton() {
  var btn = document.getElementById('new-btn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    _submitMethod = 'POST';
    var title = document.getElementById('form-title');
    if (title) title.textContent = 'Novo Som da Semana';
    var tituloEl = document.getElementById('featured-titulo');
    var generoEl = document.getElementById('featured-genero');
    var descricaoEl = document.getElementById('featured-descricao');
    if (tituloEl) tituloEl.value = '';
    if (generoEl) generoEl.value = '';
    if (descricaoEl) descricaoEl.value = '';
    clearLinkInputs();
    clearArtistasList();
    clearProdutoresList();
    showFormSection();
    yonkouMessage('');
  });
}

function wireNewUpdateButton() {
  var btn = document.getElementById('new-update-btn');
  if (!btn) return;
  btn.addEventListener('click', function() {
    var titulo = document.getElementById('update-titulo');
    var resumo = document.getElementById('update-resumo');
    var categoria = document.getElementById('update-categoria');
    var bullets = document.getElementById('update-bullets');
    if (titulo) titulo.value = '';
    if (resumo) resumo.value = '';
    if (categoria) categoria.value = 'audio';
    if (bullets) bullets.value = '';
    showUpdatesFormSection();
  });
}

// ── Login form ────────────────────────────────────────────────────────────────

function wireLoginForm() {
  var form = document.getElementById('yonkou-login');
  if (!form) return;

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    var password = document.getElementById('password').value;
    fetch('/yonkou/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password })
    }).then(function(response) {
      if (response.ok) {
        window.location.href = '/yonkou';
        return;
      }
      yonkouMessage('erro');
    });
  });
}

// ── Featured editor form ──────────────────────────────────────────────────────

function wireFeaturedEditor() {
  var form = document.getElementById('featured-editor');
  if (!form) return;

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    try {
      var payload = {
        artistas: artistasFromForm(),
        produtores: produtoresFromForm(),
        titulo: document.getElementById('featured-titulo').value.trim(),
        genero: document.getElementById('featured-genero').value.trim(),
        descricao: document.getElementById('featured-descricao').value.trim(),
        links: featuredLinksFromForm()
      };

      var endpoint = _submitMethod === 'PATCH'
        ? '/yonkou/releases/current'
        : '/yonkou/releases';
      fetch(endpoint, {
        method: _submitMethod,
        headers: csrfHeaders(),
        body: JSON.stringify(payload)
      }).then(function(response) {
        if (response.ok) {
          window.location.reload();
          return;
        }
        return response.json().catch(function() { return {}; }).then(function(data) {
          yonkouMessage(data.error || data.detail || 'Nao foi possivel salvar.');
        });
      }).catch(function(err) {
        yonkouMessage('Erro de rede: ' + err.message);
      });
    } catch(err) {
      yonkouMessage('Erro ao preparar dados: ' + err.message);
    }
  });
}

// ── System updates editor ────────────────────────────────────────────────────

function wireSystemUpdateEditor() {
  var form = document.getElementById('system-update-editor');
  if (!form) return;

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    var bulletsRaw = document.getElementById('update-bullets').value.split('\n');
    var bullets = bulletsRaw.map(function(item) {
      return item.trim();
    }).filter(function(item) {
      return item.length > 0;
    });

    var payload = {
      titulo: document.getElementById('update-titulo').value.trim(),
      resumo: document.getElementById('update-resumo').value.trim(),
      categoria: document.getElementById('update-categoria').value,
      bullets: bullets
    };

    fetch('/yonkou/updates', {
      method: 'POST',
      headers: csrfHeaders(),
      body: JSON.stringify(payload)
    }).then(function(response) {
      if (response.ok) {
        window.location.reload();
        return;
      }
      return response.json().catch(function() { return {}; }).then(function(data) {
        yonkouMessage(data.error || data.detail || 'Nao foi possivel publicar a atualizacao.');
      });
    }).catch(function(err) {
      yonkouMessage('Erro de rede: ' + err.message);
    });
  });
}

// ── Submissões (Phase 16 / SUBMIT-04/05/06/07/08) ───────────────────────────────
// XSS-safe rendering: every submission-derived value is placed via textContent
// or the .value property — NEVER innerHTML/string interpolation (Pitfall 5,
// T-16-02) because a submitter-controlled field renders in the operator's
// authenticated browser session (admin cookie + CSRF token).

var _currentSubmissaoId = null;

var SUBMISSAO_STATUS_LABELS = {
  pendente: 'Pendente',
  promovida: 'Promovida',
  publicada: 'Publicada',
  rejeitada: 'Rejeitada',
  arquivada: 'Arquivada'
};

function submissaoStatusLabel(status) {
  return SUBMISSAO_STATUS_LABELS[status] || status || '';
}

function submissaoArtistasText(artistas) {
  if (!Array.isArray(artistas)) return '';
  return artistas
    .map(function(a) { return a && a.nome ? a.nome : ''; })
    .filter(function(nome) { return nome; })
    .join(', ');
}

function submissaoContactText(contato) {
  if (!contato) return '';
  var parts = [];
  if (contato.instagram) parts.push('IG: ' + contato.instagram);
  if (contato.telefone) parts.push('Tel: ' + contato.telefone);
  if (contato.email) parts.push('Email: ' + contato.email);
  return parts.join(' / ');
}

// ── Preview do card "Som da Semana" — usa sgBuildFeaturedCard (static/
// featured-card.js), a MESMA funcao que renderiza a sidebar publica, para
// o preview ser fiel ao que vai aparecer na home. Nao chama /featured nem
// muda estado algum — e so client-side, a partir dos dados ja carregados
// da submissao.

function submissaoToFeaturedPreviewData(sub) {
  var links = Array.isArray(sub.links) ? sub.links.slice() : [];
  var hasYoutubeLink = links.some(function(l) { return l && l.label === 'Youtube'; });
  if (sub.youtube_url && !hasYoutubeLink) {
    links = [{ label: 'Youtube', url: sub.youtube_url }].concat(links);
  }
  return {
    titulo: sub.titulo,
    artistas: sub.artistas,
    produtores: sub.produtores,
    genero: sub.genero,
    descricao: sub.descricao,
    links: links,
    data_adicao: new Date().toISOString().slice(0, 10)
  };
}

function openPreviewModal(sub) {
  var modal = document.getElementById('preview-modal');
  var wrap = document.getElementById('preview-modal-card-wrap');
  if (!modal || !wrap) return;
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
  wrap.appendChild(sgBuildFeaturedCard(submissaoToFeaturedPreviewData(sub)));
  modal.style.display = '';
}

function closePreviewModal() {
  var modal = document.getElementById('preview-modal');
  if (modal) modal.style.display = 'none';
}

function wirePreviewModal() {
  var backdrop = document.getElementById('preview-modal-backdrop');
  var closeBtn = document.getElementById('preview-modal-close');
  if (backdrop) backdrop.addEventListener('click', closePreviewModal);
  if (closeBtn) closeBtn.addEventListener('click', closePreviewModal);
}

function createSubmissaoActionButton(label, className, handler) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className || 'yonkou-secondary';
  btn.textContent = label;
  btn.addEventListener('click', handler);
  return btn;
}

function submissaoMutationFetch(url, method, onSuccess) {
  fetch(url, {
    method: method,
    headers: csrfHeaders()
  }).then(function(response) {
    if (response.ok) {
      onSuccess();
      return;
    }
    return response.json().catch(function() { return {}; }).then(function(data) {
      yonkouMessage(data.error || data.detail || 'Nao foi possivel completar a acao.');
    });
  }).catch(function(err) {
    yonkouMessage('Erro de rede: ' + err.message);
  });
}

function createSubmissaoRow(sub) {
  var row = document.createElement('tr');

  function cell(text) {
    var td = document.createElement('td');
    td.textContent = text || '';
    row.appendChild(td);
    return td;
  }

  cell(sub.titulo);
  cell(submissaoArtistasText(sub.artistas));
  cell(sub.genero);
  cell(submissaoStatusLabel(sub.status));
  cell(submissaoContactText(sub.contato));

  var actionsTd = document.createElement('td');
  actionsTd.appendChild(createSubmissaoActionButton('Preview', 'yonkou-secondary', function() {
    openPreviewModal(sub);
  }));
  actionsTd.appendChild(createSubmissaoActionButton('Editar', 'yonkou-secondary', function() {
    openSubmissaoEditor(sub);
  }));
  actionsTd.appendChild(createSubmissaoActionButton('Promover', 'yonkou-secondary', function() {
    submissaoMutationFetch(
      '/yonkou/submissions/' + encodeURIComponent(sub.id) + '/promote', 'POST', loadSubmissoes
    );
  }));
  actionsTd.appendChild(createSubmissaoActionButton('Publicar', 'yonkou-primary', function() {
    submissaoMutationFetch('/yonkou/releases/publish-next', 'POST', loadSubmissoes);
  }));
  actionsTd.appendChild(createSubmissaoActionButton('Rejeitar', 'yonkou-secondary', function() {
    submissaoMutationFetch(
      '/yonkou/submissions/' + encodeURIComponent(sub.id) + '/reject', 'POST', loadSubmissoes
    );
  }));
  actionsTd.appendChild(createSubmissaoActionButton('Arquivar', 'yonkou-secondary', function() {
    submissaoMutationFetch(
      '/yonkou/submissions/' + encodeURIComponent(sub.id) + '/archive', 'POST', loadSubmissoes
    );
  }));
  row.appendChild(actionsTd);

  return row;
}

function renderSubmissoesTable(list) {
  var container = document.getElementById('submissoes-list');
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  if (!list.length) {
    var empty = document.createElement('div');
    empty.className = 'yonkou-help';
    empty.textContent = 'nenhuma submissao ainda';
    container.appendChild(empty);
    return;
  }

  var table = document.createElement('table');

  var thead = document.createElement('thead');
  var headRow = document.createElement('tr');
  ['Titulo', 'Artista', 'Genero', 'Status', 'Contato', 'Acoes'].forEach(function(label) {
    var th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  var tbody = document.createElement('tbody');
  list.forEach(function(sub) {
    tbody.appendChild(createSubmissaoRow(sub));
  });
  table.appendChild(tbody);

  container.appendChild(table);
}

function loadSubmissoes() {
  fetch('/yonkou/submissions', { headers: { 'Content-Type': 'application/json' } })
    .then(function(response) {
      if (response.status === 204) return [];
      if (!response.ok) return [];
      return response.json();
    })
    .then(function(data) {
      renderSubmissoesTable(Array.isArray(data) ? data : []);
    })
    .catch(function() {
      renderSubmissoesTable([]);
    });
}

// ── Submissão edit form (dedicated artista/produtor rows — separate container
// ids from the featured editor so the two forms never collide) ────────────────

function createSubmissaoArtistaRow(nome, url) {
  var row = document.createElement('div');
  row.className = 'artista-row';

  var nomeInput = document.createElement('input');
  nomeInput.className = 'yonkou-input artista-nome';
  nomeInput.placeholder = 'nome';
  nomeInput.value = nome || '';

  var urlInput = document.createElement('input');
  urlInput.className = 'yonkou-input artista-url';
  urlInput.placeholder = 'link (opcional)';
  urlInput.value = url || '';

  var removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'artista-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', function() {
    var list = document.getElementById('submissao-artistas-list');
    if (list && list.querySelectorAll('.artista-row').length > 1) row.remove();
  });

  row.appendChild(nomeInput);
  row.appendChild(urlInput);
  row.appendChild(removeBtn);
  return row;
}

function initSubmissaoArtistasList(artistas) {
  var list = document.getElementById('submissao-artistas-list');
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);
  var items = Array.isArray(artistas) ? artistas : [];
  if (items.length === 0) {
    list.appendChild(createSubmissaoArtistaRow('', ''));
  } else {
    items.forEach(function(a) {
      list.appendChild(createSubmissaoArtistaRow(a.nome || '', a.url || ''));
    });
  }
}

function wireSubmissaoArtistasList() {
  var addBtn = document.getElementById('submissao-add-artista-btn');
  var list = document.getElementById('submissao-artistas-list');
  if (!addBtn || !list) return;
  addBtn.addEventListener('click', function() {
    list.appendChild(createSubmissaoArtistaRow('', ''));
  });
}

function submissaoArtistasFromForm() {
  var artistas = [];
  document.querySelectorAll('#submissao-artistas-list .artista-row').forEach(function(row) {
    var nomeInput = row.querySelector('.artista-nome');
    var urlInput = row.querySelector('.artista-url');
    if (!nomeInput || !urlInput) return;
    var nome = nomeInput.value.trim();
    var url = urlInput.value.trim();
    if (nome || url) artistas.push({ nome: nome, url: url });
  });
  return artistas;
}

function createSubmissaoProdutorRow(nome, url) {
  var row = document.createElement('div');
  row.className = 'produtor-row';

  var nomeInput = document.createElement('input');
  nomeInput.className = 'yonkou-input produtor-nome';
  nomeInput.placeholder = 'nome';
  nomeInput.value = nome || '';

  var urlInput = document.createElement('input');
  urlInput.className = 'yonkou-input produtor-url';
  urlInput.placeholder = 'link (opcional)';
  urlInput.value = url || '';

  var removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'artista-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', function() {
    var list = document.getElementById('submissao-produtores-list');
    if (list && list.querySelectorAll('.produtor-row').length > 1) row.remove();
  });

  row.appendChild(nomeInput);
  row.appendChild(urlInput);
  row.appendChild(removeBtn);
  return row;
}

function initSubmissaoProdutoresList(produtores) {
  var list = document.getElementById('submissao-produtores-list');
  if (!list) return;
  while (list.firstChild) list.removeChild(list.firstChild);
  var items = Array.isArray(produtores) ? produtores : [];
  if (items.length === 0) {
    list.appendChild(createSubmissaoProdutorRow('', ''));
  } else {
    items.forEach(function(p) {
      list.appendChild(createSubmissaoProdutorRow(p.nome || '', p.url || ''));
    });
  }
}

function wireSubmissaoProdutoresList() {
  var addBtn = document.getElementById('submissao-add-produtor-btn');
  var list = document.getElementById('submissao-produtores-list');
  if (!addBtn || !list) return;
  addBtn.addEventListener('click', function() {
    list.appendChild(createSubmissaoProdutorRow('', ''));
  });
}

function submissaoProdutoresFromForm() {
  var produtores = [];
  document.querySelectorAll('#submissao-produtores-list .produtor-nome').forEach(function(nomeInput) {
    var row = nomeInput.closest('.produtor-row');
    var urlInput = row ? row.querySelector('.produtor-url') : null;
    var nome = nomeInput.value.trim();
    var url = urlInput ? urlInput.value.trim() : '';
    if (nome || url) produtores.push({ nome: nome, url: url });
  });
  return produtores;
}

function setInputValue(id, value) {
  var el = document.getElementById(id);
  if (el) el.value = value || '';
}

function submissaoLinksFromForm() {
  var links = [];
  for (var i = 1; i <= 4; i++) {
    var labelInput = document.getElementById('submissao-link-label-' + i);
    var urlInput = document.getElementById('submissao-link-url-' + i);
    if (!labelInput || !urlInput) continue;
    var label = labelInput.value.trim();
    var url = urlInput.value.trim();
    if (label && url) links.push({ label: label, url: url });
  }
  return links;
}

function setSubmissaoLinksInForm(links) {
  var list = Array.isArray(links) ? links : [];
  for (var i = 1; i <= 4; i++) {
    var link = list[i - 1] || {};
    setInputValue('submissao-link-label-' + i, link.label);
    setInputValue('submissao-link-url-' + i, link.url);
  }
}

function showSubmissaoEditSection() {
  var dashboard = document.getElementById('yonkou-dashboard');
  var section = document.getElementById('submissao-edit-section');
  if (dashboard) dashboard.style.display = 'none';
  if (section) section.style.display = '';
}

function hideSubmissaoEditSection() {
  var dashboard = document.getElementById('yonkou-dashboard');
  var section = document.getElementById('submissao-edit-section');
  if (section) section.style.display = 'none';
  if (dashboard) dashboard.style.display = '';
  showYonkouTab('submissoes');
  yonkouMessage('');
}

function wireSubmissaoVoltarButton() {
  var btn = document.getElementById('submissao-voltar-btn');
  if (!btn) return;
  btn.addEventListener('click', hideSubmissaoEditSection);
}

function openSubmissaoEditor(sub) {
  _currentSubmissaoId = sub.id;
  initSubmissaoArtistasList(sub.artistas);
  initSubmissaoProdutoresList(sub.produtores);
  setInputValue('submissao-titulo', sub.titulo);
  setInputValue('submissao-genero', sub.genero);
  setInputValue('submissao-youtube-url', sub.youtube_url);
  setInputValue('submissao-descricao', sub.descricao);
  var contato = sub.contato || {};
  setInputValue('submissao-instagram', contato.instagram);
  setInputValue('submissao-telefone', contato.telefone);
  setInputValue('submissao-email', contato.email);
  setSubmissaoLinksInForm(sub.links);
  showSubmissaoEditSection();
  yonkouMessage('');
}

function wireSubmissaoEditor() {
  var form = document.getElementById('submissao-editor');
  if (!form) return;

  form.addEventListener('submit', function(event) {
    event.preventDefault();
    if (!_currentSubmissaoId) {
      yonkouMessage('Nenhuma submissao selecionada.');
      return;
    }
    try {
      var payload = {
        artistas: submissaoArtistasFromForm(),
        produtores: submissaoProdutoresFromForm(),
        titulo: document.getElementById('submissao-titulo').value.trim(),
        genero: document.getElementById('submissao-genero').value.trim(),
        descricao: document.getElementById('submissao-descricao').value.trim(),
        youtube_url: document.getElementById('submissao-youtube-url').value.trim(),
        links: submissaoLinksFromForm(),
        contato: {
          instagram: document.getElementById('submissao-instagram').value.trim(),
          telefone: document.getElementById('submissao-telefone').value.trim(),
          email: document.getElementById('submissao-email').value.trim()
        }
      };

      fetch('/yonkou/submissions/' + encodeURIComponent(_currentSubmissaoId), {
        method: 'PATCH',
        headers: csrfHeaders(),
        body: JSON.stringify(payload)
      }).then(function(response) {
        if (response.ok) {
          hideSubmissaoEditSection();
          loadSubmissoes();
          return;
        }
        return response.json().catch(function() { return {}; }).then(function(data) {
          yonkouMessage(data.error || data.detail || 'Nao foi possivel salvar a submissao.');
        });
      }).catch(function(err) {
        yonkouMessage('Erro de rede: ' + err.message);
      });
    } catch (err) {
      yonkouMessage('Erro ao preparar dados: ' + err.message);
    }
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  wireLoginForm();
  wireYonkouTabs();
  initArtistasList();
  wireArtistasList();
  initProdutoresList();
  wireProdutoresList();
  wireEditButton();
  wireNewButton();
  wireNewUpdateButton();
  wireVoltarButton();
  wireUpdatesVoltarButton();
  wireLogoutButton();
  wireFeaturedEditor();
  wireSystemUpdateEditor();
  wireSelectLabels();
  wireSubmissaoArtistasList();
  wireSubmissaoProdutoresList();
  wireSubmissaoVoltarButton();
  wireSubmissaoEditor();
  wirePreviewModal();
});

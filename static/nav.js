'use strict';

document.addEventListener('DOMContentLoaded', function () {
  var sobreSections        = ['section-projeto', 'section-aviso-legal', 'section-contato'];
  var privSections         = ['section-privacidade'];
  var participarSections   = ['section-participar'];
  var atualizacoesSections = ['section-atualizacoes'];
  var allSections          = sobreSections
    .concat(privSections)
    .concat(participarSections)
    .concat(atualizacoesSections);

  var pageScroll = document.getElementById('page-scroll');
  var scrollHint = document.getElementById('scroll-hint');

  function updateScrollHint() {
    if (!scrollHint || !pageScroll) return;
    var atBottom = pageScroll.scrollTop + pageScroll.clientHeight >= pageScroll.scrollHeight - 4;
    scrollHint.hidden = atBottom;
  }

  if (pageScroll) {
    pageScroll.addEventListener('scroll', updateScrollHint);
  }

  function setSections(visible) {
    allSections.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = visible.indexOf(id) === -1;
    });
  }

  function syncTeaser(page) {
    var teaser = document.getElementById('updates-teaser-shell');
    if (!teaser) return;
    var list = document.getElementById('updates-teaser-list');
    var hasContent = !!(list && list.children.length > 0);
    // Teaser só aparece na aba Início e apenas quando há notas carregadas.
    teaser.hidden = page !== 'home' || !hasContent;
  }

  function syncParticiparCallout(page) {
    var callout = document.getElementById('nav-participar-callout');
    if (!callout) return;
    // Callout ("↑ agora mais fácil e rápido") só faz sentido chamando
    // atenção pra aba a partir da Início — o nav é position:fixed, entao
    // sem isso ele continuaria sobreposto ao conteúdo nas outras abas.
    callout.hidden = page !== 'home';
  }

  function sgNav(page) {
    var wrapper     = document.getElementById('wrapper');
    var pageContent = document.getElementById('page-content');

    syncTeaser(page);
    syncParticiparCallout(page);

    if (page === 'home') {
      wrapper.hidden     = false;
      pageContent.hidden = true;
      document.documentElement.style.overflow = '';
      document.body.style.overflow            = '';
    } else {
      wrapper.hidden     = true;
      if (page === 'sobre')        setSections(sobreSections);
      if (page === 'privacidade')  setSections(privSections);
      if (page === 'participar')   setSections(participarSections);
      if (page === 'atualizacoes') {
        setSections(atualizacoesSections);
        if (typeof window.sgLoadUpdatesSection === 'function') {
          window.sgLoadUpdatesSection();
        }
      }
      pageContent.hidden = false;
      if (pageScroll) pageScroll.scrollTop = 0;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow            = 'hidden';
      window.setTimeout(updateScrollHint, 0);
    }
  }

  document.addEventListener('click', function (e) {
    var link = e.target;
    while (link && link.tagName !== 'A') link = link.parentNode;
    if (!link || !link.getAttribute('data-page')) return;
    e.preventDefault();
    sgNav(link.getAttribute('data-page'));
  });

  // Phase 16 (SUBMIT-10/D-10): formulario real "Participar do Som da Semana"
  // que faz POST /submissions. Substitui o antigo fluxo de copiar o template
  // de envio e mandar por email (removido nesta revisao).
  var participarForm = document.getElementById('participar-form');
  var participarStatus = document.getElementById('participar-status');
  var participarSubmitBtn = document.getElementById('participar-submit-btn');

  function setParticiparStatus(text, isError) {
    if (!participarStatus) return;
    participarStatus.textContent = text;
    participarStatus.className = isError ? 'error' : 'success';
  }

  function fieldValue(form, name) {
    var el = form.elements[name];
    return el ? String(el.value || '').trim() : '';
  }

  // ── Artistas (1-3, min 1) e Produtores (0-3, default 1) — mesmo padrao
  // visual/JS do editor Yonkou (createArtistaRow/wireArtistasList em
  // yonkou.js), com os caps de SubmissionRequest (api/main.py:
  // artistas<=3, produtores<=1). PLURAL_OF existe porque "produtor" pluraliza
  // de forma irregular (produtorES, nao produtorS) — usar um mapa evita
  // reintroduzir esse bug de concatenacao em cada novo call site.
  var PLURAL_OF = { artista: 'artistas', produtor: 'produtores' };
  var MAX_OF = { artista: 3, produtor: 3 };

  function createParticiparPersonRow(kind, nome, url) {
    var row = document.createElement('div');
    row.className = kind + '-row';

    var nomeInput = document.createElement('input');
    nomeInput.className = 'participar-input ' + kind + '-nome';
    nomeInput.placeholder = 'nome';
    nomeInput.maxLength = 300;
    nomeInput.value = nome || '';

    var urlInput = document.createElement('input');
    urlInput.className = 'participar-input ' + kind + '-url';
    urlInput.placeholder = 'link (opcional)';
    urlInput.maxLength = 200;
    urlInput.value = url || '';

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'artista-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', function () {
      row.remove();
      syncParticiparAddButton(kind);
    });

    row.appendChild(nomeInput);
    row.appendChild(urlInput);
    row.appendChild(removeBtn);
    return row;
  }

  function syncParticiparAddButton(kind) {
    var list = document.getElementById('participar-' + PLURAL_OF[kind] + '-list');
    var addBtn = document.getElementById('participar-add-' + kind + '-btn');
    if (!list || !addBtn) return;
    var count = list.querySelectorAll('.' + kind + '-row').length;
    addBtn.style.display = count >= MAX_OF[kind] ? 'none' : '';
  }

  function initParticiparPersonList(kind, minRows) {
    var list = document.getElementById('participar-' + PLURAL_OF[kind] + '-list');
    var addBtn = document.getElementById('participar-add-' + kind + '-btn');
    if (!list || !addBtn) return;
    list.innerHTML = '';
    for (var i = 0; i < minRows; i++) {
      list.appendChild(createParticiparPersonRow(kind, '', ''));
    }
    addBtn.addEventListener('click', function () {
      list.appendChild(createParticiparPersonRow(kind, '', ''));
      syncParticiparAddButton(kind);
    });
    syncParticiparAddButton(kind);
  }

  function resetParticiparPersonList(kind, minRows) {
    var list = document.getElementById('participar-' + PLURAL_OF[kind] + '-list');
    if (!list) return;
    list.innerHTML = '';
    for (var i = 0; i < minRows; i++) {
      list.appendChild(createParticiparPersonRow(kind, '', ''));
    }
    syncParticiparAddButton(kind);
  }

  function participarPeopleFromList(kind) {
    var people = [];
    document.querySelectorAll('#participar-' + PLURAL_OF[kind] + '-list .' + kind + '-row').forEach(function (row) {
      var nomeInput = row.querySelector('.' + kind + '-nome');
      var urlInput = row.querySelector('.' + kind + '-url');
      if (!nomeInput) return;
      var nome = nomeInput.value.trim();
      var url = urlInput ? urlInput.value.trim() : '';
      if (nome || url) people.push({ nome: nome, url: url });
    });
    return people;
  }

  initParticiparPersonList('artista', 1);
  initParticiparPersonList('produtor', 1);

  // ── Links adicionais: select de plataforma conhecida + campo customizado
  // para "Outros" — mesmo padrao de featured-link-label-N em yonkou.js.
  function getParticiparLinkLabel(i) {
    var select = document.getElementById('participar-link-label-' + i);
    if (!select) return '';
    if (select.value === 'Outros') {
      var custom = document.getElementById('participar-link-label-custom-' + i);
      return custom ? custom.value.trim() : '';
    }
    return select.value;
  }

  function wireParticiparLinkSelects() {
    for (var i = 1; i <= 4; i++) {
      (function (idx) {
        var select = document.getElementById('participar-link-label-' + idx);
        var custom = document.getElementById('participar-link-label-custom-' + idx);
        if (!select || !custom) return;
        select.addEventListener('change', function () {
          custom.style.display = select.value === 'Outros' ? '' : 'none';
          if (select.value !== 'Outros') custom.value = '';
        });
      })(i);
    }
  }

  function resetParticiparLinkSelects() {
    for (var i = 1; i <= 4; i++) {
      var select = document.getElementById('participar-link-label-' + i);
      var custom = document.getElementById('participar-link-label-custom-' + i);
      var urlInput = document.getElementById('participar-link-url-' + i);
      if (select) select.value = '';
      if (custom) { custom.style.display = 'none'; custom.value = ''; }
      if (urlInput) urlInput.value = '';
    }
  }

  wireParticiparLinkSelects();

  function collectParticiparLinks() {
    var links = [];
    for (var i = 1; i <= 4; i++) {
      var url = document.getElementById('participar-link-url-' + i);
      if (!url) continue;
      var label = getParticiparLinkLabel(i);
      var urlValue = url.value.trim();
      if (label && urlValue) {
        links.push({ label: label, url: urlValue });
      }
    }
    return links;
  }

  function buildParticiparPayload(form) {
    return {
      artistas: participarPeopleFromList('artista'),
      produtores: participarPeopleFromList('produtor'),
      titulo: fieldValue(form, 'titulo'),
      genero: fieldValue(form, 'genero'),
      descricao: fieldValue(form, 'descricao'),
      youtube_url: fieldValue(form, 'youtube_url'),
      links: collectParticiparLinks(),
      contato: {
        instagram: fieldValue(form, 'instagram'),
        telefone: fieldValue(form, 'telefone'),
        email: fieldValue(form, 'email')
      },
      // honeypot decoy (SEC-SUBMIT-02) — repassado como veio, sem trim/validacao
      website: form.elements.website ? form.elements.website.value : ''
    };
  }

  if (participarForm) {
    participarForm.addEventListener('submit', function (e) {
      e.preventDefault();

      var payload = buildParticiparPayload(participarForm);
      if (participarSubmitBtn) participarSubmitBtn.disabled = true;
      setParticiparStatus('Enviando...', false);

      fetch('/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (response) {
        if (response.status === 202) {
          setParticiparStatus('Recebemos sua indicação! A curadoria vai avaliar em breve.', false);
          participarForm.reset();
          resetParticiparPersonList('artista', 1);
          resetParticiparPersonList('produtor', 1);
          resetParticiparLinkSelects();
          return null;
        }
        return response.json().catch(function () {
          return {};
        }).then(function (data) {
          var message = data && typeof data.error === 'string'
            ? data.error
            : 'Não foi possível enviar. Verifique os campos e tente novamente.';
          setParticiparStatus(message, true);
        });
      }).catch(function () {
        setParticiparStatus('Erro de conexão. Tente novamente em instantes.', true);
      }).then(function () {
        if (participarSubmitBtn) participarSubmitBtn.disabled = false;
      });
    });
  }
});

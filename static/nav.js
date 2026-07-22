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

  function sgNav(page) {
    var wrapper     = document.getElementById('wrapper');
    var pageContent = document.getElementById('page-content');

    syncTeaser(page);

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

  function collectParticiparLinks(form) {
    var links = [];
    for (var i = 1; i <= 4; i++) {
      var label = fieldValue(form, 'link_label_' + i);
      var url = fieldValue(form, 'link_url_' + i);
      if (label && url) {
        links.push({ label: label, url: url });
      }
    }
    return links;
  }

  function buildParticiparPayload(form) {
    var produtores = [];
    var produtorNome = fieldValue(form, 'produtor_nome');
    if (produtorNome) {
      produtores.push({ nome: produtorNome, url: fieldValue(form, 'produtor_url') });
    }

    return {
      artistas: [{ nome: fieldValue(form, 'artista_nome'), url: fieldValue(form, 'artista_url') }],
      produtores: produtores,
      titulo: fieldValue(form, 'titulo'),
      genero: fieldValue(form, 'genero'),
      descricao: fieldValue(form, 'descricao'),
      youtube_url: fieldValue(form, 'youtube_url'),
      links: collectParticiparLinks(form),
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

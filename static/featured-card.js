'use strict';

// Renderizacao do card "Som da Semana" — compartilhada entre a sidebar publica
// (app.js::renderFeatured) e o preview do painel Yonkou (yonkou.js, aba
// Submissões). Funcao pura: recebe os dados e devolve o no <div id="featured-card">
// pronto, sem tocar em nenhum elemento fixo da pagina (sidebar/wrapper) — quem
// chama decide onde anexar. Todo dado do usuario passa por textContent/.value
// ou createElement — nunca via propriedade de marcacao bruta/interpolacao de
// string (contrato anti-XSS).

function sgFormatFeaturedDate(value) {
  if (!value) return '';
  const parts = String(value).split('-');
  if (parts.length !== 3) return String(value);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function sgSafeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''), window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (err) {
    return '';
  }
  return '';
}

function sgExtractYoutubeId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

const SG_FEATURED_LINK_ICONS = {
  Youtube: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5v-7l6.3 3.5-6.3 3.5z"/></svg>`,
  Soundcloud: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16" width="18" height="12" fill="currentColor" aria-hidden="true"><path d="M1.5 10.3C.7 10.3 0 11 0 11.8s.7 1.5 1.5 1.5H20c2.2 0 4-1.8 4-4a4 4 0 0 0-3.3-3.9A6 6 0 0 0 15 1a6 6 0 0 0-2.6.6A7 7 0 0 0 1.5 10.3z"/></svg>`,
  Spotify: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.7 0 12 0zm5.5 17.3c-.2.4-.7.5-1 .2-2.8-1.7-6.4-2.1-10.6-1.1-.4.1-.8-.2-.9-.5-.1-.4.2-.8.6-.9 4.5-1 8.5-.6 11.6 1.3.3.2.5.6.3 1zm1.5-3.3c-.3.4-.8.6-1.3.3-3.2-2-8.2-2.6-11.9-1.4-.5.1-1-.1-1.1-.6-.1-.5.1-1 .6-1.1 4.2-1.3 9.6-.6 13.3 1.5.4.3.6.9.4 1.3zm.1-3.4C15.2 8.4 8.8 8.2 5.2 9.3c-.6.2-1.2-.2-1.4-.7-.2-.6.2-1.2.7-1.4 4.3-1.3 11.3-1 15.7 1.6.6.3.7 1 .4 1.5-.3.5-1 .6-1.5.3z"/></svg>`,
  Instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 3.2.1 4.7 1.7 4.8 4.8.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 3.1-1.6 4.7-4.8 4.8-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1C3.9 21.6 2.4 20 2.3 16.9 2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9C2.4 3.9 4 2.4 7.1 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7C8.3 24 8.7 24 12 24s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 12 5.8zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z"/></svg>`,
  Outros: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`
};

function sgBuildFeaturedCard(data) {
  const card = document.createElement('div');
  card.id = 'featured-card';

  const kicker = document.createElement('div');
  kicker.id = 'featured-kicker';
  kicker.textContent = 'SOM DA SEMANA';
  card.appendChild(kicker);

  const titleBlock = document.createElement('div');
  titleBlock.id = 'featured-title-block';
  let titleLine = null;

  if (data.titulo) {
    titleLine = document.createElement('div');
    titleLine.id = 'featured-title-line';

    const tituloNode = document.createElement('span');
    tituloNode.id = 'featured-titulo';
    tituloNode.textContent = data.titulo;
    titleLine.appendChild(tituloNode);

    titleBlock.appendChild(titleLine);
  }

  const artistas = Array.isArray(data.artistas)
    ? data.artistas
    : (data.artista ? [{ nome: data.artista, url: '' }] : []);
  if (artistas.length > 0) {
    const artistRow = document.createElement('span');
    artistRow.id = 'featured-artist-row';
    artistRow.appendChild(document.createTextNode('de '));

    const artistNode = document.createElement('span');
    artistNode.id = 'featured-artist';
    artistas.forEach((a, i) => {
      if (i > 0) {
        const comma = (i === artistas.length - 1) ? ' & ' : ', ';
        artistNode.appendChild(document.createTextNode(comma));
      }
      if (a.url) {
        const safeUrl = sgSafeHttpUrl(a.url);
        if (!safeUrl) {
          artistNode.appendChild(document.createTextNode(a.nome));
          return;
        }
        const anchor = document.createElement('a');
        anchor.href = safeUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        anchor.textContent = a.nome;
        anchor.className = 'featured-artist-link';
        artistNode.appendChild(anchor);
      } else {
        artistNode.appendChild(document.createTextNode(a.nome));
      }
    });
    artistRow.appendChild(artistNode);
    if (!titleLine) {
      titleLine = document.createElement('div');
      titleLine.id = 'featured-title-line';
      titleBlock.appendChild(titleLine);
    }
    titleLine.appendChild(artistRow);
  }

  const produtores = Array.isArray(data.produtores) ? data.produtores.filter(p => p && p.nome) : [];
  if (produtores.length > 0) {
    const prodNode = document.createElement('div');
    prodNode.id = 'featured-prod';
    prodNode.appendChild(document.createTextNode('(prod. '));
    produtores.forEach((p, i) => {
      if (i > 0) prodNode.appendChild(document.createTextNode(i === produtores.length - 1 ? ' & ' : ', '));
      if (p.url) {
        const safeUrl = sgSafeHttpUrl(p.url);
        if (!safeUrl) {
          prodNode.appendChild(document.createTextNode(p.nome));
          return;
        }
        const a = document.createElement('a');
        a.href = safeUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = p.nome;
        a.className = 'featured-artist-link';
        prodNode.appendChild(a);
      } else {
        prodNode.appendChild(document.createTextNode(p.nome));
      }
    });
    prodNode.appendChild(document.createTextNode(')'));
    titleBlock.appendChild(prodNode);
  }

  card.appendChild(titleBlock);

  // player YouTube — entre artistas e gênero
  const ytLink = (data.links || []).find(l => l.label === 'Youtube');
  if (ytLink) {
    const videoId = sgExtractYoutubeId(ytLink.url);
    if (videoId) {
      const playerWrap = document.createElement('div');
      playerWrap.id = 'featured-player';
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${videoId}`;
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      iframe.setAttribute('allowfullscreen', '');
      playerWrap.appendChild(iframe);
      card.appendChild(playerWrap);
    }
  }

  const divider = document.createElement('div');
  divider.id = 'featured-divider';
  card.appendChild(divider);

  if (data.genero) {
    const generoNode = document.createElement('div');
    generoNode.id = 'featured-genero';
    generoNode.textContent = data.genero;
    card.appendChild(generoNode);
  }

  if (data.descricao) {
    const descNode = document.createElement('div');
    descNode.id = 'featured-descricao';
    descNode.textContent = data.descricao;
    card.appendChild(descNode);
  }

  const dateNode = document.createElement('div');
  dateNode.className = 'featured-date';
  dateNode.textContent = sgFormatFeaturedDate(data.data_adicao);
  card.appendChild(dateNode);

  const links = Array.isArray(data.links) ? data.links.slice(0, 4) : [];
  if (links.some(item => item && item.label && item.url)) {
    const linksRow = document.createElement('div');
    linksRow.className = 'featured-links-row';
    links.forEach(item => {
      if (!item || !item.label || !item.url) return;
      const link = document.createElement('a');
      const safeUrl = sgSafeHttpUrl(item.url);
      if (!safeUrl) return;
      link.className = 'featured-link';
      link.href = safeUrl;
      link.target = '_blank';
      link.rel = 'noopener';

      const iconKey = Object.keys(SG_FEATURED_LINK_ICONS).find(k => k.toLowerCase() === item.label.toLowerCase()) || 'Outros';
      const iconWrap = document.createElement('span');
      iconWrap.className = 'featured-link-icon';
      // SG_FEATURED_LINK_ICONS é markup SVG estático e confiável (constantes do
      // codigo, sem dado do usuario). Parseia com DOMParser e importa o no —
      // renderiza o icone da plataforma sem manipular HTML como string.
      const iconDoc = new DOMParser().parseFromString(SG_FEATURED_LINK_ICONS[iconKey], 'image/svg+xml');
      const iconSvg = iconDoc.documentElement;
      if (iconSvg && iconSvg.nodeName.toLowerCase() === 'svg') {
        iconWrap.appendChild(document.importNode(iconSvg, true));
      } else {
        iconWrap.textContent = iconKey === 'Outros' ? '↗' : item.label.charAt(0).toUpperCase();
      }
      link.appendChild(iconWrap);
      link.appendChild(document.createTextNode(item.label));

      linksRow.appendChild(link);
    });
    card.appendChild(linksRow);
  }

  return card;
}

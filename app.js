'use strict';

/* =========================================================
   Cinevault — a streaming-style TV browser
   Data source: TVMaze public API (no API key required)
   ========================================================= */

const API = 'https://api.tvmaze.com';
const GENRES = ['Drama', 'Comedy', 'Action', 'Thriller', 'Science-Fiction', 'Crime', 'Horror', 'Romance', 'Fantasy', 'Mystery'];
const COUNTRIES = { US: 'United States', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', IN: 'India', DE: 'Germany', FR: 'France', JP: 'Japan' };

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const searchInput = document.getElementById('searchInput');
const nav = document.getElementById('nav');

/* ---------- API helper with in-memory cache ---------- */
const cache = new Map();
function get(path) {
  if (!cache.has(path)) {
    const p = fetch(API + path).then(r => {
      if (!r.ok) throw new Error(`Request failed (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path);
}

/* ---------- Small utilities ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const strip = html => html ? new DOMParser().parseFromString(html, 'text/html').body.textContent.trim() : '';
const truncate = (s, n) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
const year = d => d ? d.slice(0, 4) : '';
const posterOf = s => s.image?.medium || s.image?.original || '';
const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);
const known = new Map(); // id -> show, so buttons can find show data

function uniqueShows(list) {
  const seen = new Set();
  return list.filter(s => s && !seen.has(s.id) && seen.add(s.id));
}

/* ---------- My List (saved in this browser) ---------- */
const LIST_KEY = 'cinevault:mylist';
function loadList() { try { return JSON.parse(localStorage.getItem(LIST_KEY)) || []; } catch { return []; } }
function saveList() { try { localStorage.setItem(LIST_KEY, JSON.stringify(myList)); } catch { /* storage unavailable */ } }
let myList = loadList();
const inList = id => myList.some(s => s.id === id);
const slim = s => ({ id: s.id, name: s.name, image: s.image, rating: s.rating, genres: s.genres, premiered: s.premiered });

async function toggleList(id) {
  let show = known.get(id);
  if (!show) show = await get(`/shows/${id}`);
  if (inList(id)) myList = myList.filter(s => s.id !== id);
  else myList.unshift(slim(show));
  saveList();
  document.querySelectorAll(`[data-action="list"][data-id="${id}"]`).forEach(b => { b.innerHTML = listLabel(id); });
  if (currentPath() === '/mylist') renderList();
}
const listLabel = id => inList(id) ? '✓ In My List' : '+ My List';

/* ---------- Templates ---------- */
function card(s, extra = '') {
  known.set(s.id, s);
  const img = posterOf(s);
  const rating = s.rating?.average ? `★ ${s.rating.average}` : '';
  return `
    <button class="card" data-action="open" data-id="${s.id}" aria-label="${esc(s.name)}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<div class="noimg">${esc(s.name)}</div>`}
      <div class="card-info">
        <strong>${esc(s.name)}</strong>
        <span>${[rating, year(s.premiered)].filter(Boolean).join(' · ')}</span>
        ${extra}
      </div>
    </button>`;
}

function row(title, shows) {
  if (!shows.length) return '';
  return `
    <section class="row">
      <h2>${esc(title)}</h2>
      <div class="row-wrap">
        <button class="arrow left" data-action="scroll" data-dir="-1" aria-label="Scroll left">‹</button>
        <div class="row-track">${shows.map(s => card(s)).join('')}</div>
        <button class="arrow right" data-action="scroll" data-dir="1" aria-label="Scroll right">›</button>
      </div>
    </section>`;
}

function metaHTML(s) {
  const bits = [];
  if (s.rating?.average) bits.push(`<span class="score">★ ${s.rating.average}</span>`);
  if (s.premiered) bits.push(`<span>${year(s.premiered)}${s.ended ? '–' + year(s.ended) : ''}</span>`);
  if (s.runtime || s.averageRuntime) bits.push(`<span>${s.runtime || s.averageRuntime} min</span>`);
  if (s.status) bits.push(`<span class="pill">${esc(s.status)}</span>`);
  if (s.genres?.length) bits.push(`<span>${esc(s.genres.join(' · '))}</span>`);
  return bits.join('');
}

function heroHTML(s) {
  known.set(s.id, s);
  return `
    <section class="hero" id="hero" style="--bg-img:url('${esc(s.image?.original || '')}')">
      <div class="hero-content">
        <span class="badge">Featured Series</span>
        <h1>${esc(s.name)}</h1>
        <div class="meta">${metaHTML(s)}</div>
        <p>${esc(truncate(strip(s.summary), 240))}</p>
        <div class="actions">
          <button class="btn primary" data-action="open" data-id="${s.id}">ⓘ More Info</button>
          <button class="btn" data-action="list" data-id="${s.id}">${listLabel(s.id)}</button>
        </div>
      </div>
    </section>`;
}

const skCards = n => Array.from({ length: n }, () => '<div class="sk sk-card"></div>').join('');
const homeSkeleton = () => `
  <div class="sk sk-hero"></div>
  <div class="rows">${[1, 2, 3].map(() => `<section class="row"><div class="sk sk-title"></div><div class="row-track">${skCards(8)}</div></section>`).join('')}</div>`;

const errorHTML = e => `
  <div class="page"><div class="empty">
    <h2>Couldn't load shows</h2>
    <p>${esc(e.message || 'Network error')}. The data service may be busy — try again in a moment.</p><br>
    <button class="btn primary" data-action="retry">Retry</button>
  </div></div>`;

/* Swap a blurred poster for a proper widescreen backdrop when one exists */
async function applyBackdrop(el, showId) {
  try {
    const imgs = await get(`/shows/${showId}/images`);
    const bg = imgs.find(i => i.type === 'background' && i.main) || imgs.find(i => i.type === 'background');
    const url = bg?.resolutions?.original?.url;
    if (url && el.isConnected) {
      const pre = new Image();
      pre.onload = () => { el.style.setProperty('--bg-img', `url("${url}")`); el.classList.add('wide'); };
      pre.src = url;
    }
  } catch { /* keep the poster fallback */ }
}

/* ---------- Views ---------- */
let catalog = null;
async function loadCatalog() {
  if (!catalog) {
    const pages = await Promise.all([0, 1, 2, 3].map(p => get(`/shows?page=${p}`).catch(() => [])));
    catalog = pages.flat().filter(s => s.image);
    if (!catalog.length) throw new Error('No shows returned');
  }
  return catalog;
}

async function renderHome() {
  app.innerHTML = homeSkeleton();
  try {
    const [shows, schedule] = await Promise.all([
      loadCatalog(),
      get('/schedule?country=US').catch(() => [])
    ]);
    const topRated = [...shows].sort((a, b) => (b.rating?.average || 0) - (a.rating?.average || 0));
    const popular = [...shows].sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const airing = uniqueShows(schedule.map(e => e.show)).filter(s => s.image).slice(0, 20);
    const hero = topRated[Math.floor(Math.random() * 15)];

    let html = heroHTML(hero) + '<div class="rows">';
    html += row('Top Rated', topRated.slice(0, 20));
    html += row('Trending Now', shuffle(popular.slice(0, 60)).slice(0, 20));
    if (myList.length) html += row('My List', myList);
    html += row('New Episodes Today', airing);
    for (const g of GENRES) {
      html += row(g.replace('-', ' '), popular.filter(s => s.genres.includes(g)).slice(0, 20));
    }
    html += '</div>';
    app.innerHTML = html;
    applyBackdrop(document.getElementById('hero'), hero.id);
  } catch (e) {
    app.innerHTML = errorHTML(e);
  }
}

async function renderToday(country = 'US') {
  const options = Object.entries(COUNTRIES).map(([c, n]) => `<option value="${c}"${c === country ? ' selected' : ''}>${n}</option>`).join('');
  app.innerHTML = `
    <section class="page">
      <div class="page-head">
        <h1>Airing Today</h1>
        <select id="countrySelect" aria-label="Country">${options}</select>
      </div>
      <h2 class="sub">On TV</h2>
      <div class="grid" id="tvGrid">${skCards(12)}</div>
      <h2 class="sub">On Streaming Services</h2>
      <div class="grid" id="webGrid">${skCards(12)}</div>
    </section>`;

  document.getElementById('countrySelect').addEventListener('change', e => renderToday(e.target.value));

  const fill = (id, episodes, getShow) => {
    const el = document.getElementById(id);
    if (!el) return;
    const seen = new Set();
    const items = episodes.filter(ep => {
      const s = getShow(ep);
      return s && !seen.has(s.id) && seen.add(s.id);
    });
    el.innerHTML = items.length
      ? items.map(ep => {
          const tag = [ep.airtime, ep.season && ep.number ? `S${ep.season}E${ep.number}` : ''].filter(Boolean).join(' · ');
          return card(getShow(ep), tag ? `<em>${esc(tag)}</em>` : '');
        }).join('')
      : '<p class="muted">Nothing scheduled.</p>';
  };

  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  get(`/schedule?country=${country}`)
    .then(eps => fill('tvGrid', eps, ep => ep.show))
    .catch(e => { const el = document.getElementById('tvGrid'); if (el) el.innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
  get(`/schedule/web?date=${today}&country=${country}`)
    .then(eps => fill('webGrid', eps, ep => ep._embedded?.show))
    .catch(e => { const el = document.getElementById('webGrid'); if (el) el.innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
}

function renderList() {
  app.innerHTML = `
    <section class="page">
      <div class="page-head"><h1>My List</h1></div>
      ${myList.length
        ? `<div class="grid">${myList.map(s => card(s)).join('')}</div>`
        : `<div class="empty"><h2>Your list is empty</h2><p>Open any show and tap “+ My List” to save it here.</p></div>`}
    </section>`;
}

async function renderSearch(q) {
  if (searchInput.value !== q) searchInput.value = q;
  app.innerHTML = `
    <section class="page">
      <div class="page-head"><h1>Results for “${esc(q)}”</h1></div>
      <div class="grid" id="results">${skCards(12)}</div>
    </section>`;
  try {
    const res = await get(`/search/shows?q=${encodeURIComponent(q)}`);
    const el = document.getElementById('results');
    if (!el) return;
    el.outerHTML = res.length
      ? `<div class="grid">${res.map(r => card(r.show)).join('')}</div>`
      : `<div class="empty"><h2>No matches</h2><p>Try a different title.</p></div>`;
  } catch (e) {
    app.innerHTML = errorHTML(e);
  }
}

/* ---------- Show details modal ---------- */
async function openModal(id) {
  modal.hidden = false;
  document.body.classList.add('locked');
  modalBody.innerHTML = '<div class="spinner"></div>';
  try {
    const s = await get(`/shows/${id}?embed[]=cast&embed[]=seasons`);
    known.set(s.id, s);
    const cast = (s._embedded?.cast || []).slice(0, 12);
    const seasons = (s._embedded?.seasons || []).filter(se => se.number != null);
    const network = s.network?.name || s.webChannel?.name;
    const trailer = `https://www.youtube.com/results?search_query=${encodeURIComponent(s.name + ' official trailer')}`;

    modalBody.innerHTML = `
      <div class="m-hero" id="mHero" style="--bg-img:url('${esc(s.image?.original || '')}')">
        <div>
          <h2>${esc(s.name)}</h2>
          <div class="actions">
            <a class="btn primary" href="${trailer}" target="_blank" rel="noopener">▶ Watch Trailer</a>
            <button class="btn" data-action="list" data-id="${s.id}">${listLabel(s.id)}</button>
          </div>
        </div>
      </div>
      <div class="m-body">
        <div>
          <div class="meta">${metaHTML(s)}</div><br>
          <p>${esc(strip(s.summary)) || '<span class="muted">No description available.</span>'}</p>
        </div>
        <div class="facts">
          ${network ? `<div><span>Network:</span> ${esc(network)}</div>` : ''}
          ${s.language ? `<div><span>Language:</span> ${esc(s.language)}</div>` : ''}
          ${s.schedule?.days?.length ? `<div><span>Airs:</span> ${esc(s.schedule.days.join(', '))}${s.schedule.time ? ' at ' + esc(s.schedule.time) : ''}</div>` : ''}
          ${s.officialSite ? `<div><a href="${esc(s.officialSite)}" target="_blank" rel="noopener">Official site ↗</a></div>` : ''}
          <div><a href="${esc(s.url)}" target="_blank" rel="noopener">View on TVmaze ↗</a></div>
        </div>
      </div>
      ${seasons.length ? `
        <div class="m-section">
          <h3>Episodes
            <select id="seasonSelect" aria-label="Season">
              ${seasons.map(se => `<option value="${se.id}">Season ${se.number}${se.episodeOrder ? ` (${se.episodeOrder} eps)` : ''}</option>`).join('')}
            </select>
          </h3>
          <div id="episodes"></div>
        </div>` : ''}
      ${cast.length ? `
        <div class="m-section">
          <h3>Cast</h3>
          <div class="cast">
            ${cast.map(c => `
              <div class="cast-item">
                ${c.person.image ? `<img src="${esc(c.person.image.medium)}" alt="" loading="lazy">` : '<div class="ph"></div>'}
                <strong>${esc(c.person.name)}</strong>
                <small>${esc(c.character?.name || '')}</small>
              </div>`).join('')}
          </div>
        </div>` : ''}`;

    applyBackdrop(document.getElementById('mHero'), s.id);
    const sel = document.getElementById('seasonSelect');
    if (sel) {
      sel.addEventListener('change', () => loadEpisodes(sel.value));
      loadEpisodes(sel.value);
    }
  } catch (e) {
    modalBody.innerHTML = `<div class="empty"><h2>Couldn't load this show</h2><p>${esc(e.message)}</p></div>`;
  }
}

async function loadEpisodes(seasonId) {
  const box = document.getElementById('episodes');
  if (!box) return;
  box.innerHTML = '<div class="spinner"></div>';
  try {
    const eps = await get(`/seasons/${seasonId}/episodes`);
    if (!document.getElementById('episodes')) return;
    box.innerHTML = eps.length ? eps.map(e => `
      <div class="ep">
        <div class="ep-num">${e.number ?? '•'}</div>
        ${e.image ? `<img src="${esc(e.image.medium)}" alt="" loading="lazy">` : '<div class="ph"></div>'}
        <div>
          <h4>${esc(e.name)}</h4>
          <span>${[e.airdate, e.runtime ? e.runtime + ' min' : ''].filter(Boolean).join(' · ')}</span>
          ${e.summary ? `<p>${esc(truncate(strip(e.summary), 200))}</p>` : ''}
        </div>
      </div>`).join('') : '<p class="muted">No episodes listed.</p>';
  } catch (e) {
    box.innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}

function closeModal() {
  modal.hidden = true;
  document.body.classList.remove('locked');
  modalBody.innerHTML = '';
}

/* ---------- Router (hash-based, works on GitHub Pages) ---------- */
const currentPath = () => (location.hash.slice(1) || '/').split('?')[0];

function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  document.querySelectorAll('.links a').forEach(a => a.classList.toggle('active', a.dataset.path === path));
  if (path !== '/search') searchInput.value = '';
  if (path === '/today') renderToday();
  else if (path === '/mylist') renderList();
  else if (path === '/search') renderSearch(new URLSearchParams(qs).get('q') || '');
  else renderHome();
  window.scrollTo(0, 0);
}

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const id = Number(el.dataset.id);
  switch (el.dataset.action) {
    case 'open': openModal(id); break;
    case 'list': toggleList(id); break;
    case 'close': closeModal(); break;
    case 'retry': route(); break;
    case 'scroll': {
      const track = el.parentElement.querySelector('.row-track');
      track.scrollBy({ left: Number(el.dataset.dir) * track.clientWidth * 0.85, behavior: 'smooth' });
      break;
    }
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = searchInput.value.trim();
    if (!q) { location.hash = '#/'; return; }
    const target = `#/search?q=${encodeURIComponent(q)}`;
    if (currentPath() === '/search') { history.replaceState(null, '', target); renderSearch(q); }
    else location.hash = target;
  }, 350);
});

window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 20), { passive: true });
window.addEventListener('hashchange', route);
route();

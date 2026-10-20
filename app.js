'use strict';

const $ = id => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
};
const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const number = value => new Intl.NumberFormat().format(value);
const filterKeys = ['q', 'mode', 'type', 'family', 'product', 'status'];
const fields = {q: $('search'), mode: $('mode'), type: $('type'), family: $('family'), product: $('product'), status: $('status')};
const textStatuses = {
  wiki_transcription: 'Wiki transcription', wiki_section_review: 'Section transcription · review needed',
  wiki_transcription_review: 'Transcription · source review needed', wiki_partial: 'Partial card text',
  token_identity_only: 'Token · identity only', printed_verified: 'Printed text verified', missing: 'Card match unresolved'
};
const validationLabels = {publisher_matched: 'Publisher matched', publisher_matched_with_aliases: 'Matched with aliases', publisher_discrepancy: 'List discrepancy', wiki_only: 'Wiki inventory'};
let state = readURL();
let meta;
let searchRequest;
let detailRequest;
let timer;
let resultData;
const dataSource = window.PACGData.create({mode:document.querySelector('meta[name="pacg-data-mode"]').content, base:document.baseURI});

function readURL() {
  const url = new URL(location.href);
  return Object.fromEntries([...filterKeys.map(key => [key, url.searchParams.get(key) || (key === 'mode' ? 'text' : '')]), ['page', Number(url.searchParams.get('page')) || 1], ['card', url.searchParams.get('card') || '']]);
}

function updateURL(push = false) {
  const url = new URL(location.href);
  url.search = '';
  for (const key of [...filterKeys, 'page', 'card']) {
    if (state[key] && !(key === 'page' && state[key] === 1) && !(key === 'mode' && state[key] === 'text')) url.searchParams.set(key, state[key]);
  }
  history[push ? 'pushState' : 'replaceState'](null, '', url);
}

function setOptions(select, options, first) {
  select.replaceChildren();
  const initial = el('option', '', first);
  initial.value = '';
  select.append(initial);
  for (const [value, text] of options) {
    const option = el('option', '', text);
    option.value = value;
    select.append(option);
  }
}

function updateProducts() {
  const products = meta.products.filter(p => !state.family || p.family === state.family);
  setOptions($('product'), products.map(p => [p.id, `${p.name} · ${p.id}`]), 'All decks & collections');
  if (state.product && !products.some(p => p.id === state.product)) state.product = '';
  $('product').value = state.product;
}

function restoreFields() {
  for (const key of filterKeys) fields[key].value = state[key];
  updateProducts();
  updateFilterSummary();
  if (activeFilterCount()) $('search-options').open = true;
}

function activeFilterCount() {
  return ['type','family','product','status'].filter(key => state[key]).length + (state.mode !== 'text' ? 1 : 0);
}

function updateFilterSummary() {
  const count = activeFilterCount();
  $('filter-summary').textContent = count ? `Search options · ${count} active` : 'Search options';
}

function initializeTheme() {
  const button = $('theme-toggle');
  const update = () => {
    const next = window.PACGTheme.get() === 'dark' ? 'light' : 'dark';
    button.textContent = label(next) + ' mode';
    button.setAttribute('aria-label',`Switch to ${next} mode`);
  };
  button.addEventListener('click',() => { window.PACGTheme.toggle(); update(); });
  update();
}

function announce(message) { $('announcement').textContent = message; }

function emptyPanel(title, message, retry) {
  const div = el('div', 'empty-detail');
  const icon = el('img', 'empty-die');
  icon.src = document.querySelector('link[rel="icon"]').href;
  icon.alt = '';
  div.append(icon, el('h2', '', title), el('p', '', message));
  if (retry) {
    const button = el('button', 'retry-button', 'Try again');
    button.type = 'button';
    button.addEventListener('click', retry);
    div.append(button);
  }
  return div;
}

async function loadResults({keepCard = false} = {}) {
  searchRequest?.abort();
  detailRequest?.abort();
  const controller = new AbortController();
  searchRequest = controller;
  $('results').setAttribute('aria-busy', 'true');
  $('results').classList.add('loading');
  const params = new URLSearchParams();
  for (const key of [...filterKeys, 'page']) if (state[key]) params.set(key, state[key]);
  try {
    const data = await dataSource.search(params, controller.signal);
    resultData = data;
    state.page = data.page;
    $('result-count').textContent = `${number(data.total)} ${data.total === 1 ? 'record' : 'records'}`;
    $('result-order').textContent = state.q ? 'Names first' : 'A–Z';
    $('results').replaceChildren();
    for (const card of data.cards) {
      const button = el('button', 'result');
      button.type = 'button';
      button.dataset.id = card.id;
      button.setAttribute('aria-pressed', 'false');
      const title = el('span', 'result-title');
      title.append(el('span', '', card.name), el('span', 'result-arrow', '↗'));
      const info = el('span', 'result-meta');
      info.append(el('span', 'result-kind', label(card.card_type)), el('span', 'meta-dot', '·'), el('span', '', `${card.product_count} ${card.product_count === 1 ? 'deck' : 'decks'}`));
      if (card.text_status !== 'wiki_transcription' && card.text_status !== 'printed_verified') {
        const dot = el('span', 'result-review');
        dot.title = textStatuses[card.text_status] || 'Needs review';
        dot.setAttribute('aria-label', dot.title);
        info.append(dot);
      }
      button.append(title, info);
      if (card.traits.length) button.append(el('div', 'result-traits', card.traits.slice(0, 4).join(' · ')));
      button.addEventListener('click', () => selectCard(card.id, {push: true, scroll: true}));
      $('results').append(button);
    }
    $('results').scrollTop = 0;
    $('page-label').textContent = `Page ${data.page} of ${data.pages}`;
    $('previous').disabled = data.page <= 1;
    $('next').disabled = data.page >= data.pages;
    if (!data.total) {
      const empty = el('div', 'empty-results');
      empty.append(el('h3', '', 'No cards found'), el('p', '', 'Try another name or a broader set of filters.'));
      const button = el('button', 'retry-button', 'Reset filters');
      button.type = 'button';
      button.addEventListener('click', resetFilters);
      empty.append(button);
      $('results').append(empty);
      state.card = '';
      $('detail').replaceChildren(emptyPanel('A different path awaits', 'No card matches this search. Adjust your filters to keep exploring.'));
      $('detail').setAttribute('aria-busy', 'false');
    } else {
      const selected = keepCard && state.card ? state.card : data.cards.some(c => c.id === state.card) ? state.card : data.cards[0].id;
      await selectCard(selected);
    }
    if (controller.signal.aborted) return;
    updateURL();
    announce(`${number(data.total)} records found.`);
  } catch (error) {
    if (error.name === 'AbortError') return;
    $('result-count').textContent = 'Search unavailable';
    $('results').replaceChildren(emptyPanel('Couldn’t load the library', error.message, () => loadResults()));
    $('previous').disabled = true;
    $('next').disabled = true;
    $('detail').setAttribute('aria-busy', 'false');
  } finally {
    if (searchRequest === controller) {
      $('results').setAttribute('aria-busy', 'false');
      $('results').classList.remove('loading');
    }
  }
}

async function selectCard(id, {push = false, scroll = false} = {}) {
  detailRequest?.abort();
  const controller = new AbortController();
  detailRequest = controller;
  state.card = id;
  for (const button of $('results').querySelectorAll('.result')) button.setAttribute('aria-pressed', String(button.dataset.id === id));
  $('detail').setAttribute('aria-busy', 'true');
  $('detail').classList.add('loading');
  if (push) updateURL(true);
  try {
    const card = await dataSource.detail(id, controller.signal);
    renderCard(card);
    document.title = `${card.name} · PACG card library`;
    announce(`${card.name}, ${label(card.card_type)}. Details loaded.`);
    if (scroll && window.matchMedia('(max-width: 620px)').matches) {
      $('detail').scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
      $('detail').focus({preventScroll: true});
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    $('detail').replaceChildren(emptyPanel('Card details unavailable', error.message, () => selectCard(id)));
  } finally {
    if (detailRequest === controller) {
      $('detail').setAttribute('aria-busy', 'false');
      $('detail').classList.remove('loading');
    }
  }
}

function renderCard(card) {
  const presentation = el('div', 'card-presentation');
  const preview = window.PACGFace.create(card, {product:state.product, family:state.family, products:meta.products, announce});
  const body = el('aside', 'card-information');
  body.setAttribute('aria-label', 'Deck contents and source information');
  body.append(el('p', 'card-information-label', 'Library record'));
  const toolbar = el('div', 'card-toolbar');
  const review = !['wiki_transcription','printed_verified'].includes(card.text_status);
  toolbar.append(el('span', 'status-badge' + (review ? ' review' : ''), textStatuses[card.text_status] || label(card.text_status)));
  const copy = el('button', 'copy-link', 'Copy card link ↗');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      copy.textContent = 'Link copied';
      announce('Card link copied to clipboard.');
      setTimeout(() => { copy.textContent = 'Copy card link ↗'; }, 1800);
    } catch {
      copy.textContent = 'Use the browser address to share';
    }
  });
  toolbar.append(copy);
  body.append(toolbar);
  const notices = {
    missing: 'This inventory entry has no resolved card version. Its deck quantity is recorded; the card text still needs to be matched.',
    wiki_partial: 'This record contains partial adventure information. A complete transcription of the printed card is still needed.',
    token_identity_only: 'This record identifies the character token. Token artwork and any token-specific text have not been transcribed.',
    wiki_section_review: 'This transcription preserves a wiki section. It may include commentary or information from more than one card face.',
    wiki_transcription_review: 'The deck inventory establishes this card’s source. The wiki text’s printing association still needs review.'
  };
  if (notices[card.text_status]) body.append(el('p', 'notice', notices[card.text_status]));
  if (card.corrections.length) {
    const heading = el('h3', 'section-label', 'Errata & corrections');
    body.append(heading);
    for (const correction of card.corrections) {
      const details = el('details', 'errata');
      details.append(el('summary', '', correction.issue || 'View correction'));
      if (correction.corrected_text) details.append(el('p', '', correction.corrected_text));
      else details.append(el('p', '', 'See the source page for this correction.'));
      body.append(details);
    }
  }
  renderDecks(body, card);
  if (card.other_versions.length) {
    const section = el('section', 'text-section');
    section.append(el('h3', '', card.unresolved ? 'Candidate card versions' : 'Other versions of this card'));
    const versions = el('div', 'versions');
    for (const version of card.other_versions) {
      const button = el('button', 'version-button', `${version.name} · ${version.variant_label || 'Another version'}`);
      button.type = 'button';
      button.addEventListener('click', () => selectCard(version.id, {push:true}));
      versions.append(button);
    }
    section.append(versions);
    body.append(section);
  }
  const source = el('details', 'disclosure');
  source.append(el('summary', '', 'Source & verification'));
  const sourceBody = el('div');
  if (card.source_url) {
    const line = el('p', 'source-line');
    const link = el('a', '', 'View source on the Pathfinder ACG Wiki ↗');
    // Only known web links become clickable; card content is always plain text.
    if (/^https:\/\/pacg\.fandom\.com\//.test(card.source_url)) link.href = card.source_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    line.append(link);
    sourceBody.append(line);
  }
  sourceBody.append(el('p', 'source-line', `Wiki revision ${card.revision || 'unknown'} · Record ${card.id}`));
  if (card.source_codes.length) sourceBody.append(el('p', 'source-line', 'Source codes: ' + card.source_codes.join(', ')));
  if (card.notes) sourceBody.append(el('p', 'source-note', card.notes));
  if (card.issues.length) {
    sourceBody.append(el('p', 'source-line', `${card.issues.length} open review ${card.issues.length === 1 ? 'note' : 'notes'}`));
    const list = el('ul', 'source-note');
    for (const issue of card.issues) list.append(el('li', '', issue.detail));
    sourceBody.append(list);
  }
  if (card.character_layout && card.effective_text) {
    const complete = el('details');
    complete.append(el('summary', '', card.flavor_text_excluded ? 'Rules transcription' : 'Complete wiki transcription'), el('pre', 'raw-markup', card.effective_text));
    sourceBody.append(complete);
  }
  if (card.raw_markup) {
    const raw = el('details');
    raw.append(el('summary', '', 'Original wiki markup'), el('pre', 'raw-markup', card.raw_markup));
    sourceBody.append(raw);
  }
  source.append(sourceBody);
  body.append(source);
  presentation.append(preview, body);
  $('detail').replaceChildren(presentation);
}

function renderDecks(parent, card) {
  const section = el('section', 'deck-section');
  const heading = el('h3', '', 'Found in');
  heading.append(el('span', 'count-badge', `${card.products.length} ${card.products.length === 1 ? 'deck' : 'decks'}`));
  section.append(heading);
  if (!card.products.length) {
    section.append(el('p', 'source-note', 'The wiki identifies source codes for this version, but no deck inventory entry has been resolved to it.'));
  } else {
    const table = el('table', 'deck-table');
    const head = el('thead');
    const header = el('tr');
    for (const text of ['Deck / collection','Copies','Inventory check']) {
      const th = el('th', '', text);
      th.scope = 'col';
      header.append(th);
    }
    head.append(header);
    const rows = el('tbody');
    const buildRows = all => {
      rows.replaceChildren();
      for (const product of all ? card.products : card.products.slice(0, 6)) {
        const row = el('tr');
        const deck = el('td');
        const button = el('button', 'deck-button', product.name);
        button.type = 'button';
        button.title = 'Filter the library to this deck';
        button.addEventListener('click', () => {
          state.product = product.id;
          state.family = '';
          state.page = 1;
          restoreFields();
          loadResults();
        });
        deck.append(button, el('span', 'deck-code', product.id + (product.levels ? ' · Level ' + product.levels : '')));
        const count = el('td', '', product.quantity);
        const status = el('td');
        status.append(el('span', 'validation-label' + (product.validation_status === 'publisher_discrepancy' ? ' warning' : ''), validationLabels[product.validation_status] || label(product.validation_status)));
        row.append(deck, count, status);
        rows.append(row);
      }
    };
    buildRows(false);
    table.append(head, rows);
    section.append(table);
    if (card.products.length > 6) {
      const show = el('button', 'show-decks', `Show all ${card.products.length} decks ↓`);
      show.type = 'button';
      let expanded = false;
      show.setAttribute('aria-expanded', 'false');
      show.addEventListener('click', () => {
        expanded = !expanded;
        buildRows(expanded);
        show.textContent = expanded ? 'Show fewer decks ↑' : `Show all ${card.products.length} decks ↓`;
        show.setAttribute('aria-expanded', String(expanded));
      });
      section.append(show);
    }
  }
  parent.append(section, el('div', 'detail-divider'));
}

function resetFilters() {
  clearTimeout(timer);
  state = {q:'', mode:'text', type:'', family:'', product:'', status:'', page:1, card:''};
  restoreFields();
  loadResults();
  $('search').focus();
}

function onFilterChange() {
  clearTimeout(timer);
  for (const key of filterKeys) state[key] = fields[key].value;
  state.page = 1;
  state.card = '';
  updateProducts();
  updateFilterSummary();
  loadResults();
}

async function init() {
  try {
    meta = await dataSource.meta();
    setOptions($('type'), meta.types.map(type => [type,label(type)]), 'All card types');
    setOptions($('family'), meta.families.map(family => [family,family]), 'All adventure paths');
    restoreFields();
    $('search').addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(onFilterChange, 250);
    });
    for (const key of filterKeys.filter(k => k !== 'q')) fields[key].addEventListener('change', onFilterChange);
    $('filters').addEventListener('submit', event => { event.preventDefault(); onFilterChange(); });
    $('clear').addEventListener('click', resetFilters);
    for (const [id, delta] of [['previous',-1],['next',1]]) $(id).addEventListener('click', () => {
      if (!resultData) return;
      state.page += delta;
      state.card = '';
      loadResults();
    });
    window.addEventListener('popstate', () => { state = readURL(); restoreFields(); loadResults({keepCard:true}); });
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
        event.preventDefault();
        $('search').focus();
      }
    });
    await loadResults({keepCard:true});
  } catch (error) {
    $('results').setAttribute('aria-busy', 'false');
    $('detail').setAttribute('aria-busy', 'false');
    $('detail').replaceChildren(emptyPanel('Couldn’t open the library', error.message, () => location.reload()));
    $('result-count').textContent = 'Connection needed';
  }
}

initializeTheme();
init();

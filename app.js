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
const workspaceViews = ['library','character','mechanics','map','rules','dice'];
let state = readURL();
let meta;
let searchRequest;
let detailRequest;
let timer;
let resultData;
let activeResult = -1;
let characterSheet;
let diceStatistics;
let rulebook;
let mechanics;
let adventureMap;
const dataSource = window.PACGData.create({mode:document.querySelector('meta[name="pacg-data-mode"]').content, base:document.baseURI});
const narrowFeatureMenu = window.matchMedia('(max-width:760px)');

function readURL() {
  const url = new URL(location.href);
  return Object.fromEntries([...filterKeys.map(key => [key, url.searchParams.get(key) || (key === 'mode' ? 'prefix' : '')]),
    ['card', url.searchParams.get('card') || ''],
    ['view', workspaceViews.includes(url.searchParams.get('view')) ? url.searchParams.get('view') : 'library'],
    ['character', url.searchParams.get('character') || ''], ['dice',url.searchParams.get('dice') || ''],
    ['set',url.searchParams.get('set')||''],['mechanic',url.searchParams.get('mechanic')||''],['tracker',url.searchParams.get('tracker')||''],['adventure',url.searchParams.get('adventure')||'']]);
}

function updateURL(push = false) {
  const url = new URL(location.href);
  url.search = '';
  for (const key of [...filterKeys, 'card', 'view', 'character', 'dice','set','mechanic','tracker','adventure']) {
    if (state[key] && !(key === 'mode' && state[key] === 'prefix') &&
        !(key === 'view' && state[key] === 'library')) url.searchParams.set(key, state[key]);
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
}

function activeFilterCount() {
  return ['type','family','product','status'].filter(key => state[key]).length + (state.mode !== 'prefix' ? 1 : 0);
}

function updateFilterSummary() {
  const count = activeFilterCount();
  $('filter-summary').textContent = count ? `Search options · ${count} active` : 'Search options';
  $('search').placeholder = state.mode === 'text' ? 'Search names, traits, or card text…' :
    state.mode === 'name' ? 'Search within card names…' : 'Start typing a card name…';
}

function initializeTheme() {
  const button = $('theme-toggle');
  const update = () => {
    const next = window.PACGTheme.get() === 'dark' ? 'light' : 'dark';
    button.textContent = label(next) + ' mode';
    button.setAttribute('aria-label',`Switch to ${next} mode`);
  };
  button.addEventListener('click',() => { window.PACGTheme.toggle(); update(); adventureMap?.syncTheme(); });
  update();
}

function announce(message) { $('announcement').textContent = message; }

function setFeatureMenu(open, {restoreFocus = false} = {}) {
  const expanded = !!open && narrowFeatureMenu.matches;
  $('feature-navigation').dataset.open = String(expanded);
  $('feature-menu-toggle').setAttribute('aria-expanded',String(expanded));
  if (expanded) setDropdown(false);
  else if (restoreFocus && narrowFeatureMenu.matches) $('feature-menu-toggle').focus();
}

function showWorkspace(view, {push = false} = {}) {
  state.view = view;
  document.body.classList.toggle('is-map-view',view==='map');
  for (const name of workspaceViews) {
    const selected = name === view;
    $(name + '-view').hidden = !selected;
    $(name + '-tab').setAttribute('aria-selected',String(selected));
    $(name + '-tab').tabIndex = selected ? 0 : -1;
  }
  const selectedTab = $(view + '-tab');
  $('feature-menu-label').textContent = selectedTab.textContent;
  setFeatureMenu(false,{restoreFocus:$('feature-menu').contains(document.activeElement)});
  document.querySelector('.skip-link').href = view === 'map' ? '#adventure-map-frame' : view === 'character' ? '#character-picker' : view === 'dice' ? '#dice-d4' : view === 'rules' ? '#rule-article' : view === 'mechanics' ? '#mechanic-content' : '#detail';
  setDropdown(false);
  characterSheet?.closeSearch();
  updateURL(push);
  if (view === 'character') {
    document.title = 'Character sheet · PACG';
    if (!meta) return;
    characterSheet ||= window.PACGCharacter.create({source:dataSource,products:meta.products,announce,
      onSelect:id => {
        state.character = id;
        updateURL();
      }});
    characterSheet.select(state.character);
  } else if (view === 'dice') {
    document.title = 'Dice statistics · PACG';
    diceStatistics ||= window.PACGDice.create({onChange:pool => { state.dice = pool; updateURL(); }});
    diceStatistics.setPool(state.dice);
  } else if (view === 'rules') {
    document.title = 'Interactive rulebook · PACG';
    rulebook ||= window.PACGRules.create();
    rulebook.open();
  } else if (view === 'mechanics') {
    document.title = 'Special mechanics · PACG';
    mechanics ||= window.PACGMechanics.create({onChange:choice=>{state.set=choice.set;state.mechanic=choice.mechanic;state.tracker=choice.character;updateURL();}});
    mechanics.open({set:state.set,mechanic:state.mechanic,character:state.tracker});
  } else if(view==='map') {
    document.title='Adventure map · PACG';
    adventureMap ||= window.PACGAdventureMap.create({frame:$('adventure-map-frame'),onChange:(id,{push})=>{
      const changed=state.adventure!==id;state.adventure=id;
      if(state.view==='map')updateURL(push&&changed);
    }});
    adventureMap.open(state.adventure);
  } else document.title = 'PACG · Card library';
}

function initializeViews() {
  const toggle = $('feature-menu-toggle');
  const navigation = $('feature-navigation');
  const openMenu = () => {
    setFeatureMenu(true);
    $(state.view + '-tab').focus();
  };
  toggle.addEventListener('click',() => {
    if (toggle.getAttribute('aria-expanded') === 'true') setFeatureMenu(false);
    else openMenu();
  });
  toggle.addEventListener('keydown',event => {
    if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    openMenu();
  });
  navigation.addEventListener('keydown',event => {
    if (event.key === 'Escape' && narrowFeatureMenu.matches) {
      event.preventDefault();
      setFeatureMenu(false,{restoreFocus:true});
    }
  });
  navigation.addEventListener('focusout',event => {
    if (!navigation.contains(event.relatedTarget)) setFeatureMenu(false);
  });
  document.addEventListener('pointerdown',event => {
    if (!navigation.contains(event.target)) setFeatureMenu(false);
  });
  const updateMenuLayout = () => {
    $('feature-menu').setAttribute('aria-orientation',narrowFeatureMenu.matches ? 'vertical' : 'horizontal');
    const focusWithin = navigation.contains(document.activeElement);
    setFeatureMenu(false);
    if (focusWithin) (narrowFeatureMenu.matches ? toggle : $(state.view + '-tab')).focus();
  };
  narrowFeatureMenu.addEventListener('change',updateMenuLayout);
  updateMenuLayout();
  for (const name of workspaceViews) {
    const button = $(name + '-tab');
    button.addEventListener('click',() => showWorkspace(name,{push:true}));
    button.addEventListener('keydown',event => {
      const previous = narrowFeatureMenu.matches ? 'ArrowUp' : 'ArrowLeft';
      const next = narrowFeatureMenu.matches ? 'ArrowDown' : 'ArrowRight';
      if (![previous,next,'Home','End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? workspaceViews[0] : event.key === 'End' ? workspaceViews.at(-1) :
        workspaceViews[(workspaceViews.indexOf(name) + (event.key === next ? 1 : -1) + workspaceViews.length) % workspaceViews.length];
      if (!narrowFeatureMenu.matches) showWorkspace(target,{push:true});
      $(target + '-tab').focus();
    });
  }
  showWorkspace(state.view);
}

function clearRecord() {
  $('record').replaceChildren();
  $('record').hidden = true;
}

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

function setActiveResult(index) {
  const buttons = [...$('results').querySelectorAll('.result')];
  activeResult = index >= 0 && index < buttons.length ? index : -1;
  buttons.forEach((button, i) => button.setAttribute('aria-selected', String(i === activeResult)));
  if (activeResult < 0) $('search').removeAttribute('aria-activedescendant');
  else {
    $('search').setAttribute('aria-activedescendant', buttons[activeResult].id);
    buttons[activeResult].scrollIntoView({block:'nearest'});
  }
}

function setDropdown(open) {
  $('search-dropdown').hidden = !open;
  $('search').setAttribute('aria-expanded', String(open));
  if (!open) setActiveResult(-1);
}

function invalidateResults() {
  searchRequest?.abort();
  searchRequest = undefined;
  resultData = null;
  setActiveResult(-1);
  $('results').replaceChildren();
  $('result-count').textContent = 'Searching…';
  $('results').setAttribute('aria-busy', 'true');
}

async function loadResults() {
  invalidateResults();
  const controller = new AbortController();
  searchRequest = controller;
  $('results').setAttribute('aria-busy', 'true');
  $('results').classList.add('loading');
  const params = new URLSearchParams({all:'1'});
  for (const key of filterKeys) if (state[key]) params.set(key, state[key]);
  try {
    const data = await dataSource.search(params, controller.signal);
    if (controller.signal.aborted || searchRequest !== controller) return;
    resultData = data;
    $('result-count').textContent = `${number(data.total)} ${data.total === 1 ? 'record' : 'records'}`;
    $('result-order').textContent = state.q && state.mode !== 'prefix' ? 'Names first' : 'A–Z';
    $('results').replaceChildren();
    for (const card of data.cards) {
      const button = el('button', 'result');
      button.type = 'button';
      button.dataset.id = card.id;
      button.id = 'result-' + card.id;
      button.tabIndex = -1;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      button.classList.toggle('is-current', card.id === state.card);
      const title = el('span', 'result-title');
      title.append(el('span', '', card.name), el('span', 'result-arrow', '↗'));
      const info = el('span', 'result-meta');
      info.append(el('span', 'result-kind', label(card.card_type)), el('span', 'meta-dot', '·'));
      const sets = el('span','result-sets');
      sets.title = `${card.product_count} ${card.product_count === 1 ? 'deck' : 'decks'}`;
      if (card.source_codes?.length) {
        sets.setAttribute('aria-label','Sets: ' + card.source_codes.join(', '));
        for (const code of card.source_codes) sets.append(el('span','result-set',code));
      } else sets.textContent = sets.title;
      info.append(sets);
      if (card.text_status !== 'wiki_transcription' && card.text_status !== 'printed_verified') {
        const dot = el('span', 'result-review');
        dot.title = textStatuses[card.text_status] || 'Needs review';
        dot.setAttribute('aria-label', dot.title);
        info.append(dot);
      }
      button.append(title, info);
      if (card.traits.length) button.append(el('div', 'result-traits', card.traits.slice(0, 4).join(' · ')));
      button.addEventListener('click', () => selectCard(card.id, {push: true, scroll: true}));
      button.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse') event.preventDefault();
      });
      $('results').append(button);
    }
    $('results').scrollTop = 0;
    if (!data.total) {
      const empty = el('div', 'empty-results');
      empty.append(el('h3', '', 'No cards found'), el('p', '', 'Try another name or a broader set of filters.'));
      $('results').append(empty);
    }
    if (controller.signal.aborted) return;
    updateURL();
    announce(`${number(data.total)} records found.`);
  } catch (error) {
    if (error.name === 'AbortError' || searchRequest !== controller) return;
    $('result-count').textContent = 'Search unavailable';
    $('results').replaceChildren(emptyPanel('Couldn’t load the library', error.message, () => loadResults()));
  } finally {
    if (searchRequest === controller) {
      $('results').setAttribute('aria-busy', 'false');
      $('results').classList.remove('loading');
    }
  }
}

async function selectCard(id, {push = false, scroll = false} = {}) {
  setDropdown(false);
  detailRequest?.abort();
  clearRecord();
  const controller = new AbortController();
  detailRequest = controller;
  state.card = id;
  for (const button of $('results').querySelectorAll('.result')) button.classList.toggle('is-current', button.dataset.id === id);
  $('detail').setAttribute('aria-busy', 'true');
  $('detail').classList.add('loading');
  if (push) updateURL(true);
  try {
    const card = await dataSource.detail(id, controller.signal);
    if (controller.signal.aborted || detailRequest !== controller) return;
    renderCard(card);
    if (state.view === 'library') document.title = `${card.name} · PACG card library`;
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
  const textView = el('div','card-text-view');
  const toggle = el('div','text-version-toggle');
  toggle.setAttribute('role','group');
  toggle.setAttribute('aria-label','Card text version');
  const preview = el('div','text-version-preview');
  let side = 0;
  const showVersion = mode => {
    for (const button of toggle.querySelectorAll('button')) button.setAttribute('aria-pressed',String(button.dataset.mode === mode));
    const selected = window.PACGHistory.select(card,mode);
    preview.replaceChildren(window.PACGFace.create(selected.card, {product:state.product, family:state.family,
      products:meta.products, announce, edgeControls:toggle, viewIndex:side, onViewChange:index => { side = index; }}));
  };
  for (const [mode,title] of [['original','Original'],['errata','Errata']]) {
    if (mode === 'errata' && !window.PACGHistory.hasErrata(card)) continue;
    const button = el('button','text-version-button',title);
    button.type = 'button';
    button.dataset.mode = mode;
    button.addEventListener('click',() => { showVersion(mode); button.focus({preventScroll:true}); announce(`${title} text displayed.`); });
    toggle.append(button);
  }
  textView.append(preview,window.PACGHistory.disclosure(card));
  showVersion('original');
  const body = el('aside', 'card-information');
  body.setAttribute('aria-label', 'Deck contents and source information');
  body.append(el('p', 'card-information-label', 'Library record'));
  const notices = {
    missing: 'This inventory entry has no resolved card version. Its deck quantity is recorded; the card text still needs to be matched.',
    wiki_partial: 'This record contains partial adventure information. A complete transcription of the printed card is still needed.',
    token_identity_only: 'This record identifies the character token. Token artwork and any token-specific text have not been transcribed.',
    wiki_section_review: 'This transcription preserves a wiki section. It may include commentary or information from more than one card face.',
    wiki_transcription_review: 'The deck inventory establishes this card’s source. The wiki text’s printing association still needs review.'
  };
  if (notices[card.text_status]) body.append(el('p', 'notice', notices[card.text_status]));
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
  const originalNote = window.PACGHistory.select(card,'original').note;
  if (originalNote !== 'Original printing unverified. Wiki transcription shown; it may already include errata.') {
    sourceBody.append(el('p','source-note',originalNote));
  }
  sourceBody.append(el('p', 'source-line', `Wiki revision ${card.revision || 'unknown'} · Record ${card.id}`));
  const sourceNotes = (card.notes || '').replace('Wiki text may include errata; not independently certified as printed text.','').trim();
  if (sourceNotes) sourceBody.append(el('p', 'source-note', sourceNotes));
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
  presentation.append(textView);
  $('detail').replaceChildren(presentation);
  $('record').replaceChildren(body);
  $('record').hidden = false;
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
    for (const text of ['Deck','Copies']) {
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
          restoreFields();
          loadResults();
          $('search').focus();
        });
        const deckCodes = product.levels ? product.levels.split(',').map(level => product.id + '-' + level.trim()).join(' · ') : product.id;
        deck.append(button, el('span', 'deck-code', deckCodes));
        const count = el('td', '', product.quantity);
        row.append(deck, count);
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
  parent.append(section);
}

function resetFilters() {
  clearTimeout(timer);
  state = {...state,q:'', mode:'prefix', type:'', family:'', product:'', status:''};
  restoreFields();
  loadResults();
  $('search').focus();
}

function onFilterChange({debounce = false} = {}) {
  clearTimeout(timer);
  for (const key of filterKeys) state[key] = fields[key].value;
  updateProducts();
  updateFilterSummary();
  updateURL();
  invalidateResults();
  setDropdown($('search-anchor').contains(document.activeElement));
  if (debounce) timer = setTimeout(loadResults, 180);
  else loadResults();
}

async function init() {
  try {
    meta = await dataSource.meta();
    setOptions($('type'), meta.types.map(type => [type,label(type)]), 'All card types');
    setOptions($('family'), meta.families.map(family => [family,family]), 'All adventure paths');
    restoreFields();
    if (state.view === 'character') showWorkspace(state.view);
    $('search').addEventListener('input', () => onFilterChange({debounce:true}));
    $('search').addEventListener('focus', () => setDropdown(true));
    $('search').addEventListener('click', () => setDropdown(true));
    $('search').addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); setDropdown(false); }
      else if (['ArrowDown','ArrowUp'].includes(event.key)) {
        event.preventDefault();
        setDropdown(true);
        const count = $('results').querySelectorAll('.result').length;
        if (count) setActiveResult(activeResult < 0 ? (event.key === 'ArrowDown' ? 0 : count - 1) :
          (activeResult + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (!$('search-dropdown').hidden && resultData?.cards.length) {
          selectCard(resultData.cards[Math.max(0, activeResult)].id, {push:true, scroll:true});
        } else { clearTimeout(timer); loadResults(); setDropdown(true); }
      }
    });
    document.addEventListener('pointerdown', event => {
      if (!$('search-anchor').contains(event.target)) setDropdown(false);
    });
    $('search-anchor').addEventListener('focusout', event => {
      if (!$('search-anchor').contains(event.relatedTarget)) setDropdown(false);
    });
    $('search-anchor').addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.activeElement !== $('search')) {
        event.preventDefault();
        $('search').focus();
        setDropdown(false);
      }
    });
    for (const key of filterKeys.filter(k => k !== 'q')) fields[key].addEventListener('change', onFilterChange);
    $('filters').addEventListener('submit', event => { event.preventDefault(); onFilterChange(); });
    $('clear').addEventListener('click', resetFilters);
    window.addEventListener('popstate', () => {
      clearTimeout(timer);
      state = readURL();
      restoreFields();
      showWorkspace(state.view);
      setDropdown(false);
      loadResults();
      if (state.card) selectCard(state.card);
      else {
        detailRequest?.abort();
        clearRecord();
        $('detail').classList.remove('loading');
        $('detail').setAttribute('aria-busy', 'false');
        $('detail').replaceChildren(emptyPanel('Find a card', 'Type a name above, then select a card to see its rules and deck contents.'));
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
        event.preventDefault();
        (state.view === 'map' ? $('adventure-map-frame') : state.view === 'character' ? $('character-picker') : state.view === 'dice' ? $('dice-d4') : state.view === 'rules' ? $('rule-search') : state.view === 'mechanics' ? $('mechanic-set') : $('search')).focus();
      }
    });
    await Promise.all([loadResults(), state.card ? selectCard(state.card) : Promise.resolve()]);
  } catch (error) {
    $('results').setAttribute('aria-busy', 'false');
    $('detail').setAttribute('aria-busy', 'false');
    $('detail').replaceChildren(emptyPanel('Couldn’t open the library', error.message, () => location.reload()));
    $('result-count').textContent = 'Connection needed';
  }
}

initializeTheme();
initializeViews();
init();

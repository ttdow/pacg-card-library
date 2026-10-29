/* Personal feat selections stay in browser storage; card records are read-only. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'pacg.character-sheets.v1';
  const characterName = name => String(name).replace(/\s+\[role\]$/i,'').trim().toLowerCase();

  function matchingRoles(character, roles) {
    return roles.filter(role => characterName(role.name) === characterName(character.name) &&
      role.source_codes.some(code => character.source_codes.includes(code)));
  }

  function groupCharacters(characters) {
    const groups = new Map();
    for (const card of characters) {
      const key = characterName(card.name);
      if (!groups.has(key)) groups.set(key,{key,name:card.name,versions:[],source_codes:[]});
      const group = groups.get(key);
      group.versions.push(card);
      group.source_codes = [...new Set([...group.source_codes,...card.source_codes])];
    }
    return [...groups.values()];
  }

  class SheetStore {
    constructor(storage) {
      this.storage = storage;
      this.persistent = !!storage;
      this.data = {schema_version:1, last_character:'', sheets:{}};
      try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved.schema_version !== 1 || !saved.sheets || typeof saved.sheets !== 'object') throw new Error('Invalid saved sheets');
        for (const [id,sheet] of Object.entries(saved.sheets)) {
          if (!/^[a-f0-9]{24}$/.test(id) || !Array.isArray(sheet.checked)) continue;
          const roles = {};
          for (const [role,name] of Object.entries(sheet.roles || {})) {
            if (/^[a-f0-9]{24}$/.test(role) && typeof name === 'string') roles[role] = name;
          }
          this.data.sheets[id] = {checked:sheet.checked.filter(key => typeof key === 'string'),roles};
        }
        if (/^[a-f0-9]{24}$/.test(saved.last_character)) this.data.last_character = saved.last_character;
      } catch { this.readError = true; }
    }
    sheet(id) { return this.data.sheets[id] ||= {checked:[],roles:{}}; }
    has(id,key) { return this.sheet(id).checked.includes(key); }
    set(id,key,checked) {
      const values = new Set(this.sheet(id).checked);
      if (checked) values.add(key); else values.delete(key);
      this.sheet(id).checked = [...values];
      this.save();
    }
    role(id,roleId,name) {
      this.sheet(id).roles[roleId] = name;
      this.save();
    }
    remember(id) { this.data.last_character = id; this.save(); }
    save() {
      try {
        if (this.storage) this.storage.setItem(STORAGE_KEY,JSON.stringify(this.data));
      } catch { this.persistent = false; }
    }
  }

  async function allOfType(source,type) {
    const params = new URLSearchParams({type,limit:'100'});
    const first = await source.search(params);
    const remaining = await Promise.all(Array.from({length:first.pages - 1},(_,i) =>
      source.search(new URLSearchParams({type,limit:'100',page:String(i + 2)}))));
    return [first,...remaining].flatMap(page => page.cards).filter(card => !card.unresolved);
  }

  function create({source,products,onSelect,announce}) {
    const picker = document.getElementById('character-picker');
    const searchAnchor = document.getElementById('character-search-anchor');
    const dropdown = document.getElementById('character-search-dropdown');
    const results = document.getElementById('character-results');
    const resultCount = document.getElementById('character-result-count');
    const cards = document.getElementById('character-cards');
    const status = document.getElementById('character-save-status');
    let storage;
    try { storage = root.localStorage; } catch { storage = null; }
    const store = new SheetStore(storage);
    const expanded = {portrait:false,backstory:false};
    let catalog, pending, portraitCatalog, portraitPending, loreCatalog, lorePending, selectedId, request = 0;
    let matches = [], activeResult = -1;
    const loadPortraits = () => portraitPending ||= fetch('./character-portraits.json')
      .then(response => { if (!response.ok) throw new Error('Portrait catalog unavailable'); return response.json(); })
      .then(value => { portraitCatalog = value; })
      .catch(() => { portraitPending = null; }); // Character sheets remain usable if artwork is unavailable.
    const loadLore = () => lorePending ||= fetch('./character-lore.json')
      .then(response => { if (!response.ok) throw new Error('Backstory catalog unavailable'); return response.json(); })
      .then(value => { loreCatalog = value; })
      .catch(() => { lorePending = null; });
    const details = new Map();
    const element = (tag,className,text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    };
    const savedMessage = () => {
      status.hidden = store.persistent;
      status.textContent = store.persistent ? '' :
        'Selections are kept for this session. Browser storage is unavailable.';
    };
    const detail = id => {
      if (!details.has(id)) details.set(id,source.detail(id).catch(error => { details.delete(id); throw error; }));
      return details.get(id);
    };
    function setActiveResult(index) {
      const buttons = [...results.querySelectorAll('.result')];
      activeResult = index >= 0 && index < buttons.length ? index : -1;
      buttons.forEach((button,i) => button.setAttribute('aria-selected',String(i === activeResult)));
      if (activeResult < 0) picker.removeAttribute('aria-activedescendant');
      else {
        picker.setAttribute('aria-activedescendant',buttons[activeResult].id);
        buttons[activeResult].scrollIntoView({block:'nearest'});
      }
    }
    function setDropdown(open) {
      dropdown.hidden = !open;
      picker.setAttribute('aria-expanded',String(open));
      if (!open) setActiveResult(-1);
    }
    function renderSuggestions() {
      if (!catalog) return;
      const query = picker.value.trim().toLowerCase();
      matches = catalog.groups.filter(group => group.name.toLowerCase().startsWith(query));
      setActiveResult(-1);
      results.replaceChildren();
      resultCount.textContent = `${matches.length} ${matches.length === 1 ? 'character' : 'characters'}`;
      for (const group of matches) {
        const card = preferredVersion(group);
        const button = element('button','result');
        button.type = 'button';
        button.id = 'character-result-' + group.versions[0].id;
        button.dataset.id = card.id;
        button.tabIndex = -1;
        button.setAttribute('role','option');
        button.setAttribute('aria-selected','false');
        button.classList.toggle('is-current',group.versions.some(version => version.id === selectedId));
        const title = element('span','result-title');
        title.append(element('span','',group.name),element('span','result-arrow','↗'));
        const info = element('span','result-meta');
        info.append(element('span','result-kind','Character'),element('span','meta-dot','·'));
        const codes = element('span','result-sets');
        codes.setAttribute('aria-label','Sets: ' + group.source_codes.join(', '));
        for (const code of group.source_codes) codes.append(element('span','result-set',code));
        info.append(codes);
        button.append(title,info);
        button.addEventListener('pointerdown',event => { if (event.pointerType === 'mouse') event.preventDefault(); });
        button.addEventListener('click',() => { setDropdown(false); select(card.id); });
        results.append(button);
      }
      if (!matches.length) {
        const empty = element('div','empty-results');
        empty.append(element('h3','','No characters found'),element('p','','Try another character name.'));
        results.append(empty);
      }
      results.scrollTop = 0;
    }
    function preferredVersion(group) {
      return group.versions.find(card => card.id === selectedId) ||
        group.versions.find(card => card.id === store.data.last_character) || group.versions[0];
    }
    function cardPanel(card,characterId) {
      const panel = element('section','sheet-card');
      panel.setAttribute('aria-label',card.card_type === 'character' ? 'Character card' : 'Role card');
      const textView = element('div','card-text-view');
      const tabs = element('div','text-version-toggle');
      tabs.setAttribute('role','group');
      tabs.setAttribute('aria-label','Card text version');
      const preview = element('div');
      const available = root.PACGFace.views(card);
      let versionControls;
      if (card.card_type === 'character') {
        const versions = catalog.groups.find(group => group.key === characterName(card.name)).versions;
        if (versions.length > 1) {
          versionControls = element('div','pacg-role-options pacg-character-options');
          versionControls.setAttribute('role','group');
          versionControls.setAttribute('aria-label','Character card versions');
          for (const version of versions) {
            const button = element('button','pacg-role-button pacg-character-button',version.source_codes.join(' / '));
            button.type = 'button';
            button.dataset.characterId = version.id;
            button.setAttribute('aria-pressed',String(version.id === card.id));
            button.title = version.source_codes.map(code => products.find(product => product.id === code)?.name || code).join(' / ');
            button.addEventListener('click',() => select(version.id,{focusVariant:true}));
            versionControls.append(button);
          }
        }
      }
      const savedRole = store.sheet(characterId).roles[card.id];
      let side = Math.max(0,available.findIndex(view => view.label === savedRole));
      const show = mode => {
        for (const button of tabs.children) button.setAttribute('aria-pressed',String(button.dataset.mode === mode));
        const selected = root.PACGHistory.select(card,mode).card;
        preview.replaceChildren(root.PACGFace.create(selected, {
          products,edgeControls:tabs,viewIndex:side,announce,characterControls:versionControls,
          feats:{has:key => store.has(characterId,key),set:(key,checked) => {
            store.set(characterId,key,checked);
            savedMessage();
          }},
          onViewChange:index => {
            side = index;
            store.role(characterId,card.id,available[index].label);
            savedMessage();
          }
        }));
      };
      for (const [mode,name] of [['original','Original'],['errata','Errata']]) {
        if (mode === 'errata' && !root.PACGHistory.hasErrata(card)) continue;
        const button = element('button','text-version-button',name);
        button.type = 'button';
        button.dataset.mode = mode;
        button.addEventListener('click', () => show(mode));
        tabs.append(button);
      }
      textView.append(preview);
      panel.append(textView);
      show('original');
      return panel;
    }
    function portraitPanel(character, portrait) {
      const panel = expandable('portrait','Character portrait','sheet-portrait');
      const figure = element('figure','sheet-portrait-figure');
      const image = element('img','sheet-portrait-image');
      image.src = './' + portrait.file;
      image.alt = character.name + ' — official PACG portrait';
      image.width = portrait.width;
      image.height = portrait.height;
      image.loading = 'lazy';
      image.decoding = 'async';
      const credit = element('figcaption','sheet-portrait-credit');
      credit.append(element('span','',portraitCatalog.copyright));
      if (portrait.artist) credit.append(element('span','','Illustration: ' + portrait.artist));
      const sourceLink = element('a','','Artwork source');
      sourceLink.href = portraitCatalog.source_url;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      credit.append(sourceLink);
      figure.append(image,credit);
      panel.append(figure);
      image.addEventListener('error', () => {
        figure.replaceChildren(element('p','source-note','Portrait unavailable.'));
      });
      return panel;
    }
    function expandable(key,title,className) {
      const panel = element('details','sheet-expandable ' + className);
      panel.open = expanded[key];
      panel.append(element('summary','',title));
      panel.addEventListener('toggle',() => { expanded[key] = panel.open; });
      return panel;
    }
    function sourceLink(source) {
      const link = element('a','',source.title);
      link.href = source.revision_url || source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      return link;
    }
    function backstoryPanel(character) {
      const panel = expandable('backstory','Backstory','sheet-backstory');
      const body = element('div','sheet-backstory-body');
      const lore = loreCatalog?.characters[character.name];
      if (lore?.card_background) {
        const section = element('section','sheet-background');
        section.append(element('h3','','Card background'));
        const quote = element('blockquote','sheet-background-text');
        for (const paragraph of lore.card_background.paragraphs) quote.append(element('p','',paragraph));
        const citation = element('p','sheet-lore-source');
        citation.append(document.createTextNode('Wiki transcription · '),sourceLink(lore.card_background.source));
        section.append(quote,citation);
        body.append(section);
      }
      if (lore?.expanded_background) {
        const section = element('section','sheet-expanded-background');
        section.append(element('h3','','Expanded background'),element('p','sheet-lore-label','Summary of official Paizo material'));
        for (const paragraph of lore.expanded_background.paragraphs) section.append(element('p','',paragraph));
        for (const source of lore.expanded_background.sources) {
          const citation = element('p','sheet-lore-source');
          citation.append(sourceLink(source),document.createTextNode(` · ${source.author} · ${source.date}`));
          section.append(citation);
        }
        body.append(section);
      }
      if (!body.children.length) body.append(element('p','source-note',loreCatalog ? 'No backstory is recorded for this character yet.' : 'Backstory is currently unavailable.'));
      panel.append(body);
      return panel;
    }
    async function init() {
      if (catalog) return;
      if (!pending) pending = (async () => {
        const [characters,roles] = await Promise.all([allOfType(source,'character'),allOfType(source,'role')]);
        catalog = {characters,roles,groups:groupCharacters(characters)};
        picker.disabled = false;
        results.setAttribute('aria-busy','false');
        renderSuggestions();
      })().catch(error => { pending = null; throw error; });
      return pending;
    }
    async function select(id, {focusVariant = false} = {}) {
      const version = ++request;
      cards.setAttribute('aria-busy','true');
      cards.classList.add('loading');
      try {
        await init();
        if (version !== request) return;
        id = id || store.data.last_character;
        if (!id) { savedMessage(); return; }
        const summary = catalog.characters.find(card => card.id === id);
        if (!summary) throw new Error('This character version is not available. Choose another character above.');
        picker.value = summary.name;
        renderSuggestions();
        setDropdown(false);
        if (selectedId === id && cards.querySelector('.pacg-card')) return;
        cards.replaceChildren(element('p','source-note','Loading character and roles…'));
        const roles = matchingRoles(summary,catalog.roles);
        const [records] = await Promise.all([Promise.all([detail(id),...roles.map(role => detail(role.id))]),loadPortraits(),loadLore()]);
        if (version !== request) return;
        selectedId = id;
        renderSuggestions();
        const panels = records.map(card => cardPanel(card,id));
        const portrait = portraitCatalog?.portraits[summary.name];
        const extras = element('div','sheet-extras');
        if (portrait) extras.append(portraitPanel(records[0],portrait));
        extras.append(backstoryPanel(records[0]));
        cards.replaceChildren(extras,...panels);
        if (!roles.length) cards.append(element('p','source-note','No matching role card is recorded for this character and set.'));
        store.remember(id);
        savedMessage();
        onSelect?.(id);
        if (focusVariant) cards.querySelector('.pacg-character-button[aria-pressed="true"]')?.focus({preventScroll:true});
        announce?.(`${summary.name}, ${summary.source_codes.join(', ')}. Interactive character and role cards loaded.`);
      } catch (error) {
        if (version !== request) return;
        selectedId = null;
        cards.replaceChildren(element('p','source-note',error.message));
        const retry = element('button','retry-button','Try again');
        retry.type = 'button';
        retry.addEventListener('click',() => select(id));
        cards.append(retry);
      } finally {
        if (version === request) { cards.setAttribute('aria-busy','false'); cards.classList.remove('loading'); }
      }
    }
    picker.addEventListener('input',() => { renderSuggestions(); setDropdown(true); });
    picker.addEventListener('focus',() => { renderSuggestions(); setDropdown(true); });
    picker.addEventListener('click',() => { renderSuggestions(); setDropdown(true); });
    picker.addEventListener('keydown',event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); setDropdown(false); }
      else if (['ArrowDown','ArrowUp'].includes(event.key)) {
        event.preventDefault();
        setDropdown(true);
        if (matches.length) setActiveResult(activeResult < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) :
          (activeResult + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (!dropdown.hidden && matches.length) {
          const id = preferredVersion(matches[Math.max(0,activeResult)]).id;
          setDropdown(false);
          select(id);
        }
        else setDropdown(true);
      }
    });
    document.getElementById('character-search-form').addEventListener('submit',event => event.preventDefault());
    document.addEventListener('pointerdown',event => {
      if (!searchAnchor.contains(event.target)) setDropdown(false);
    });
    searchAnchor.addEventListener('focusout',event => {
      if (!searchAnchor.contains(event.relatedTarget)) setDropdown(false);
    });
    return {select,closeSearch:() => setDropdown(false)};
  }
  const api = {matchingRoles,groupCharacters,SheetStore,allOfType,create,STORAGE_KEY};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PACGCharacter = api;
})(typeof window !== 'undefined' ? window : globalThis);

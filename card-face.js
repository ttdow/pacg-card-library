/* Original-edition PACG-inspired text layout. The database remains unchanged. */
(function (root) {
  'use strict';
  const titleCase = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
  const families = {ROTR:'Rise of the Runelords', SS:'Skull & Shackles', WOTR:'Wrath of the Righteous', MM:"Mummy’s Mask"};
  const fieldNames = {atlocation:'At this location', whenclosing:'When closing', whenclosed:'When permanently closed',
    decklist:'Location deck', during:'During this scenario', reward:'Reward', henchmen:'Henchmen', villain:'Villain',
    locations:'Locations', owners:'Owner', before:'Before you act', after:'After you act'};
  const omitted = new Set(['name','type','subtype','source','traits','image','template','source_association','section_association',
    'unstructured','partial','reason','faces','powers','recharge','fluff']);
  const symbols = {weapon:'⚔', spell:'✧', armor:'◇', blessing:'✦', character:'♙', role:'♙', location:'⌖',
    item:'◈', ally:'♧', monster:'◆', villain:'◆', henchman:'◆', barrier:'⟐', scenario:'✥', cohort:'♧'};

  function identity(card, context = {}) {
    const codes = card.source_codes || [];
    const products = context.products || [];
    let matching = codes.filter(code => code === context.product || code.startsWith(context.product + '-'));
    if (!context.product || !matching.length) {
      const prefix = Object.keys(families).find(p => families[p].replace('’', "'") === context.family);
      matching = prefix ? codes.filter(c => c.startsWith(prefix + '-')) : [];
    }
    if (!matching.length) {
      const prefix = Object.keys(families).find(p => codes.some(c => c.startsWith(p + '-')));
      matching = prefix ? codes.filter(c => c.startsWith(prefix + '-')) : codes.slice(0, 1);
    }
    const first = matching[0] || '';
    const prefix = first.replace(/-[^-]+$/, '');
    const product = products.find(p => p.id === first || p.id === prefix);
    const set = families[prefix] || product?.name || 'Pathfinder Adventure Card Game';
    const levels = [...new Set(matching.map(c => c.match(/-([BCP\d]+)$/)?.[1]).filter(Boolean))];
    return {set, codes:matching, levels, type:titleCase(card.card_type)};
  }

  function checkModel(check) {
    const text = String(check.text || check || '');
    const match = text.match(/^(.*?)\s+(\d+)$/);
    return {text, skills:match ? match[1].split(/\s+or\s+/i) : [text], difficulty:match ? match[2] : null};
  }

  function locationDeck(value) {
    if (typeof value !== 'string') return [];
    const rows = value.split(';').map(part => part.trim().match(/^([\w ]+):\s*(\d+)$/));
    if (!rows.length || rows.some(row => !row)) return [];
    return rows.map(row => [titleCase(row[1]), row[2]]);
  }

  function views(card) {
    if (card.card_type === 'role' && card.character_layout?.roles.length) {
      return card.character_layout.roles.map(role => ({label:role.name, role, character:card.character_layout}));
    }
    if (card.card_type === 'character' && card.character_layout) {
      return [{label:'Character', role:card.character_layout.base, character:card.character_layout}];
    }
    if (card.faces?.length) {
      return card.faces.map(face => ({label:`Face ${face.face_number}`, face:true, fields:face.attributes || {}, text:face.text}));
    }
    return [{label:'Card face', fields:card.attributes || {}, text:card.effective_text}];
  }

  function faceModel(card, view, context = {}) {
    const fields = view.fields || {};
    const unstructured = fields.unstructured || fields.partial;
    const upperDeck = locationDeck(fields.decklist);
    const sections = [];
    if (view.character) {
      sections.push({title:'Powers', text:view.role.powers.join('\n\n')});
    } else if (unstructured) {
      sections.push({title:fields.partial ? 'Available card text' : 'Card transcription', text:view.text});
    } else {
      const powers = view.fields === card.attributes ? card.powers || fields.powers : fields.powers;
      if (powers) sections.push({title:'Powers', text:powers});
      for (const [key,value] of Object.entries(fields)) {
        if (omitted.has(key) || key.startsWith('check') || key.startsWith('separator') || value === '' || value == null || (key === 'decklist' && upperDeck.length)) continue;
        sections.push({title:fieldNames[key] || titleCase(key), text:typeof value === 'object' ? JSON.stringify(value,null,2) : String(value)});
      }
      const recharge = view.fields === card.attributes ? card.recharge || fields.recharge : fields.recharge;
      if (recharge) sections.push({title:'Recharge',text:recharge});
      if (!sections.length && view.text) sections.push({title:'Card transcription',text:view.text});
    }
    if (!sections.some(s => s.text)) sections.push({title:'Card text',text:'A complete transcription is not available for this record.'});
    const faceChecks = Object.entries(fields).filter(([key]) => /^check\d+$/.test(key)).map(([field,text]) => ({field,text}));
    const checks = view.face ? faceChecks : faceChecks.length ? faceChecks : card.checks || [];
    const traits = Object.hasOwn(fields,'traits') ? String(fields.traits).split(',').map(v => v.trim()).filter(Boolean) : view.face ? [] : card.traits || [];
    const boon = ['weapon','spell','armor','item','ally','blessing','loot'].includes(card.card_type);
    return {identity:identity(card,context), title:card.name.replace(/\s+\[(role|token)\]$/i,''), type:card.card_type,
      traits, checks:checks.map(checkModel), checkLabel:boon ? 'Check to acquire' : 'Check to defeat',
      separators:checks.map((_,i) => fields['separator' + i] || 'or'), subtype:fields.subtype || null,
      upperDeck, sections, fluff:fields.fluff || null, view};
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function table(title, rows, extra = '') {
    const section = node('section','pacg-mini-table ' + extra);
    section.append(node('h3','pacg-small-heading',title));
    const grid = node('table');
    const body = node('tbody');
    for (const row of rows) {
      const tr = node('tr');
      row.forEach((cell,i) => {
        const td = node(i ? 'td' : 'th','',cell);
        if (!i) td.scope = 'row';
        tr.append(td);
      });
      if (row.length === 2 && extra === 'pacg-skills') tr.className = 'pacg-subskill';
      body.append(tr);
    }
    grid.append(body);
    section.append(grid);
    return section;
  }

  function createFace(card, view, context) {
    const model = faceModel(card,view,context);
    const face = node('section','pacg-card' + (view.character ? ' pacg-character' : ''));
    face.dataset.type = model.type;
    face.setAttribute('aria-label', `${model.title} — ${view.label}`);
    const header = node('div','pacg-set-line');
    header.append(node('span','pacg-set-name',model.identity.set),node('span','pacg-type',model.identity.type));
    if (model.identity.levels.length) {
      const level = node('span','pacg-deck-number',model.identity.levels.join('/'));
      level.title = 'Source deck: ' + model.identity.codes.join(', ');
      header.append(level);
    }
    const title = node('h2','pacg-name' + (model.title.length > 30 ? ' pacg-name-long' : ''),model.title);
    face.append(header,title);
    if (view.role && card.card_type === 'role') face.append(node('p','pacg-role-name',view.role.name));
    const upper = node('div','pacg-upper');
    const left = node('div','pacg-trait-column');
    if (model.traits.length) {
      const traits = node('ul','pacg-traits');
      traits.setAttribute('aria-label','Traits');
      for (const trait of model.traits) traits.append(node('li','',trait));
      left.append(traits);
    }
    if (model.upperDeck.length) left.append(table('Location deck',model.upperDeck));
    if (view.character && card.card_type === 'character') {
      left.append(table('Skills',view.character.skills,'pacg-skills'));
    }
    upper.append(left);
    const emblem = node('div','pacg-emblem');
    emblem.setAttribute('aria-hidden','true');
    emblem.append(node('span','',symbols[card.card_type] || '◇'));
    upper.append(emblem);
    const right = node('div','pacg-check-column');
    if (view.character && view.character.deck_list.length) {
      right.append(table('Cards list',view.character.deck_list));
      if (view.character.favored_card_type) right.append(node('p','pacg-favored','Favored card: ' + view.character.favored_card_type));
    }
    if (model.subtype) {
      const subtype = node('div','pacg-check');
      subtype.append(node('h3','', 'Type'),node('p','pacg-subtype',model.subtype));
      right.append(subtype);
    }
    if (model.checks.length) {
      const checks = node('section','pacg-check');
      checks.append(node('h3','',model.checkLabel));
      model.checks.forEach((check,i) => {
        if (i) checks.append(node('span','pacg-check-or',model.separators[i]));
        const item = node('div','pacg-check-value');
        const skills = node('div','pacg-check-skills');
        check.skills.forEach(skill => skills.append(node('span','',skill)));
        item.append(skills);
        if (check.difficulty !== null) item.append(node('span','pacg-difficulty',check.difficulty));
        checks.append(item);
      });
      right.append(checks);
    }
    upper.append(right);
    face.append(upper);
    const rules = node('div','pacg-rules');
    if (view.role) {
      const stats = node('div','pacg-hand-size');
      if (view.role.hand_size) stats.append(node('p','','Hand size: ' + view.role.hand_size));
      if (view.role.proficiencies) stats.append(node('p','','Proficient with: ' + view.role.proficiencies));
      rules.append(stats);
    }
    for (const field of model.sections) {
      if (!field.text) continue;
      const section = node('section','pacg-field');
      section.append(node('h3','',field.title));
      const text = node('div','pacg-field-text');
      String(field.text).split(/\n\s*\n/).forEach(paragraph => text.append(node('p','',paragraph)));
      section.append(text);
      rules.append(section);
    }
    if (model.fluff) rules.append(node('p','pacg-flavor',model.fluff));
    face.append(rules);
    const footer = node('footer','pacg-imprint');
    footer.append(node('span','',model.identity.codes.join(' · ') || 'Original edition'),node('span','','PACG · text reference'));
    face.append(footer);
    return face;
  }

  function create(card, context = {}) {
    const figure = node('figure','pacg-preview');
    const available = views(card);
    const nav = node('div','pacg-face-nav');
    const caption = node('figcaption','pacg-preview-caption','Text layout · original artwork is not included');
    const holder = node('div','pacg-face-holder');
    if (available.length > 1) {
      nav.setAttribute('role','group');
      nav.setAttribute('aria-label',card.card_type === 'role' ? 'Role card sides' : 'Card faces');
      available.forEach((view,i) => {
        const button = node('button','pacg-face-button',view.label);
        button.type = 'button';
        button.setAttribute('aria-pressed',String(i===0));
        button.addEventListener('click',() => {
          for (const other of nav.querySelectorAll('button')) other.setAttribute('aria-pressed',String(other===button));
          holder.replaceChildren(createFace(card,view,context));
          context.announce?.(`${view.label} displayed.`);
        });
        nav.append(button);
      });
    } else nav.append(node('span','pacg-preview-label','Card face'));
    holder.append(createFace(card,available[0],context));
    figure.append(nav,holder,caption);
    return figure;
  }

  const api = {create, identity, checkModel, locationDeck, views, faceModel};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PACGFace = api;
})(typeof window !== 'undefined' ? window : globalThis);

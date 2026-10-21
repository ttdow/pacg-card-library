/* Interactive campaign aids. All changes are local browser state. */
(function(root){
  'use strict';
  const STORAGE_KEY='pacg.special-mechanics.v1';
  const SETS=[
    {id:'SS',name:'Skull & Shackles',mechanics:[['ships','Ships']]},
    {id:'WOTR',name:'Wrath of the Righteous',mechanics:[['mythic','Mythic paths'],['servitors','Servitor demons'],['redemption','Corrupted cards']]},
    {id:'MM',name:"Mummy’s Mask",mechanics:[['traders','Traders'],['curses','Curses']]}
  ];
  const validId=id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id);
  const validScope=scope=>typeof scope==='string'&&/^(?:SS\/ships\/party|WOTR\/(?:servitors|redemption|mythic)\/party|MM\/(?:traders|curses)\/party|WOTR\/mythic\/[a-f0-9]{24}|MM\/curses\/[a-f0-9]{24})$/.test(scope);
  function selection(set,mechanic){
    const chosen=SETS.find(s=>s.id===set)||SETS[0];
    return {set:chosen.id,mechanic:chosen.mechanics.some(m=>m[0]===mechanic)?mechanic:chosen.mechanics[0][0]};
  }
  function tracker(value={}){
    return {checked:Array.isArray(value.checked)?[...new Set(value.checked.filter(validId))]:[],
      selected:validId(value.selected)?value.selected:'',current:validId(value.current)?value.current:'', count:Number.isSafeInteger(value.count)?Math.max(0,Math.min(9999,value.count)):0,
      level:/^[B1-6]$/.test(value.level)?value.level:'B', wrecked:value.wrecked===true,
      checklist:['WOTR','HV1','HV2'].includes(value.checklist)?value.checklist:'WOTR'};
  }
  class TrackerStore {
    constructor(storage){
      this.storage=storage;this.persistent=!!storage;
      this.data={schema_version:1,last:selection('SS','ships'),character:'',trackers:{}};
      try{
        const saved=JSON.parse(storage?.getItem(STORAGE_KEY)||'null');
        if(!saved||saved.schema_version!==1)return;
        this.data.last=selection(saved.last?.set,saved.last?.mechanic);
        if(validId(saved.character))this.data.character=saved.character;
        for(const [scope,value] of Object.entries(saved.trackers||{}))if(validScope(scope)&&value&&typeof value==='object')this.data.trackers[scope]=tracker(value);
        // Carry the last character's preview into the character-free path browser.
        const previous=this.data.trackers['WOTR/mythic/'+this.data.character];
        if(!this.data.trackers['WOTR/mythic/party']&&previous?.selected)this.data.trackers['WOTR/mythic/party']=tracker({selected:previous.selected});
        const previousCurses=this.data.trackers['MM/curses/'+this.data.character];
        if(!this.data.trackers['MM/curses/party']&&previousCurses)this.data.trackers['MM/curses/party']=tracker({checked:previousCurses.checked,selected:previousCurses.selected});
      }catch{this.readError=true;}
    }
    get(scope){if(!validScope(scope))throw new Error('Invalid tracker scope');return this.data.trackers[scope]||tracker();}
    patch(scope,values){const next=tracker({...this.get(scope),...values});this.data.trackers[scope]=next;this.save();return next;}
    check(scope,id,checked){if(!validId(id))return;const values=new Set(this.get(scope).checked);if(checked)values.add(id);else values.delete(id);this.patch(scope,{checked:[...values]});}
    remember(set,mechanic,character){this.data.last=selection(set,mechanic);if(validId(character)||character==='')this.data.character=character;this.save();}
    save(){try{this.storage?.setItem(STORAGE_KEY,JSON.stringify(this.data));}catch{this.persistent=false;}}
  }
  const api={TrackerStore,STORAGE_KEY,SETS,selection};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.PACGMechanics={...api,create};

  function create({onChange}={}){
    const $=id=>document.getElementById(id);
    const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
    let storage;try{storage=root.localStorage;}catch{storage=null;}
    const store=new TrackerStore(storage);
    let data,pending,active={...store.data.last,character:store.data.character},loadVersion=0;
    function options(select,entries,value,empty){
      select.replaceChildren();if(empty){const o=node('option','',empty);o.value='';select.append(o);}
      for(const [id,text] of entries){const o=node('option','',text);o.value=id;select.append(o);}select.value=value;
    }
    function scope(){return `${active.set}/${active.mechanic}/party`;}
    function ruleLink(topic){const a=node('a','mechanic-rules-link','Rules');a.href=`?view=rules#rule=${topic}&variation=${active.set.toLowerCase()}`;return a;}
    function status(){
      const p=$('mechanic-storage-status');p.hidden=store.persistent;p.textContent=store.persistent?'':'Selections are kept for this session. Browser storage is unavailable.';
    }
    function publish(){store.remember(active.set,active.mechanic,active.character);status();onChange?.({...active});}
    function update(values){store.patch(scope(),values);renderPreservingFocus();status();}
    function picker(label,id,entries,value,onChange,empty){
      const wrapper=node('label','mechanic-picker');wrapper.htmlFor=id;wrapper.append(node('span','',label));
      const select=node('select');select.id=id;options(select,entries,value,empty);select.addEventListener('change',()=>onChange(select.value));wrapper.append(select);return wrapper;
    }
    function button(text,action,cls='mechanic-button'){
      const b=node('button',cls,text);b.type='button';b.addEventListener('click',action);return b;
    }
    function cardPanel(id,{redeemed=false}={}){
      const card=data.cards[id],panel=node('section','mechanic-card');
      if(!card){panel.append(node('p','source-note','No card is selected.'));return panel;}
      const tabs=node('div','text-version-toggle');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Card text version');
      const preview=node('div');let mode='original';
      function show(){
        let selected=root.PACGHistory.select(card,mode).card;
        if(redeemed){
          selected={...selected,traits:selected.traits.filter(t=>t.toLowerCase()!=='corrupted'),attributes:{...selected.attributes}};
          if(typeof selected.attributes.traits==='string')selected.attributes.traits=selected.attributes.traits.split(',').map(s=>s.trim()).filter(t=>t.toLowerCase()!=='corrupted').join(', ');
        }
        for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.mode===mode));
        preview.replaceChildren(root.PACGFace.create(selected,{edgeControls:tabs}));
      }
      for(const [id,text] of [['original','Original'],['errata','Errata']]){
        if(id==='errata'&&!root.PACGHistory.hasErrata(card))continue;
        const b=button(text,()=>{mode=id;show();},'text-version-button');b.dataset.mode=id;tabs.append(b);
      }
      if(redeemed)panel.append(node('p','mechanic-redeemed-note','Redeemed · Corrupted trait removed'));
      panel.append(preview);show();return panel;
    }
    function checklist(title,ids,checked,label,selected,onCheck,onPreview,sourcePrefix=active.set){
      const section=node('section','mechanic-checklist');section.setAttribute('aria-label',title);
      const heading=node('div','mechanic-list-heading');heading.append(node('h3','',title),node('span','',`${checked.filter(id=>ids.includes(id)).length} / ${ids.length}`));section.append(heading);
      const list=node('div','mechanic-checklist-rows');
      for(const id of ids){
        const card=data.cards[id],row=node('div','mechanic-check-row'+(id===selected?' selected':''));
        const input=node('input');input.type='checkbox';input.id='mechanic-check-'+id;input.checked=checked.includes(id);input.setAttribute('aria-label',`${label}: ${card.name}`);input.addEventListener('change',()=>onCheck(id,input.checked));
        const name=button(card.name,()=>onPreview(id),'mechanic-card-name');name.id='mechanic-preview-'+id;name.setAttribute('aria-pressed',String(id===selected));
        const code=card.source_codes.find(c=>c.startsWith(sourcePrefix+'-'))||card.source_codes[0];name.append(node('small','',code));
        row.append(input,name);list.append(row);
      }
      section.append(list);return section;
    }
    function renderPreservingFocus(){
      const id=document.activeElement?.id;render();if(id)document.getElementById(id)?.focus({preventScroll:true});
    }
    function render(){
      if(!data)return;
      const host=$('mechanic-content');host.replaceChildren();
      const name=SETS.find(s=>s.id===active.set).mechanics.find(m=>m[0]===active.mechanic)[1];
      const headings=node('div','mechanic-heading');headings.append(node('h2','',name),ruleLink({ships:'commanding-and-moving-ships',redemption:'redeeming-cards',servitors:'servitor-demon-table',mythic:'support-cards',traders:'support-cards',curses:'support-cards'}[active.mechanic]));host.append(headings);
      const saved=store.get(scope()),layout=node('div','mechanic-layout');host.append(layout);
      if(['ships','redemption','traders','curses'].includes(active.mechanic)){
        const key={ships:'ships',redemption:'redemption',traders:'traders',curses:'curses'}[active.mechanic];
        const redemption=active.mechanic==='redemption'?(data.redemption_checklists?.find(c=>c.id===saved.checklist)||data.redemption_checklists?.[0]):null;
        const ids=redemption?redemption.cards:data[key],selected=ids.includes(saved.selected)?saved.selected:ids[0];
        const label={ships:'Acquired',redemption:'Redeemed',traders:'Available',curses:'Displayed'}[active.mechanic];
        const list=checklist({ships:'Fleet',redemption:'Redemption',traders:'Bazaar',curses:'Curses'}[active.mechanic],ids,saved.checked,label,selected,(id,checked)=>{
          store.check(scope(),id,checked);
          renderPreservingFocus();status();
        },id=>update({selected:id}),redemption?.id||active.set);
        if(redemption){
          const deck=picker('Deck','mechanic-redemption-deck',data.redemption_checklists.map(c=>[c.id,c.name]),redemption.id,id=>update({checklist:id}));
          deck.classList.add('redemption-deck-picker');list.insertBefore(deck,list.querySelector('.mechanic-checklist-rows'));
          for(const issue of redemption.source_issues||[]){
            const note=node('p','source-note mechanic-list-note',issue.note+' ');
            const source=node('a','','Checklist source');source.href=redemption.source_url;source.target='_blank';source.rel='noopener noreferrer';note.append(source);list.append(note);
          }
        }
        const detail=node('div','mechanic-detail');
        detail.append(cardPanel(selected,{redeemed:active.mechanic==='redemption'&&saved.checked.includes(selected)}));
        layout.append(detail,list);
      }else if(active.mechanic==='servitors'){
        const adventures=node('section','mechanic-checklist');adventures.append(node('div','mechanic-list-heading','Current adventure'));
        for(const demon of data.servitors){
          const row=node('label','mechanic-servitor-row');
          const input=node('input');input.type='radio';input.name='servitor-adventure';input.value=demon.level;input.id='mechanic-adventure-'+demon.level;input.checked=saved.level===demon.level;
          input.addEventListener('change',()=>update({level:demon.level}));
          const text=node('span');text.append(node('strong','',demon.adventure),node('small','',data.cards[demon.card].name));row.append(input,text);adventures.append(row);
        }
        const current=data.servitors.find(d=>d.level===saved.level)||data.servitors[0];layout.append(cardPanel(current.card),adventures);
      }else if(active.mechanic==='mythic'){
        const controls=node('section','mechanic-checklist mythic-controls');
        controls.append(picker('Mythic path','mechanic-path',data.paths.map(id=>[id,data.cards[id].name]),saved.selected,id=>update({selected:id}),'Choose a mythic path…'));
        layout.append(saved.selected&&data.paths.includes(saved.selected)?cardPanel(saved.selected):node('div','mechanic-empty','Choose a mythic path to see its powers.'),controls);
      }
    }
    async function open(requested={}){
      const version=++loadVersion;
      active={...selection(requested.set||store.data.last.set,requested.mechanic||store.data.last.mechanic),character:requested.character||store.data.character};
      $('mechanic-content').setAttribute('aria-busy','true');
      try{
        if(!data){
          if(!pending)pending=fetch(new URL('mechanics-catalog.json',document.baseURI),{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('Could not load the mechanic cards.');return r.json();}).then(value=>{if(value.schema_version!==1)throw new Error('Unsupported mechanic catalog.');data=value;}).finally(()=>{pending=null;});
          await pending;
        }
        if(version!==loadVersion)return;
        if(!data.characters.some(c=>c.id===active.character))active.character='';
        options($('mechanic-set'),SETS.map(s=>[s.id,s.name]),active.set);
        options($('mechanic-picker'),SETS.find(s=>s.id===active.set).mechanics,active.mechanic);
        $('mechanic-set').disabled=false;$('mechanic-picker').disabled=false;
        publish();render();
      }catch(error){
        if(version!==loadVersion)return;
        $('mechanic-content').replaceChildren(node('p','source-note',error.message),button('Try again',()=>open(requested)));
      }finally{if(version===loadVersion)$('mechanic-content').setAttribute('aria-busy','false');}
    }
    $('mechanic-set').addEventListener('change',()=>open({set:$('mechanic-set').value,character:active.character}));
    $('mechanic-picker').addEventListener('change',()=>open({set:active.set,mechanic:$('mechanic-picker').value,character:active.character}));
    return {open};
  }
})(typeof window!=='undefined'?window:globalThis);

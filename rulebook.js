(function (root) {
  'use strict';
  const fold = text => String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘]/g,"'");
  const plain = text => text.replace(/\[\[[^|]+\|([^\]]+)\]\]/g,'$1');
  const matches = (text, query) => fold(query).trim().split(/\s+/).filter(Boolean).every(word => fold(plain(text)).includes(word));
  const signature = (topic, edition) => topic.blocks.map(block => block.variants.find(v => v.editions.includes(edition))?.text || '').join('|');
  function groups(topic) {
    const grouped = new Map();
    for (const edition of topic.editions) {
      const key = signature(topic,edition);
      if (!grouped.has(key)) grouped.set(key,[]);
      grouped.get(key).push(edition);
    }
    return [...grouped.values()];
  }
  function search(data, query) {
    const found = [];
    for (const topic of data.topics) {
      if (matches(topic.title, query)) {
        found.push({topic:topic.id, editions:topic.editions, block:-1, excerpt:''});
        continue;
      }
      let first;
      const editions = new Set();
      topic.blocks.forEach((block,index) => block.variants.forEach(variant => {
        const text = data.texts[variant.text];
        if (!matches(text,query)) return;
        variant.editions.forEach(key => editions.add(key));
        if (!first) {
          const cleaned=plain(text), word=fold(query).trim().split(/\s+/)[0];
          const start=Math.max(0,fold(cleaned).indexOf(word)-45);
          first={block:index, excerpt:(start?'…':'')+cleaned.slice(start,start+155)+(start+155<cleaned.length?'…':''), edition:variant.editions.at(-1)};
        }
      }));
      if (first) found.push({topic:topic.id,editions:[...editions],...first});
    }
    return found;
  }
  const headings = {
    'Getting started':['object-of-the-game','the-golden-rules','card-sets','organizing-your-cards','setting-up'],
    'Playing the game':['playing-a-scenario','taking-your-turn','playing-cards','encountering-a-card','attempting-a-check','damage','dying','examining-and-searching','resetting-your-hand','summoning-and-adding-cards','closing-a-location','encountering-a-villain'],
    'After the adventure':['after-the-scenario','ending-a-scenario-adventure-or-adventure-path','between-games'],
    'Cards & characters':['card-types','your-character','character-cards','feats','role-cards','token-cards','story-cards','location-cards','support-cards','boon-cards','bane-cards','henchmen'],
    'Special mechanics':['ships-and-plunder','commanding-and-moving-ships','encountering-ships','seizing-ships','structural-damage','wrecked-ships','plunder-cards','redeeming-cards','servitor-demons']
  };
  function section(topic) {
    for (const [name,ids] of Object.entries(headings)) if (ids.includes(topic.id)) return name;
    if (/turn$/.test(topic.id) || topic.id === 'example-of-play') return 'Examples';
      if (topic.id==='quick-reference' || topic.id==='things-to-keep-in-mind') return 'Reference';
    return topic.category === 'Rules' ? 'Rules & clarifications' : topic.category;
  }
  function ordered(data) {
    const order=[...Object.keys(headings),'Rules & clarifications','Strategy','Examples','Starting decks','Reference'];
    return [...data.topics].sort((a,b) => {
      const sa=section(a),sb=section(b);
      if(sa!==sb) return order.indexOf(sa)-order.indexOf(sb);
      if (headings[sa]) return headings[sa].indexOf(a.id)-headings[sa].indexOf(b.id);
      if(sa==='Starting decks' && [a.id,b.id].includes('suggested-deck-lists')) return a.id==='suggested-deck-lists'?-1:1;
      if(sa==='Examples' && [a.id,b.id].includes('example-of-play')) return a.id==='example-of-play'?-1:1;
      return a.title.localeCompare(b.title);
    });
  }
  const api={fold,plain,matches,groups,search,ordered};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  root.PACGRules={...api,create};

  function create() {
    const $=id=>document.getElementById(id);
    const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
    let data, loading, topicId, edition, compare=false, query='', target=-1;
    const editionNames=keys=>keys.map(k=>data.editions.find(e=>e.id===k).short).join(' · ');
    const editionTitles=keys=>keys.map(k=>data.editions.find(e=>e.id===k).name).join(' / ');
    function address(id,variation,block) {
      const params=new URLSearchParams({rule:id});
      if(variation)params.set('variation',variation);
      if(block>=0)params.set('passage',String(block));
      return '#'+params;
    }
    function readAddress() {
      const params=new URLSearchParams(location.hash.slice(1));
      topicId=params.get('rule')||'object-of-the-game';
      edition=params.get('variation');
      target=params.has('passage')?Number(params.get('passage')):-1;
    }
    function link(id,text,variation=edition,block=-1) {
      const a=node('a','',text);a.href=address(id,variation,block);
      a.addEventListener('click',event=>{
        if(event.button!==0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)return;
        event.preventDefault();navigate(id,variation,block,true);
      });
      return a;
    }
    function navigate(id,variation,block=-1,push=true) {
      const topic=data.topics.find(t=>t.id===id);
      if(!topic)return;
      topicId=id;
      edition=topic.editions.includes(variation)?variation:topic.editions.at(-1);
      target=block;
      const url=new URL(location.href);url.hash=address(id,edition,block);
      history[push?'pushState':'replaceState'](null,'',url);
      renderNavigation();renderArticle();
      if(matchMedia('(max-width:600px)').matches)$('rule-contents').open=false;
      $('rule-article').focus({preventScroll:true});
      if(block>=0)document.getElementById('rule-passage-'+block)?.scrollIntoView({block:'center'});
      else if($('rule-article').getBoundingClientRect().top<0)$('rule-article').scrollIntoView({block:'start'});
    }
    function highlight(container,text) {
      const words=fold(query).trim().split(/\s+/).filter(Boolean);
      if(!words.length){container.append(document.createTextNode(text));return;}
      const folded=fold(text);let pos=0;
      while(pos<text.length) {
        const candidates=words.map(w=>({start:folded.indexOf(w,pos),length:w.length})).filter(m=>m.start>=0).sort((a,b)=>a.start-b.start);
        if(!candidates.length){container.append(document.createTextNode(text.slice(pos)));break;}
        const found=candidates[0];
        container.append(document.createTextNode(text.slice(pos,found.start)),node('mark','',text.slice(found.start,found.start+found.length)));
        pos=found.start+found.length;
      }
    }
    function prose(container,text) {
      // Stored links are explicit internal topic references. Never inject HTML.
      const references=/\[\[([^|]+)\|([^\]]+)\]\]/g;
      let position=0;
      const addText=part=>{
        // Link exact topic names mentioned in ordinary prose, longest first.
        const titles=data.topics.filter(t=>t.id!==topicId && !['your-character','card-types'].includes(t.id) && t.title.length>7 && !t.title.includes(':')).sort((a,b)=>b.title.length-a.title.length);
        let offset=0;
        while(offset<part.length) {
          let best;
          for(const t of titles){
            const pattern=new RegExp('\\b'+t.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i');
            const match=pattern.exec(part.slice(offset));
            if(match && (!best || match.index<best.index))best={topic:t,index:match.index,text:match[0]};
          }
          if(!best){highlight(container,part.slice(offset));break;}
          highlight(container,part.slice(offset,offset+best.index));
          container.append(link(best.topic.id,best.text));offset+=best.index+best.text.length;
        }
      };
      for(const match of text.matchAll(references)){
        addText(text.slice(position,match.index));container.append(link(match[1],match[2]));position=match.index+match[0].length;
      }
      addText(text.slice(position));
    }
    function paragraph(text) {
      const p=node('p');
      // Bold short action labels while retaining the exact passage wording.
      const leading=text.match(/^([^.!?\[\]]{3,95}[.:])\s/);
      if(leading && !/^If |^When |^The |^Each |^You |^For |^In |^At |^To /i.test(leading[1])){
        const strong=node('strong');prose(strong,leading[1]);p.append(strong,document.createTextNode(' '));prose(p,text.slice(leading[0].length));
      }else prose(p,text);
      return p;
    }
    function renderNavigation() {
      const nav=$('rule-topics');nav.replaceChildren();
      const results=query.trim()?search(data,query):null;
      $('rule-results-label').textContent=results?`${results.length} matching topic${results.length===1?'':'s'}`:'Contents';
      if(results?.length===0){nav.append(node('p','rule-no-results','No matching rules. Try a different word or phrase.'));return;}
      const resultMap=new Map(results?.map(r=>[r.topic,r]));let currentGroup,group;
      for(const topic of ordered(data)){
        if(results&&!resultMap.has(topic.id))continue;
        const category=section(topic);
        if(category!==currentGroup){group=node('div','rule-topic-group');group.append(node('h3','',category));nav.append(group);currentGroup=category;}
        const result=resultMap.get(topic.id);
        const a=link(topic.id,'',result?.edition||edition,result?.block??-1);a.className='rule-topic-link';
        a.setAttribute('aria-current',String(topic.id===topicId));highlight(a,topic.title);
        if(result?.excerpt){const small=node('small');highlight(small,result.excerpt);a.append(small,node('small','rule-match-sets',editionNames(result.editions)));}
        group.append(a);
      }
    }
    function renderArticle() {
      const article=$('rule-article');article.replaceChildren();article.setAttribute('aria-busy','false');
      let topic=data.topics.find(t=>t.id===topicId);
      if(!topic){topic=data.topics[0];topicId=topic.id;}
      if(!topic.editions.includes(edition))edition=topic.editions.at(-1);
      const heading=node('div','rule-topic-heading'), titles=node('div');
      titles.append(node('p','rule-topic-kind',section(topic)),node('h2','',topic.title));
      const permalink=node('button','rule-permalink','Copy link');permalink.type='button';
      permalink.addEventListener('click',async()=>{
        const url=new URL(location.href);url.hash=address(topicId,edition,-1);
        try{await navigator.clipboard.writeText(url.href);permalink.textContent='Copied';setTimeout(()=>permalink.textContent='Copy link',1800);}
        catch{permalink.textContent='Link in address bar';history.replaceState(null,'',url);}
      });
      heading.append(titles,permalink);article.append(heading);
      const variationGroups=groups(topic);
      if(variationGroups.length>1){
        const bar=node('div','rule-variation-bar'),tabs=node('div','rule-variation-tabs');
        tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Rule variations');
        for(const keys of variationGroups){
          const button=node('button','',editionNames(keys));button.type='button';button.title=editionTitles(keys);
          button.setAttribute('aria-label',editionTitles(keys));button.setAttribute('aria-pressed',String(keys.includes(edition)));
          button.addEventListener('click',()=>{navigate(topicId,keys.includes(edition)?edition:keys.at(-1),-1,false);});tabs.append(button);
        }
        const toggle=node('button','rule-compare-button',compare?'Close comparison':'Compare variations');toggle.type='button';toggle.setAttribute('aria-pressed',String(compare));
        toggle.addEventListener('click',()=>{compare=!compare;renderArticle();$('rule-article').querySelector('.rule-compare-button').focus({preventScroll:true});});
        bar.append(tabs,toggle);article.append(bar);
      }else article.append(node('p','rule-shared-note',topic.editions.length===4?'Shared across all four variations':editionTitles(topic.editions)));
      let tableBody;
      topic.blocks.forEach((block,index)=>{
        if(topic.table_columns){
          const variant=block.variants.find(v=>v.editions.includes(edition));
          const text=variant?data.texts[variant.text]:'';
          if(text.includes(' — ')){
            if(!tableBody){
              const table=node('table','rule-data-table'),head=node('thead'),row=node('tr');
              table.setAttribute('aria-label',topic.title);
              for(const name of topic.table_columns){const cell=node('th','',name);cell.scope='col';row.append(cell);}
              head.append(row);tableBody=node('tbody');table.append(head,tableBody);article.append(table);
            }
            const row=node('tr');row.id='rule-passage-'+index;
            if(index===target)row.className='rule-passage-target';
            for(const value of text.split(' — ')){const cell=node('td');prose(cell,value);row.append(cell);}tableBody.append(row);return;
          }
        }
        const wrapper=node('div','rule-passage'+(index===target?' rule-passage-target':''));wrapper.id='rule-passage-'+index;
        const allSame=block.variants.length===1 && block.variants[0].editions.length===topic.editions.length;
        if(compare && variationGroups.length>1 && !allSame){
          wrapper.classList.add('rule-comparison');
          for(const variant of block.variants){
            const col=node('section');col.append(node('h3','',editionTitles(variant.editions)),paragraph(data.texts[variant.text]));wrapper.append(col);
          }
          const missing=topic.editions.filter(k=>!block.variants.some(v=>v.editions.includes(k)));
          if(missing.length){const col=node('section');col.append(node('h3','',editionTitles(missing)),node('p','rule-absent','No separate paragraph at this position.'));wrapper.append(col);}
        }else{
          const variant=block.variants.find(v=>v.editions.includes(edition));if(!variant)return;
          if(compare && allSame)wrapper.append(node('span','rule-variant-note','Shared · '+editionNames(variant.editions)));
          wrapper.append(paragraph(data.texts[variant.text]));
        }
        article.append(wrapper);
      });
      const topics=ordered(data),index=topics.findIndex(t=>t.id===topicId),pager=node('nav','rule-page-navigation');pager.setAttribute('aria-label','Adjacent topics');
      if(index>0)pager.append(link(topics[index-1].id,'← '+topics[index-1].title));
      if(index<topics.length-1)pager.append(link(topics[index+1].id,topics[index+1].title+' →'));
      article.append(pager);
    }
    async function open() {
      readAddress();
      if(data){renderNavigation();renderArticle();return;}
      if(loading)return loading;
      loading=(async()=>{
        try{
          const script=document.querySelector('script[src*="rulebook.js"]');
          const response=await fetch(new URL('master-rulebook.json',script?.src||document.baseURI));
          if(!response.ok)throw new Error('Could not load the master rulebook.');
          data=await response.json();readAddress();renderNavigation();renderArticle();
          if(target>=0)document.getElementById('rule-passage-'+target)?.scrollIntoView({block:'center'});
        }catch(error){
          const article=$('rule-article');article.setAttribute('aria-busy','false');article.replaceChildren(node('p','rule-no-results',error.message));
          const retry=node('button','rule-compare-button','Try again');retry.type='button';retry.addEventListener('click',open);article.append(retry);
        }finally{loading=null;}
      })();return loading;
    }
    $('rule-search').addEventListener('input',()=>{query=$('rule-search').value;if(data){$('rule-contents').open=true;renderNavigation();renderArticle();}});
    $('rule-search').addEventListener('keydown',event=>{
      if(event.key==='Escape'){$('rule-search').value='';query='';if(data){renderNavigation();renderArticle();}}
      if(event.key==='Enter'&&data&&query.trim()){const result=search(data,query)[0];if(result)navigate(result.topic,result.edition,result.block,true);}
    });
    const restore=()=>{if(data && !$('rules-view').hidden){readAddress();renderNavigation();renderArticle();}};
    window.addEventListener('hashchange',restore);window.addEventListener('popstate',restore);
    if(matchMedia('(max-width:600px)').matches)$('rule-contents').open=false;
    return {open};
  }
})(typeof window !== 'undefined' ? window : globalThis);

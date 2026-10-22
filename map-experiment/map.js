/* PACG full atlas experiment. No article prose or raster map artwork. */
(function(root){
  'use strict';
  const COLORS={dark:{water:'#142630',land:'#334236',coast:'#77846a',forest:'#263e30',river:'#578a9e',road:'#c8af73',hills:'#4b513d',mountains:'#626053',deserts:'#786d4c',swamps:'#304c43',ice:'#a5b9bd',specials:'#66536c',borders:'#b89d7e',buildings:'#bead8b',notes:'#d5957d'},light:{water:'#c6dce0',land:'#e9e3c8',coast:'#829783',forest:'#c3d0ab',river:'#669aa8',road:'#a48651',hills:'#d3cfad',mountains:'#bcb5a1',deserts:'#e4d1a1',swamps:'#b4c5b0',ice:'#edf4f3',specials:'#c9b7c9',borders:'#927854',buildings:'#927c59',notes:'#a45c43'}};
  function atlasStyle(theme){
    const c=COLORS[theme],layers=[{id:'ocean',type:'background',paint:{'background-color':c.water}}];
    const add=(id,group,type,paint,extra={})=>layers.push({id,type,source:'region',filter:['==',['get','layer'],group],metadata:{group},paint,...extra});
    add('land','land','fill',{'fill-color':c.land});
    for(const id of ['deserts','hills','mountains','forests','swamps','ice','specials'])add(id,id,'fill',{'fill-color':c[id==='forests'?'forest':id],'fill-opacity':id==='specials'?.55:id==='forests'?.85:1});
    add('waters','waters','fill',{'fill-color':c.water});
    add('coast','coastlines','line',{'line-color':c.coast,'line-width':1});layers.at(-1).metadata.group='land';
    add('borders','borders','line',{'line-color':c.borders,'line-width':1,'line-dasharray':[4,3],'line-opacity':.7},{minzoom:2,filter:['all',['==',['get','layer'],'borders'],['!', ['has','timeEnd']]]});
    add('districts','districts','line',{'line-color':c.borders,'line-width':1,'line-dasharray':[2,3],'line-opacity':.65},{minzoom:9});
    add('rivers','rivers','line',{'line-color':c.river,'line-width':['interpolate',['linear'],['zoom'],3,.35,10,1,15,3]});
    add('roads','roads','line',{'line-color':c.road,'line-width':['interpolate',['linear'],['zoom'],5,.4,10,1,15,3],'line-opacity':.7},{minzoom:5});
    add('buildings','buildings','fill',{'fill-color':c.buildings,'fill-opacity':.8},{minzoom:12});
    add('mapping-notes','Notes','line',{'line-color':c.notes,'line-width':1,'line-dasharray':[2,2]},{minzoom:6,layout:{visibility:'none'}});
    for(const kind of ['cities','locations'])layers.push({id:kind,type:'circle',source:'places',filter:['==',['get','kind'],kind],metadata:{group:kind},paint:{'circle-radius':['interpolate',['linear'],['zoom'],0,.6,5,1,12,3,16,4],'circle-color':kind==='cities'?c.road:c.coast,'circle-stroke-color':c.water,'circle-stroke-width':1}});
    return {version:8,sources:{region:{type:'geojson',data:new URL('./region.geojson?v=15d36ef7bfc3',typeof location==='undefined'?'http://localhost/':location.href).href,maxzoom:14,tolerance:.5},places:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers};
  }
  function adventureFor(data,id){return data.adventures.find(a=>a.id===id)||data.adventures.find(a=>a.id===data.default_adventure)||data.adventures[0];}
  function offsets(scenarios){
    const groups=new Map();
    for(const scenario of scenarios){if(!scenario.coordinates)continue;const key=scenario.coordinates.join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(scenario);}
    const result=new Map();for(const group of groups.values())group.forEach((s,i)=>result.set(s.number,[0,(i-(group.length-1)/2)*46]));return result;
  }
  function scenarioRules(card){
    return [['villain','Villain'],['henchmen','Henchmen'],['locations','Locations'],['during','During this scenario'],['reward','Reward']]
      .filter(([key])=>card.attributes?.[key]).map(([key,title])=>({title,text:card.attributes[key]}));
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={adventureFor,offsets,atlasStyle,scenarioRules};return;}
  const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  let map,data,current,popup,markers=[],labels=[],places=[],selected='',enabled=new Set();
  const controls=$('map-controls'),cardCache=new Map();
  const library=root.PACGData.create({mode:document.querySelector('meta[name="pacg-data-mode"]').content,base:new URL('../',document.baseURI)});
  function closeControls({focus=false}={}){controls.open=false;if(focus)$('map-controls-toggle').focus();}
  controls.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeControls({focus:true});}});
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const themeButton=$('theme-toggle');
  function updateThemeButton(){const light=root.PACGTheme.get()==='dark';themeButton.textContent=light?'Light mode':'Dark mode';themeButton.setAttribute('aria-label',`Switch to ${light?'light':'dark'} mode`);}
  function paint(){if(!map?.isStyleLoaded())return;for(const layer of atlasStyle(root.PACGTheme.get()).layers)for(const [property,value] of Object.entries(layer.paint))map.setPaintProperty(layer.id,property,value);}
  themeButton.addEventListener('click',()=>{root.PACGTheme.toggle();updateThemeButton();paint();});updateThemeButton();
  const credits=$('map-credits');$('map-credits-open').addEventListener('click',()=>credits.showModal());$('map-credits-close').addEventListener('click',()=>credits.close());credits.addEventListener('close',()=>$('map-credits-open').focus());
  function fit(){
    if(!current||!map)return;
    const mapped=current.scenarios.filter(s=>s.coordinates);if(!mapped.length)return;
    const bounds=new maplibregl.LngLatBounds();
    if(current.fit_bounds){const b=current.fit_bounds;bounds.extend([b[0],b[1]]);bounds.extend([b[2],b[3]]);}else mapped.forEach(s=>bounds.extend(s.coordinates));
    const stack=Math.max(...[...offsets(mapped).values()].map(offset=>Math.abs(offset[1])+26));
    const top=Math.ceil($('map-controls-toggle').getBoundingClientRect().bottom-$('adventure-map').getBoundingClientRect().top+stack+12);
    map.fitBounds(bounds,{padding:{top,left:60,right:60,bottom:Math.max(100,stack+30)},maxZoom:13.5,duration:reduced?0:650});
  }
  function world(){popup?.remove();$('map-status').hidden=true;map.fitBounds([[data.bounds[0],data.bounds[1]],[data.bounds[2],data.bounds[3]]],{padding:{top:85,left:22,right:22,bottom:85},maxZoom:2,duration:reduced?0:700});}
  function updateLabels(){
    if(!map||!places.length)return;
    labels.forEach(label=>label.remove());labels=[];
    const zoom=map.getZoom(),width=$('adventure-map').clientWidth,height=$('adventure-map').clientHeight;
    const occupied=[];
    for(const marker of markers){const p=map.project(marker.getLngLat()),offset=offsets(current.scenarios).get(marker.getElement().dataset.number);occupied.push([p.x+offset[0]-25,p.y+offset[1]-25,p.x+offset[0]+25,p.y+offset[1]+32]);}
    const candidates=places.filter(f=>f.properties.name&&enabled.has(f.properties.kind)&&f.properties.min_zoom<=zoom).sort((a,b)=>{
      const priority=f=>['Sandpoint','Thistletop'].includes(f.properties.name)?-100:f.properties.min_zoom+(f.properties.kind==='cities'?-1:0);
      return priority(a)-priority(b)||a.properties.name.localeCompare(b.properties.name);
    });
    for(const place of candidates){
      const p=map.project(place.geometry.coordinates),name=place.properties.name,anchor=['Sandpoint','Thistletop'].includes(name),offset=anchor?34:15;
      const half=Math.min(190,name.length*3.5+5),rect=[p.x-half,p.y+offset-9,p.x+half,p.y+offset+9];
      if(rect[0]<4||rect[2]>width-4||rect[1]<4||rect[3]>height-45)continue;
      if(occupied.some(r=>rect[0]<r[2]&&rect[2]>r[0]&&rect[1]<r[3]&&rect[3]>r[1]))continue;
      const label=node('span','map-place-label'+(anchor?' is-anchor':''),name);label.title=name;
      labels.push(new maplibregl.Marker({element:label,offset:[0,offset]}).setLngLat(place.geometry.coordinates).addTo(map));occupied.push(rect);
      if(labels.length>=90)break;
    }
  }
  function layerControls(){
    const controls=$('map-layers');controls.replaceChildren();
    for(const layer of data.map_layers){
      if(layer.default)enabled.add(layer.id);
      const label=node('label'),input=node('input');input.type='checkbox';input.checked=layer.default;input.dataset.layer=layer.id;
      input.addEventListener('change',()=>{
        if(input.checked)enabled.add(layer.id);else enabled.delete(layer.id);
        for(const style of map.getStyle().layers)if(style.metadata?.group===layer.id)map.setLayoutProperty(style.id,'visibility',input.checked?'visible':'none');
        updateLabels();
      });label.append(input,node('span','',layer.label));controls.append(label);
    }
  }
  function keepPopupVisible(active){
    if(popup!==active||!active.isOpen())return;
    const box=active.getElement().getBoundingClientRect(),frame=$('adventure-map').getBoundingClientRect();
    const dx=Math.max(0,box.right-frame.right+10)+Math.min(0,box.left-frame.left-10);
    const dy=Math.max(0,box.bottom-frame.bottom+50)+Math.min(0,box.top-frame.top-10);
    if(dx||dy)map.panBy([dx,dy],{duration:0});
  }
  async function loadScenarioText(scenario,body,content){
    body.replaceChildren(node('p','scenario-popup-note','Loading card text…'));
    try{
      if(!cardCache.has(scenario.card_id))cardCache.set(scenario.card_id,library.detail(scenario.card_id).catch(error=>{cardCache.delete(scenario.card_id);throw error;}));
      const card=await cardCache.get(scenario.card_id);if(!body.isConnected)return;
      let mode='original';
      const render=()=>{
        body.replaceChildren();
        if(root.PACGHistory.hasErrata(card)){
          const tabs=node('div','scenario-text-versions');tabs.setAttribute('aria-label','Card text version');
          for(const value of ['original','errata']){const button=node('button','',value==='original'?'Original':'Errata');button.type='button';button.setAttribute('aria-pressed',String(mode===value));button.addEventListener('click',()=>{mode=value;render();body.querySelector(`button[aria-pressed="true"]`).focus();});tabs.append(button);}body.append(tabs);
        }
        const sections=scenarioRules(root.PACGHistory.select(card,mode).card);
        for(const section of sections){const block=node('section','scenario-rules-section');block.append(node('h3','',section.title),node('p','',section.text));body.append(block);}
        if(!sections.length)body.append(node('p','scenario-popup-note','Card text is not yet available.'));
        if(popup?.isOpen()&&popup.getElement()?.contains(content)){const active=popup;active.setDOMContent(content);requestAnimationFrame(()=>keepPopupVisible(active));}
      };render();
    }catch(error){
      if(!body.isConnected)return;body.replaceChildren(node('p','scenario-popup-note','Card text could not be loaded.'));
      const retry=node('button','scenario-text-retry','Retry');retry.type='button';retry.addEventListener('click',()=>loadScenarioText(scenario,body,content));body.append(retry);
    }
  }
  function selectScenario(scenario,focus=false){
    closeControls();popup?.remove();$('map-status').hidden=true;selected=scenario.number;
    for(const marker of markers)marker.getElement().setAttribute('aria-pressed',String(marker.getElement().dataset.number===selected));
    for(const b of $('scenario-index').children)b.setAttribute('aria-pressed',String(b.dataset.number===selected));
    const content=node('div','scenario-popup');content.append(node('p','scenario-popup-number',`${current.path} · ${scenario.number}`),node('h2','',scenario.name));
    const body=node('div','scenario-card-text');content.append(body);
    const footer=node('p','scenario-source','Unofficial · '),source=node('a','','Source');source.href=scenario.source_url;source.target='_blank';source.rel='noopener noreferrer';footer.append(source);content.append(footer);
    if(!scenario.coordinates){
      const close=node('button','map-floating-close','×');close.type='button';close.setAttribute('aria-label','Close scenario details');
      close.addEventListener('click',()=>{$('map-status').hidden=true;for(const b of $('scenario-index').children)b.setAttribute('aria-pressed','false');});
      $('map-status').replaceChildren(close,content);$('map-status').hidden=false;loadScenarioText(scenario,body,content);if(focus)close.focus();return;
    }
    const offset=offsets(current.scenarios).get(scenario.number);
    popup=new maplibregl.Popup({maxWidth:Math.min(380,$('adventure-map').clientWidth-40)+'px',offset:[offset[0],offset[1]-26],focusAfterOpen:focus,closeOnClick:true}).setLngLat(scenario.coordinates).setDOMContent(content).addTo(map);
    popup.on('close',()=>{selected='';for(const marker of markers)marker.getElement().setAttribute('aria-pressed','false');for(const b of $('scenario-index').children)b.setAttribute('aria-pressed','false');});
    const active=popup;requestAnimationFrame(()=>keepPopupVisible(active));loadScenarioText(scenario,body,content);
  }
  function show(id,{push=false,fitMap=true}={}){
    current=adventureFor(data,id);popup?.remove();markers.forEach(m=>m.remove());markers=[];selected='';
    document.querySelector('.map-layer-options').open=false;
    const choice=$('adventure-choice');
    if($('adventure-path-choice').value!==current.path||!choice.querySelector(`option[value="${current.id}"]`)){
      $('adventure-path-choice').value=current.path;choice.replaceChildren();
      for(const adventure of data.adventures.filter(a=>a.path===current.path)){const option=node('option','',`${adventure.deck} · ${adventure.title}`);option.value=adventure.id;choice.append(option);}
    }
    choice.value=current.id;choice.title=current.title;
    const unmapped=current.scenarios.filter(s=>!s.coordinates).length;
    $('adventure-fit').disabled=unmapped===current.scenarios.length;
    $('scenario-index-label').textContent=`${current.scenarios.length} scenario${current.scenarios.length===1?'':'s'}${unmapped?' · '+unmapped+' off-map':''}`;$('scenario-index').replaceChildren();$('scenario-index-label').parentElement.open=unmapped===current.scenarios.length;
    const positions=offsets(current.scenarios);
    for(const scenario of current.scenarios){
      if(scenario.coordinates){
        const button=node('button','scenario-marker'+(['region','portal'].includes(scenario.precision)?' is-approximate':''),scenario.number);button.type='button';button.dataset.number=scenario.number;button.setAttribute('aria-label',`${scenario.number}. ${scenario.name} — ${scenario.location}`);button.setAttribute('aria-pressed','false');button.title=`${scenario.number} · ${scenario.name}`;
        button.addEventListener('click',event=>{event.stopPropagation();selectScenario(scenario,event.detail===0);});
        markers.push(new maplibregl.Marker({element:button,offset:positions.get(scenario.number)}).setLngLat(scenario.coordinates).addTo(map));
      }
      const suffix=scenario.precision==='off-map'?' · Off-world':scenario.precision==='unplaced'?' · Unplaced':scenario.precision==='portal'?' · Entrance':'';
      const entry=node('button','',`${scenario.number} · ${scenario.name}${suffix}`);entry.type='button';entry.dataset.number=scenario.number;entry.setAttribute('aria-pressed','false');entry.addEventListener('click',event=>{if(scenario.coordinates){entry.closest('details').open=false;map.easeTo({center:scenario.coordinates,duration:reduced?0:400});}selectScenario(scenario,event.detail===0);});$('scenario-index').append(entry);
    }
    const url=new URL(location.href);url.searchParams.set('adventure',current.id);url.searchParams.delete('scenario');history[push?'pushState':'replaceState']({},'',url);
    document.title=`${current.title} · PACG map experiment`;$('map-status').hidden=true;
    if(fitMap){if(markers.length)fit();else world();}
    updateLabels();
  }
  $('adventure-path-choice').addEventListener('change',()=>show(data.adventures.find(a=>a.path===$('adventure-path-choice').value).id,{push:true}));
  $('adventure-choice').addEventListener('change',()=>{closeControls({focus:true});show($('adventure-choice').value,{push:true});});
  $('adventure-fit').addEventListener('click',()=>{closeControls({focus:true});fit();});
  $('map-world').addEventListener('click',()=>{closeControls({focus:true});world();});
  window.addEventListener('popstate',()=>{if(data&&map?.isStyleLoaded())show(new URL(location.href).searchParams.get('adventure'));});
  async function start(){
    try{
      const response=await fetch('./adventures.json?v=2244710aed0c');if(!response.ok)throw Error('The adventure index could not be loaded.');data=await response.json();
      if(data.schema_version!==1)throw Error('This adventure index is not supported.');
      if(typeof root.maplibregl?.Map!=='function')throw Error('The map library could not be loaded. Reload this map preview to retry.');
      maplibregl.setWorkerUrl(new URL('./vendor/maplibre-worker.js',location.href).href);
      map=new maplibregl.Map({container:'adventure-map',center:[-27.12,44.10],zoom:11.4,minZoom:-2,maxZoom:18,attributionControl:false,renderWorldCopies:false,pitchWithRotate:false,dragRotate:false,style:atlasStyle(root.PACGTheme.get())});
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
      map.on('error',event=>{console.error('Map rendering:',event.error);$('map-status').textContent='Part of the map could not be loaded. Reload this map preview to retry.';$('map-status').hidden=false;});
      map.once('load',async()=>{
        const choice=$('adventure-path-choice');choice.replaceChildren();
        for(const path of [...new Set(data.adventures.map(a=>a.path))]){
          const option=node('option','',path);option.value=path;choice.append(option);
        }
        choice.disabled=false;$('adventure-choice').disabled=false;$('adventure-fit').disabled=false;$('map-world').disabled=false;layerControls();
        try{
          const collection=await fetch('./places.geojson?v=63b5eb746265').then(r=>{if(!r.ok)throw Error('Place names could not be loaded.');return r.json();});
          places=collection.features;map.getSource('places').setData(collection);
        }catch(error){console.warn(error.message);}
        show(new URL(location.href).searchParams.get('adventure'));
        map.on('moveend',updateLabels);
        for(const layer of ['cities','locations']){
          map.on('mouseenter',layer,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',layer,()=>map.getCanvas().style.cursor='');
          map.on('click',layer,event=>{const place=event.features[0];if(!place)return;popup?.remove();const content=node('div','scenario-popup');content.append(node('h2','',place.properties.name));const link=node('a','','Place source');link.href=place.properties.source_url;link.target='_blank';link.rel='noopener noreferrer';content.append(link);popup=new maplibregl.Popup({maxWidth:Math.min(290,$('adventure-map').clientWidth-110)+'px'}).setLngLat(event.lngLat).setDOMContent(content).addTo(map);});
        }
        const resize=new ResizeObserver(()=>map.resize());resize.observe($('adventure-map'));
        window.PACGMapExperiment={map,getAdventure:()=>current,getLabelCount:()=>labels.length};
      });
    }catch(error){$('map-status').textContent=error.message;$('map-status').hidden=false;}
  }
  start();
})(typeof window!=='undefined'?window:globalThis);

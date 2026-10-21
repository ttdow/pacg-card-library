/* PACG map interface preview; terrain intentionally omitted. No article prose or raster map artwork. */
(function(root){
  'use strict';
  const COLORS={dark:{water:'#142630',land:'#334236',coast:'#77846a',forest:'#263e30',river:'#578a9e',road:'#c8af73'},light:{water:'#c6dce0',land:'#e9e3c8',coast:'#829783',forest:'#c3d0ab',river:'#669aa8',road:'#a48651'}};
  function adventureFor(data,id){return data.adventures.find(a=>a.id===id)||data.adventures.find(a=>a.id===data.default_adventure)||data.adventures[0];}
  function offsets(scenarios){
    const groups=new Map();
    for(const scenario of scenarios){const key=scenario.coordinates.join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(scenario);}
    const result=new Map();for(const group of groups.values())group.forEach((s,i)=>result.set(s.number,[(i-(group.length-1)/2)*46,0]));return result;
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={adventureFor,offsets};return;}
  const $=id=>document.getElementById(id),node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  let map,data,current,popup,markers=[],labels=[],selected='';
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  const themeButton=$('theme-toggle');
  function updateThemeButton(){const light=root.PACGTheme.get()==='dark';themeButton.textContent=light?'Light mode':'Dark mode';themeButton.setAttribute('aria-label',`Switch to ${light?'light':'dark'} mode`);}
  function paint(){if(!map?.isStyleLoaded())return;const c=COLORS[root.PACGTheme.get()];for(const [layer,property,value] of [['ocean','background-color',c.water],['land','fill-color',c.land],['coast','line-color',c.coast],['forests','fill-color',c.forest],['rivers','line-color',c.river],['roads','line-color',c.road]])map.setPaintProperty(layer,property,value);}
  themeButton.addEventListener('click',()=>{root.PACGTheme.toggle();updateThemeButton();paint();});updateThemeButton();
  const credits=$('map-credits');$('map-credits-open').addEventListener('click',()=>credits.showModal());$('map-credits-close').addEventListener('click',()=>credits.close());credits.addEventListener('close',()=>$('map-credits-open').focus());
  function fit(){
    if(!current||!map)return;
    const bounds=new maplibregl.LngLatBounds();current.scenarios.forEach(s=>bounds.extend(s.coordinates));
    map.fitBounds(bounds,{padding:{top:225,left:88,right:88,bottom:100},maxZoom:13.5,duration:reduced?0:650});
  }
  function selectScenario(scenario,focus=false){
    popup?.remove();selected=scenario.number;
    for(const marker of markers)marker.getElement().setAttribute('aria-pressed',String(marker.getElement().dataset.number===selected));
    for(const b of $('scenario-index').children)b.setAttribute('aria-pressed',String(b.dataset.number===selected));
    const content=node('div','scenario-popup');content.append(node('p','scenario-popup-number',`${current.path} · ${scenario.number}`),node('h2','',scenario.name),node('p','scenario-popup-location',scenario.location),node('p','scenario-popup-note',scenario.note));
    const source=node('a','','Scenario source');source.href=scenario.source_url;source.target='_blank';source.rel='noopener noreferrer';content.append(source);
    const offset=offsets(current.scenarios).get(scenario.number);
    popup=new maplibregl.Popup({maxWidth:'290px',offset:[offset[0],-26],focusAfterOpen:focus,closeOnClick:true}).setLngLat(scenario.coordinates).setDOMContent(content).addTo(map);
    popup.on('close',()=>{selected='';for(const marker of markers)marker.getElement().setAttribute('aria-pressed','false');for(const b of $('scenario-index').children)b.setAttribute('aria-pressed','false');});
    $('map-status').textContent=`${scenario.number}: ${scenario.name}. ${scenario.location}. ${scenario.note}`;
  }
  function show(id,{push=false,fitMap=true}={}){
    current=adventureFor(data,id);popup?.remove();markers.forEach(m=>m.remove());markers=[];selected='';
    $('adventure-choice').value=current.id;$('adventure-choice').title=`${current.path} · ${current.title}`;$('adventure-path-name').textContent=current.path;
    const index=data.adventures.indexOf(current);$('adventure-previous').disabled=index===0;$('adventure-next').disabled=index===data.adventures.length-1;
    $('scenario-index-label').textContent=`${current.scenarios.length} scenarios`;$('scenario-index').replaceChildren();$('scenario-index-label').parentElement.open=false;
    const positions=offsets(current.scenarios);
    for(const scenario of current.scenarios){
      const button=node('button','scenario-marker'+(scenario.precision==='region'?' is-approximate':''),scenario.number);button.type='button';button.dataset.number=scenario.number;button.setAttribute('aria-label',`${scenario.number}. ${scenario.name} — ${scenario.location}`);button.setAttribute('aria-pressed','false');button.title=`${scenario.number} · ${scenario.name}`;
      button.addEventListener('click',event=>{event.stopPropagation();selectScenario(scenario,event.detail===0);});
      markers.push(new maplibregl.Marker({element:button,offset:positions.get(scenario.number)}).setLngLat(scenario.coordinates).addTo(map));
      const entry=node('button','',`${scenario.number} · ${scenario.name}`);entry.type='button';entry.dataset.number=scenario.number;entry.setAttribute('aria-pressed','false');entry.addEventListener('click',()=>{entry.closest('details').open=false;map.easeTo({center:scenario.coordinates,duration:reduced?0:400});selectScenario(scenario);});$('scenario-index').append(entry);
    }
    const url=new URL(location.href);url.searchParams.set('adventure',current.id);url.searchParams.delete('scenario');history[push?'pushState':'replaceState']({},'',url);
    document.title=`${current.title} · PACG map experiment`;$('map-status').hidden=true;
    if(fitMap)fit();
  }
  $('adventure-choice').addEventListener('change',()=>show($('adventure-choice').value,{push:true}));
  $('adventure-previous').addEventListener('click',()=>show(data.adventures[data.adventures.indexOf(current)-1].id,{push:true}));
  $('adventure-next').addEventListener('click',()=>show(data.adventures[data.adventures.indexOf(current)+1].id,{push:true}));
  $('adventure-fit').addEventListener('click',fit);
  window.addEventListener('popstate',()=>{if(data&&map?.isStyleLoaded())show(new URL(location.href).searchParams.get('adventure'));});
  async function start(){
    try{
      const response=await fetch('./adventures.json');if(!response.ok)throw Error('The adventure index could not be loaded.');data=await response.json();
      if(data.schema_version!==1)throw Error('This adventure index is not supported.');
      if(typeof root.maplibregl?.Map!=='function')throw Error('The map library could not be loaded. Reload this map preview to retry.');
      maplibregl.setWorkerUrl(new URL('./vendor/maplibre-worker.js',location.href).href);
      const c=COLORS[root.PACGTheme.get()];
      map=new maplibregl.Map({container:'adventure-map',center:[-27.12,44.10],zoom:11.4,minZoom:9.5,maxZoom:16,maxBounds:[[data.bounds[0],data.bounds[1]],[data.bounds[2],data.bounds[3]]],attributionControl:false,renderWorldCopies:false,pitchWithRotate:false,dragRotate:false,
        style:{version:8,sources:{region:{type:'geojson',data:new URL('./region.geojson',location.href).href}},layers:[
          {id:'ocean',type:'background',paint:{'background-color':c.water}},
          {id:'land',type:'fill',source:'region',filter:['==',['get','layer'],'land'],paint:{'fill-color':c.land}},
          {id:'coast',type:'line',source:'region',filter:['==',['get','layer'],'land'],paint:{'line-color':c.coast,'line-width':1}},
          {id:'forests',type:'fill',source:'region',filter:['==',['get','layer'],'forests'],paint:{'fill-color':c.forest,'fill-opacity':.85}},
          {id:'rivers',type:'line',source:'region',filter:['==',['get','layer'],'rivers'],paint:{'line-color':c.river,'line-width':['interpolate',['linear'],['zoom'],10,1,15,3]}},
          {id:'roads',type:'line',source:'region',filter:['==',['get','layer'],'roads'],paint:{'line-color':c.road,'line-width':['interpolate',['linear'],['zoom'],10,1,15,3],'line-opacity':.7}},
        ]}});
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
      map.on('error',event=>{console.error('Map rendering:',event.error);$('map-status').textContent='Part of the map could not be loaded. Reload this map preview to retry.';$('map-status').hidden=false;});
      map.once('load',async()=>{
        const choice=$('adventure-choice');choice.replaceChildren();
        for(const path of [...new Set(data.adventures.map(a=>a.path))]){
          const group=node('optgroup');group.label=path;for(const a of data.adventures.filter(a=>a.path===path)){const option=node('option','',`${a.deck} · ${a.title}`);option.value=a.id;group.append(option);}choice.append(group);
        }
        choice.disabled=false;$('adventure-fit').disabled=false;
        try{
          const places=await fetch('./places.geojson').then(r=>{if(!r.ok)throw Error('Place names could not be loaded.');return r.json();});
          for(const place of places.features){
            const name=place.properties.name,anchor=['Sandpoint','Thistletop'].includes(name);
            if(!anchor&&place.properties.kind!=='cities')continue;
            const label=node('span','map-place-label'+(anchor?' is-anchor':''),name);
            labels.push(new maplibregl.Marker({element:label,offset:[0,anchor?34:15]}).setLngLat(place.geometry.coordinates).addTo(map));
          }
        }catch(error){console.warn(error.message);}
        show(new URL(location.href).searchParams.get('adventure'));
        const resize=new ResizeObserver(()=>map.resize());resize.observe($('adventure-map'));
        window.PACGMapExperiment={map,getAdventure:()=>current};
      });
    }catch(error){$('map-status').textContent=error.message;$('map-status').hidden=false;}
  }
  start();
})(typeof window!=='undefined'?window:globalThis);

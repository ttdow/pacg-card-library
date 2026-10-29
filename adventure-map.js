/* Load the atlas on demand; keep navigation in the parent workspace. */
(function(root){
  'use strict';
  root.PACGAdventureMap={create({frame,onChange}){
    let loaded=false,ready=false,current='',desired='',initial='';
    const send=message=>frame.contentWindow?.postMessage(message,location.origin);
    const syncTheme=()=>send({type:'pacg-map-theme',theme:root.PACGTheme.get()});
    root.addEventListener('message',event=>{
      if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
      if(!['pacg-map-ready','pacg-map-selection'].includes(event.data?.type)||typeof event.data.adventure!=='string')return;
      if(!ready&&event.data.type==='pacg-map-selection')return;
      current=event.data.adventure;
      if(event.data.type==='pacg-map-ready'){
        ready=true;
        syncTheme();
        if(desired&&desired!==current&&desired!==initial){send({type:'pacg-map-adventure',adventure:desired});return;}
      }
      desired=current;onChange(current,{push:event.data.push===true});
    });
    frame.addEventListener('load',syncTheme);
    return {syncTheme,open(adventure=''){
      desired=adventure;
      if(!loaded){
        const url=new URL('./map/',document.baseURI);url.searchParams.set('embedded','1');
        if(adventure)url.searchParams.set('adventure',adventure);
        initial=adventure;frame.src=url.href;loaded=true;
      }else{syncTheme();if(ready&&adventure&&adventure!==current)send({type:'pacg-map-adventure',adventure});}
    }};
  }};
})(window);

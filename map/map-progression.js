/* Scenario progression uses screen-space endpoints so stacked pins stay connected. */
(function(root){
  'use strict';
  function connections(adventure){
    const stages=adventure.progression?.stages||adventure.scenarios.map(s=>[s.number]),edges=[];
    for(let i=0;i<stages.length;i++){
      const stage=stages[i];
      // A dotted spine groups freely ordered scenarios; it is not a chosen itinerary.
      for(let j=1;j<stage.length;j++)edges.push({from:stage[j-1],to:stage[j],kind:'any-order',side:-1,lane:0});
      if(i+1<stages.length)for(let j=0;j<stage.length;j++)for(const next of stages[i+1])edges.push({from:stage[j],to:next,kind:'required',side:stage.length>1?1:-1,lane:stage.length-1-j});
    }
    return edges;
  }
  function routeGeometry(from,to,{radius=20,sameLocation=false,side=-1,lane=0}={}){
    const dx=to.x-from.x,dy=to.y-from.y,distance=Math.hypot(dx,dy);
    if(![from.x,from.y,to.x,to.y,radius].every(Number.isFinite))return null;
    const point=(x,y)=>[+x.toFixed(2),+y.toFixed(2)];
    if(sameLocation||distance<radius*2+12){
      const direction=dy<0?-1:1,reach=48+lane*15;
      const start=point(from.x+side*radius,from.y),end=point(to.x+side*radius,to.y);
      const loop=distance<1?18:0;
      return {start,end,d:`M ${start} C ${point(from.x+side*reach,from.y+direction*loop)} ${point(to.x+side*reach,to.y-direction*loop)} ${end}`};
    }
    const bend=Math.min(70,distance*.14),control={x:(from.x+to.x)/2-dy/distance*bend,y:(from.y+to.y)/2+dx/distance*bend};
    const trim=(p,c)=>{const length=Math.hypot(c.x-p.x,c.y-p.y);return point(p.x+(c.x-p.x)/length*radius,p.y+(c.y-p.y)/length*radius);};
    const start=trim(from,control),end=trim(to,control);
    return {start,end,d:`M ${start} Q ${point(control.x,control.y)} ${end}`};
  }
  const api={connections,routeGeometry};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PACGMapProgression=api;
})(typeof window!=='undefined'?window:globalThis);

/* Preserve bookmarks from the former standalone experiment. */
(function(){
  'use strict';
  const current=new URL(location.href),target=new URL('../',current);
  target.searchParams.set('view','map');
  const adventure=current.searchParams.get('adventure');
  if(adventure)target.searchParams.set('adventure',adventure);
  location.replace(target.href);
})();

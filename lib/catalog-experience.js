'use strict';

function titleKey(item,type=''){
 const kind=type||item?.media_type||(item?.first_air_date||item?.name?'tv':'movie'),id=Number(item?.id);
 return ['movie','tv'].includes(kind)&&Number.isSafeInteger(id)&&id>0?kind+':'+id:'';
}
function uniqueTitles(items=[],type=''){
 const seen=new Set();return (Array.isArray(items)?items:[]).filter(item=>{const key=titleKey(item,type);if(!key||item.adult||seen.has(key))return false;seen.add(key);return true;});
}
// Allocate in rounds so several overlapping sources all receive a share of the
// catalog. Rendering order remains the caller's order, with no cross-row repeats.
function diverseRows(rows=[],{limit=18,exclude=[]}={}){
 const used=new Set(exclude),prepared=rows.map(row=>({...row,items:[],candidates:uniqueTitles(row.items,row.type),cursor:0}));
 for(let round=0;round<limit;round++)for(const row of prepared){
  while(row.cursor<row.candidates.length){const item=row.candidates[row.cursor++],key=titleKey(item,row.type);if(used.has(key))continue;used.add(key);row.items.push(item);break;}
 }
 return prepared.map(({candidates,cursor,...row})=>row);
}
function pageHref(base,page=1){
 const url=new URL(String(base||'/'),'https://swifly.invalid'),number=Math.max(1,Math.min(500,Number.parseInt(page,10)||1));
 url.searchParams.set('page',String(number));return url.pathname+'?'+url.searchParams+url.hash;
}
const periodDefinitions={
 today:{label:'Today',title:'Popular movies',description:'Popular movies today',endpoint:'/trending/movie/day'},
 week:{label:'This Week',title:'Popular movies',description:'Popular movies this week',endpoint:'/trending/movie/week'},
 month:{label:'This Month',title:'Popular movies',description:'Popular releases this month',endpoint:'/discover/movie'}
};
function moviePeriod(value,fallback='week'){return Object.hasOwn(periodDefinitions,value)?value:fallback;}
function moviePeriodQuery(value,{page=1,now=new Date(),type='movie'}={}){
 const period=moviePeriod(value),params={page,include_adult:'false'};
 // TMDB has day/week trending, but no month window. Use its supported release
 // discovery filters for this calendar month and describe that scope in the UI.
 const kind=type==='tv'?'tv':'movie',date=kind==='tv'?'first_air_date':'primary_release_date';
 if(period==='month')Object.assign(params,{sort_by:'popularity.desc',[date+'.gte']:now.toISOString().slice(0,7)+'-01',[date+'.lte']:now.toISOString().slice(0,10)});
 return {endpoint:periodDefinitions[period].endpoint.replace('/movie', '/'+kind),params};
}
function personCredits(combined={},filters={}){
 const map=new Map();
 for(const [rows,cast]of [[combined.cast,true],[combined.crew,false]])for(const item of Array.isArray(rows)?rows:[]){
  const key=titleKey(item);if(!key||item.adult)continue;
  let row=map.get(key);if(!row){row={...item,creditRoles:[],creditJobs:[],characters:[]};map.set(key,row);}
  const role=cast?'Acting':String(item.department||item.job||'Crew');
  if(!row.creditRoles.includes(role))row.creditRoles.push(role);
  if(item.job&&!row.creditJobs.includes(item.job))row.creditJobs.push(item.job);
  if(cast&&item.character&&!row.characters.includes(item.character))row.characters.push(item.character);
 }
 const all=[...map.values()],roles=[...new Set(all.flatMap(row=>row.creditRoles))].sort();
 let items=all.filter(row=>(!['movie','tv'].includes(filters.media)||titleKey(row).startsWith(filters.media+':'))&&(!filters.role||filters.role==='all'||row.creditRoles.includes(filters.role)));
 const sort=['popular','newest','oldest','title'].includes(filters.sort)?filters.sort:'popular';
 const date=row=>String(row.release_date||row.first_air_date||'');
 items=[...items].sort((a,b)=>sort==='title'?String(a.title||a.name||'').localeCompare(String(b.title||b.name||'')):sort==='newest'||sort==='oldest'?(date(a)&&date(b)?date(a).localeCompare(date(b))*(sort==='newest'?-1:1):date(a)?-1:date(b)?1:0):Number(b.popularity||0)-Number(a.popularity||0));
 return {items,all,total:all.length,roles,sort};
}
module.exports={titleKey,uniqueTitles,diverseRows,pageHref,periodDefinitions,moviePeriod,moviePeriodQuery,personCredits};

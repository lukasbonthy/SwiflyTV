/* Shared deterministic relevance rules; the actual embeddings stay in the worker. */
(() => {
 'use strict';
 const stop=new Set('a an the i we you me us my our your this that these those is are was were be been to of in on at by for from with and or but as it its something someone people person movie movies film films show shows series tv story stories watch watching want please find about where after really very more'.split(' '));
 const normal=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const stem=w=>({yesterday:'day',repeating:'repeat',repeats:'repeat',repeated:'repeat',trapped:'trap',driving:'drive',drives:'drive',children:'child',kids:'child',magicians:'magician',thieves:'thief',crew:'team',group:'team'}[w]||w.replace(/(?:ing|ed|s)$/,''));
 function tokens(text){return [...new Set((normal(text).match(/[\p{L}\p{N}]+/gu)||[]).filter(w=>w.length>2&&!stop.has(w)).map(stem))];}
 function signals(query){const q=normal(query);return {
  comfort:/\b(?:comfort\w*|cozy|cosy|uplifting|feel[ -]good|cheer\w*|exhausting day|stressful day)\b/.test(q)&&!/(?:no|not|without)\s+(?:a\s+)?(?:comfort\w*|uplifting|feel[ -]good)/.test(q),
  family:/\b(?:for|with) (?:my |our |the |young )?(?:kids|children)\b|\b(?:kid|family)[ -]friendly\b/.test(q),
  horror:/\b(?:horror|scary|frightening)\b/.test(q)&&!/(?:no|not|without|avoid)\s+(?:a\s+)?(?:horror|scary|frightening)/.test(q),
  movie:/\b(?:movie|film)s?\b/.test(q),tv:/\b(?:series|tv|show|shows)\b/.test(q)
 };}
 function expandQuery(query){
  const s=signals(query);if(s.comfort&&!s.horror)return query.replace(/\bafter\b[^.!?]*\bday\b/i,'')+' An uplifting, warm, hopeful and light-hearted story about kindness, friendship and enjoying life.';
  if(/\b(?:time[ -]loop|trapped repeating|repeating yesterday|reliving (?:a|the|same) day)\b/i.test(query))return query+' Someone relives the same day again and again, trapped in a repeating time loop.';
  return query;
 }
 function rankCandidates(rows,scores,query,context={}){
  const intent=signals(query),terms=tokens(intent.comfort?query.replace(/\bafter\b[^.!?]*\bday\b/i,''):query),documents=rows.map(r=>tokens(r.title+' '+(r.genreNames||[]).join(' ')+' '+r.overview));
  const frequencies=new Map(terms.map(term=>[term,documents.filter(d=>d.includes(term)).length]));
  const weight=t=>Math.log(1+(rows.length-(frequencies.get(t)||0)+.5)/((frequencies.get(t)||0)+.5));
  const total=terms.reduce((s,t)=>s+weight(t),0)||1;
  const type=['movie','tv'].includes(context.type)?context.type:'';
  const eligible=rows.map((row,i)=>{
   if(type&&row.type&&row.type!==type)return null;
   const genres=row.genres||[],names=(row.genreNames||[]).join(' ');
   const horror=genres.includes(27)||/\bhorror\b/.test(names);
   if((intent.comfort||intent.family)&&!intent.horror&&horror)return null;
   if(intent.family&&genres.length&&!genres.includes(10751))return null;
   const found=terms.filter(t=>documents[i].includes(t)),coverage=found.length/Math.max(1,terms.length),lexical=found.reduce((s,t)=>s+weight(t),0)/total;
   const score=Number.isFinite(scores[i])?scores[i]:0;
   const affinity=row.source==='reference'?.07/(1+Math.max(0,Number(row.catalogRank||1)-1)*.12):0;
   const warmth=intent.comfort?(genres.includes(35)?.055:0)+(/\b(?:warm|uplifting|kindness|joy|gentle|hopeful|friendship|reconnect\w*|support\w*|optimis\w*)\b/i.test(row.overview)? .065:0)-(/\b(?:terror|murder|kill|disturb|dread|violent)\w*\b/i.test(row.overview)? .09:0)-(genres.some(g=>g===28||g===53)? .12:0):0;
   return {...row,score,rank:score*.7+lexical*.26+coverage*.1+affinity+Math.max(0,Math.min(10,Number(row.rating)||0))*.003+warmth,lexical,coverage,matchedTerms:found};
  }).filter(Boolean);
  const calibration=context.calibration||{},minimum=Number.isFinite(calibration.minimum)?calibration.minimum:.24,lexicalMinimum=Number.isFinite(calibration.lexicalMinimum)?calibration.lexicalMinimum:.16,window=Number.isFinite(calibration.window)?calibration.window:.15;
  const best=Math.max(0,...eligible.map(r=>r.score)),floor=Math.max(minimum,best-window);
  const ordered=eligible.filter(r=>r.match==='title'||context.broad||r.score>=floor||(r.score>=lexicalMinimum&&r.matchedTerms.length>=2&&r.coverage>=.35)).sort((a,b)=>Number(b.match==='title')-Number(a.match==='title')||b.rank-a.rank);
  const top=ordered[0]?.rank||0;
  return ordered.filter(r=>r.match==='title'||context.broad||r.rank>=top-.2).slice(0,8).map(({lexical,coverage,matchedTerms,...row})=>({...row,reason:row.source==='reference'?'Related to your reference':matchedTerms.length>=2?'Matches your story details':context.broad?'Matches your filters':'A close story match'}));
 }
 function selectStoryTopics(topics,target,config={}){
  const minimum=Number.isFinite(config.minimum)?config.minimum:.54,window=Number.isFinite(config.window)?config.window:.075,limit=Math.max(1,Math.min(2,config.limit||2));
  const ordered=topics.map(t=>({id:t.id,score:Math.max(...(t.vectors||[t.vector]).map(v=>v.reduce((s,n,i)=>s+n*target[i],0)))})).filter(t=>Number.isFinite(t.score)).sort((a,b)=>b.score-a.score);
  return ordered.filter(t=>t.score>=minimum&&t.score>=ordered[0].score-window).slice(0,limit).map(t=>t.id);
 }
 const api=Object.freeze({rankCandidates,expandQuery,tokens,selectStoryTopics});
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else globalThis.SwiflyRelevance=api;
})();

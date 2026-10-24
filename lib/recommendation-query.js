'use strict';

// Parse catalog constraints before semantic ranking. Genre IDs differ for TV.
const genres = [
  ['action', /\baction\b/i, 28, 10759],
  ['adventure', /\badventures?\b/i, 12, 10759],
  ['animation', /\b(?:animated|animation|cartoons?|anime)\b/i, 16, 16],
  ['comedy', /\b(?:comed(?:y|ies)|funny|funnier|humou?r|hilarious|romcom|rom-com)\b/i, 35, 35],
  ['crime', /\b(?:crime|gangsters?|heist)\b/i, 80, 80],
  ['documentary', /\bdocumentar(?:y|ies)\b/i, 99, 99],
  ['drama', /\bdramas?\b/i, 18, 18],
  ['family', /\b(?:family[ -]friendly|kid[ -]friendly|for (?:the |my |our )?(?:kids|children)|(?:watch )?with (?:my |our |the |young )?(?:kids|children)|kids? movie)\b/i, 10751, 10751],
  ['fantasy', /\bfantas(?:y|ies)\b/i, 14, 10765],
  ['history', /\b(?:historical|history)\b/i, 36, null],
  ['horror', /\b(?:horror|scary|frightening)\b/i, 27, null],
  ['music', /\b(?:musicals?|music)\b/i, 10402, null],
  ['mystery', /\b(?:myster(?:y|ies)|whodunn?it|detective)\b/i, 9648, 9648],
  ['romance', /\b(?:romantic|romance|romcom|rom-com)\b/i, 10749, null],
  ['science fiction', /\b(?:sci[ -]?fi|science fiction)\b/i, 878, 10765],
  ['thriller', /\bthrillers?\b/i, 53, null],
  ['war', /\b(?:war|military)\b/i, 10752, 10768],
  ['western', /\b(?:westerns?|cowboys?)\b/i, 37, 37]
];
const themes = [
  [/\b(?:time loop|same day|reliv\w* (?:a|the) day|repeat\w* (?:a|the) day)\b/i, 'time loop'],
  [/\btime[ -]travel\b/i, 'time travel'],
  [/\b(?:space|astronaut|intergalactic|cosmic)\b/i, 'outer space'],
  [/\b(?:heist|robbery|bank robbers?)\b/i, 'heist'],
  [/\b(?:superheroes?|superhero|superpowers?)\b/i, 'superhero'],
  [/\b(?:artificial intelligence|robots?|androids?)\b/i, 'artificial intelligence'],
  [/\bserial killer\b/i, 'serial killer'],
  [/\b(?:coming[ -]of[ -]age|growing up)\b/i, 'coming of age'],
  [/\b(?:dystopia|dystopian)\b/i, 'dystopia'],
  [/\b(?:vampires?)\b/i, 'vampire'],
  [/\b(?:zombies?)\b/i, 'zombie'],
  [/\b(?:survival|stranded|deserted island)\b/i, 'survival'],
  [/\b(?:courtroom|court case|legal battle)\b/i, 'courtroom'],
  [/\b(?:dragons?)\b/i, 'dragon'],
  [/\b(?:witches?|wizard|magic)\b/i, 'magic'],
  [/\b(?:aliens?|extraterrestrial)\b/i, 'alien'],
  [/\b(?:dreams?|dreaming)\b/i, 'dream'],
  [/\b(?:christmas)\b/i, 'christmas']
];
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Explicit credit constraints are mandatory; ambiguous “with” phrases are
// only hints until the catalog verifies a real person. Keep story clauses intact.
function personPreferences(text,ignoreHints=false){
 const heads=[...text.matchAll(/\b(directed by|starring|featuring|(?:movies?|films?|shows?|series)\s+(?:with|by))\s+/gi)],entries=[];
 for(let i=0;i<heads.length;i++){
  const head=heads[i],required=!/\bwith$/i.test(head[1]);if(ignoreHints&&!required)continue;
  const tail=text.slice(head.index+head[0].length,heads[i+1]?.index);
  const boundary=tail.search(/[,;:!?]|\s+(?:but|with|without|no|not|after|before|from|under|over|in|released|like|similar to|about|where|who|that|as|along the lines of|reminds? me of)\b|\s+and\s+(?=(?:a|an|some|something|more|less)\b)/i);
  const portion=tail.slice(0,boundary<0?undefined:boundary).replace(/\s+(?:and|but)\s*$/i,'').trim();
  const quoted=/^["“]([^"”]+)["”]$/.exec(portion);
  const names=(quoted?[quoted[1]]:portion.split(/\s+(?:and|&)\s+/i)).map(n=>n.trim().replace(/^["“]|["”.]+$/g,''));
  const valid=names.every(n=>n.length>=2&&n.length<=80&&n.split(/\s+/).length<=5&&/\p{L}/u.test(n)&&/^[\p{L}\p{M} .'’-]+$/u.test(n));
  if(!valid){if(required)return{entries:[],phrases:[],error:'Use a complete actor or director name after “'+head[1]+'”.'};continue;}
  if(!required&&names.some(n=>/^(?:a|an|the|strong|happy|sad)\b/i.test(n)||genres.some(g=>normalize(g[0])===normalize(n))||themes.some(([,term])=>normalize(term)===normalize(n))))continue;
  const phrase=head[0]+portion,role=/directed by|\bby$/i.test(head[1])?'director':'cast';
  for(const name of names)entries.push({name,role,required,phrase,order:head.index});
 }
 const unique=[...new Map(entries.map(p=>[p.role+':'+normalize(p.name),p])).values()],explicit=unique.filter(p=>p.required);
 if(explicit.length>2)return{entries:[],phrases:[],error:'Use up to two actor or director constraints in one search.'};
 const selected=[...explicit,...unique.filter(p=>!p.required).slice(0,2-explicit.length)].sort((a,b)=>a.order-b.order);
 return{entries:selected.map(({phrase,order,...p})=>p),phrases:[...new Set(selected.map(p=>p.phrase))],error:''};
}

function parseRecommendationQuery(value, selectedType = 'mix', {ignorePersonHints=false}={}) {
  const prompt = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  // A film's own name is not an instruction: protect it before reading filters.
  const similar = /\b(?:like|similar to|along the lines of|reminds? me of)\s+(.+)/i.exec(prompt);
  const quoted = /["“]([^"”]{2,100})["”]/.exec(prompt);
  let title = quoted?.[1] || similar?.[1] || '', intent = prompt;
  if (title) {
    // Commas/periods are valid in names (I, Robot; Mr. Robot). Only explicit
    // preference or date phrases end an unquoted reference.
    const qualifier = title.search(/(?:,\s*|\s+)(?=(?:(?:but|and|with)\s+)?(?:no|not|without|avoid|excluding|exclude)\s+|but\s+(?:with|more|less|set|funnier|scarier|shorter|longer|lighter|darker|slower|faster)\b|(?:but|and|with)\s+(?:(?:a|any|more|less)\s+)?(?:horror|scary|romance|romantic|comedy|funny|action|adventure|drama|thriller|sci[ -]?fi|science fiction)\b|(?:from|in|released in)\s+(?:the\s+)?(?:['’]?\d0['’]?s|(?:19|20)\d{2}(?:['’]?s)?\b))/i);
    const suffix=title.search(/\s+(?=(?:starring|featuring|directed by)\s+|(?:under|less than|up to|at most|no longer than)\s+(?:\d+(?:\.\d+)?|one|two|three|an?)\s*(?:hours?|hrs?|minutes?|mins?)\b|in\s+(?:english|french|korean|japanese|spanish|german|italian|hindi|chinese|mandarin|tamil|telugu|portuguese|arabic|danish|norwegian|swedish)\b|with\s+(?:(?:a|an)\s+(?:female|male|happy|sad|strong|complex|emotional|different|surprise|twist)\b|(?:more|less)\s))/i);
    const splitAt=qualifier<0?suffix:suffix<0?qualifier:Math.min(qualifier,suffix);
    if (!quoted && splitAt >= 0) title = title.slice(0, splitAt);
    title = title.trim().replace(/[.!?]+$/, '');
    const start = quoted ? quoted.index : similar.index + similar[0].length - similar[1].length;
    const end = quoted ? quoted.index + quoted[0].length : start + title.length;
    intent = prompt.slice(0, start) + ' ' + prompt.slice(end);
  }
  // A negative clause ends at punctuation or a positive conjunction.
  const negative = [], positive = intent.replace(/\b(?:no(?!\s+longer\s+than)|not|without|avoid|excluding|exclude|nothing|don['’]t want|do not want)\s+[^,.!?;]+/gi, clause => {
    const parts = clause.split(/\b(?:but|however|instead)\b|\band\s+(?=(?:a|an|some|something)\s)/i);
    negative.push(parts[0]);
    return parts.length > 1 ? parts.slice(1).join(' ') : ' ';
  });
  const personMatch=personPreferences(positive,ignorePersonHints),people=personMatch.entries;
  const person=people[0]?{name:people[0].name,role:people[0].role}:null;
  const preferenceText=personMatch.phrases.reduce((text,phrase)=>text.replace(phrase,/^(?:movies?|films?|shows?|series)\b/i.exec(phrase)?.[0]||' '),positive);
  const wanted = genres.filter(g => g[1].test(preferenceText));
  const unwanted = genres.filter(g => negative.some(text => g[1].test(text)));
  let type = ['movie', 'tv'].includes(selectedType) ? selectedType : 'mix';
  if (type === 'mix') {
    const tv = /\b(?:tv|series|episodes?|sitcoms?)\b|\b(?:a|some|good|best)\s+shows?\b|\bshows?\s+(?:like|about|with|set|from)\b/i.test(preferenceText);
    const film = /\b(?:movies?|films?)\b/i.test(preferenceText);
    if (tv !== film) type = tv ? 'tv' : 'movie';
  }
  let start = null, end = null;
  // A story set in the seventies can have been released yesterday.
  const dated=preferenceText.replace(/\b(?:set|takes? place|taking place)\s+(?:in|during)\s+(?:the\s+)?(?:(?:19|20)\d{2}['’]?s?|['’]?[2-9]0['’]?s)\b/gi,' ');
  const range = dated.match(/\b((?:19|20)\d{2})\s*(?:-|to|through)\s*((?:19|20)\d{2})\b/);
  const decade = dated.match(/\b((?:19|20)\d0)['’]?s\b|\b(?:from|the|in)\s+(?:the\s+)?['’]?([2-9]0)['’]?s\b/i);
  const year = dated.match(/\b(?:from|in|released in)\s+((?:19|20)\d{2})\b/);
  const bound=dated.match(/\b(after|since|before|until|through)\s+((?:19|20)\d{2})\b/i);
  if (range) [start, end] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
  else if (decade) { start = decade[1] ? Number(decade[1]) : Number(decade[2]) + 1900; end = start + 9; }
  else if (year) start = end = Number(year[1]);
  else if(bound){const n=Number(bound[2]);if(/after|since/i.test(bound[1])){start=n+(/^after$/i.test(bound[1])?1:0);end=new Date().getFullYear();}else{start=1874;end=n-(/^before$/i.test(bound[1])?1:0);}}
  const duration=preferenceText.match(/\b(?:under|less than|up to|at most|no longer than)\s+(\d+(?:\.\d+)?|one|two|three|an?)\s*(hours?|hrs?|minutes?|mins?)\b/i);
  const amount=duration?({a:1,an:1,one:1,two:2,three:3}[duration[1].toLowerCase()]||Number(duration[1])):0;
  const runtimeMax=duration?Math.max(1,Math.min(600,Math.round(amount*(/^h/i.test(duration[2])?60:1)))):null;
  const languages={english:'en',french:'fr',korean:'ko',japanese:'ja',spanish:'es',german:'de',italian:'it',hindi:'hi',chinese:'zh',mandarin:'zh',tamil:'ta',telugu:'te',portuguese:'pt',arabic:'ar',danish:'da',norwegian:'no',swedish:'sv'};
  const languagePhrase=preferenceText.match(/\b(?:in\s+|originally in\s+)(english|french|korean|japanese|spanish|german|italian|hindi|chinese|mandarin|tamil|telugu|portuguese|arabic|danish|norwegian|swedish)\b|\b(english|french|korean|japanese|spanish|german|italian|hindi|chinese|mandarin|tamil|telugu|portuguese|arabic|danish|norwegian|swedish)(?=[ -](?:language|movies?|films?|shows?|series|comedies|thrillers?|dramas?|horror|romance|science fiction|animation)\b)/i);
  const language=languagePhrase?languages[(languagePhrase[1]||languagePhrase[2]).toLowerCase()]:'';
  const languageWord=languagePhrase?(languagePhrase[1]||languagePhrase[2]).toLowerCase():'';
  const languageName=languageWord?languageWord[0].toUpperCase()+languageWord.slice(1):'';
  // Dates constrain the catalog; they are not a story premise for the encoder.
  let semanticQuery=preferenceText;
  for(const match of [range,decade,year,bound,duration,languagePhrase].filter(Boolean))semanticQuery=semanticQuery.replace(match[0],' ');
  semanticQuery=semanticQuery.replace(/\b(?:from|released in|in)\s*(?:the\s*)?(?=[,;.!?]|$)/gi,' ').replace(/\s+/g,' ').trim();
  if (!title && prompt.split(/\s+/).length <= 10 && prompt.length <= 100) {
    title = prompt.replace(/^(?:please\s+)?(?:find|show me|search for|i want(?: to watch)?|looking for)\s+/i, '').replace(/^(?:the )?(?:movie|film|show|series)(?: called| named)\s+/i, '').trim();
  }
  const selectedThemes=themes.filter(([re]) => re.test(preferenceText) && !negative.some(text => re.test(text))).slice(0,2).map(([,term])=>term);
  let remainder=semanticQuery;
  for(const g of wanted)remainder=remainder.replace(new RegExp(g[1].source,'gi'),' ');
  remainder=remainder.replace(/\b(?:i|we|want|watch|watching|a|an|the|some|something|please|find|me|us|good|great|best|movie|movies|film|films|show|shows|series|tv|and|or|with|of|in|for|to)\b/gi,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const broad=!!(people.length||wanted.length||unwanted.length||language||runtimeMax||start)&&!remainder&&!selectedThemes.length&&!similar;
  const titleLike=!!quoted||(!wanted.length&&!selectedThemes.length&&!language&&!runtimeMax&&!start&&!/\b(?:about|where|with|without|movie|film|show|series|something|story|stories|want)\b/i.test(prompt)&&prompt.split(/\s+/).length<=7);
  const explicitTitle=!!quoted||/^(?:please\s+)?(?:(?:find|show me|search for|i want(?: to watch)?|looking for)\s+)?(?:the\s+)?(?:movie|film|show|series)\s+(?:called|named)\b/i.test(prompt);
  return {prompt,semanticQuery,people,person,personError:personMatch.error,type,wanted,unwanted,themes:selectedThemes,title:title.slice(0,100),similar:!!similar,start,end,either:/\bor\b/i.test(preferenceText),runtimeMax,language,languageName,broad,titleLike,explicitTitle};
}

function genreIds(items, type) { return [...new Set(items.map(g => g[type === 'tv' ? 3 : 2]).filter(Boolean))]; }
function matchesConstraints(row, query, {allowUnknownRuntime=false,allowUnknownTvGenres=false}={}) {
  if (query.type !== 'mix' && row.type !== query.type) return false;
  const wanted=query.wanted.map(g=>{const id=g[row.type==='tv'?3:2];return id?row.genres.includes(id):row.type==='tv'&&(allowUnknownTvGenres||(row.tvGenreMatches||[]).includes(g[0]));}),excluded=genreIds(query.unwanted,row.type);
  if (excluded.some(id => row.genres.includes(id))) return false;
  if (wanted.length && !(query.either ? wanted.some(Boolean) : wanted.every(Boolean))) return false;
  if (query.start && (!row.year || Number(row.year) < query.start || Number(row.year) > query.end)) return false;
  if(query.language&&row.language!==query.language)return false;
  if(query.runtimeMax&&(!(Number(row.runtime)>0)?!allowUnknownRuntime:Number(row.runtime)>query.runtimeMax))return false;
  return true;
}
function genreNames(ids, type) { return genres.filter(g => ids.includes(g[type === 'tv' ? 3 : 2])).map(g => g[0]); }

module.exports = {parseRecommendationQuery, genreIds, matchesConstraints, genreNames, normalize, genreDefinitions:genres};

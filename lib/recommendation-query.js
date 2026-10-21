'use strict';

// Parse catalog constraints before semantic ranking. Genre IDs differ for TV.
const genres = [
  ['action', /\baction\b/i, 28, 10759],
  ['adventure', /\badventures?\b/i, 12, 10759],
  ['animation', /\b(?:animated|animation|cartoons?|anime)\b/i, 16, 16],
  ['comedy', /\b(?:comed(?:y|ies)|funny|hilarious|romcom|rom-com)\b/i, 35, 35],
  ['crime', /\b(?:crime|gangsters?|heist)\b/i, 80, 80],
  ['documentary', /\bdocumentar(?:y|ies)\b/i, 99, 99],
  ['drama', /\bdramas?\b/i, 18, 18],
  ['family', /\b(?:family[ -]friendly|for (?:the )?(?:kids|children)|kids? movie)\b/i, 10751, 10751],
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

function parseRecommendationQuery(value, selectedType = 'mix') {
  const prompt = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  // A film's own name is not an instruction: protect it before reading filters.
  const similar = /\b(?:like|similar to|along the lines of|reminds? me of)\s+(.+)/i.exec(prompt);
  const quoted = /["“]([^"”]{2,100})["”]/.exec(prompt);
  let title = quoted?.[1] || similar?.[1] || '', intent = prompt;
  if (title) {
    // Commas/periods are valid in names (I, Robot; Mr. Robot). Only explicit
    // preference or date phrases end an unquoted reference.
    const qualifier = title.search(/(?:,\s*|\s+)(?=(?:(?:but|and|with)\s+)?(?:no|not|without|avoid|excluding|exclude)\s+|(?:but|and|with)\s+(?:(?:a|any|more|less)\s+)?(?:horror|scary|romance|romantic|comedy|funny|action|adventure|drama|thriller|sci[ -]?fi|science fiction)\b|(?:from|in|released in)\s+(?:the\s+)?(?:['’]?\d0['’]?s|(?:19|20)\d{2}(?:['’]?s)?\b))/i);
    if (!quoted && qualifier >= 0) title = title.slice(0, qualifier);
    title = title.trim().replace(/[.!?]+$/, '');
    const start = quoted ? quoted.index : similar.index + similar[0].length - similar[1].length;
    const end = quoted ? quoted.index + quoted[0].length : start + title.length;
    intent = prompt.slice(0, start) + ' ' + prompt.slice(end);
  }
  // A negative clause ends at punctuation or a positive conjunction.
  const negative = [], positive = intent.replace(/\b(?:no|not|without|avoid|excluding|exclude|nothing|don['’]t want|do not want)\s+[^,.!?;]+/gi, clause => {
    const parts = clause.split(/\b(?:but|however|instead)\b/i);
    negative.push(parts[0]);
    return parts.length > 1 ? parts.slice(1).join(' ') : ' ';
  });
  const wanted = genres.filter(g => g[1].test(positive));
  const unwanted = genres.filter(g => negative.some(text => g[1].test(text)));
  let type = ['movie', 'tv'].includes(selectedType) ? selectedType : 'mix';
  if (type === 'mix') {
    const tv = /\b(?:tv|series|episodes?|sitcoms?)\b|\b(?:a|some|good|best)\s+shows?\b|\bshows?\s+(?:like|about|with|set|from)\b/i.test(positive);
    const film = /\b(?:movies?|films?)\b/i.test(positive);
    if (tv !== film) type = tv ? 'tv' : 'movie';
  }
  let start = null, end = null;
  const range = positive.match(/\b((?:19|20)\d{2})\s*(?:-|to|through)\s*((?:19|20)\d{2})\b/);
  const decade = positive.match(/\b((?:19|20)\d0)['’]?s\b|\b(?:from|the|in)\s+(?:the\s+)?['’]?([2-9]0)['’]?s\b/i);
  const year = positive.match(/\b(?:from|in|released in)\s+((?:19|20)\d{2})\b/);
  if (range) [start, end] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
  else if (decade) { start = decade[1] ? Number(decade[1]) : Number(decade[2]) + 1900; end = start + 9; }
  else if (year) start = end = Number(year[1]);
  // Dates constrain the catalog; they are not a story premise for the encoder.
  let semanticQuery=positive;
  for(const match of [range,decade,year].filter(Boolean))semanticQuery=semanticQuery.replace(match[0],' ');
  semanticQuery=semanticQuery.replace(/\b(?:from|released in|in)\s*(?:the\s*)?(?=[,;.!?]|$)/gi,' ').replace(/\s+/g,' ').trim();
  if (!title && prompt.split(/\s+/).length <= 10 && prompt.length <= 100) {
    title = prompt.replace(/^(?:please\s+)?(?:find|show me|search for|i want(?: to watch)?|looking for)\s+/i, '').replace(/^(?:the )?(?:movie|film|show|series)(?: called| named)\s+/i, '').trim();
  }
  return {prompt, semanticQuery, type, wanted, unwanted, themes:themes.filter(([re]) => re.test(positive) && !negative.some(text => re.test(text))).slice(0, 2).map(([,term]) => term), title:title.slice(0, 100), similar:!!similar, start, end, either:/\bor\b/i.test(positive)};
}

function genreIds(items, type) { return [...new Set(items.map(g => g[type === 'tv' ? 3 : 2]).filter(Boolean))]; }
function matchesConstraints(row, query) {
  if (query.type !== 'mix' && row.type !== query.type) return false;
  const wanted = genreIds(query.wanted, row.type), excluded = genreIds(query.unwanted, row.type);
  if (excluded.some(id => row.genres.includes(id))) return false;
  if (wanted.length && !(query.either ? wanted.some(id => row.genres.includes(id)) : wanted.every(id => row.genres.includes(id)))) return false;
  if (query.start && (!row.year || Number(row.year) < query.start || Number(row.year) > query.end)) return false;
  return true;
}
function genreNames(ids, type) { return genres.filter(g => ids.includes(g[type === 'tv' ? 3 : 2])).map(g => g[0]); }

module.exports = {parseRecommendationQuery, genreIds, matchesConstraints, genreNames, normalize, genreDefinitions:genres};

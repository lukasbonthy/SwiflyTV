'use strict';

const { extractMediaCandidates } = require('./media-discovery');
const { cleanHeaders } = require('./nuvio-http');
const MAX_SUBTITLES = 32;
const STANDARD_HEIGHTS = new Set([144,240,360,480,540,576,720,1080,1440,1600,1920,2160,2880,4320,8640]);
const LANGUAGE_NAMES = Object.freeze({
  english:'en',eng:'en',spanish:'es',spa:'es',french:'fr',fre:'fr',fra:'fr',german:'de',ger:'de',deu:'de',
  italian:'it',ita:'it',portuguese:'pt',por:'pt','portuguese (br)':'pt-BR',brazilian:'pt-BR',
  hindi:'hi',hin:'hi',tamil:'ta',tam:'ta',telugu:'te',tel:'te',malayalam:'ml',mal:'ml',kannada:'kn',kan:'kn',
  bengali:'bn',ben:'bn',arabic:'ar',ara:'ar',japanese:'ja',jpn:'ja',korean:'ko',kor:'ko',
  chinese:'zh',zho:'zh',chi:'zh',mandarin:'zh',dutch:'nl',dut:'nl',nld:'nl',polish:'pl',pol:'pl',
  russian:'ru',rus:'ru',ukrainian:'uk',ukr:'uk',turkish:'tr',tur:'tr',swedish:'sv',swe:'sv',
  norwegian:'no',nor:'no',danish:'da',dan:'da',finnish:'fi',fin:'fi',greek:'el',ell:'el',gre:'el',
  hebrew:'he',heb:'he',indonesian:'id',ind:'id',thai:'th',tha:'th',vietnamese:'vi',vie:'vi',
  czech:'cs',ces:'cs',cze:'cs',hungarian:'hu',hun:'hu',romanian:'ro',ron:'ro',rum:'ro',
  persian:'fa',fas:'fa',per:'fa',malay:'ms',msa:'ms',may:'ms',slovak:'sk',slk:'sk',slo:'sk',
  bulgarian:'bg',bul:'bg',croatian:'hr',hrv:'hr',serbian:'sr',srp:'sr',slovenian:'sl',slv:'sl',
  lithuanian:'lt',lit:'lt',estonian:'et',est:'et',icelandic:'is',isl:'is',ice:'is',
  albanian:'sq',sqi:'sq',alb:'sq',bosnian:'bs',bos:'bs',macedonian:'mk',mkd:'mk',mac:'mk',sinhala:'si',sin:'si'
});

function text(value, limit=100) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit) : '';
}

/** Normalize provider evidence only: original/unknown/multi audio never means English. */
function normalizeAudioLanguage(value) {
  const language=text(value,80).toLowerCase();
  if (Object.hasOwn(LANGUAGE_NAMES,language)) return LANGUAGE_NAMES[language];
  if (!/^[a-z]{2}(?:-[a-z0-9]{2,8}){0,3}$/.test(language)) return '';
  try { return Intl.getCanonicalLocales(language)[0] || ''; } catch { return ''; }
}

function remoteUrl(value, baseUrl) {
  if(typeof value!=='string'||value.length>16384||/[\u0000-\u0020\u007f\\<>"']/.test(value))return null;
  try {
    const parsed=new URL(value,baseUrl);
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return null;
    return parsed;
  } catch {return null;}
}

/** Bounded provider-owned caption metadata. Content remains untrusted until fetched. */
function normalizeSubtitles(input,{headers={},baseUrl}={}) {
  if(!Array.isArray(input))return [];
  const tracks=[],seen=new Set();
  for(const entry of input.slice(0,MAX_SUBTITLES*2)) {
    if(!entry||typeof entry!=='object'||Array.isArray(entry))continue;
    const parsed=remoteUrl(entry.url||entry.file||entry.src,baseUrl);
    if(!parsed||seen.has(parsed.href))continue;
    const extension=parsed.pathname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]||'';
    if(extension&&!['vtt','srt'].includes(extension))continue;
    const rawType=text(entry.format||entry.type,40).toLowerCase();
    if(rawType&& !['vtt','webvtt','srt','text/vtt','application/x-subrip','subtitles','captions'].includes(rawType))continue;
    const language=normalizeAudioLanguage(entry.language||entry.lang||entry.srclang);
    try {
      const inherited=cleanHeaders(headers);
      let sameOrigin=false;
      try {sameOrigin=new URL(baseUrl).origin===parsed.origin;}catch{}
      if(!sameOrigin){delete inherited.cookie;delete inherited.authorization;}
      const trackHeaders={...inherited,...cleanHeaders(entry.headers||{})};
      tracks.push({url:parsed.href,language,label:text(entry.label||entry.name,100)||text(entry.language||entry.lang,100)||'Subtitles',kind:'subtitles',default:entry.default===true,format:extension||(rawType.includes('srt')||rawType==='application/x-subrip'?'srt':rawType?'vtt':''),headers:trackHeaders});
      seen.add(parsed.href);
      if(tracks.length>=MAX_SUBTITLES)break;
    } catch {}
  }
  return tracks;
}

function sourceQuality(source) {
  const height=value=>{
    if(typeof value!=='number'&&!(typeof value==='string'&&/^\d{2,4}$/.test(value.trim())))return 0;
    const n=Number(value);return Number.isSafeInteger(n)&&n>=144&&n<=8640?n:0;
  };
  const measured=height(source.height);if(measured)return measured+'p';
  const supplied=text(source.quality,100)||text(source.resolution,100),dimensions=text(source.resolution,100).match(/^(\d{3,5})\s*[x×]\s*(\d{3,5})$/i)||supplied.match(/^(\d{3,5})\s*[x×]\s*(\d{3,5})$/i);
  if(dimensions)return Number(dimensions[1])>0&&Number(dimensions[1])<=16384&&height(dimensions[2])?height(dimensions[2])+'p':'';
  for(const raw of [source.quality,source.resolution])if((typeof raw==='number'||typeof raw==='string'&&/^\d{2,4}$/.test(raw.trim()))&&STANDARD_HEIGHTS.has(Number(raw)))return Number(raw)+'p';
  if(/^auto(?:matic)?$/i.test(supplied))return 'auto';
  for(const label of [supplied,text(source.name||source.label,100)]){
    const pixels=label.match(/\b([1-9]\d{2,3})\s*p\b/i);if(pixels&&height(pixels[1]))return height(pixels[1])+'p';
    if(/\b8k\b/i.test(label))return '4320p';
    if(/\b(?:4k|uhd)\b/i.test(label))return '2160p';
  }
  return '';
}

function normalizePlaybackSource(source,{isNonMediaUrl=()=>false}={}) {
  if(!source||typeof source!=='object'||Array.isArray(source))return null;
  // Only this record's video URL is evidence. Nested caption/metadata URLs
  // must never replace a rejected source while walking the provider object.
  const videoRecord={url:source.url||source.file||source.src};
  for(const field of ['type','format','mimeType','mime','contentType','streamType','forceHls'])videoRecord[field]=source[field];
  const [candidate]=extractMediaCandidates({sources:[videoRecord]},{isNonMediaUrl});
  if(!candidate)return null;
  try {
    const headers=cleanHeaders(source.headers||{});
    const codecName=text(source.codecName,32);
    const name=text(source.name||source.label,100);
    let audioLanguage=normalizeAudioLanguage(source.audioLanguage||source.audio_language||source.language||source.lang);
    // The pinned VidEasy formatter supplies its explicit audio label in name
    // while leaving language empty. Original/dual/multi labels stay unknown.
    if(!audioLanguage&&/^VidEasy\s*\|/i.test(name)) {
      const label=name.split('|').at(-1).trim().replace(/^Normal\s+/i,'').replace(/\s+Audio$/i,'');
      audioLanguage=normalizeAudioLanguage(label);
    }
    return {
      ...candidate,headers,name,quality:sourceQuality(source),audioLanguage,
      subtitles:normalizeSubtitles(source.subtitles||source.captions,{headers,baseUrl:candidate.url}),
      ...(source.requiresProxy===true?{requiresProxy:true}:{}),
      ...(source.mediaVerified===true?{mediaVerified:true}:{}),
      ...(/^[a-z0-9][a-z0-9._+-]{0,31}$/i.test(codecName)?{codecName:codecName.toLowerCase()}:{})
    };
  } catch {return null;}
}

/** Known preferred audio, unknown audio, other known audio; quality breaks ties. */
function preferPlaybackSources(sources,{preferredLanguage='en'}={}) {
  const preferred=normalizeAudioLanguage(preferredLanguage).split('-')[0];
  const audioRank=source=>{
    const language=normalizeAudioLanguage(source.audioLanguage||source.language||source.lang);
    return !language?1:preferred&&language.split('-')[0]===preferred?2:0;
  };
  const resolution=source=>Number(sourceQuality(source).match(/^(\d{2,4})p$/i)?.[1]||0);
  return (Array.isArray(sources)?sources:[]).slice(0,24).sort((a,b)=>audioRank(b)-audioRank(a)||resolution(b)-resolution(a));
}

module.exports={normalizeAudioLanguage,normalizePlaybackSource,normalizeSubtitles,preferPlaybackSources};

import React, {createElement as h, Fragment, memo, useCallback, useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {MAX_VISIBLE_TITLES, nextOffset, railWindow, responsivePageSize, subscribeToRailSize} from './rails.mjs';

const names = {
  class:'className', for:'htmlFor', tabindex:'tabIndex', inputmode:'inputMode', readonly:'readOnly', maxlength:'maxLength',
  minlength:'minLength', autofocus:'autoFocus', autocomplete:'autoComplete', crossorigin:'crossOrigin',
  fetchpriority:'fetchPriority', srcset:'srcSet', usemap:'useMap', ismap:'isMap', referrerpolicy:'referrerPolicy',
  allowfullscreen:'allowFullScreen', playsinline:'playsInline', frameborder:'frameBorder', cellpadding:'cellPadding',
  cellspacing:'cellSpacing', colspan:'colSpan', rowspan:'rowSpan', contenteditable:'contentEditable',
  spellcheck:'spellCheck', autocapitalize:'autoCapitalize', acceptcharset:'acceptCharset', 'accept-charset':'acceptCharset',
  'http-equiv':'httpEquiv', charset:'charSet', datetime:'dateTime', enctype:'encType', formaction:'formAction',
  formenctype:'formEncType', formmethod:'formMethod', formnovalidate:'formNoValidate', formtarget:'formTarget',
  novalidate:'noValidate', accesskey:'accessKey', autoplay:'autoPlay', controlslist:'controlsList',
  defaultchecked:'defaultChecked', defaultvalue:'defaultValue', 'xlink:href':'xlinkHref', 'xml:space':'xmlSpace',
  'stroke-width':'strokeWidth', 'stroke-linecap':'strokeLinecap', 'stroke-linejoin':'strokeLinejoin',
  'stroke-dasharray':'strokeDasharray', 'stroke-dashoffset':'strokeDashoffset', 'stroke-opacity':'strokeOpacity',
  'fill-rule':'fillRule', 'fill-opacity':'fillOpacity', 'clip-rule':'clipRule', 'clip-path':'clipPath',
  'color-interpolation-filters':'colorInterpolationFilters', 'flood-color':'floodColor', 'flood-opacity':'floodOpacity',
  'stop-color':'stopColor', 'stop-opacity':'stopOpacity', 'font-family':'fontFamily', 'font-size':'fontSize',
  'text-anchor':'textAnchor', 'dominant-baseline':'dominantBaseline', 'vector-effect':'vectorEffect',
};
const booleans = new Set(['allowfullscreen','async','autofocus','autoplay','checked','controls','default','defer',
  'disabled','formnovalidate','hidden','inert','ismap','itemscope','loop','multiple','muted','nomodule','novalidate',
  'open','playsinline','readonly','required','reversed','scoped','seamless']);
const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

// Split declarations only outside quoted strings and parentheses (SVG/data URLs
// and custom properties in the original theme contain embedded semicolons).
export function inlineStyle(source='') {
  const values={};let start=0,depth=0,quote='',escaped=false;
  const add=end=>{
    const declaration=source.slice(start,end);const colon=declaration.indexOf(':');
    if(colon<0)return;
    const property=declaration.slice(0,colon).trim();
    if(!property)return;
    const name=property.startsWith('--')?property:property.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
    values[name]=declaration.slice(colon+1).trim().replace(/\s*!important\s*$/i,'');
  };
  for(let index=0;index<source.length;index++){
    const char=source[index];
    if(escaped){escaped=false;continue;}if(char==='\\'){escaped=true;continue;}
    if(quote){if(char===quote)quote='';continue;}
    if(char==='"'||char==="'"){quote=char;continue;}
    if(char==='(')depth++;else if(char===')')depth=Math.max(0,depth-1);
    else if(char===';'&&!depth){add(index);start=index+1;}
  }
  add(source.length);return values;
}

export function elementProps(node) {
  const props={};
  for(const [name,value] of Object.entries(node.attrs||{})){
    // Current source controllers attach native listeners during their boot
    // lifecycle. Do not evaluate attribute strings as JavaScript in React.
    if(name.startsWith('on'))continue;
    const target=names[name]||name;
    if(name==='style'){props.style=inlineStyle(value);continue;}
    if(booleans.has(name)){props[target]=true;continue;}
    props[target]=value;
  }
  if(node.tag==='input'){
    if('value'in props){props.defaultValue=props.value;delete props.value;}
    if('checked'in props){props.defaultChecked=props.checked;delete props.checked;}
  }
  if(node.tag==='textarea'){
    props.defaultValue=(node.children||[]).filter(x=>typeof x==='string').join('');
  }
  if(node.tag==='option')delete props.selected; // selection is supplied by its select.
  if(node.tag==='select'){
    const selected=[];
    const scan=children=>{for(const child of children||[]){if(typeof child==='string')continue;if(child.tag==='option'&&'selected'in(child.attrs||{}))selected.push(child.attrs.value??(child.children||[]).join(''));scan(child.children);}};
    scan(node.children);if(selected.length)props.defaultValue=props.multiple?selected:selected[0];
  }
  return props;
}

const hasClass=(node,name)=>typeof node==='object'&&node!==null&&(node.attrs?.class||'').split(/\s+/).includes(name);
const railClasses=['movieRail','dsRail','nfRail','nfTopTenRail','dsWelcomeRailTrack'];
const cardClasses=['movieCard','dsWelcomeCard','topTenCard','nfTopTenCard','nfTopTenItem'];
const isRail=node=>railClasses.some(name=>hasClass(node,name));
const isCard=node=>cardClasses.some(name=>hasClass(node,name));
function findRail(node){
  return (node.children||[]).find(child=>isRail(child)&&child.children?.filter(x=>typeof x!=='string').every(isCard));
}

export const PosterCard = memo(function PosterCard({node}) {
  return h(node.tag,elementProps(node),h(Nodes,{nodes:node.children}));
});

export function NativeElement({node}) {
  const props=elementProps(node);
  if(voids.has(node.tag)||node.tag==='textarea')return h(node.tag,props);
  if(node.tag==='script'||node.tag==='style')return h(node.tag,props,(node.children||[]).filter(child=>typeof child==='string').join(''));
  return h(node.tag,props,h(Nodes,{nodes:node.children}));
}

// HTMLTemplateElement stores children in a DocumentFragment, outside its own
// childNodes. A portal gives React the correct container and keeps the player
// blueprint inert until the existing party controller clones it.
export function PlayerTemplate({node}) {
  const [target,setTarget]=useState(null);
  const mount=useCallback(element=>{setTarget(element?.content||null);},[]);
  return h(Fragment,null,h('template',{...elementProps(node),ref:mount}),target?createPortal(h(Nodes,{nodes:node.children}),target):null);
}

export function MovieRailSection({node}) {
  const rail=findRail(node);
  const cards=rail.children.filter(isCard);
  const size=useSyncExternalStore(subscribeToRailSize,responsivePageSize,()=>MAX_VISIBLE_TITLES);
  const [offset,setOffset]=useState(0);
  const railRef=useRef(null),rangeRef=useRef(null),focusAfterPage=useRef(false);
  const start=Math.min(Math.floor(offset/size)*size,Math.max(0,Math.floor((cards.length-1)/size)*size));
  const end=Math.min(cards.length,start+size);
  useEffect(()=>{
    if(railRef.current)railRef.current.scrollLeft=0;
    window.syncLibraryButtons?.(railRef.current);
    window.syncWatchButtons?.();
    document.dispatchEvent(new CustomEvent('swifly:react-rail',{detail:{rail:railRef.current,start,end,total:cards.length}}));
    // Keep keyboard/controller focus usable when the last next button disables.
    if(focusAfterPage.current){
      const direction=focusAfterPage.current;focusAfterPage.current=false;
      const cards=railRef.current?.querySelectorAll(':scope > *');
      const card=direction<0?cards?.[cards.length-1]:cards?.[0];
      card?.querySelector('.posterWrap,.dsThumb,a,button')?.focus({preventScroll:true});
    }
  },[start,size,end,cards.length]);
  const move=(event,direction)=>{
    event.preventDefault();event.stopPropagation();
    focusAfterPage.current=event.detail===0?direction:false;
    setOffset(nextOffset(start,direction,cards.length,size));
  };
  const pager=h('div',{className:'dsRowControls svReactRailControls','data-sv-react-pager':'true',key:'pager'},
    h('span',{className:'svReactRailRange','data-sv-react-range':'true','aria-live':'polite',ref:rangeRef},`${start+1}–${end} of ${cards.length}`),
    h('button',{className:'dsRowBtn',type:'button','aria-label':'Previous titles',disabled:start===0,onClick:event=>move(event,-1)},'‹'),
    h('button',{className:'dsRowBtn',type:'button','aria-label':'Next titles',disabled:end===cards.length,onClick:event=>move(event,1)},'›'));
  let placed=false;
  function content(child,index){
    if(child===rail)return h(rail.tag,{...elementProps(rail),key:index,ref:railRef,'data-sv-react-rail':'true','data-sv-page-size':size,'aria-label':`Titles ${start+1} to ${end} of ${cards.length}`},railWindow(cards,start,size).map((card,i)=>h(PosterCard,{node:card,key:`${start+i}`})));
    if(typeof child==='string')return child;
    if(['svSectionActions','dsRowHead','dsWelcomeRailHead','sectionHead','nfRowTitle'].some(name=>hasClass(child,name))){
      placed=true;return h(child.tag,{...elementProps(child),key:index},h(Nodes,{nodes:child.children}),pager);
    }
    if(child.children?.some(n=>hasClass(n,'svSectionActions'))){
      return h(child.tag,{...elementProps(child),key:index},child.children.map(content));
    }
    return h(Element,{node:child,key:index});
  }
  const children=node.children.map(content);
  if(!placed)children.unshift(pager);
  return h(node.tag,{...elementProps(node),'data-sv-react-row':'true'},children);
}

export const Element = memo(function Element({node}) {
  if(typeof node==='string')return node;
  if(node.tag==='template')return h(PlayerTemplate,{node});
  if(node.tag==='section'&&findRail(node))return h(MovieRailSection,{node});
  if(isCard(node))return h(PosterCard,{node});
  return h(NativeElement,{node});
});

export function Nodes({nodes=[]}) {
  return h(Fragment,null,nodes.map((node,index)=>h(Element,{node,key:index})));
}

export function serializeBoot(model) {
  return JSON.stringify(model).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}

export function PageContent({model}) {
  return h(Fragment,null,h(Nodes,{nodes:model.nodes}),
    h('script',{id:'swifly-react-data',type:'application/json'},serializeBoot(model)),
    h('script',{type:'module',src:model.entry}));
}

import React, {createElement as h, Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react';
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

export const PosterCard = memo(function PosterCard({node,position}) {
  return h(node.tag,{...elementProps(node),...(position===undefined?{}:{'data-sv-rail-index':position})},h(Nodes,{nodes:node.children}));
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
  const native=size<MAX_VISIBLE_TITLES;
  const [offset,setOffset]=useState(0);
  const railRef=useRef(null),rangeRef=useRef(null),focusAfterPage=useRef(false),scrollTimer=useRef(0),pageMotion=useRef(null),previousStart=useRef(0),columnSize=useRef(0),previousNative=useRef(native),physicalIndex=useRef(null);
  const start=native?Math.min(offset,Math.max(0,cards.length-size)):Math.min(Math.floor(offset/size)*size,Math.max(0,Math.floor((cards.length-1)/size)*size));
  const end=Math.min(cards.length,start+size);
  const first=native?0:start;
  const last=native?cards.length:end;
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduceMotion')||document.documentElement.dataset.svTv==='true'||document.documentElement.dataset.svXbox==='true';
  const measureColumn=()=>{
    const rail=railRef.current;if(!rail?.clientWidth)return 0;
    const style=window.getComputedStyle(rail);
    return (rail.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)+16)/size;
  };
  useLayoutEffect(()=>{
    const rail=railRef.current;if(!rail)return;
    window.clearTimeout(scrollTimer.current);scrollTimer.current=0;
    const physical=previousNative.current?(physicalIndex.current??(columnSize.current>0?Math.round(rail.scrollLeft/columnSize.current):offset)):offset;
    const aligned=native?Math.max(0,Math.min(cards.length-size,physical)):Math.min(Math.floor(physical/size)*size,Math.max(0,Math.floor((cards.length-1)/size)*size));
    // Only a breakpoint change repositions the native track. Scroll updates
    // leave the stable native track and its poster nodes intact.
    columnSize.current=native?measureColumn():0;
    previousNative.current=native;
    physicalIndex.current=native?aligned:null;
    rail.scrollLeft=native?aligned*columnSize.current:0;
    if(aligned!==start)setOffset(aligned);
  },[size,native]);
  useLayoutEffect(()=>{
    if(!native||typeof window.ResizeObserver!=='function')return;
    let active=true;
    const observer=new window.ResizeObserver(entries=>{
      if(!active)return;
      const entry=entries[0];if(!entry)return;
      const content=entry.contentBoxSize?.[0]?.inlineSize??entry.contentRect.width;
      columnSize.current=(content+16)/size;
      const position=Math.max(0,Math.min(cards.length-size,Math.round(entry.target.scrollLeft/columnSize.current)));physicalIndex.current=position;setOffset(position);
    });
    observer.observe(railRef.current);return()=>{active=false;observer.disconnect();};
  },[native,size,cards.length]);
  useLayoutEffect(()=>{
    const rail=railRef.current,direction=Math.sign(start-previousStart.current);previousStart.current=start;
    pageMotion.current?.cancel();pageMotion.current=null;
    if(rail)delete rail.dataset.svRailMoving;
    if(!native&&direction&&!reduced()&&typeof rail?.animate==='function'){
      rail.dataset.svRailMoving='true';
      const animation=rail.animate([{transform:`translate3d(${direction*14}px,0,0)`},{transform:'translate3d(0,0,0)'}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});pageMotion.current=animation;
      const settle=()=>{if(pageMotion.current!==animation)return;pageMotion.current=null;delete rail.dataset.svRailMoving;};
      animation.finished?.then(settle,settle);
    }
  },[start,native]);
  useEffect(()=>()=>{window.clearTimeout(scrollTimer.current);pageMotion.current?.cancel();},[]);
  useEffect(()=>{
    window.syncLibraryButtons?.(railRef.current);
    window.syncWatchButtons?.(railRef.current);
    document.dispatchEvent(new CustomEvent('swifly:react-rail',{detail:{rail:railRef.current,start,end,total:cards.length}}));
  },[first,last,size,cards.length]);
  useEffect(()=>{
    // Keep keyboard/controller focus usable when the last next button disables.
    if(focusAfterPage.current&&focusAfterPage.current.target===start){
      const {direction}=focusAfterPage.current;focusAfterPage.current=false;
      const card=railRef.current?.querySelector(`[data-sv-rail-index="${direction<0?end-1:start}"]`);
      card?.querySelector('.posterWrap,.dsThumb,a,button')?.focus({preventScroll:true});
    }
  },[start,size,end,cards.length]);
  const settleRange=()=>{
    window.clearTimeout(scrollTimer.current);scrollTimer.current=0;
    const rail=railRef.current;if(!native||!rail)return;
    const slot=columnSize.current||measureColumn();columnSize.current=slot;
    if(slot>0){const position=Math.max(0,Math.min(cards.length-size,Math.round(rail.scrollLeft/slot)));physicalIndex.current=position;setOffset(position);}
  };
  const onScroll=()=>{
    if(!native)return;
    if(!columnSize.current)columnSize.current=measureColumn();
    if(columnSize.current>0)physicalIndex.current=Math.round(railRef.current.scrollLeft/columnSize.current);
    window.clearTimeout(scrollTimer.current);
    // React and glass setup stay out of an active touch gesture. Only the
    // small range/arrow state changes after native momentum has settled.
    scrollTimer.current=window.setTimeout(settleRange,160);
  };
  const move=(event,direction)=>{
    event.preventDefault();event.stopPropagation();
    const slot=native?(columnSize.current||measureColumn()):0;
    if(native)columnSize.current=slot;
    const current=native&&slot>0?Math.round(railRef.current.scrollLeft/slot):start;
    const target=native?Math.max(0,Math.min(cards.length-size,current+direction*size)):nextOffset(start,direction,cards.length,size);
    focusAfterPage.current=event.detail===0?{direction,target}:false;
    if(native){
      railRef.current?.scrollTo({left:target*slot,behavior:reduced()?'instant':'smooth'});
    }else setOffset(target);
  };
  const pager=h('div',{className:'dsRowControls svReactRailControls','data-sv-react-pager':'true',key:'pager'},
    h('span',{className:'svReactRailRange','data-sv-react-range':'true','aria-live':'polite',ref:rangeRef},`${start+1}–${end} of ${cards.length}`),
    h('button',{className:'dsRowBtn',type:'button','aria-label':'Previous titles',disabled:start===0,onClick:event=>move(event,-1)},'‹'),
    h('button',{className:'dsRowBtn',type:'button','aria-label':'Next titles',disabled:end===cards.length,onClick:event=>move(event,1)},'›'));
  let placed=false;
  function content(child,index){
    if(child===rail){
      return h(rail.tag,{...elementProps(rail),key:index,ref:railRef,onScroll,onScrollEnd:settleRange,'data-sv-react-rail':'true','data-sv-native-rail':native?'true':undefined,'data-sv-page-size':size,'aria-label':`Titles ${start+1} to ${end} of ${cards.length}`},
        railWindow(cards,first,last-first).map((card,i)=>h(PosterCard,{node:card,position:first+i,key:`${first+i}`})));
    }
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

'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {parse,serialize,serializeOuter}=require('parse5');
const React=require('react');
const {renderToString}=require('react-dom/server');
const renderer=import('../frontend/document.mjs');
const executable=node=>{
  const type=node.attrs?.find(a=>a.name==='type')?.value||'';
  return node.tagName==='script'&&(!type||/^(?:text|application)\/(?:java|ecma)script$/i.test(type)||type==='module');
};
const attrs=node=>Object.fromEntries((node.attrs||[]).map(a=>[a.prefix?`${a.prefix}:${a.name}`:a.name,a.value]));

function compileDocument(html){
  const doc=parse(html),root=doc.childNodes.find(n=>n.tagName==='html');
  const head=root.childNodes.find(n=>n.tagName==='head'),body=root.childNodes.find(n=>n.tagName==='body');
  const immediate=[],deferred=[];
  const descriptor=node=>({attrs:attrs(node),src:attrs(node).src||'',code:(node.childNodes||[]).map(n=>n.value||'').join('')});
  const headNodes=[];
  for(const child of head.childNodes){
    if(executable(child)){
      const attributes=attrs(child);
      if('defer'in attributes||attributes.type==='module'){deferred.push(descriptor(child));continue;}
    }
    headNodes.push(serializeOuter(child));
  }
  const convert=node=>{
    if(node.nodeName==='#text')return node.value;
    if(!node.tagName)return null;
    if(executable(node)&&!node.attrs.some(attribute=>attribute.name==='data-sv-studio-prime')){
      const script=descriptor(node);
      if('defer'in script.attrs||script.attrs.type==='module')deferred.push(script);else immediate.push(script);
      return null;
    }
    return {tag:node.tagName,attrs:attrs(node),children:(node.content?.childNodes||node.childNodes||[]).map(convert).filter(n=>n!==null)};
  };
  return {version:173,htmlAttrs:attrs(root),bodyAttrs:attrs(body),head:headNodes.join(''),nodes:body.childNodes.map(convert).filter(n=>n!==null),scripts:[...immediate,...deferred]};
}

const attributeText=values=>Object.entries(values).map(([key,value])=>` ${key}="${String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}"`).join('');

async function renderDocument(model,{entry,css=[]}){
  const {PageContent}=await renderer;
  // Head code runs in its original parser phase, outside React's body root.
  // The full original CSS cascade is preserved, with only rail geometry added.
  const boot={version:model.version,nodes:model.nodes,scripts:model.scripts,entry};
  const body=renderToString(React.createElement(PageContent,{model:boot}));
  return '<!doctype html><html'+attributeText(model.htmlAttrs)+'><head>'+model.head+
    '<meta name="swifly-renderer" content="react-vite-v173">'+css.map(href=>'<link rel="stylesheet" href="'+href+'">').join('')+
    '</head><body'+attributeText(model.bodyAttrs)+'>'+body+'</body></html>';
}

function install(app){
  const output=path.join(__dirname,'../dist');
  const manifestFile=path.join(output,'.vite/manifest.json');
  let manifest,manifestTime=0;
  function assets(){
    const mtime=fs.statSync(manifestFile).mtimeMs;
    if(!manifest||mtime!==manifestTime){
      const value=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
      manifest=Object.values(value).find(item=>item.isEntry);
      if(!manifest)throw new Error('Vite manifest has no entry. Run npm run build.');
      manifestTime=mtime;
    }
    return {entry:'/'+manifest.file,css:(manifest.css||[]).map(file=>'/'+file)};
  }
  app.use('/react-assets',require('express').static(path.join(output,'react-assets'),{maxAge:'1y',immutable:true,index:false}));
  app.use((req,res,next)=>{
    if(process.env.SWIFLY_REACT!=='true'||req.method==='HEAD'||/^\/(?:api|assets|react-assets|socket\.io)(?:\/|$)/.test(req.path))return next();
    const send=res.send;
    res.send=function(value){
      if(typeof value!=='string'||!/^\s*<!doctype html/i.test(value))return send.call(this,value);
      // Keep all original route status codes, cookies, redirects and API paths.
      renderDocument(compileDocument(value),assets()).then(result=>{
        res.removeHeader('Content-Length');res.set('X-Swifly-Renderer','React-Vite-173');send.call(res,result);
      }).catch(error=>{console.error('[react-render]',error.message);if(!res.headersSent)res.status(500).type('text/plain').end('React build could not be rendered. See the launcher window.');});
      return this;
    };
    next();
  });
}
module.exports={compileDocument,renderDocument,install};

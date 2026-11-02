'use strict';
const {readShellStyle}=require('../lib/shell-styles');
// Expand the delivered bundles so integration assertions still verify which
// component styles are present and where they sit in the actual cascade.
function entries(document){
 return [...document.querySelectorAll('link[rel="stylesheet"]')].flatMap(link=>{
  const pathname=new URL(link.getAttribute('href'),'https://swifly.test').pathname;
  const css=readShellStyle(pathname);
  return css===undefined?[{pathname,link}]:[...css.matchAll(/^\/\* ([\w./-]+\.css) \*\/$/gm)].map(match=>({pathname:'/assets/'+match[1],link}));
 });
}
const stylesheetLink=(document,pathname)=>entries(document).find(entry=>entry.pathname===pathname)?.link;
const stylesheetPaths=document=>entries(document).map(entry=>entry.pathname);
module.exports={stylesheetLink,stylesheetPaths,readShellStyle};

'use strict';
const {normalize}=require('./recommendation-query');
const key=value=>normalize(value).replace(/\s/g,'');
const names=row=>[row.title,...(row.aliases||[])].map(key).filter(Boolean);
function matchesTitle(row,value){return !!key(value)&&names(row).includes(key(value));}
function distance(a,b){
 const table=Array.from({length:a.length+1},(_,i)=>[i]);for(let j=0;j<=b.length;j++)table[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  table[i][j]=Math.min(table[i-1][j]+1,table[i][j-1]+1,table[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])table[i][j]=Math.min(table[i][j],table[i-2][j-2]+1);
 }return table[a.length][b.length];
}
function closestTitle(rows,value){
 const target=key(value);if(target.length<5||target.length>100)return null;
 const distinct=new Map();
 for(const row of rows){let score=0;for(const name of names(row)){const edits=distance(target,name),length=Math.max(target.length,name.length);if(edits<=Math.min(3,Math.max(1,Math.floor(length*.2))))score=Math.max(score,1-edits/length);}if(score>=.78){const old=distinct.get(key(row.title));if(!old||score>old.score)distinct.set(key(row.title),{row,score});}}
 const ranked=[...distinct.values()].sort((a,b)=>b.score-a.score);return ranked[0]&&(!ranked[1]||ranked[0].score-ranked[1].score>=.06)?ranked[0].row:null;
}
module.exports={matchesTitle,closestTitle};

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
function closestTitles(rows,value){
 const target=key(value);if(target.length<5||target.length>100)return [];
 const distinct=new Map();
 for(const row of rows){let score=0;for(const name of names(row)){const edits=distance(target,name),length=Math.max(target.length,name.length);if(edits<=Math.min(3,Math.max(1,Math.floor(length*.2))))score=Math.max(score,1-edits/length);}if(score>=.78){const votes=Math.max(0,Number(row.votes)||0),rank=score+Math.min(.14,Math.log10(1+votes)/35),old=distinct.get(key(row.title));if(!old||rank>old.rank)distinct.set(key(row.title),{row,score,rank});}}
 const ranked=[...distinct.values()].sort((a,b)=>b.rank-a.rank||b.score-a.score),best=Math.max(0,...ranked.map(r=>r.score));
 return ranked.filter(r=>r.score>=best-.12).slice(0,3).map(r=>r.row);
}
const closestTitle=(rows,value)=>closestTitles(rows,value)[0]||null;
module.exports={matchesTitle,closestTitle,closestTitles};

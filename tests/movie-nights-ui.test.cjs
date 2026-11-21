'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
test('screening page uses real ballot totals, escaped chat, and a clear scheduled state',()=>{
 let render;try{render=require('../ui/movie-nights').movieNightsMarkup;}catch{}assert.equal(typeof render,'function');
 const snapshot={event:{id:'2026-11-21',title:'Saturday Movie Night',startsAt:1795309200000,votingClosesAt:1795308900000,phase:'voting',candidates:[{id:1,title:'A real film',poster:'https://image.tmdb.org/t/p/w342/test.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/test.jpg',votes:2,runtime:100}],totalVotes:2,viewers:0,messages:[{id:'m1',name:'<Owner>',text:'<img onerror=alert(1)>',createdAt:1795309000000}]},upcoming:[],viewer:{signedIn:false},serverTime:1795300000000,schedule:{timeZone:'America/New_York',hour:20,days:[5,6]}};
 const d=new JSDOM(render({snapshot})).window.document;assert.equal(d.querySelectorAll('[data-night-vote]').length,1);assert.match(d.querySelector('[data-night-total-votes]').textContent,/2/);assert.equal(d.querySelector('[data-night-viewers]').textContent,'0 here');assert.match(d.querySelector('[data-night-phase]').textContent,/Voting open/);assert.equal(d.querySelector('[data-night-message-list] img'),null);assert(d.querySelector('[data-night-message-list]').textContent.includes('<img onerror=alert(1)>'));assert(d.querySelector('[data-night-signin]'));assert.equal(d.querySelectorAll('video').length,0,'no unselected movie starts');
});
test('storage failure remains a usable page with a retry and no invented movie',()=>{
 const {movieNightsMarkup}=require('../ui/movie-nights'),d=new JSDOM(movieNightsMarkup({snapshot:{event:null,upcoming:[],code:'storage_unavailable',message:'Try again shortly.'}})).window.document;
 assert.match(d.querySelector('[data-night-status]').textContent,/Try again shortly/);assert(d.querySelector('[data-night-refresh]'));assert.equal(d.querySelectorAll('[data-night-vote],video').length,0);assert.match(d.querySelector('h1').textContent,/Movie Nights/);
});

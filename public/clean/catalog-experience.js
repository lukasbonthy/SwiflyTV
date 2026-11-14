/* Small progressive enhancements; forms and page navigation remain native. */
(() => {
 'use strict';
 const root=document.querySelector('.svLanguagePage'),input=root?.querySelector('[data-language-search]');
 if(!input)return;
 const cards=[...root.querySelectorAll('[data-language-name]')],count=root.querySelector('[data-language-count]'),empty=root.querySelector('[data-language-empty]');
 const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
 function filter(){const query=normalize(input.value);let visible=0;for(const card of cards){const match=!query||normalize(card.dataset.languageName).includes(query);card.hidden=!match;if(match)visible++;}if(empty)empty.hidden=visible>0;if(count)count.textContent=visible+' '+(visible===1?'language':'languages')+(query?' found':' to explore');}
 input.addEventListener('input',filter);filter();
})();

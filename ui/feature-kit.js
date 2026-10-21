'use strict';
const {icon}=require('../public/connect/icons');
function featureNav(active,{discovery=false}={}){
 const items=discovery?[['search','Titles','search'],['recommendations','AI Search','spark'],['audiobooks','Audiobooks','headphones']]:[['friends','Friends','people'],['recommendations','AI Search','spark'],['audiobooks','Audiobooks','headphones']];
 return '<nav class="svFeatureNav" aria-label="'+(discovery?'Discovery categories':'Explore more of SwiflyTV')+'">'+items.map(([key,label,glyph])=>`<a href="/${key}"${active===key?' aria-current="page"':''}>${icon(glyph)}<span>${label}</span></a>`).join('')+'</nav>';
}
module.exports={icon,featureNav};

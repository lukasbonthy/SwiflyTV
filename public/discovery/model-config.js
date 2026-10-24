/* One identity shared by preparation, topic generation, evaluation and workers. */
(() => {
 'use strict';
 const config=Object.freeze({
  id:'Xenova/bge-small-en-v1.5',revision:'ea104dacec62c0de699686887e3f920caeb4f3e3',dtype:'q8',pooling:'cls',dimensions:384,
  queryPrefix:'Represent this sentence for searching relevant passages: ',assetVersion:'v2',topicsHash:'20a4c1deb955a2d6',
  license:'MIT',source:'https://huggingface.co/BAAI/bge-small-en-v1.5',
  weightsSha256:'6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4',
  calibration:Object.freeze({minimum:.55,lexicalMinimum:.48,window:.15}),
  planning:Object.freeze({minimum:.54,window:.075,limit:2})
 });
 if(typeof module!=='undefined'&&module.exports)module.exports=config;else globalThis.SwiflyModelConfig=config;
})();

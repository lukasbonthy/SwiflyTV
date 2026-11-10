'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

test('Render binds its assigned port on every interface and defaults to React',()=>{
  const {runtimeConfig}=require('../../scripts/runtime-config.cjs');
  assert.deepEqual(runtimeConfig({RENDER:'true',PORT:'10000',NODE_ENV:'production'}),{react:true,production:true,host:'0.0.0.0',port:'10000'});
});

test('the original renderer can be selected without changing branches or private data',()=>{
  const {runtimeConfig}=require('../../scripts/runtime-config.cjs');
  assert.deepEqual(runtimeConfig({RENDER:'true',SWIFLY_REACT:'false',PORT:'10000'}),{react:false,production:true,host:'0.0.0.0',port:'10000'});
});

test('local launch remains local and explicit host/port choices are honored',()=>{
  const {runtimeConfig}=require('../../scripts/runtime-config.cjs');
  assert.deepEqual(runtimeConfig({}),{react:true,production:false,host:'127.0.0.1',port:'4173'});
  assert.deepEqual(runtimeConfig({HOST:'0.0.0.0',PORT:'8190',SWIFLY_REACT:'true'}),{react:true,production:false,host:'0.0.0.0',port:'8190'});
});

test('original startup remains usable when the React adapter itself cannot load',()=>{
  const {spawnSync}=require('node:child_process');
  const path=require('node:path');
  const script=`
    const Module=require('node:module');
    const load=Module._load;
    Module._load=function(id,...args){
      if(id.includes('react-document.cjs'))throw new Error('React adapter unavailable');
      return load.call(this,id,...args);
    };
    require('node:http').Server.prototype.listen=function(){return this;};
    require('./scripts/start-original.cjs');
    console.log('ORIGINAL_STARTED');
    process.exit(0);
  `;
  const output=spawnSync(process.execPath,['-e',script],{
    cwd:path.resolve(__dirname,'../..'),encoding:'utf8',timeout:10000,
    env:{...process.env,SWIFLY_REACT:'true',SWIFLY_NO_ENV_MODE:'false',DATABASE_URL:'',RENDER:'true'},
  });
  assert.equal(output.status,0,output.stderr);
  assert.match(output.stdout,/ORIGINAL_STARTED/);
});

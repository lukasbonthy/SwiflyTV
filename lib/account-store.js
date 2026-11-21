'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const empty=()=>({version:1,users:{},sessions:{},friends:[],requests:[],blocks:[],messages:[],notifications:[],homes:{},invites:{}});
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const nonempty=value=>typeof value==='string'&&value.length>0;
function validateAccountState(value,complete=false){
 const state=typeof value==='string'?JSON.parse(value):value;
 const valid=state?.version===1&&record(state.users);
 const completeCore=valid&&['sessions','homes','invites'].every(key=>record(state[key]))&&
  ['friends','requests','blocks','messages','notifications'].every(key=>Array.isArray(state[key]))&&
  Object.entries(state.users).every(([id,user])=>record(user)&&user.id===id&&
   ['name','handle','email','password'].every(key=>nonempty(user[key])))&&
  Object.values(state.sessions).every(session=>record(session)&&nonempty(session.userId)&&Number.isFinite(session.expiresAt));
 if(!valid||(complete&&!completeCore)){
  throw Object.assign(new Error('Unsupported or incomplete account state.'),{code:'invalid_account_state'});
 }
 return state;
}

async function ensureDataDirectory(directory,{requireMount=false}={}){
 if(!requireMount){
  await fs.mkdir(directory,{recursive:true,mode:0o700});
  return;
 }
 const resolved=await fs.realpath(directory);
 const mountInfo=await fs.readFile('/proc/self/mountinfo','utf8');
 const mounts=mountInfo.split('\n').flatMap(line=>{
  const [options, type]=line.split(' - ');
  const target=options.split(' ')[4]?.replace(/\\([0-7]{3})/g,(_,octal)=>String.fromCharCode(parseInt(octal,8)));
  if(!target||target==='/'||(resolved!==target&&!resolved.startsWith(target+'/')))return [];
  return [{target,type:type?.split(' ')[0]}];
 });
 const mount=mounts.sort((a,b)=>b.target.length-a.target.length)[0];
 if(!mount?.type||['overlay','tmpfs','ramfs','devtmpfs'].includes(mount.type)){
  throw Object.assign(new Error('Account storage requires a mounted persistent disk.'),{status:503,code:'persistent_disk_required'});
 }
}

async function writeAccountFile(filename,state,{createOnly=false}={}){
 const temporary=filename+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
 const handle=await fs.open(temporary,'wx',0o600);
 try{
  try{
   await handle.writeFile(JSON.stringify(state),'utf8');
   await handle.sync();
  }finally{
   await handle.close();
  }
  // A hard link installs an import atomically without replacing an existing store.
  if(createOnly)await fs.link(temporary,filename);
  else await fs.rename(temporary,filename);
 }finally{
  await fs.unlink(temporary).catch(()=>{});
 }
}

async function syncDataDirectory(directory){
 if(process.platform==='win32')return;
 const handle=await fs.open(directory,'r');
 try{await handle.sync();}finally{await handle.close();}
}

async function installAccountSnapshot(directory,value){
 const state=validateAccountState(value,true);
 await ensureDataDirectory(directory,{requireMount:Boolean(process.env.RENDER)});
 await writeAccountFile(path.join(directory,'accounts.json'),state,{createOnly:true});
 await syncDataDirectory(directory);
 return Object.keys(state.users).length;
}

function unavailable(){return Object.assign(new Error('Accounts are being set up. Please try again once persistent storage is connected.'),{status:503,code:'storage_setup_required'});}
function createAccountStore(options={}){
 const localOnly=(options.backend??process.env.SWIFLY_ACCOUNT_STORE)==='file';
 const hostedCutover=localOnly&&Boolean(process.env.RENDER);
 const readOnly=options.readOnly??process.env.SWIFLY_ACCOUNT_STORE_READ_ONLY==='true';
 const connectionString=localOnly?'':options.connectionString??process.env.DATABASE_URL;
 const configuredDirectory=options.directory??process.env.SWIFLY_DATA_DIR;
 const directory=configuredDirectory??path.join(process.cwd(),'.swifly-data');
 const available=options.available??Boolean(connectionString||configuredDirectory||!process.env.RENDER);
 let pool,state,queue=Promise.resolve();
 let initialization;
 let retryInitializationAt=0;
 const filename=path.join(directory,'accounts.json');
 if(available&&connectionString){
  const {Pool}=require('pg');
  pool=new Pool({connectionString,max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:30000,
    ...(process.env.SWIFLY_DB_SSL==='true'?{ssl:{rejectUnauthorized:true}}:{})});
  // pg removes disconnected idle clients. Active requests handle their own failures.
  pool.on('error',()=>{});
 }
 async function initialize(){
  if(pool){
   if(readOnly){
    await pool.query('SELECT 1 FROM swifly_account_state WHERE id=1');
    return;
   }
   await pool.query('CREATE TABLE IF NOT EXISTS swifly_account_state (id integer PRIMARY KEY CHECK (id=1), data jsonb NOT NULL)');
   await pool.query('INSERT INTO swifly_account_state (id,data) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(empty())]);
  }else{
   await ensureDataDirectory(directory,{requireMount:hostedCutover});
   try{state=validateAccountState(await fs.readFile(filename,'utf8'),hostedCutover);}
   catch(error){
    if(error.code!=='ENOENT')throw error;
    if(hostedCutover){
     throw Object.assign(new Error('Import the existing account state before activating local storage.'),{status:503,code:'account_snapshot_required'});
    }
    state=empty();
   }
  }
 }
 function ensureInitialized(){
  if(initialization)return initialization;
  if(Date.now()<retryInitializationAt){
   return Promise.reject(Object.assign(new Error('Accounts are temporarily unavailable. Try again shortly.'),{status:503,code:'storage_unavailable'}));
  }
  const attempt=initialization=initialize();
  // A provider outage at boot must not require a deploy after the database recovers.
  // File errors stay failed so corrupt persistent files never become empty accounts.
  if(pool)attempt.catch(()=>{
   retryInitializationAt=Date.now()+30000;
   initialization=undefined;
  });
  return attempt;
 }
 const ready=available?ensureInitialized():Promise.resolve();
 // Keep startup failures contained to the account API; catalog playback can run.
 ready.catch(()=>{});
 async function ensure(){if(!available)throw unavailable();await ensureInitialized();}
 async function read(){await ensure();if(pool)return (await pool.query('SELECT data FROM swifly_account_state WHERE id=1')).rows[0].data;await queue;return structuredClone(state);}
 function transaction(fn){
  if(readOnly){
   return Promise.reject(Object.assign(new Error('Account updates are paused for storage migration.'),{status:503,code:'account_store_read_only'}));
  }
  const job=queue.then(async()=>{
   await ensure();
   if(pool){
    const client=await pool.connect();
    try{await client.query('BEGIN');const next=(await client.query('SELECT data FROM swifly_account_state WHERE id=1 FOR UPDATE')).rows[0].data;
     const result=await fn(next);await client.query('UPDATE swifly_account_state SET data=$1::jsonb WHERE id=1',[JSON.stringify(next)]);await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
   }
   const next=structuredClone(state),result=await fn(next);
   await writeAccountFile(filename,next);
   state=next;
   await syncDataDirectory(directory);
   return result;
  });
  queue=job.catch(()=>{});return job;
 }
 return {read,transaction,ready,available,readOnly,backend:connectionString?'postgres':'file',async close(){await queue;await initialization?.catch(()=>{});await pool?.end();}};
}
module.exports={createAccountStore,installAccountSnapshot};

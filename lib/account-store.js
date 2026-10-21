'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const empty=()=>({version:1,users:{},sessions:{},friends:[],requests:[],blocks:[],messages:[],notifications:[],homes:{},invites:{}});
function unavailable(){return Object.assign(new Error('Accounts are being set up. Please try again once persistent storage is connected.'),{status:503,code:'storage_setup_required'});}
function createAccountStore(options={}){
 const connectionString=options.connectionString??process.env.DATABASE_URL;
 const directory=options.directory??process.env.SWIFLY_DATA_DIR??path.join(process.cwd(),'.swifly-data');
 const available=options.available??Boolean(connectionString||options.directory||process.env.SWIFLY_DATA_DIR||!process.env.RENDER);
 let pool,state,queue=Promise.resolve();
 const filename=path.join(directory,'accounts.json');
 const ready=(async()=>{
  if(!available)return;
  if(connectionString){
   const {Pool}=require('pg');
   pool=new Pool({connectionString,max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:30000,
    ...(process.env.SWIFLY_DB_SSL==='true'?{ssl:{rejectUnauthorized:true}}:{})});
   await pool.query('CREATE TABLE IF NOT EXISTS swifly_account_state (id integer PRIMARY KEY CHECK (id=1), data jsonb NOT NULL)');
   await pool.query('INSERT INTO swifly_account_state (id,data) VALUES (1,$1::jsonb) ON CONFLICT (id) DO NOTHING',[JSON.stringify(empty())]);
  }else{
   await fs.mkdir(directory,{recursive:true,mode:0o700});
   try{state=JSON.parse(await fs.readFile(filename,'utf8'));if(state.version!==1||!state.users)throw Error('Unsupported account data.');}
   catch(error){if(error.code!=='ENOENT')throw error;state=empty();}
  }
 })();
 // Keep startup failures contained to the account API; catalog playback can run.
 ready.catch(()=>{});
 async function ensure(){if(!available)throw unavailable();await ready;}
 async function read(){await ensure();if(pool)return (await pool.query('SELECT data FROM swifly_account_state WHERE id=1')).rows[0].data;await queue;return structuredClone(state);}
 function transaction(fn){
  const job=queue.then(async()=>{
   await ensure();
   if(pool){
    const client=await pool.connect();
    try{await client.query('BEGIN');const next=(await client.query('SELECT data FROM swifly_account_state WHERE id=1 FOR UPDATE')).rows[0].data;
     const result=await fn(next);await client.query('UPDATE swifly_account_state SET data=$1::jsonb WHERE id=1',[JSON.stringify(next)]);await client.query('COMMIT');return result;
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
   }
   const next=structuredClone(state),result=await fn(next);
   const temporary=filename+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
   try{await fs.writeFile(temporary,JSON.stringify(next),{mode:0o600,flag:'wx'});await fs.rename(temporary,filename);}
   catch(error){await fs.unlink(temporary).catch(()=>{});throw error;}
   state=next;return result;
  });
  queue=job.catch(()=>{});return job;
 }
 return {read,transaction,ready,available,backend:connectionString?'postgres':'file',async close(){await queue;await ready.catch(()=>{});await pool?.end();}};
}
module.exports={createAccountStore};

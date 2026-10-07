import http from 'node:http'; import fs from 'node:fs'; import { spawn, execSync } from 'node:child_process';
const T='/tmp/ip2verify'; fs.rmSync(T,{recursive:true,force:true}); fs.mkdirSync(T+'/web',{recursive:true});
const env={...process.env,APP_SECRET:'segredo-de-teste-1234567890',DATA_DIR:T+'/data',PORT:'3998',PUBLIC_BASE_URL:'http://localhost:3998',WEB_DIR:T+'/web',TIKTOK_API_BASE:'http://localhost:4401'};
let statusCalls=0;
const mock=http.createServer((req,res)=>{ req.resume(); req.on('end',()=>{ const j=(o)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(o));};
  if(req.url.startsWith('/v2/post/publish/inbox')) return j({data:{publish_id:'p1',upload_url:'http://localhost:4401/up'},error:{code:'ok'}});
  if(req.url.startsWith('/up')){res.writeHead(200);return res.end();}
  if(req.url.startsWith('/v2/post/publish/status')){statusCalls++;return j({data:{status:'SEND_TO_USER_INBOX'}});} j({}); });}).listen(4401);
const srv=spawn('node',['server/dist/index.js'],{env,stdio:'ignore'}); const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); await sleep(1500);
const call=async(m,p,{json,form,cookie}={})=>{const h={};if(cookie)h.cookie=cookie;if(json)h['content-type']='application/json';const r=await fetch('http://localhost:3998'+p,{method:m,headers:h,body:json?JSON.stringify(json):form});const sc=r.headers.get('set-cookie');return{data:await r.json().catch(()=>({})),cookie:sc?sc.split(';')[0]:null};};
const r1=await call('POST','/api/setup',{json:{name:'I',email:'i@x.com',password:'senhaforte1'}}); const ck=r1.cookie;
const a=await call('POST','/api/artists',{cookie:ck,json:{name:'A'}});
execSync(`node -e "require('./server/dist/channels.js').saveChannel({artistId:${a.data.id},platform:'tiktok',externalId:'1',accessToken:'t',refreshToken:'r',expiresAt:Date.now()+36e5,refreshExpiresAt:Date.now()+9e9})"`,{env});
const f=new FormData(); f.append('artistId',a.data.id); f.append('deliveries','[{"platform":"tiktok","mode":"draft"}]'); f.append('video',new Blob([Buffer.alloc(1000,1)],{type:'video/mp4'}),'v.mp4');
await call('POST','/api/posts',{cookie:ck,form:f});
await sleep(60000);
const v=JSON.parse(execSync(`node -e "const D=require('./server/node_modules/better-sqlite3');console.log(JSON.stringify(new D('${T}/data/publisher.db').prepare('SELECT status,verified FROM deliveries').all()))"`,{env}).toString());
console.log(v[0].status==='awaiting_finalize'&&v[0].verified===1&&statusCalls>=1?'OK   verificacao da caixa de entrada marcou o rascunho como confirmado':'FALHA verificacao '+JSON.stringify(v)+' chamadas='+statusCalls);
srv.kill();mock.close();process.exit(0);

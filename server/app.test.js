import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from './app.js';
const origin='http://localhost:5173';
async function start(path=':memory:'){const app=createApp({dbPath:path,origin});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));app.url=`http://127.0.0.1:${app.server.address().port}`;return app}
async function client(app,name){const c={cookie:'',csrf:'',name};c.call=async(path,data,headers={})=>{const r=await fetch(app.url+'/api'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:c.cookie,'X-CSRF-Token':c.csrf,...headers},body:data===undefined?undefined:JSON.stringify(data)});const body=await r.json();if(r.headers.get('set-cookie'))c.cookie=r.headers.get('set-cookie').split(';')[0];if(body.csrf)c.csrf=body.csrf;return {status:r.status,body}};if(name){const r=await c.call('/register',{email:name+'@example.test',name,password:'secure-test-password-123',kind:'adult',agreed:true,verified:true,role:'admin'});assert.equal(r.status,200);assert.equal(r.body.account.verified,false);assert.equal(r.body.account.role,'member')}return c}
const when=()=>new Date(Date.now()+10*86400000).toISOString().slice(0,10)+'T10:00:00+09:00';
const event=()=>({title:'美術館',description:'公共の施設でアートを楽しむ',category:'アート',area:'上野',duration:'2時間',cost:'各自500円',dates:[when()],deadline:new Date(Date.now()+5*86400000).toISOString(),max:3,agreed:true});
test('認証、権限、承認、プライバシー、開催確定、SQLite再起動保持',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'kikkake-test-'));const path=join(dir,'test.sqlite');let app=await start(path);t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true})});
 const host=await client(app,'主催'),a=await client(app,'参加者A'),b=await client(app,'参加者B'),outsider=await client(app,'外部'),anon=await client(app);
 assert.equal((await host.call('/events',event())).status,403);
 app.db.prepare('UPDATE users SET verified=1').run();
 assert.equal((await host.call('/events',event(),{'X-CSRF-Token':'bad'})).status,403);
 assert.equal((await host.call('/events',event(),{Origin:'https://evil.test'})).status,403);
 assert.equal((await host.call('/events',{...event(),max:11})).status,400);
 const created=await host.call('/events',event());assert.equal(created.status,200);const id=created.body.events[0].id;
 assert.equal((await anon.call(`/events/${id}/apply`,{answers:['参加できる'],agreed:true})).status,401);
 for(const c of [a,b]){assert.equal((await c.call(`/events/${id}/apply`,{answers:['参加できる'],agreed:true,reason:'非公開の応募理由'})).status,200)}
 assert.equal((await outsider.call(`/events/${id}/approve`,{name:a.name})).status,403);
 assert.equal((await a.call(`/events/${id}/message`,{text:'未承認です'})).status,403);
 assert.equal((await outsider.call('/state')).body.events[0].applicants.length,0);
 assert.equal((await a.call('/state')).body.events[0].applicants.length,1);
 for(const c of [a,b])assert.equal((await host.call(`/events/${id}/approve`,{name:c.name})).status,200);
 assert.equal((await outsider.call(`/events/${id}/apply`,{answers:['参加できる'],agreed:true})).status,400);
 assert.equal((await a.call(`/events/${id}/message`,{text:'参加者限定メッセージ'})).status,200);
 assert.equal((await outsider.call('/state')).body.events[0].messages.length,0);
 assert.equal((await host.call(`/events/${id}/advance`,{})).status,200);
 assert.equal((await host.call(`/events/${id}/schedule`,{when:when(),place:'集合場所の詳細',cost:'500円',duration:'2時間'})).status,200);
 assert.equal((await a.call('/state')).body.events[0].place,'');
 assert.equal((await host.call(`/events/${id}/advance`,{})).status,400);
 for(const c of [a,b])assert.equal((await c.call(`/events/${id}/confirm`,{})).status,200);
 assert.equal((await host.call(`/events/${id}/advance`,{})).status,200);
 assert.equal((await host.call(`/events/${id}/advance`,{})).status,403);
 app.db.prepare("UPDATE users SET role='admin' WHERE name=?").run(host.name);
 assert.equal((await host.call(`/events/${id}/advance`,{})).status,200);
 assert.equal((await a.call('/state')).body.events[0].place,'集合場所の詳細');
 assert.equal((await outsider.call('/state')).body.events[0].place,'');
 assert.equal((await anon.call('/state')).body.events[0].place,'');
 await app.close();app=await start(path);
 const login=await client(app);assert.equal((await login.call('/login',{email:'参加者A@example.test',password:'incorrect-password-123'})).status,401);
 const logged=await login.call('/login',{email:'参加者A@example.test',password:'secure-test-password-123'});assert.equal(logged.status,200);assert.equal(logged.body.events[0].messages[0].text,'参加者限定メッセージ');
 const stolen=login.cookie;assert.equal((await login.call('/logout',{})).status,200);login.cookie=stolen;assert.equal((await login.call('/state')).body.account,null);
});
test('SSEはログイン必須、変更通知だけを送信しチャット内容を漏らさない',async t=>{
 const app=await start();t.after(()=>app.close());const c=await client(app,'接続利用者');app.db.prepare('UPDATE users SET verified=1').run();
 assert.equal((await fetch(app.url+'/api/stream')).status,401);
 const controller=new AbortController();const response=await fetch(app.url+'/api/stream',{headers:{Cookie:c.cookie},signal:controller.signal});assert.equal(response.status,200);
 const reader=response.body.getReader();const first=new TextDecoder().decode((await reader.read()).value);assert.match(first,/event: changed/);
 const pending=reader.read();await c.call('/events',event());const next=await Promise.race([pending,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('SSE timeout')),2000);timer.unref()})]);assert.match(new TextDecoder().decode(next.value),/data: \{\}/);controller.abort();
});

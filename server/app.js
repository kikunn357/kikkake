import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {apply,approve,advance} from '../src/model.js';
const scrypt=promisify(scryptCallback);
const hash=s=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const text=(s,max=300)=>{if(typeof s!=='string'||!s.trim()||s.length>max)fail('入力内容を確認してください。');return s.trim()};
const optional=(s,max=300)=>s==null||s===''?'':text(s,max);
export function openDatabase(path){
 if(path!==':memory:')mkdirSync(dirname(resolve(path)),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT UNIQUE NOT NULL,password TEXT NOT NULL,salt TEXT NOT NULL,verified INTEGER NOT NULL DEFAULT 0,role TEXT NOT NULL DEFAULT 'member',kind TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),text TEXT NOT NULL,time TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor INTEGER NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,time TEXT NOT NULL);`);return db;
}
export function createApp({dbPath='data/kikkake.sqlite',origin='http://localhost:5173',secureCookies=false,dist='dist'}={}){
 const db=openDatabase(dbPath);const streams=new Set();const limits=new Map();
 const userView=u=>u?{id:u.id,name:u.name,verified:!!u.verified,role:u.role,kind:u.kind}:null;
 const snapshot=(u,csrf='')=>({account:userView(u),csrf,user:u?.name||'',notifications:u?db.prepare('SELECT text,time FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(u.id):[],events:db.prepare('SELECT data FROM events ORDER BY id DESC').all().map(r=>{const e=JSON.parse(r.data);const privileged=u&&(u.role==='admin'||e.host===u.name);const member=u?.verified&&e.members.includes(u.name);return {...e,applicants:privileged?e.applicants:e.applicants.filter(a=>a.name===u?.name),messages:member?e.messages:[],place:privileged||member&&e.status==='開催確定'?e.place:'',confirmed:privileged||member?e.confirmed:[]};})});
 function session(req){const match=(req.headers.cookie||'').match(/(?:^|;\s*)kikkake_session=([a-f0-9]{64})(?:;|$)/);if(!match)return null;return db.prepare('SELECT s.*,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').get(hash(match[1]),Date.now());}
 function limit(key,max){const now=Date.now();for(const [k,v]of limits)if(v.until<now)limits.delete(k);let l=limits.get(key);if(!l){l={count:0,until:now+60000};limits.set(key,l)}if(++l.count>max)fail('しばらく待ってから再試行してください。',429);}
 function notify(names,message){for(const name of new Set(names)){const u=db.prepare('SELECT id FROM users WHERE name=?').get(name);if(u)db.prepare('INSERT INTO notifications(user_id,text,time) VALUES(?,?,?)').run(u.id,message,new Date().toISOString());}}
 function broadcast(){for(const s of streams)s.res.write('event: changed\ndata: {}\n\n');}
 async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000)fail('入力が大きすぎます。',413)}try{return JSON.parse(raw||'{}')}catch{fail('JSON形式が不正です。')}}
 const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try{
 if(!url.pathname.startsWith('/api/')){
 if(req.method!=='GET'&&req.method!=='HEAD')fail('許可されていない操作です。',405);
 const base=resolve(dist);let file=resolve(base,'.'+decodeURIComponent(url.pathname));if(file!==base&&!file.startsWith(base+'/'))fail('見つかりません。',404);
 if(url.pathname==='/')file=resolve(base,'index.html');if(!existsSync(file))fail('見つかりません。',404);
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
 res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:readFileSync(file));return;
 }
 let s=session(req);
 if(req.method==='GET'&&url.pathname==='/api/health'){send({ok:true});return}
 if(req.method==='GET'&&url.pathname==='/api/state'){send(snapshot(s,s?.csrf));return}
 if(req.method==='GET'&&url.pathname==='/api/stream'){
 if(!s)fail('ログインしてください。',401);
 const active=[...streams].filter(x=>x.user===s.id);if(active.length>=5)fail('接続数が多すぎます。',429);
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'});res.write('event: changed\ndata: {}\n\n');
 const stream={res,user:s.id,session:s.token};streams.add(stream);const timer=setInterval(()=>{if(!db.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').get(stream.session,Date.now()))res.end();else res.write(': heartbeat\n\n')},15000);
 res.on('close',()=>{clearInterval(timer);streams.delete(stream)});return;
 }
 if(req.method!=='POST')fail('見つかりません。',404);
 if(req.headers.origin!==origin)fail('アクセス元を確認できません。',403);
 if(!req.headers['content-type']?.startsWith('application/json'))fail('JSONで送信してください。',415);
 limit('ip:'+req.socket.remoteAddress,120);const b=await body(req);
 if(url.pathname==='/api/register'||url.pathname==='/api/login'){
 const email=text(b.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('メールアドレスを確認してください。');limit('auth:'+email,10);limit('auth-ip:'+req.socket.remoteAddress,20);
 text(b.password,128);const password=b.password;if(password.length<12)fail('パスワードは12文字以上にしてください。');
 if(url.pathname==='/api/register'){
 const name=text(b.name,30);if(!['student','adult'].includes(b.kind)||b.agreed!==true)fail('利用区分・規約への同意を確認してください。');
 if(db.prepare('SELECT id FROM users WHERE email=? OR name=?').get(email,name))fail('このメールアドレスまたはニックネームは使用できません。',409);
 const salt=token();const derived=(await scrypt(password,salt,64)).toString('hex');
 try{db.prepare('INSERT INTO users(email,name,password,salt,kind) VALUES(?,?,?,?,?)').run(email,name,derived,salt,b.kind)}catch{fail('登録できませんでした。',409)}
 }else{
 const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);const check=await scrypt(password,u?.salt||'missing-user-salt',64);
 if(!u||!timingSafeEqual(check,Buffer.from(u.password,'hex')))fail('メールアドレスまたはパスワードが違います。',401);
 }
 if(s)db.prepare('DELETE FROM sessions WHERE token=?').run(s.token);
 const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);const secret=token(),csrf=token();db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(secret),u.id,csrf,Date.now()+7*86400000);
 res.setHeader('Set-Cookie',`kikkake_session=${secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookies?'; Secure':''}`);send(snapshot(u,csrf));return;
 }
 if(!s)fail('ログインしてください。',401);
 if(req.headers['x-csrf-token']!==s.csrf)fail('再ログインしてください。',403);
 if(url.pathname==='/api/logout'){db.prepare('DELETE FROM sessions WHERE token=?').run(s.token);for(const stream of streams)if(stream.session===s.token)stream.res.end();res.setHeader('Set-Cookie','kikkake_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');send({ok:true});return}
 if(!s.verified)fail('本人確認が完了するまで閲覧のみ利用できます。',403);
 db.exec('BEGIN IMMEDIATE');
 try{
 if(url.pathname==='/api/events'){
 const dates=b.dates;if(!Array.isArray(dates)||dates.length<1||dates.length>6)fail('候補日時を確認してください。');
 for(const d of dates){if(typeof d!=='string')fail('日時を確認してください。');const date=new Date(d),hour=Number(date.toLocaleString('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',hourCycle:'h23'}));if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now()||hour<7||hour>=22)fail('日時は未来の7〜22時で指定してください。');}
 const deadline=new Date(b.deadline).getTime();if(!Number.isFinite(deadline)||deadline<=Date.now()||deadline>=Math.min(...dates.map(d=>new Date(d).getTime())))fail('応募期限は開催前の未来の日時にしてください。');
 const max=Number(b.max);if(!Number.isInteger(max)||max<3||max>10)fail('人数は3〜10人です。');if(b.agreed!==true)fail('禁止事項への同意が必要です。');
 const e={title:text(b.title,100),description:text(b.description,2000),category:text(b.category,30),area:text(b.area,100),duration:text(b.duration,100),cost:text(b.cost,200),dates,deadline:new Date(deadline).toISOString(),max,host:s.name,members:[s.name],applicants:[],messages:[],confirmed:[],status:'募集中',place:'',art:'✳'};
 const result=db.prepare('INSERT INTO events(data) VALUES(?)').run(JSON.stringify(e));e.id=Number(result.lastInsertRowid);db.prepare('UPDATE events SET data=? WHERE id=?').run(JSON.stringify(e),e.id);notify([s.name],'新しい企画を投稿しました');
 }else{
 const match=url.pathname.match(/^\/api\/events\/(\d+)\/(apply|approve|cancel|advance|schedule|confirm|message)$/);if(!match)fail('見つかりません。',404);
 const row=db.prepare('SELECT data FROM events WHERE id=?').get(Number(match[1]));if(!row)fail('企画が見つかりません。',404);const e=JSON.parse(row.data),action=match[2];
 const host=e.host===s.name,admin=s.role==='admin',member=e.members.includes(s.name);
 if(['approve','schedule'].includes(action)&&!host)fail('投稿者だけが操作できます。',403);
 if(action==='advance'&&!(e.status==='運営確認中'?admin:host))fail('操作する権限がありません。',403);
 if(action==='apply'){
 if(Date.now()>new Date(e.deadline).getTime())fail('応募期限を過ぎています。');
 if(!Array.isArray(b.answers)||b.answers.length!==e.dates.length||!b.answers.every(a=>['参加できる','調整できれば参加できる','参加できない'].includes(a)))fail('候補日時に回答してください。');
 apply(e,s.name,b.answers,b.agreed===true);Object.assign(e.applicants.at(-1),{reason:optional(b.reason),message:optional(b.message)});notify([e.host,s.name],`${s.name}さんから参加申し込みがありました`);
 }
 if(action==='approve'){if(e.status!=='募集中')fail('募集は終了しています。');approve(e,text(b.name,30));notify([b.name],`${e.title}への参加が承認されました`)}
 if(action==='cancel'){if(member)fail('承認後の辞退は現在未対応です。');e.applicants=e.applicants.filter(a=>a.name!==s.name)}
 if(action==='advance'){advance(e);notify(e.members,`${e.title}：${e.status}`)}
 if(action==='schedule'){
 if(e.status!=='内容調整中')fail('現在は開催内容を変更できません。');const when=new Date(b.when);const hour=Number(when.toLocaleString('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',hourCycle:'h23'}));if(!Number.isFinite(when.getTime())||when.getTime()<=Date.now()+86400000||hour<7||hour>=22)fail('開催日時は24時間以上先の7〜22時にしてください。');
 Object.assign(e,{when:when.toISOString(),place:text(b.place,300),duration:text(b.duration,100),cost:text(b.cost,200),confirmed:[s.name]});advance(e);notify(e.members,'開催内容を確認してください');
 }
 if(action==='confirm'){if(!member||e.status!=='参加者確認待ち')fail('確認する権限がありません。',403);if(!e.confirmed.includes(s.name))e.confirmed.push(s.name)}
 if(action==='message'){if(!member)fail('承認された参加者だけがチャットを利用できます。',403);limit('message:'+s.id,30);e.messages.push({name:s.name,text:text(b.text,1000),time:new Date().toISOString()});if(e.messages.length>1000)fail('チャットの保存上限に達しました。');notify(e.members.filter(n=>n!==s.name),`${e.title}：新しいメッセージ`)}
 db.prepare('UPDATE events SET data=? WHERE id=?').run(JSON.stringify(e),e.id);
 }
 db.prepare('INSERT INTO audit(actor,action,target,time) VALUES(?,?,?,?)').run(s.id,url.pathname,String(b.name||''),new Date().toISOString());db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');if(!e.status)e.status=400;throw e}
 broadcast();send(snapshot(s,s.csrf));
 }catch(e){if(res.headersSent){res.end();return}send({error:e.status?e.message:'処理できませんでした。'},e.status||500)}
 });
 return {server,db,close:async()=>{for(const s of streams)s.res.end();await new Promise(r=>{server.close(r);server.closeIdleConnections()});db.close()}};
}

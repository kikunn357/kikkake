import {createApp} from './app.js';
const production=process.env.NODE_ENV==='production';
const origin=process.env.APP_ORIGIN||'http://localhost:5173';
if(production&&!origin.startsWith('https://'))throw Error('本番環境はHTTPSのAPP_ORIGINが必要です');
const app=createApp({dbPath:process.env.DB_PATH||'data/kikkake.sqlite',origin,secureCookies:production});
app.server.listen(Number(process.env.PORT||3001),'0.0.0.0',()=>console.log('Kikkake API ready'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0)});

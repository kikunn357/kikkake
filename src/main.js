import './style.css';
import {statuses} from './model.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>new Date(d).toLocaleString('ja-JP',{month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tokyo'});
let account=null,csrf='',connection=null,authMode='login';
let state={user:'',tutorial:localStorage.getItem('kikkake-tutorial')!=='done',notifications:[],events:[]};
let tab='ホーム',mode='参加する',selected=null,screen='list',filter='すべて',role='参加者',tutorialStep=0,application=null,toast='';
const save=()=>{if(!state.tutorial)localStorage.setItem('kikkake-tutorial','done')};
async function api(path,data){const response=await fetch('/api'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error||'通信に失敗しました');return result}
function receive(result){account=result.account;csrf=result.csrf;state={...state,...result};role=account?.role==='admin'?'運営':'参加者'}
async function refresh(){receive(await api('/state'));render()}
function connect(){connection?.close();connection=null;if(account){connection=new EventSource('/api/stream');connection.addEventListener('changed',async()=>{try{receive(await api('/state'));if(!document.querySelector('form')||tab==='チャット'&&!document.querySelector('.chat-form input:focus'))render()}catch{toast='接続を確認してください'}})}}
async function mutate(path,data={}){receive(await api(path,data));}
const button=(label,action,cls='primary')=>`<button class="${cls}" data-action="${action}">${label}</button>`;
const field=(name,label,type='text',value='',required=true)=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}></label>`;
function render(){
 const e=state.events.find(x=>x.id===selected);let body='';
 if(tab==='マイページ'&&!account){body=`<h1>${authMode==='login'?'ログイン':'会員登録'}</h1><p>アカウントでログインして、仲間と体験を共有しましょう。</p><form id="auth">${field('email','メールアドレス','email')}${field('password','パスワード（12文字以上）','password')}${authMode==='register'?`${field('name','ニックネーム（変更不可）')}<label>利用区分<select name="kind"><option value="student">18歳以上の大学生・大学院生</option><option value="adult">20歳以上の社会人</option></select></label><label class="check"><input name="agreed" type="checkbox" required>年齢条件とコミュニティールールに同意します</label><p class="hint">登録後は本人確認完了まで閲覧のみ利用できます。メール認証・規約整備は公開前に追加予定です。</p>`:''}<button class="primary">${authMode==='login'?'ログイン':'登録する'}</button></form>${button(authMode==='login'?'新しく登録する':'ログインへ戻る','auth-toggle','text')}`}
 else if(state.tutorial){const slides=[['小さな一歩を、一緒に。','東京でやってみたいことを、世代を越えた仲間と。'],['あなたの「やってみたい」が、きっかけに。','学生も社会人も、体験を探したり、企画を投稿したりできます。'],['安心して、出会える体験を。','3人以上で相談し、運営が開催内容を確認します。']];body=`<section class="welcome"><div class="welcome-art">✳</div><p class="eyebrow">${tutorialStep+1} / 3 · WELCOME TO KIKKAKE</p><h1>${slides[tutorialStep][0]}</h1><p>${slides[tutorialStep][1]}</p>${button(tutorialStep===2?'はじめる':'次へ','tutorial-next')}${button('スキップ','skip','text')}</section>`}
 else if(tab==='ホーム'&&screen==='list'){
 body=`<div class="segmented">${['参加する','投稿する'].map(m=>button(m,`mode:${m}`,m===mode?'active':'')).join('')}</div>`;
 if(mode==='参加する')body+=`<section class="hero"><p class="eyebrow">A LITTLE STEP, A NEW CONNECTION</p><h1>やってみたかったこと。<br>誰かとなら、きっと。</h1><p>好きな体験からはじまる、新しいつながり。</p><span class="hero-flower">✳</span></section><div class="section-title"><h2>次のきっかけを探す</h2><span>東京都内 · 3〜10人</span></div><div class="chips">${['すべて','アート','街歩き','ゲーム','その他'].map(f=>button(f,`filter:${f}`,filter===f?'chip active':'chip')).join('')}</div><div class="cards">${state.events.filter(e=>filter==='すべて'||e.category===filter).map((e,i)=>`<button class="card" data-action="detail:${e.id}"><div class="card-art color${i%3}" role="img" aria-label="${esc(e.category)}のイメージ"><span>${e.art||'✳'}</span><i></i></div><h3>${esc(e.title)} <span>↗</span></h3></button>`).join('')||'<p class="empty">このカテゴリーの企画はまだありません。</p>'}</div>`;
 else body+=`<section class="section-title"><div><p class="eyebrow">MAKE A KIKKAKE</p><h1>あなたの好きを、企画に。</h1></div>${button('＋ 企画を投稿する','new')}</section><p>小さな「やってみたい」から、はじめてみませんか。</p>${state.events.filter(e=>e.host===state.user).map(e=>`<button class="row" data-action="detail:${e.id}"><strong>${esc(e.title)}</strong><span>${e.status} →</span></button>`).join('')||'<p class="empty">投稿した企画はまだありません。</p>'}`;
 }
 else if(tab==='ホーム'&&screen==='new')body=`${button('← 戻る','back','text')}<h1>新しい企画をつくる</h1><form id="create">${field('title','企画タイトル')}<label>体験内容<textarea name="description" required maxlength="2000"></textarea></label><label>カテゴリー<select name="category">${['アート','街歩き','ゲーム','その他'].map(x=>`<option>${x}</option>`).join('')}</select></label>${field('area','開催エリア（東京都内）')}${field('when','第一希望日時（日本時間）','datetime-local')}${field('backup','予備日時（任意）','datetime-local','',false)}${field('duration','所要時間・終了時刻の目安')}${field('max','最大人数（投稿者を含め3〜10人）','number',6)}${field('deadline','応募期限','datetime-local')}${field('cost','費用と負担方法（1人10,000円以内）')}<label class="check"><input name="agreed" type="checkbox" required>恋愛・勧誘・宿泊・個室での開催など、禁止事項に該当しません。</label><p class="hint">活動時間は7〜22時。公開された場所で開催してください。</p><button class="primary">企画を投稿する</button></form>`;
 else if(e&&tab==='ホーム'){
 body=`${button('← 一覧へ','back','text')}<div class="detail-art color0">${e.art||'✳'}</div><p class="eyebrow">${esc(e.category)} · ${esc(e.area)}</p><h1>${esc(e.title)}</h1><span class="badge">${e.status}</span><p class="description">${esc(e.description)}</p><div class="info"><p>投稿者 <strong>${esc(e.host)} · 本人確認済み</strong></p><p>候補日時 <strong>${e.dates.map(date).join('<br>')}</strong></p><p>人数 <strong>最少3人 / 最大${e.max}人 · 現在${e.members.length}人</strong></p><p>費用 <strong>${esc(e.cost)}</strong></p><p>所要時間 <strong>${esc(e.duration)}</strong></p>${e.deadline?`<p>応募期限 <strong>${date(e.deadline)}</strong></p>`:''}<p>集合場所 <strong>${e.status==='開催確定'&&(e.members.includes(state.user)||role==='運営')?esc(e.place):'運営承認後、参加者へ公開'}</strong></p></div>`;
 if(screen==='apply')body+=`<h2>参加を申し込む</h2><form id="apply">${e.dates.map((d,i)=>`<label>${date(d)}<select name="answer${i}" required><option value="">選択してください</option>${['参加できる','調整できれば参加できる','参加できない'].map(x=>`<option>${x}</option>`).join('')}</select></label>`).join('')}<label>応募理由（任意）<textarea name="reason" maxlength="300"></textarea></label><label>投稿者へのメッセージ（任意）<textarea name="message" maxlength="300"></textarea></label><label class="check"><input name="agree" type="checkbox" required>費用負担とコミュニティールールに同意します</label><button class="primary">申し込み内容を確認する</button></form>`;
 else if(screen==='confirm')body+=`<section class="panel"><h2>申し込み内容の確認</h2>${application.answers.map((a,i)=>`<p>${date(e.dates[i])}：${esc(a)}</p>`).join('')}<p>応募理由：${esc(application.reason)||'なし'}</p><p>メッセージ：${esc(application.message)||'なし'}</p>${button('申し込みを確定する','submit-application')}${button('入力に戻る','apply','text')}</section>`;
 else if(e.host===state.user ||role==='運営'){
 body+=`<h2>企画の進行</h2><div class="steps">${statuses.map((s,i)=>`<span class="${i<=statuses.indexOf(e.status)?'done':''}">${i+1}. ${s}</span>`).join('')}</div><p class="hint">次にすること：${{'募集中':'応募者を承認して3人以上を集める','内容調整中':'チャットで日時・集合場所・費用を相談する','参加者確認待ち':'参加者全員に開催内容の確認を依頼する','運営確認中':'運営が開催内容を確認する','開催確定':'開催当日に向けて準備する'}[e.status]}</p><h2>応募者</h2>${e.applicants.map(a=>`<div class="row"><div><strong>${esc(a.name)}</strong><p>${a.answers.map(esc).join(' / ')} · ${a.state}</p><p>${esc(a.reason)}</p><p>${esc(a.message)}</p></div>${a.state!=='承認済み'?button('承認',`approve:${a.name}`,'small'):''}</div>`).join('')||'<p>まだ応募はありません。</p>'}`;
 if(e.status==='内容調整中')body+=`<form id="schedule"><h2>開催内容を入力する</h2>${field('when','開催日時（日本時間）','datetime-local')}${field('place','詳しい集合場所')}${field('duration','所要時間')}${field('cost','費用・負担方法','text',e.cost)}<button class="primary">内容確認を依頼する</button></form>`;
 else if(e.status==='募集中'||e.status==='参加者確認待ち'||(e.status==='運営確認中'&&role==='運営'))body+=button({'募集中':'日時の相談へ進む','参加者確認待ち':'運営へ確定申請する','運営確認中':'運営として開催を承認する'}[e.status],'advance');
 }else if(e.members.includes(state.user)){body+=`<p class="panel">承認済みです。チャットで開催内容を相談してください。</p>`;if(e.status==='参加者確認待ち')body+=`<div class="panel"><p>${date(e.when)} · ${esc(e.cost)} · ${esc(e.duration)}</p>${button(e.confirmed.includes(state.user)?'確認済み':'開催内容を確認しました','confirm-member')}</div>`;}
 else if(e.applicants.some(a=>a.name===state.user))body+=`<p class="panel">投稿者の確認待ちです。</p>${button('申し込みを取り消す','cancel','text')}`;
 else if(e.status==='募集中'&&e.members.length<e.max)body+=button('参加を申し込む','apply');
 body+=button('企画を通報する','report','text');
 }
 else if(tab==='チャット'){const chats=state.events.filter(e=>e.members.includes(state.user));body=`<h1>チャット</h1><p>承認された参加者で、体験の準備を。</p>${chats.map(e=>`<section class="panel"><h2>${esc(e.title)}</h2><p class="hint">企画グループ · ${e.members.map(esc).join('、')}</p><div class="messages">${e.messages.map(m=>`<p><strong>${esc(m.name)}</strong><span>${esc(m.text)}</span></p>`).join('')||'<p>希望日時と開催内容を相談しましょう。</p>'}</div><form class="chat-form" data-id="${e.id}"><input name="text" placeholder="メッセージを入力" aria-label="メッセージ" maxlength="1000" required><button class="primary">送信</button></form></section>`).join('')||'<p class="empty">参加が承認されるとチャットが開きます。</p>'}`}
 else if(tab==='通知')body=`<h1>通知</h1>${state.notifications.map(n=>`<div class="row"><div>${esc(n.text)}<p class="hint">${date(n.time)}</p></div></div>`).join('')||'<p class="empty">新しい通知はありません。</p>'}`;
 else body=`<h1>マイページ</h1><section class="panel"><div class="avatar">${esc(state.user.slice(0,1))}</div><h2>${esc(state.user)}</h2><span class="badge">${account?.verified?'本人確認済み':'本人確認待ち'}</span><p>${account?.verified?'企画の投稿・参加・チャットを利用できます。':'本人確認が完了するまで閲覧のみ利用できます。運営からの案内をお待ちください。'}</p>${button('ログアウト','logout','text')}</section><h2>応募・参加した企画</h2>${state.events.filter(e=>e.members.includes(state.user)||e.applicants.some(a=>a.name===state.user)).map(e=>`<button class="row" data-action="detail:${e.id}">${esc(e.title)} →</button>`).join('')}${button('チュートリアルをもう一度見る','tutorial','text')}`;
 document.querySelector('#app').innerHTML=`<header><a href="#" data-action="home" class="logo">kikkake<span>✳</span></a><span class="header-note">小さな一歩を、一緒に。</span><button class="profile" data-action="tab:マイページ">${esc(state.user.slice(0,1)||'入')}</button></header><div class="demo-banner">開発版 · データはサーバーに保存されます</div><main>${body}</main>${toast?`<div role="status" class="toast">${esc(toast)}</div>`:''}<nav aria-label="メインメニュー">${[['ホーム','⌂'],['チャット','◌'],['通知','♧'],['マイページ','☺']].map(([t,i])=>`<button data-action="tab:${t}" class="${tab===t?'selected':''}"><span>${i}</span>${t}</button>`).join('')}</nav>`;
}
async function act(action){const [a,...rest]=action.split(':');const v=rest.join(':');const e=state.events.find(x=>x.id===selected);toast='';
 if(a==='tab'){tab=v;screen='list'}if(a==='home'){tab='ホーム';screen='list'}if(a==='mode')mode=v;if(a==='filter')filter=v;
 if(a==='detail'){selected=Number(v);tab='ホーム';screen='detail'}if(a==='back')screen='list';
 if(a==='new'||a==='apply'){if(!account){tab='マイページ'}else if(!account.verified)throw Error('本人確認完了まで閲覧のみ利用できます。');else screen=a==='new'?'new':'apply';}
 if(a==='skip'||a==='tutorial-next'&&tutorialStep===2)state.tutorial=false;else if(a==='tutorial-next')tutorialStep++;
 if(a==='tutorial'){state.tutorial=true;tutorialStep=0}
 if(a==='auth-toggle')authMode=authMode==='login'?'register':'login';
 if(a==='logout'){await api('/logout',{});connection?.close();receive(await api('/state'));screen='list';tab='マイページ'}
 if(a==='submit-application'){await mutate(`/events/${e.id}/apply`,application);screen='detail'}
 if(a==='approve')await mutate(`/events/${e.id}/approve`,{name:v});
 if(a==='advance')await mutate(`/events/${e.id}/advance`);
 if(a==='confirm-member')await mutate(`/events/${e.id}/confirm`);
 if(a==='cancel')await mutate(`/events/${e.id}/cancel`);
 if(a==='report')toast='通報窓口は準備中です。正式公開前に運営窓口を接続します。';
 save();render();window.scrollTo(0,0);
}
let busy=false;
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-action]');if(!b)return;ev.preventDefault();if(busy)return;busy=true;try{await act(b.dataset.action)}catch(err){toast=err.message;render()}finally{busy=false}});
document.addEventListener('submit',async ev=>{ev.preventDefault();if(busy)return;busy=true;const form=ev.target,data=Object.fromEntries(new FormData(form));const e=state.events.find(x=>x.id===selected);try{
 if(form.id==='auth'){receive(await api('/'+authMode,{...data,agreed:data.agreed==='on'}));state.tutorial=false;save();tab='ホーム';screen='list';connect()}
 if(form.id==='create'){
 await mutate('/events',{...data,max:Number(data.max),dates:[new Date(data.when+'+09:00').toISOString(),...(data.backup?[new Date(data.backup+'+09:00').toISOString()]:[])],deadline:new Date(data.deadline+'+09:00').toISOString(),agreed:data.agreed==='on'});mode='投稿する';screen='list';
 }
 if(form.id==='apply'){application={answers:e.dates.map((_,i)=>data[`answer${i}`]),reason:data.reason,message:data.message,agreed:data.agree==='on'};screen='confirm'}
 if(form.id==='schedule')await mutate(`/events/${e.id}/schedule`,{...data,when:new Date(data.when+'+09:00').toISOString()});
 if(form.classList.contains('chat-form'))await mutate(`/events/${form.dataset.id}/message`,{text:data.text});
 toast='';render();
 }catch(err){toast=err.message;render()}finally{busy=false}});
render();
refresh().then(connect).catch(()=>{toast='サーバーに接続できません。時間を置いて再読み込みしてください。';render()});

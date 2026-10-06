export const statuses=['募集中','内容調整中','参加者確認待ち','運営確認中','開催確定'];
export function apply(event, user, answers, agreed) {
 if(!agreed) throw Error('費用負担とコミュニティールールへの同意が必要です。');
 if(!answers.length || !answers.every(Boolean) || !answers.some(a=>a!=='参加できない')) throw Error('参加できる候補日時を選んでください。');
 if(event.members.length>=event.max) throw Error('定員に達しています。');
 if(event.members.includes(user)||event.applicants.some(a=>a.name===user)) throw Error('すでに参加・申し込み済みです。');
 if(event.status!=='募集中') throw Error('この企画の募集は終了しています。');
 event.applicants.push({name:user,answers,state:'未確認'});
}
export function approve(event,name){
 if(event.members.length>=event.max) throw Error('定員に達しています。');
 const a=event.applicants.find(a=>a.name===name&&a.state!=='承認済み');
 if(!a) throw Error('応募者が見つかりません。');
 a.state='承認済み'; event.members.push(name);
}
export function advance(event, now=Date.now()) {
 const next=statuses.indexOf(event.status)+1;
 if(next<1||next>=statuses.length) throw Error('これ以上進められません。');
 if(event.members.length<3) throw Error('投稿者を含め3人以上が必要です。');
 if(next>=2 && (!event.place?.trim()||!event.when||!event.duration?.trim()||!event.cost?.trim())) throw Error('日時・集合場所・費用・所要時間を入力してください。');
 if(next>=3 && event.confirmed.length!==event.members.length) throw Error('参加者全員の内容確認が必要です。');
 if(next===3 && new Date(event.when).getTime()-now<86400000) throw Error('確定申請は開催24時間前までです。');
 event.status=statuses[next];
}

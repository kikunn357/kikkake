import {openDatabase} from '../server/app.js';
const [action,email]=process.argv.slice(2);
if(!['verify','unverify','promote','demote'].includes(action)||!email)throw Error('Usage: node scripts/admin.js verify|unverify|promote|demote EMAIL');
const db=openDatabase(process.env.DB_PATH||'data/kikkake.sqlite');
const user=db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase());
if(!user)throw Error('利用者が見つかりません');
db.exec('BEGIN IMMEDIATE');
try{
if(action==='verify'||action==='unverify')db.prepare('UPDATE users SET verified=? WHERE id=?').run(action==='verify'?1:0,user.id);
else db.prepare('UPDATE users SET role=? WHERE id=?').run(action==='promote'?'admin':'member',user.id);
db.prepare('INSERT INTO audit(actor,action,target,time) VALUES(?,?,?,?)').run(0,action,String(user.id),new Date().toISOString());
db.exec('COMMIT');console.log('更新しました。');
}catch(e){db.exec('ROLLBACK');throw e}finally{db.close()}

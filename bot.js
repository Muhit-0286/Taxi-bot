const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');

const app = express();
let lastQr = '', isConnected = false, groups = {}, zakazId = 100, zakazy = {};
let sock;

const PRAIS_TOLIQ = `🚕 *ПРАЙС - 4 ы/а (Ынтымақ, Қоянқұс, Жаңадәуір, Жаңаталап)*

*КҮНДІЗ 22:00-ге дейін*

📍 *ТӨРТ АУЫЛ ІШІ:*
Ауыл іші - 800-1000тг
4 ауыл арасы - 1500тг
Жаңаталап-Жаңадәуір 1000тг
Жаңаталап-Ынтымақ/Қоянқұс 1500тг
Жаңадәуір-Ынтымақ 1000тг
Жаңадәуір-Қоянқұс 1200тг

📍 *ЖАҚЫН:*
4 ы/а -> Трасса / Магнум 1500тг
4 ы/а -> Гейт Сити / Март 1500 (1 адам) / 2000 салон
4 ы/а -> Көкжиек 2000 / 2500 салон
4 ы/а -> Пятилетка 2000 / 2500 салон

📍 *ОРТА:*
4 ы/а -> ГРЭС 2000тг (Ары-бері 4000тг)
4 ы/а -> Вокзал-1 2000/2500 салон
4 ы/а -> Вокзал-2 3500/4000 багаж
4 ы/а -> Аэропорт 3500тг
4 ы/а -> Байсерке 2500/3000 салон

📍 *АЛЫС:*
Шолохова 2500тг, Құлагер 2800, Барахолка 2700
Сайран 4500/5000, Алтынорда/Шұғыла 6000тг

⚠️ Түнде 22:00-ден кейін +500-1000тг`;

function getPraisPrice(text){
  const t=text.toLowerCase();
  if(t.includes('грэс')||t.includes('өтеген')) return '2000тг (Ары-бері 4000тг)';
  if(t.includes('гейт')||t.includes('март')) return '1500тг (1 адам) / 2000 салон';
  if(t.includes('трасса')||t.includes('магнум')) return '1500тг';
  if(t.includes('көкжиек')) return '2000 / 2500 салон';
  if(t.includes('пятилетка')||t.includes('пятачок')) return '2000 / 2500 салон';
  if(t.includes('вокзал')) return '2000-3500тг';
  if(t.includes('аэропорт')) return '3500тг';
  return '1500тг';
}

app.get('/', (req,res)=>{
  if(isConnected) return res.send('<h1>✅ БОТ ҚОСЫЛЫП ТҰР</h1><p>Лог: Группалар табылды</p>');
  if(lastQr) return res.send(`<img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(lastQr)}"><script>setTimeout(()=>location.reload(),8000)</script>`);
  res.send('Қосылуда...');
});
app.listen(process.env.PORT||3000,()=>console.log('Server start'));

async function startBot(){
  const {state, saveCreds} = await useMultiFileAuthState('sess');
  sock = makeWASocket({auth:state, printQRInTerminal:false, browser:["Ubuntu","Chrome","22.04.4"]});
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u)=>{
    if(u.qr) lastQr=u.qr;
    if(u.connection==='open'){
      isConnected=true; lastQr=''; console.log('✅ WA қосылды');
      try{
        const all=await sock.groupFetchAllParticipating();
        for(let id in all) groups[id]=all[id].subject;
        console.log('Группалар:', groups);
      }catch(e){ console.log('Группа алу қате', e); }
    }
    if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut){
      isConnected=false; setTimeout(startBot,3000);
    }
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m=messages[0]; if(!m.message || m.key.fromMe) return;
    const jid=m.key.remoteJid;
    const part=m.key.participant || m.key.remoteJid;
    const text=(m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
    if(!text) return;
    const low=text.toLowerCase();
    console.log(`MSG ${groups[jid]||jid}: ${text}`);

    // ПРАЙС - КЕЗ КЕЛГЕН ГРУППАДА
    if(low.includes('прайс') || low==='/прайс' || low.includes('баға') || low.includes('цена')){
      await sock.sendMessage(jid, {text:PRAIS_TOLIQ});
      return;
    }

    // ТАКСИ ЗАКАЗ - КЕЗ КЕЛГЕН ГРУППАДА
    const isZakaz = low.includes('такси') || low.includes('керек') || low.includes('жеткіз') || low.includes('апарып') || /\d+\s*тг/.test(low) || low.includes('грэс') || low.includes('гейт') || low.includes('до ') || low.includes('дан ');
    if(isZakaz && jid.endsWith('@g.us')){
      const clientPrice = text.match(/\d+\s*тг|\d+\s*k|\d+\s*мың/i)?.[0] || 'көрсетілмеген';
      const praisPrice = getPraisPrice(text);
      zakazId++; zakazy[zakazId]={text, phone:part, from:jid};

      // Сол группаға жауап
      await sock.sendMessage(jid, {text:`✅ Заказ #${zakazId} қабылданды!\n\n👤 Сіздің бағаңыз: ${clientPrice}\n💰 Прайс: ${praisPrice}\n\nЖүргізуші ізделуде...`});

      // Басқа группаларға жіберу
      for(let gid in groups){
        if(gid!==jid){
          await sock.sendMessage(gid, {text:`🚕 ЖАҢА ЗАКАЗ #${zakazId}\n📍 ${text}\nГруппа: ${groups[jid]}\n\n👤 Клиент: ${clientPrice}\n💰 Прайс: ${praisPrice}\n📞 +${part.split('@')[0]}\n\nАлу: /алам_${zakazId}`});
        }
      }
    }

    if(low.startsWith('/алам')){
      const num=text.match(/\d+/)?.[0]; if(!num ||!zakazy[num]) return;
      const order=zakazy[num];
      await sock.sendMessage(order.from, {text:`🚕 Заказ #${num} ды ${m.pushName||'жүргізуші'} алды, хабарласады!`});
      await sock.sendMessage(jid, {text:`✅ Заказ #${num} сізде!\nКлиент: +${order.phone.split('@')[0]}\nЗаказ: ${order.text}`});
      delete zakazy[num];
    }
  });
}
startBot();

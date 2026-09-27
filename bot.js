const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');

const app = express();
let lastQr = '', isConnected = false, zakazId = 120, zakazy = {};
let sock;

const INV_CLIENT = 'B80rTyvT9dvApmM12XeS4f';
const INV_DRIVER = 'IwwPqGzMjT8LYyxeAcrGfu';

const PRAIS_TOLIQ = `🚕 *ПРАЙС - 4 ы/а (Ынтымақ, Қоянқұс, Жаңадәуір, Жаңаталап)*

📍 *ТӨРТ АУЫЛ ІШІ:*
Ауыл іші - 800-1000тг
4 ауыл арасы - 1500тг
Жаңаталап-Жаңадәуір 1000тг
Жаңаталап-Ынтымақ/Қоянқұс 1500тг
Жаңадәуір-Ынтымақ 1000тг
Жаңадәуір-Қоянқұс 1200тг

📍 *ЖАҚЫН:*
Трасса / Магнум 1500тг
Гейт Сити / Март 1500 (1 адам) / 2000 салон
Көкжиек 2000/2500 салон
Пятилетка 2000/2500 салон

📍 *ОРТА:*
ГРЭС 2000тг (Ары-бері 4000тг)
Вокзал-1 2000/2500 салон
Вокзал-2 3500/4000 багаж
Аэропорт 3500тг
Байсерке 2500/3000 салон

📍 *АЛЫС:*
Шолохова 2500тг, Құлагер 2800, Барахолка 2700
Сайран 4500/5000, Алтынорда/Шұғыла 6000тг
⚠️ Түнде 22:00-ден кейін +500-1000тг`;

function getPraisPrice(t){
  t=t.toLowerCase();
  if(t.includes('грэс')) return '2000тг (Ары-бері 4000)';
  if(t.includes('гейт')||t.includes('март')) return '1500 / 2000 салон';
  if(t.includes('трасса')||t.includes('магнум')) return '1500тг';
  if(t.includes('көкжиек')) return '2000/2500';
  if(t.includes('пятилетка')) return '2000/2500';
  if(t.includes('аэропорт')) return '3500тг';
  return '1500тг';
}

app.get('/', (req,res)=>{
  if(isConnected) return res.send('<h1>✅ БОТ ҚОСЫЛЫП ТҰР</h1><p>Клиент: B80rTyvT9dv<br>Водитель: IwwPqGzMjT8</p>');
  if(lastQr) return res.send(`<h1>QR СКАНЕРЛЕ</h1><img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(lastQr)}"><script>setTimeout(()=>location.reload(),8000)</script>`);
  res.send('Қосылуда...');
});
app.listen(process.env.PORT||3000,()=>console.log('Server start'));

async function startBot(){
  const {state, saveCreds} = await useMultiFileAuthState('sess');
  sock = makeWASocket({auth:state, printQRInTerminal:false, browser:["Ubuntu","Chrome","22.04"]});
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u)=>{
    if(u.qr) lastQr=u.qr;
    if(u.connection==='open'){
      isConnected=true; lastQr=''; console.log('✅ WA қосылды');
      // Группаларға автоматты қосылу
      for(let code of [INV_CLIENT, INV_DRIVER]){
        try{ await sock.groupAcceptInvite(code); console.log('Қосылды:', code); }catch(e){ console.log('Қосылу қате немесе бұрын қосылған:', code); }
      }
      const all=await sock.groupFetchAllParticipating();
      console.log('Барлық группа:', Object.values(all).map(g=>g.subject));
    }
    if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut){
      isConnected=false; setTimeout(startBot,3000);
    }
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m=messages[0]; if(!m.message || m.key.fromMe) return;
    const jid=m.key.remoteJid;
    if(!jid.endsWith('@g.us')) return;
    const part=m.key.participant||m.key.remoteJid;
    const text=(m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
    if(!text) return;
    const low=text.toLowerCase();
    console.log(`MSG ${jid}: ${text}`);

    // ПРАЙС - кез келген группада
    if(low.includes('прайс')||low==='/прайс'||low.includes('баға')){
      await sock.sendMessage(jid, {text:PRAIS_TOLIQ}); return;
    }

    // ЗАКАЗ
    const isZakaz = low.includes('такси')||low.includes('керек')||low.includes('грэс')||low.includes('гейт')||/\d+\s*тг/.test(low)||low.includes('жеткіз');
    if(isZakaz){
      const clientPrice=text.match(/\d+\s*тг|\d+k/i)?.[0]||'көрсетілмеген';
      const praisPrice=getPraisPrice(text);
      zakazId++; zakazy[zakazId]={text, phone:part, from:jid, clientPrice};

      // Клиентке жауап
      await sock.sendMessage(jid, {text:`✅ Заказ #${zakazId} қабылданды!\n\n👤 Сіз: ${clientPrice}\n💰 Прайс: ${praisPrice}\n\nЖүргізуші ізделуде...`});

      // Қалған группаларға жіберу
      const all=await sock.groupFetchAllParticipating();
      for(let gid in all){
        if(gid!==jid){
          await sock.sendMessage(gid, {text:`🚕 *ЖАҢА ЗАКАЗ #${zakazId}*\n📍 ${text}\n\n👤 Клиент: ${clientPrice}\n💰 Прайс: ${praisPrice}\n📞 +${part.split('@')[0]}\n\nАлу: /алам_${zakazId}`});
        }
      }
    }

    if(low.startsWith('/алам')){
      const num=text.match(/\d+/)?.[0]; if(!num||!zakazy[num]) return;
      const order=zakazy[num];
      // Барлық группаға хабар
      const all=await sock.groupFetchAllParticipating();
      for(let gid in all){
        if(gid===order.from) await sock.sendMessage(gid, {text:`🚕 Заказ #${num} ды ${m.pushName} алды, хабарласады!`});
        else await sock.sendMessage(gid, {text:`✅ Заказ #${num} алынды! ${m.pushName} алды.`});
      }
      delete zakazy[num];
    }
  });
}
startBot();

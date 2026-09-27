const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();

let lastQr = '';
let isConnected = false;
let groupCache = {}; // атауы -> ID

app.get('/', (req,res)=>{
  if(isConnected){
    let gList = Object.entries(groupCache).map(([name,id])=>`${name} : ${id}`).join('<br>');
    return res.send(`<h1>✅ БОТ ҚОСЫЛДЫ</h1><p>Группалар:</p>${gList}<br><br><p>Енді клиент группада "такси керек 4мкр гейт" деп жазып көр</p>`);
  }
  if(lastQr) return res.send(`<center><h2>QR</h2><img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(lastQr)}"><script>setTimeout(()=>location.reload(),8000)</script></center>`);
  res.send('Дайындалуда...<script>setTimeout(()=>location.reload(),3000)</script>');
});
app.listen(process.env.PORT||3000);

const PRAIS = `*ПРАЙС 4 мкр (күндіз 22:00 дейін):*\n4 мкр-Трасса 1500\n4 мкр-Магнум 1500\n4 мкр-Гейт Сити 1500/2000\n4 мкр-ГРЭС 2000\n4 мкр-Вокзал1 2000/2500\n4 мкр-Аэропорт 3500\nЖаңаталап-Жаңадәуір 1000\nАуыл іші 800-1000`;

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('sess');
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update)=>{
    const { connection, lastDisconnect, qr } = update;
    if(qr) lastQr = qr;
    if(connection === 'open'){
      isConnected = true; lastQr='';
      console.log('✅ ҚОСЫЛДЫ');
      // Группаларды табу
      try {
        const groups = await sock.groupFetchAllParticipating();
        for(let id in groups){
          let name = groups[id].subject;
          groupCache[name]=id;
          console.log(`ГРУППА ТАБЫЛДЫ: ${name} -> ${id}`);
        }
      } catch(e){ console.log('Группа алу қате', e.message); }
    }
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      if(shouldReconnect){ isConnected=false; start(); }
    }
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m=messages[0]; if(!m.message || m.key.fromMe) return;
    const jid=m.key.remoteJid;
    const text=(m.message.conversation||m.message.extendedTextMessage?.text||'').toLowerCase();
    const orig=m.message.conversation||m.message.extendedTextMessage?.text||'';
    console.log(`Хабар келді ${jid}: ${orig}`);

    // 1. Егер клиент группасынан болса
    if(jid.includes('@g.us')){
      // Клиент группаны тап
      let clientId = Object.entries(groupCache).find(([name])=>name.includes('ГЕЙТ СИТИ'))?.[1];
      let driverId = Object.entries(groupCache).find(([name])=>name.includes('Таксист'))?.[1];

      // Егер қазіргі хабар клиент группасынан келсе
      if(clientId && jid === clientId){
        if(text.includes('прайс')||text.includes('баға')||text.includes('цена')){
          await sock.sendMessage(jid,{text:PRAIS}); return;
        }
        if(text.includes('такси')||text.includes('керек')||text.includes('машина')){
          // Клиентке прайс
          await sock.sendMessage(jid,{text:`✅ Заказыңыз қабылданды!\n${PRAIS}\n\nЖүргізуші ізделуде...`});
          // Таксистерге жіберу
          if(driverId){
            await sock.sendMessage(driverId,{text:`🔥 ЖАҢА ЗАКАЗ (Гейт Сити группасы):\n\n${orig}\n\nКім алады? /алам деп жазыңдар`});
          }
          return;
        }
      }
      // Егер таксист /алам десе - клиентке жіберу
      if(driverId && jid === driverId && text.startsWith('/алам')){
        if(clientId){
          await sock.sendMessage(clientId,{text:`🚕 Жүргізуші шықты! ${orig}\n\nСізге хабарласады.`});
          await sock.sendMessage(jid,{text:`✅ Сіз алдыңыз! Клиентке хабар кетті.`});
        }
      }
    }
  });
}
start();

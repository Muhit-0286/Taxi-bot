const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();

let pairingCode = 'Жүктеліп жатыр... 15 сек күт';
let isConnected = false;
const PHONE_NUMBER = '77084816762'; // <--- Сенің бот номерің (7 мен бастап, + жоқ)

app.get('/', (req,res)=>{
  res.send(`
  <div style="text-align:center; font-family:sans-serif; margin-top:50px">
    <h1>${isConnected? '✅ БОТ ҚОСЫЛДЫ ГРУППАҒА ДАЙЫН!' : 'Кодты енгіз:'}</h1>
    <h1 style="font-size:60px; letter-spacing:10px; background:#eee; padding:20px">${pairingCode}</h1>
    <p>Ватсап -> Настройки -> Связанные устройства -> Привязка устройства -> Внизу "Привязать по номеру телефона"</p>
    <p>Номер: ${PHONE_NUMBER}</p>
  </div>
  `);
});
app.listen(process.env.PORT || 3000);

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth_pair');
  const sock = makeWASocket({
    auth: state,
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false
  });
  sock.ev.on('creds.update', saveCreds);

  if(!sock.authState.creds.registered){
    setTimeout(async ()=>{
      try{
        let code = await sock.requestPairingCode(PHONE_NUMBER);
        pairingCode = code;
        console.log('КОД:', code);
      }catch(e){ console.log(e); }
    }, 3000);
  }

  sock.ev.on('connection.update', (u)=>{
    if(u.connection==='open'){ isConnected=true; console.log('CONNECTED'); }
    if(u.connection==='close'){ 
      if(u.lastDisconnect?.error?.output?.statusCode !== 401) start();
    }
  });

  // ГРУППА ЛОГИКАСЫ
  let orderId = 100;
  const MKR4 = ["ынтымақ", "коян", "қоян", "жанада", "жаңадә", "жаната", "жаңата"];
  
  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0];
    if(!m.message || m.key.fromMe) return;
    if(!m.key.remoteJid.endsWith('@g.us')) return; // тек группа

    const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
    if(!text.toLowerCase().includes('такси') && !MKR4.some(x=>text.toLowerCase().includes(x))) return;

    orderId++;
    await sock.sendMessage(m.key.remoteJid, {
      text: `🚕 ТАПСЫРЫС #${orderId}\n📍 ${text}\n📋 Прайс: 4 мкр - ГРЭС = 2000 тг\n\nАлу: /алам_${orderId}`
    });
  });
}
start();

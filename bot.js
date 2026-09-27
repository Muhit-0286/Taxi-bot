const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();

let lastQr = '';
let isConnected = false;

app.get('/', (req,res)=>{
  if(isConnected) return res.send('<h1>✅ ТАКСИ БОТ ҚОСЫЛДЫ</h1><p>Енді группада "прайс" деп жаз - тест болады</p>');
  if(lastQr) return res.send(`<center><h2>QR дайын - сканерле</h2><img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(lastQr)}"><br><p>Ватсап > Связанные устройства > Привязать</p><script>setTimeout(()=>location.reload(),8000)</script></center>`);
  res.send('<h2>Дайындалуда... 15 сек күтіп жаңарт</h2><script>setTimeout(()=>location.reload(),3000)</script>');
});
app.listen(process.env.PORT||3000, ()=>console.log('Server started'));

const PRAIS = `*ПРАЙС 4 мкр (күндіз 22:00 дейін):*\n4 мкр-Трасса 1500\n4 мкр-Магнум 1500\n4 мкр-Гейт Сити 1500/2000 салон\n4 мкр-ГРЭС 2000\n4 мкр-Аэропорт 3500\n4 мкр-Вокзал1 2000/2500\n4 мкр-Вокзал2 3500\n4 мкр-Жетіген 6000\nАуыл іші 800-1000\nЖаңаталап-Жаңадәуір 1000\nЖаңаталап-Ынтымақ 1500\nТолық прайсты білу үшін "толық прайс" деп жаз`;

const TOLIQ_PRAIS = `СЕНІҢ ТОЛЫҚ ПРАЙСЫҢ ОСЫНДА - алдыңғы хабарламадағы ұзын тізім - оны осы жерге қоясың`;

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('sess');
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update)=>{
    const { connection, lastDisconnect, qr } = update;
    if(qr){ lastQr = qr; console.log('QR жаңарды'); }
    if(connection === 'open'){ isConnected = true; lastQr=''; console.log('✅ ҚОСЫЛДЫ!'); }
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Жабылып қалды, қайта қосылу:', shouldReconnect);
      if(shouldReconnect){ isConnected=false; start(); }
    }
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m=messages[0]; if(!m.message || m.key.fromMe) return;
    const jid=m.key.remoteJid;
    const text=(m.message.conversation||m.message.extendedTextMessage?.text||'').toLowerCase();
    const origText=m.message.conversation||m.message.extendedTextMessage?.text||'';

    if(text.includes('толық прайс')){ await sock.sendMessage(jid,{text:TOLIQ_PRAIS}); return; }
    if(text.includes('прайс')||text.includes('баға')||text.includes('цена')){ await sock.sendMessage(jid,{text:PRAIS}); return; }

    if(text.includes('такси')||text.includes('керек')){
      await sock.sendMessage(jid,{text:`🚕 Заказ қабылданды: ${origText}\n\n${PRAIS}\n\nЖүргізушілер жауап береді...`});
    }
    if(text.startsWith('/алам')){ await sock.sendMessage(jid,{text:`✅ ${origText} қабылданды!`}); }
  });
}
start();

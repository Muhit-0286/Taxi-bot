const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let lastQR = '';

app.get('/', async (req,res)=>{
  if(lastQR){
    const img = await QRCode.toDataURL(lastQR);
    res.send(`<h1>WhatsApp QR - сканерле</h1><img src="${img}"><p>Ватсап -> Связанные устройства -> Привязка</p>`);
  } else {
    res.send('Bot іске қосылуда... 10 сек күт');
  }
});
app.listen(process.env.PORT || 3000);

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state, printQRInTerminal: true });
  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', (u)=>{
    const { qr, connection } = u;
    if(qr){
      lastQR = qr;
      console.log('QR ДАЙЫН! Сайтқа кіріп көр: /');
      qrcode.generate(qr, {small:true});
    }
    if(connection==='open') console.log('BOT ҚОСЫЛДЫ!');
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    const msg = messages[0];
    if(!msg.message || msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    
    await sock.sendMessage(from, { text: `🚕 Заказ қабылданды: ${text}\nДиспетчер хабарласады!` });
    
    // саған заказ келеді - номеріңді жаз
    const myNumber = '77084816762@s.whatsapp.net'; // <-- ОСЫНЫ ӨЗГЕРТ
    await sock.sendMessage(myNumber, { text: `ЖАҢА ЗАКАЗ!\nКлиент: ${from}\nМаршрут: ${text}` });
  });
}
start();

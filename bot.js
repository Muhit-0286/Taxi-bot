const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();
let codeText = 'Күтіңіз...';
app.get('/', (req,res)=> res.send(`<h1 style="font-size:80px; text-align:center; letter-spacing:10px">${codeText}</h1><p>WhatsApp -> Связанные устройства -> Привязка по номеру телефона -> кодты тер</p>`));
app.listen(process.env.PORT || 3000);

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const sock = makeWASocket({ auth: state });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', (u)=>{
    if(u.connection==='open') console.log('BOT ҚОСЫЛДЫ!');
  });
  // ОСЫ ЖЕРГЕ ӨЗ НОМЕРІҢДІ ЖАЗ - мысалы 77071234567
  const MY_NUMBER = '77084816762';
  if(!sock.authState.creds.registered){
    const code = await sock.requestPairingCode(MY_NUMBER);
    codeText = code;
    console.log('КОД:', code);
  }
  sock.ev.on('messages.upsert', async ({messages})=>{
    const msg = messages[0];
    if(!msg.message || msg.key.fromMe) return;
    const from = msg.key.remoteJid;
    await sock.sendMessage(from, { text: `🚕 Заказ қабылданды!` });
  });
}
start();

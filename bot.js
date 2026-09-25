const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();

let lastCode = 'Күту...';
let connected = false;

app.get('/', (req,res)=> res.send(`<h1 style="font-family:sans-serif;text-align:center;margin-top:50px">${connected?'✅ БОТ ҚОСЫЛДЫ':`КОД: <b style="font-size:70px;background:green;color:white;padding:20px">${lastCode}</b><br><br>Ватсап > Связанные устройства > Привязать по номеру телефона<br><br>Кодты енгіз. Номер: 7084816762`}</h1>`));
app.listen(process.env.PORT || 3000);

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('session');
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({connection, lastDisconnect})=>{
    if(connection==='close'){
      if(lastDisconnect?.error?.output?.statusCode!= 401){ start(); }
    }
    if(connection==='open'){ connected=true; console.log('OPEN'); }
  });

  if(!state.creds.registered){
    setTimeout(async ()=>{
      try{
        // ВАЖНО: номер +сыз
        const code = await sock.requestPairingCode('77084816762');
        lastCode = code;
        console.log('CODE:', code);
      }catch(e){
        console.log('ERROR CODE', e);
        lastCode = 'Қате: ' + e.message + ' 10 сектан соң қайта...';
        setTimeout(start, 10000);
      }
    }, 8000);
  }

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0];
    if(!m.message ||!m.key.remoteJid.endsWith('@g.us')) return;
    const t = m.message.conversation || '';
    if(t.toLowerCase().includes('такси')){
      await sock.sendMessage(m.key.remoteJid, {text: '✅ Бот дайын: '+t});
    }
  });
}
start();

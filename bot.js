const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();

let pairingCode = 'Дайындалуда... 20 секунд күте тұр';
let isConnected = false;
const PHONE_NUMBER = '77084816762'; // + жоқ, 7 мен баста

app.get('/', (req,res)=>{
  res.send(`<h1 style="text-align:center;font-family:sans-serif;margin-top:100px">
  ${isConnected? '✅ ҚОСЫЛДЫ! Енді группаға қос' : `КОД: <br><br><span style="font-size:80px; background:#25D366; color:white; padding:20px; border-radius:20px">${pairingCode}</span><br><br>Ватсап -> Связанные устройства -> Привязать по номеру`}
  </h1>`);
});
app.listen(process.env.PORT || 3000);

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');
  const sock = makeWASocket({
    auth: state,
    browser: Browsers.macOS('Desktop'),
    printQRInTerminal: false,
    syncFullHistory: false
  });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update)=>{
    const { connection, lastDisconnect } = update;
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== 401;
      if(shouldReconnect){ console.log('Қайта қосылу...'); start(); }
      else { console.log('Логаут болды, auth папканы өшір'); }
    }
    if(connection === 'open'){ isConnected = true; console.log('✅ ҚОСЫЛДЫ'); }
  });

  if(!state.creds.registered){
    await new Promise(r=>setTimeout(r, 5000));
    try{
      const code = await sock.requestPairingCode(PHONE_NUMBER);
      pairingCode = code.match(/.{1,4}/g)?.join('-') || code;
      console.log('ПАЙРИНГ КОД:', pairingCode);
    }catch(e){ console.log('Код алу қатесі:', e.message); pairingCode = 'Қате, 10 сек күт'; setTimeout(start, 5000); }
  }

  // Группа тыңдау
  sock.ev.on('messages.upsert', async ({messages})=>{
    const m = messages[0];
    if(!m.message || m.key.fromMe) return;
    if(!m.key.remoteJid.endsWith('@g.us')) return;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
    console.log('Группадан:', text);
    // Тест үшін әр хабарламаға жауап берсін
    if(text.toLowerCase().includes('такси') || text.toLowerCase().includes('ынтымақ')){
      await sock.sendMessage(m.key.remoteJid, {text: `✅ Бот жұмыс істейді! Тапсырыс қабылданды: ${text}`});
    }
  });
}
start();

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();

let lastQr = '', isConnected = false;
let zakazId = 120;
const zakazy = {};
let sock;

const INV_CLIENT = 'Cyk6TnT8azd3gnB6hqv0aE';
const INV_DRIVER = 'GsA8K8CzVKPLcfjMwS7KXV';

const PRAIS = "🚕 ПРАЙС - 4 ы/а\n\nАуыл іші 800-1000тг\n4 ауыл арасы 1500тг\nТрасса / Магнум 1500тг\nГейт Сити 1500/2000 салон\nГРЭС 2000тг (4000 барыс-келіс)\nАэропорт 3500тг\nСайран 4500/5000\nТүнде +500тг";

app.get('/', (req, res) => {
  if (isConnected) return res.send('<h1>✅ БОТ ҚОСЫЛЫП ТҰР</h1>');
  if (lastQr) return res.send(`<img src="https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(lastQr)}"><script>setTimeout(()=>location.reload(),7000)</script>`);
  res.send('Қосылуда...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер ${PORT} портында іске қосылды`));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('sess');

  sock = makeWASocket({
  auth: state,
  browser: ["Ubuntu", "Chrome", "22.04"],
  connectTimeoutMs: 60000,
  defaultQueryTimeoutMs: 0,
  keepAliveIntervalMs: 10000,
  printQRInTerminal: false // Өшіру
});


  sock.ev.on('creds.update', saveCreds);

  setInterval(async () => {
    if (sock && isConnected) {
      try { await sock.sendPresenceUpdate('available'); } catch (e) {}
    }
  }, 15000);

  sock.ev.on('connection.update', async (u) => {
    if (u.qr) lastQr = u.qr;

    if (u.connection === 'open') {
      isConnected = true;
      lastQr = '';
      try { await sock.groupAcceptInvite(INV_CLIENT); } catch (e) {}
      try { await sock.groupAcceptInvite(INV_DRIVER); } catch (e) {}
      console.log('✅ WhatsApp байланысы орнатылды!');
    }

    if (u.connection === 'close') {
      isConnected = false;
      const statusCode = u.lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(startBot, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;

    const jid = m.key.remoteJid;
    if (!jid.endsWith('@g.us')) return;

    const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
    if (!text) return;

    if (text.includes('ЖАНА ЗАКАЗ #')) return;

    const low = text.toLowerCase();

    // 1. ПРАЙС
    if (low.includes('прайс') || low.includes('бага') || low.includes('баға')) {
      await sock.sendMessage(jid, { text: PRAIS });
      return;
    }

    // 2. ЖАҢА ЗАКАЗ ТҮСУІ
    if (low.includes('такси') || low.includes('керек') || /\d+\s*тг/.test(low)) {
      zakazId++;
      zakazy[zakazId] = { message: m, text: text, fromJid: jid };

      await sock.sendMessage(jid, { text: `✅ Заказ #${zakazId} қабылданды!` });

      const all = await sock.groupFetchAllParticipating().catch(() => null);
      if (all) {
        for (let g in all) {
          if (g !== jid) {
            await sock.sendMessage(g, {
              text: `🚕 ЖАНА ЗАКАЗ #${zakazId}\n${text}\n\n👇 Алу үшін осы хабарламаға жауап (Reply) беріп "алам" немесе "+", "мен" деп жазыңыз.`
            }).catch(() => {});
          }
        }
      }
      return;
    }

    // 3. ТАПСЫРЫСТЫ АЛУ (ЖҮРГІЗҮШІЛЕР ҮШІН)
    let foundZakazId = null;

    // А) Жүргізуші заказ хабарламасын REPLY (цитата) етіп жауап берсе:
    const quotedText = m.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation ||
                       m.message.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || '';
    
    if (quotedText && quotedText.includes('ЖАНА ЗАКАЗ #')) {
      const match = quotedText.match(/ЖАНА ЗАКАЗ #(\d+)/);
      if (match) foundZakazId = match[1];
    }

    // Б) Немесе егер жай санын жазса (мысалы: "алам 121", "мен 121", "121 алам", "121"):
    if (!foundZakazId) {
      const matchNum = text.match(/\d+/);
      if (matchNum && zakazy[matchNum[0]]) {
        foundZakazId = matchNum[0];
      }
    }

    // Егер заказ табылса:
    if (foundZakazId) {
      if (zakazy[foundZakazId]) {
        // Тапсырысты өшіреміз (басқа ешкім ала алмайды)
        const currentZakaz = zakazy[foundZakazId];
        delete zakazy[foundZakazId];

        // Жүргізушіге жауап
        await sock.sendMessage(jid, { text: `✅ Заказ #${foundZakazId} сізге берілді!`, quoted: m });

        // Клиенттің тобына хабарлау
        if (currentZakaz.fromJid) {
          await sock.sendMessage(currentZakaz.fromJid, { 
            text: `🚕 Заказ #${foundZakazId} бойынша жүргізуші табылды!` 
          }).catch(() => {});
        }
      } else {
        await sock.sendMessage(jid, { text: `❌ Заказ #${foundZakazId} бұрын алынып қойған!`, quoted: m });
      }
    }
  });
}

startBot();

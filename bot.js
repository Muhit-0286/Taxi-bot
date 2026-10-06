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
  if (isConnected) return res.send('<h1>✅ БОТ КОСЫЛЫП ТУР</h1>');
  if (lastQr) return res.send(`<img src="https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(lastQr)}"><script>setTimeout(()=>location.reload(),7000)</script>`);
  res.send('Қосылуда...');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server runs on port', process.env.PORT || 3000);
});

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('sess');

  sock = makeWASocket({
    auth: state,
    browser: ["Ubuntu", "Chrome", "22.04"],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  // Статус әрдайым онлайн болып тұруы үшін
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
      console.log('WA OK');
    }

    if (u.connection === 'close') {
      isConnected = false;
      const statusCode = u.lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log('Қайта қосылуда...');
        setTimeout(startBot, 3000);
      } else {
        console.log('Сессия аяқталды, "sess" папкасын өшіріп қайта сканерлеңіз.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const m = messages[0];
    if (!m.message || m.key.fromMe) return; // Боттың өз хабарламасын елемеу

    const jid = m.key.remoteJid;
    if (!jid.endsWith('@g.us')) return; // Тек топтарда жұмыс істейді

    const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
    if (!text) return;

    // Бот өзі жіберген "ЖАНА ЗАКАЗ" хабарламасын қайта өңдемеуі үшін тексеріс
    if (text.includes('ЖАНА ЗАКАЗ #')) return;

    const low = text.toLowerCase();

    // 1. Прайс сұрау
    if (low.includes('прайс') || low.includes('бага') || low.includes('баға')) {
      await sock.sendMessage(jid, { text: PRAIS });
      return;
    }

    // 2. Жаңа тапсырыс түсуі
    if (low.includes('такси') || low.includes('керек') || /\d+\s*тг/.test(low)) {
      zakazId++;
      zakazy[zakazId] = { message: m, text: text, fromJid: jid };

      await sock.sendMessage(jid, { text: `✅ Заказ #${zakazId} қабылданды!` });

      const all = await sock.groupFetchAllParticipating().catch(() => null);
      if (all) {
        for (let g in all) {
          // Тапсырыс келген топтан БАСҚА барлық топқа бағыттау
          if (g !== jid) {
            await sock.sendMessage(g, {
              text: `🚕 ЖАНА ЗАКАЗ #${zakazId}\n${text}\n\nАлу үшін: /алам_${zakazId}`
            }).catch(() => {});
          }
        }
      }
      return;
    }

    // 3. Тапсырысты жүргізушінің алуы
    if (low.startsWith('/алам')) {
      const n = text.match(/\d+/)?.[0];
      if (n && zakazy[n]) {
        await sock.sendMessage(jid, { text: `✅ Заказ #${n} сізге берілді!` });
        
        // Клиентке де хабарлау (қалауыңыз бойынша)
        if (zakazy[n].fromJid) {
          await sock.sendMessage(zakazy[n].fromJid, { text: `🚕 Заказ #${n} бойынша жүргізуші табылды!` }).catch(() => {});
        }
        
        delete zakazy[n];
      } else if (n) {
        await sock.sendMessage(jid, { text: `❌ Заказ #${n} өшірілген немесе бұрын алынған!` });
      }
    }
  });
}

startBot();

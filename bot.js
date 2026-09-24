const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
app.get('/', (req,res) => res.send('WhatsApp Taxi Bot is running'));
app.listen(process.env.PORT || 3000);

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox'] }
});

client.on('qr', qr => {
  console.log('QR КОД ОСЫНДА:');
  qrcode.generate(qr, {small: true});
});

client.on('ready', () => console.log('BOT ДАЙЫН!'));

let step = {};

client.on('message', async msg => {
  const chatId = msg.from;
  const text = msg.body.trim();

  if (!step[chatId]) {
    await client.sendMessage(chatId, '🚕 *Такси ботқа қош келдің!*\n\nҚайдан қайда барасың? Мысалы: Самалдан Мегаға');
    step[chatId] = 1;
    return;
  }

  if (step[chatId] === 1) {
    step[chatId] = { fromTo: text };
    await client.sendMessage(chatId, `✅ Маршрут: ${text}\n\nТелефон номеріңді жаз:`);
    step[chatId] = {...step[chatId], stage: 2 };
    return;
  }

  if (step[chatId].stage === 2) {
    const order = `🚕 ЖАҢА ЗАКАЗ!\n📍 ${step[chatId].fromTo}\n📞 Клиент: ${text}\n👤 ${msg.from}`;
    // өзіңе жібер - номеріңді жаз
    await client.sendMessage('77084816762@c.us', order); // <--- ОСЫ ЖЕРГЕ ӨЗ НОМЕРІҢДІ ЖАЗ 77... ФОРМАТТА
    await client.sendMessage(chatId, '✅ Заказ қабылданды! Таксист хабарласады.');
    delete step[chatId];
  }
});

client.initialize();

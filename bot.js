sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0]; if (!m.message || m.key.fromMe) return;
    const jid = m.key.remoteJid;
    const part = m.key.participant || jid;
    const text = (m.message.conversation || m.message.extendedTextMessage?.text || '').trim();
    const low = text.toLowerCase();
    if (!text) return;

    // DEBUG - логқа шығарамыз
    console.log(`MSG from ${groups[jid] || jid}: ${text}`);

    // ID ларды логтан алған соң осында қатты жазып қойсаң болады
    // const clientId = '1203630xxxxxx@g.us';
    // const driverId = '1203630xxxxxx@g.us';

    const allIds = Object.keys(groups);
    const clientId = allIds.find(id => groups[id].toLowerCase().includes('гейт')) || allIds[0];
    const driverId = allIds.find(id => groups[id].toLowerCase().includes('таксист')) || allIds[1];

    // 1. ПРАЙС - КЕЗ КЕЛГЕН ЖЕРДЕ
    if (low.includes('прайс') || low === 'баға' || low.includes('/прайс')) {
      console.log('Прайс сұралды, жіберем');
      await sock.sendMessage(jid, { text: PRAIS_TOLIQ });
      return;
    }

    // 2. КЛИЕНТ ЖАЗСА - БАРЛЫҚ ГРУППАДА ТЕКСЕР
    if (jid.endsWith('@g.us')) {
      if (low.includes('такси') || low.includes('керек') || low.includes('жеткіз') || /\d+\s*тг/.test(low) || low.includes('грэс') || low.includes('гейт') || low.includes('до') || low.includes('дан')) {

        const clientPriceMatch = text.match(/(\d+)\s*(тг|тң|k|мың)/i);
        const clientPrice = clientPriceMatch? clientPriceMatch[0] : 'баға көрсетілмеген';
        const praisPrice = getPraisPrice(text);

        zakazId++;
        zakazy[zakazId] = { text, phone: part, from: jid };
        console.log(`Заказ #${zakazId} жасалды`);

        // Сол группаға жауап
        await sock.sendMessage(jid, {
          text: `✅ Заказ #${zakazId} қабылданды!\n\n👤 Сіздің бағаңыз: ${clientPrice}\n💰 Прайс бойынша: ${praisPrice}\n\nЖүргізуші ізделуде...`
        });

        // Таксист группасына жібер
        if (driverId && driverId!== jid) {
          await sock.sendMessage(driverId, {
            text: `🚕 ЖАҢА ЗАКАЗ #${zakazId}\n📍 ${text}\nГруппа: ${groups[jid]}\n\n👤 Клиент бағасы: ${clientPrice}\n💰 Прайс: ${praisPrice}\n📞 Клиент: +${part.split('@')[0]}\n\nАлу: /алам_${zakazId}`,
            mentions: part? [part] : []
          });
        }
      }
    }

    // Таксист алам десе
    if (low.startsWith('/алам')) {
      const num = text.match(/\d+/)?.[0];
      if (!num ||!zakazy[num]) return;
      const order = zakazy[num];
      console.log(`Заказ #${num} алынды`);
      await sock.sendMessage(order.from, { text: `🚕 Заказ #${num} ды ${m.pushName || 'жүргізуші'} алды, хабарласады!\nТел: ${m.key.participant? '+'+m.key.participant.split('@')[0] : ''}` });
      await sock.sendMessage(jid, { text: `✅ #${num} сізде! Клиент: +${order.phone.split('@')[0]}\nЗаказ: ${order.text}` });
    }
  });

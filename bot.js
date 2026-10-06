const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode'); // Браузерге QR шығару үшін

const app = express();
const PORT = process.env.PORT || 3000;

let currentQR = ''; // QR кодты сақтайтын айнымалы

// Веб-беттен QR кодты немесе бот статусын көрсету
app.get('/', async (req, res) => {
    if (currentQR) {
        try {
            const qrImage = await QRCode.toDataURL(currentQR);
            res.send(`
                <div style="text-align: center; font-family: sans-serif; padding-top: 50px;">
                    <h2>🚕 FastTaxi WhatsApp Бот</h2>
                    <p>WhatsApp қосымшасымен мына QR-кодты сканерлеңіз:</p>
                    <img src="${qrImage}" alt="QR Code" style="width: 300px; height: 300px;" />
                    <p><small>Бетті жаңартсаңыз, жаңа QR шығады</small></p>
                </div>
            `);
        } catch (err) {
            res.send('QR-код генерациялауда қате шықты.');
        }
    } else {
        res.send(`
            <div style="text-align: center; font-family: sans-serif; padding-top: 50px;">
                <h2>🚕 FastTaxi WhatsApp Бот белсенді жұмыс істеп тұр!</h2>
                <p style="color: green; font-weight: bold;">✅ Бот WhatsApp-қа қосылған.</p>
            </div>
        `);
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Веб-сервер PORT ${PORT} арқылы іске қосылды.`);
});

// Оперативті дерекқор
const activeDrivers = new Map();
const userStates = new Map();

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr; // QR-ді веб-бетке береміз
            console.log('\n--- QR-КОД ЖАҢАРТЫЛДЫ (Браузерді де тексеріңіз) ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            currentQR = '';
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔴 Қосылым үзілді. Қайта қосылу:', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            currentQR = ''; // Қосылған соң QR-ді өшіреміз
            console.log('✅ «FastTaxi» боты WhatsApp-қа сәтті қосылды!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const from = msg.key.remoteJid;
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

            if (!text) continue;

            const reply = async (content) => {
                await sock.sendMessage(from, { text: content });
            };

            let userState = userStates.get(from) || { step: 'IDLE', data: {} };

            // МӘЗІР ЖӘНЕ БОТ ЛОГИКАСЫ
            if (text.toLowerCase() === 'меню' || text.toLowerCase() === 'сәлем' || text.toLowerCase() === 'такси' || userState.step === 'IDLE') {
                userStates.set(from, { step: 'MAIN_MENU', data: {} });
                await reply(
                    `🤖 *«FastTaxi» ботына кош келдіңіз!*\n\n` +
                    `Таңдауды жасаңыз (нөмірді жазыңыз):\n` +
                    `1️⃣ Такси іздеу (Клиент)\n` +
                    `2️⃣ Линияға шығу (Жүргізуші)\n` +
                    `3️⃣ Линиядан шығу (Жүргізуші)`
                );
                continue;
            }

            // 1. КЛИЕНТ
            if (userState.step === 'MAIN_MENU' && text === '1') {
                userStates.set(from, { step: 'CLIENT_SELECT_ROUTE', data: {} });
                await reply(`📍 *Бағытты таңдаңыз:*\n\n1. Алматы — Қаскелең\n2. Алматы — Ұзынағаш`);
                continue;
            }

            if (userState.step === 'CLIENT_SELECT_ROUTE') {
                let route = text === '1' ? 'Алматы — Қаскелең' : text === '2' ? 'Алматы — Ұзынағаш' : '';
                if (!route) {
                    await reply('❌ Қате таңдау. 1 немесе 2 санын жіберіңіз.');
                    continue;
                }

                const availableDrivers = [];
                for (let [phone, driver] of activeDrivers.entries()) {
                    if (driver.route === route && driver.seats > 0) {
                        availableDrivers.push({ phone, ...driver });
                    }
                }

                if (availableDrivers.length === 0) {
                    userStates.set(from, { step: 'IDLE', data: {} });
                    await reply(`⚠️ *${route}* бағыты бойынша қазіргі уақытта линияда жүргізуші жоқ.\n\nКейінірек қайталап көріңіз немесе қайта *«Меню»* деп жазыңыз.`);
                    continue;
                }

                let listMsg = `🚘 *${route} бойынша активті жүргізушілер:*\n\n`;
                availableDrivers.forEach((drv, index) => {
                    listMsg += `*${index + 1}.* ⏰ Уақыты: ${drv.time} | 👥 Бос орын: ${drv.seats} | 💵 Бағасы: ${drv.price} тг\n`;
                });
                listMsg += `\nҚай жүргізушіге бронь жасайсыз? (Нөмірін жазыңыз: 1, 2...)`;

                userStates.set(from, { step: 'CLIENT_SELECT_DRIVER', data: { route, availableDrivers } });
                await reply(listMsg);
                continue;
            }

            if (userState.step === 'CLIENT_SELECT_DRIVER') {
                const driverIndex = parseInt(text) - 1;
                const drivers = userState.data.availableDrivers;

                if (isNaN(driverIndex) || driverIndex < 0 || driverIndex >= drivers.length) {
                    await reply('❌ Тізімдегі дұрыс нөмірді таңдаңыз.');
                    continue;
                }

                const selectedDriver = drivers[driverIndex];
                userStates.set(from, { step: 'CLIENT_ENTER_SEATS', data: { ...userState.data, selectedDriver } });
                await reply(`Керек орын санын жазыңыз (Максимум: ${selectedDriver.seats}):`);
                continue;
            }

            if (userState.step === 'CLIENT_ENTER_SEATS') {
                const requestedSeats = parseInt(text);
                const driver = userState.data.selectedDriver;

                if (isNaN(requestedSeats) || requestedSeats <= 0 || requestedSeats > driver.seats) {
                    await reply(`❌ Қате сан. 1 мен ${driver.seats} аралығында сан жазыңыз.`);
                    continue;
                }

                const currentDriverData = activeDrivers.get(driver.phone);
                currentDriverData.seats -= requestedSeats;
                activeDrivers.set(driver.phone, currentDriverData);

                const clientPhoneFormatted = from.replace('@s.whatsapp.net', '');
                await reply(
                    `✅ *Бронь сәтті расталды!*\n\n` +
                    `📍 Бағыт: ${driver.route}\n` +
                    `👥 Таңдалған орын: ${requestedSeats}\n` +
                    `⏰ Шығу уақыты: ${driver.time}\n` +
                    `📞 Жүргізуші телефоны: +${driver.phone.replace('@s.whatsapp.net', '')}\n\n` +
                    `Жүргізушіге хабарлама жіберілді!`
                );

                await sock.sendMessage(driver.phone, {
                    text: `🔔 *ЖАҢА БРОНЬ!*\n\n📍 Бағыт: ${driver.route}\n👥 Тапсырыс берілген орын: ${requestedSeats}\n📞 Клиент телефоны: +${clientPhoneFormatted}\n📉 Қалған бос орын: ${currentDriverData.seats}`
                });

                userStates.set(from, { step: 'IDLE', data: {} });
                continue;
            }

            // 2. ЖҮРГІЗУШІ
            if (userState.step === 'MAIN_MENU' && text === '2') {
                userStates.set(from, { step: 'DRIVER_SET_ROUTE', data: {} });
                await reply(`🚘 *Линия ашу үшін бағытты таңдаңыз:*\n\n1. Алматы — Қаскелең\n2. Алматы — Ұзынағаш`);
                continue;
            }

            if (userState.step === 'DRIVER_SET_ROUTE') {
                let route = text === '1' ? 'Алматы — Қаскелең' : text === '2' ? 'Алматы — Ұзынағаш' : '';
                if (!route) {
                    await reply('❌ 1 немесе 2 санын таңдаңыз.');
                    continue;
                }
                userStates.set(from, { step: 'DRIVER_SET_SEATS', data: { route } });
                await reply('Көліктегі бос орын санын көрсетіңіз (1-ден 8-ге дейін):');
                continue;
            }

            if (userState.step === 'DRIVER_SET_SEATS') {
                const seats = parseInt(text);
                if (isNaN(seats) || seats < 1 || seats > 8) {
                    await reply('❌ Орын санын дұрыс жазыңыз (1-ден 8-ге дейін).');
                    continue;
                }
                userStates.set(from, { step: 'DRIVER_SET_TIME', data: { ...userState.data, seats } });
                await reply('Жөнелетін уақытты жазыңыз (мысалы: 15:30 немесе "Толғанда"):');
                continue;
            }

            if (userState.step === 'DRIVER_SET_TIME') {
                userStates.set(from, { step: 'DRIVER_SET_PRICE', data: { ...userState.data, time: text } });
                await reply('1 орынның бағасын жазыңыз (тенгемен):');
                continue;
            }

            if (userState.step === 'DRIVER_SET_PRICE') {
                const price = parseInt(text);
                if (isNaN(price) || price <= 0) {
                    await reply('❌ Бағаны санмен дұрыс енгізіңіз.');
                    continue;
                }

                const driverData = {
                    route: userState.data.route,
                    seats: userState.data.seats,
                    time: userState.data.time,
                    price: price
                };

                activeDrivers.set(from, driverData);
                userStates.set(from, { step: 'IDLE', data: {} });

                await reply(
                    `✅ *Сіз линияға сәтті шықтыңыз!*\n\n` +
                    `🟢 Статус: Линияда\n` +
                    `📍 Бағыт: ${driverData.route}\n` +
                    `👥 Бос орын: ${driverData.seats}\n` +
                    `⏰ Уақыты: ${driverData.time}\n` +
                    `💵 Бағасы: ${driverData.price} тг/орын\n\n` +
                    `Линиядан шығу үшін *«3»* немесе *«Меню»* деп жазыңыз.`
                );
                continue;
            }

            // 3. ЛИНИЯДАН ШЫҒУ
            if ((userState.step === 'MAIN_MENU' && text === '3') || text.toLowerCase() === 'выход') {
                if (activeDrivers.has(from)) {
                    activeDrivers.delete(from);
                    await reply('🔴 Сіз линиядан шықтыңыз. Базадағы статусыңыз: *Оффлайн*.');
                } else {
                    await reply('⚠️ Сіз қазір линияда жоқсыз.');
                }
                userStates.set(from, { step: 'IDLE', data: {} });
                continue;
            }
        }
    });
}

startBot();

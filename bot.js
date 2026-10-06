const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Railway денсаулық тексерісі (Health Check) үшін Express сервері
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🚕 FastTaxi WhatsApp Бот белсенді жұмыс істеп тұр!');
});

app.listen(PORT, () => {
    console.log(`🌐 Веб-сервер PORT ${PORT} арқылы іске қосылды.`);
});

// Оперативті дерекқор (In-memory DB)
const activeDrivers = new Map(); // key: phone, value: { route, seats, time, price }
const userStates = new Map();    // key: phone, value: { step, data }

async function startBot() {
    // Сессия файлдарын сақтау қалтасы
    const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false // QR-кодты өзіміз баптаймыз
    });

    sock.ev.on('creds.update', saveCreds);

    // Қосылу статусын бақылау
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n--- QR-КОДТЫ WHATSAPP АРҚЫЛЫ СКАНИРЛЕҢІЗ ---');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('🔴 Қосылым үзілді. Қайта қосылу:', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ «FastTaxi» боты WhatsApp-қа сәтті қосылды!');
        }
    });

    // Хабарламаларды өңдеу
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe) continue;

            const from = msg.key.remoteJid; // Пайдаланушының ID-і (мысалы: 77001234567@s.whatsapp.net)
            const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();

            if (!text) continue;

            // Көмекші функция: Хабарлама жіберу
            const reply = async (content) => {
                await sock.sendMessage(from, { text: content });
            };

            // Пайдаланушы күйі
            let userState = userStates.get(from) || { step: 'IDLE', data: {} };

            // --- БАСТАПҚЫ МӘЗІР ---
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

            // --- 1. КЛИЕНТ СЦЕНАРИЙІ ---
            if (userState.step === 'MAIN_MENU' && text === '1') {
                userStates.set(from, { step: 'CLIENT_SELECT_ROUTE', data: {} });
                await reply(
                    `📍 *Бағытты таңдаңыз:*\n\n` +
                    `1. Алматы — Қаскелең\n` +
                    `2. Алматы — Ұзынағаш`
                );
                continue;
            }

            if (userState.step === 'CLIENT_SELECT_ROUTE') {
                let route = '';
                if (text === '1') route = 'Алматы — Қаскелең';
                else if (text === '2') route = 'Алматы — Ұзынағаш';
                else {
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
                    await reply(
                        `⚠️ *${route}* бағыты бойынша қазіргі уақытта линияда жүргізуші жоқ.\n\n` +
                        `Кейінірек қайталап көріңіз немесе қайта *«Меню»* деп жазыңыз.`
                    );
                    continue;
                }

                let listMsg = `🚘 *${route} бойынша активті жүргізушілер:*\n\n`;
                availableDrivers.forEach((drv, index) => {
                    listMsg += `*${index + 1}.* ⏰ Уақыты: ${drv.time} | 👥 Бос орын: ${drv.seats} | 💵 Бағасы: ${drv.price} тг\n`;
                });
                listMsg += `\nҚай жүргізушіге бронь жасайсыз? (Нөмірін жазыңыз: 1, 2...)`;

                userStates.set(from, { 
                    step: 'CLIENT_SELECT_DRIVER', 
                    data: { route, availableDrivers } 
                });
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
                userStates.set(from, { 
                    step: 'CLIENT_ENTER_SEATS', 
                    data: { ...userState.data, selectedDriver } 
                });

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

                // Жүргізушіге хабарлама жіберу
                await sock.sendMessage(driver.phone, {
                    text: `🔔 *ЖАҢА БРОНЬ!*\n\n` +
                          `📍 Бағыт: ${driver.route}\n` +
                          `👥 Тапсырыс берілген орын: ${requestedSeats}\n` +
                          `📞 Клиент телефоны: +${clientPhoneFormatted}\n` +
                          `📉 Қалған бос орын: ${currentDriverData.seats}`
                });

                userStates.set(from, { step: 'IDLE', data: {} });
                continue;
            }

            // --- 2. ЖҮРГІЗУШІ: ЛИНИЯҒА ШЫҒУ ---
            if (userState.step === 'MAIN_MENU' && text === '2') {
                userStates.set(from, { step: 'DRIVER_SET_ROUTE', data: {} });
                await reply(
                    `🚘 *Линия ашу үшін бағытты таңдаңыз:*\n\n` +
                    `1. Алматы — Қаскелең\n` +
                    `2. Алматы — Ұзынағаш`
                );
                continue;
            }

            if (userState.step === 'DRIVER_SET_ROUTE') {
                let route = '';
                if (text === '1') route = 'Алматы — Қаскелең';
                else if (text === '2') route = 'Алматы — Ұзынағаш';
                else {
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
                const time = text;
                userStates.set(from, { step: 'DRIVER_SET_PRICE', data: { ...userState.data, time } });
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

            // --- 3. ЖҮРГІЗУШІ: ЛИНИЯДАН ШЫҒУ ---
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

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const app = express();
let lastQr='', isConnected=false, groups={}, zakazId=120, zakazy={};

const PRAIS = `*🚕 ПРАЙС - 4 ы/а (Ынтымақ, Қоянқұс, Жаңадәуір, Жаңаталап) - САЛОН*
*КҮНДІЗ 22:00-ге дейін*

📍 ТӨРТ АУЫЛ ІШІ:
Ауыл іші - 800-1000тг
4 ауыл арасы - 1500тг
Жаңаталап-Жаңадәуір 1000тг
Жаңаталап-Ынтымақ/Қоянқұс 1500тг
Жаңадәуір-Ынтымақ 1000тг
Жаңадәуір-Қоянқұс 1200тг

📍 ЖАҚЫН:
4 ы/а -> Трасса / Магнум 1500тг
4 ы/а -> Гейт Сити / Март 1500 (1 адам) / 2000 салон
4 ы/а -> Көкжиек 2000/2500 салон
4 ы/а -> Пятелетка 2000/2500 салон
4 ы/а -> Хозяюшка 1000-1200тг

📍 ОРТА:
4 ы/а -> ГРЭС 2000тг (Ары-бері 4000тг)
4 ы/а -> Вокзал-1 2000/2500 салон
4 ы/а -> Вокзал-2 3500/4000 багаж
4 ы/а -> Аэропорт 3500тг
4 ы/а -> Байсерке 2500/3000 салон
4 ы/а -> Шолохова-Сейфуллина 2500тг

📍 АЛЫС:
Шолохова базары, Гүлдер, Айнабұлақ, Құрылысшы тб - 2500тг
Құлагер 2800, Барахолка 2700
Папанина, Жасқанат, Роща, Развилка 3000-3500тг
Саялы, Халық Арена, Ақбұлақ, Гүлдала, Апорт Кульджинка, Жаңалық - 4000тг
Сайран 4500/5000, Бесағаш 4500, Тұздыбастау 5000
Орбита, Абая, Чапай 5500тг
Алтынорда, Шұғыла, Алатау, Апорт Молл, Талғар, Бағанашыл - 6000тг
Жаңашар 7000, Шамолған 7500, Ават/Қаскелең 8000, Қапшағай/Есік/Шелек 8500-9000тг

⚠️ Түнде 22:00-ден кейін +500-1000тг
3-4 адам, багаж +500тг`;

function getPrice(text){
  const t=text.toLowerCase();
  if(t.includes('грэс')||t.includes('өтеген')) return '2000тг (Ары-бері 4000тг)';
  if(t.includes('гейт')||t.includes('март')) return '1500тг (1 адам) / 2000тг салон';
  if(t.includes('трасса')||t.includes('магнум')) return '1500тг';
  if(t.includes('көкжиек')||t.includes('кокжиек')) return '2000тг (1 адам) / 2500тг салон';
  if(t.includes('пятачок')||t.includes('пятилетка')||t.includes('талдыкорган')) return '2000тг (1 адам) / 2500тг салон';
  if(t.includes('вокзал-1')||t.includes('вокзал 1')) return '2000тг / 2500тг салон';
  if(t.includes('вокзал-2')||t.includes('вокзал 2')) return '3500тг / 4000тг багаж';
  if(t.includes('аэропорт')||t.includes('әуежай')) return '3500тг';
  if(t.includes('байсерке')) return '2500тг / 3000тг салон';
  if(t.includes('шолохова')&&t.includes('сейфуллина')) return '2500тг';
  if(t.includes('ауыл іші')||t.includes('внутри')) return '800-1000тг';
  return '1500тг (4 ауыл арасы - стандарт)';
}

app.get('/', (req,res)=>{
  if(isConnected) return res.send(`<h1>✅ ДИСПЕТЧЕР ҚОСЫЛДЫ</h1>`);
  if(lastQr) return res.send(`<center><img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(lastQr)}"><script>setTimeout(()=>location.reload(),7000)</script></center>`);
  res.send('Қосылуда...');
});
app.listen(process.env.PORT||3000);

async function start(){
  const { state, saveCreds } = await useMultiFileAuthState('sess');
  const sock = makeWASocket({ auth: state, printQRInTerminal:false });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u)=>{
    if(u.qr) lastQr=u.qr;
    if(u.connection==='open'){ isConnected=true; lastQr=''; const all=await sock.groupFetchAllParticipating(); for(let id in all) groups[id]=all[id].subject; }
    if(u.connection==='close' && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut){ isConnected=false; start(); }
  });

  sock.ev.on('messages.upsert', async ({messages})=>{
    const m=messages[0]; if(!m.message||m.key.fromMe) return;
    const jid=m.key.remoteJid; const part=m.key.participant;
    const text=(m.message.conversation||m.message.extendedTextMessage?.text||'').trim();
    const low=text.toLowerCase();

    const clientId=Object.keys(groups).find(id=>groups[id].includes('ГЕЙТ СИТИ'));
    const driverId=Object.keys(groups).find(id=>groups[id].includes('Таксист'));
    if(!clientId||!driverId) return;

    if(low.includes('прайс')||low.includes('баға')||low.includes('цена')){
      await sock.sendMessage(jid,{text:PRAIS}); return;
    }

    if(jid===clientId && (low.includes('такси')||low.includes('керек')||low.includes('жеткіз')||low.match(/\d+\s*тг/)||low.includes('грэс')||low.includes('гейт'))){
      const clientPrice=text.match(/\d+\s*тг|\d+\s*теңге/i)?.[0]||'баға жазбаған';
      const praisPrice=getPrice(text);
      zakazId++; zakazy[zakazId]={text, clientPhone:part};

      await sock.sendMessage(jid,{text:`✅ Заказ #${zakazId} қабылданды!\n👤 Сіздің бағаңыз: ${clientPrice}\n💰 Прайс бойынша: ${praisPrice}\n\nЖүргізуші ізделуде...`});

      await sock.sendMessage(driverId,{
        text:`🚕 ЖАҢА ЗАКАЗ #${zakazId}\n📍 ${text}\n👤 Клиент бағасы: ${clientPrice}\n💰 Прайс: ${praisPrice}\n📞 +${part?.split('@')[0]}\n\nАлу: /алам_${zakazId}`,
        mentions:[part]
      });
    }

    if(jid===driverId && low.startsWith('/алам')){
      const num=text.match(/\d+/)?.[0]; if(!num||!zakazy[num]) return;
      const order=zakazy[num];
      await sock.sendMessage(order.clientPhone||clientId,{text:`🚕 Заказ #${num} алды - ${m.pushName} жүргізуші, хабарласады!`});
      await sock.sendMessage(driverId,{text:`✅ #${num} алдыңыз! Клиент: +${order.clientPhone?.split('@')[0]}`, mentions:[order.clientPhone]});
      await sock.sendMessage(order.clientPhone,{text:`Сіздің #${num} заказыңызды алдым, шығып келе жатырмын - ${m.pushName}\n${PRAIS.split('\n').slice(0,3).join('\n')}`});
    }

    if(jid===driverId && low.includes('боспын')){
      const place=text.replace(/боспын/gi,'').trim()||'ГРЕС';
      const time=new Date().toLocaleTimeString('kk-KZ',{hour:'2-digit',minute:'2-digit'});
      await sock.sendMessage(driverId,{text:`✅ ${m.pushName} БОС\n📍 ${place}\n⏰ ${time}`, mentions:[part]});
    }
  });
}
start();

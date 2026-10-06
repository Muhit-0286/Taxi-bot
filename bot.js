const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');

// ... 

  sock = makeWASocket({
    auth: state,
    browser: Browsers.ubuntu('Desktop'), // WhatsApp-тың соңғы стандартына сай
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    printQRInTerminal: false
  });

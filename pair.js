import express from 'express';
import { makeWASocket, useMultiFileAuthState, delay } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// HTML Page for Entering Phone Number
const HTML_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KINDRED MD - Pair Code</title>
    <style>
        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); width: 100%; max-width: 400px; text-align: center; }
        h2 { margin-top: 0; color: #38bdf8; }
        input { width: 90%; padding: 12px; margin: 15px 0; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; font-size: 16px; text-align: center; }
        button { background: #0284c7; color: white; border: none; padding: 12px 20px; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; width: 95%; }
        button:hover { background: #0369a1; }
        .code-box { font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #4ade80; background: #0f172a; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px dashed #4ade80; }
    </style>
</head>
<body>
    <div class="card">
        <h2>🩺 KINDRED MD</h2>
        <p>Enter your WhatsApp Number with Country Code (no + or spaces)</p>
        <form action="/code" method="POST">
            <input type="text" name="number" placeholder="e.g. 15551234567" required />
            <button type="submit">Generate Pairing Code</button>
        </form>
    </div>
</body>
</html>
`;

app.get('/', (req, res) => {
    res.send(HTML_PAGE);
});

app.post('/code', async (req, res) => {
    let phoneNumber = req.body.number.replace(/[^0-9]/g, '');

    if (!phoneNumber) {
        return res.send("<h3>Invalid phone number! <a href='/'>Try again</a></h3>");
    }

    const sessionFolder = path.join('./temp_session', phoneNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    try {
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
        });

        sock.ev.on('creds.update', saveCreds);

        if (!sock.authState.creds.registered) {
            await delay(1500);
            const code = await sock.requestPairingCode(phoneNumber);
            const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Your Pairing Code</title>
                    <style>
                        body { font-family: sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .card { background: #1e293b; padding: 2rem; border-radius: 12px; text-align: center; max-width: 400px; }
                        .code { font-size: 28px; font-weight: bold; color: #4ade80; letter-spacing: 3px; background: #0f172a; padding: 15px; border-radius: 8px; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h2>🩺 KINDRED MD</h2>
                        <p>Enter this code in your WhatsApp app:</p>
                        <div class="code">${formattedCode}</div>
                        <ol style="text-align: left; font-size: 14px; color: #cbd5e1;">
                            <li>Open WhatsApp on your phone</li>
                            <li>Go to Linked Devices -> Link a Device</li>
                            <li>Tap <b>"Link with phone number instead"</b></li>
                            <li>Type the 8-character code shown above</li>
                        </ol>
                    </div>
                </body>
                </html>
            `);
        } else {
            res.send("<h3>Device already registered for this number!</h3>");
        }
    } catch (err) {
        console.error("Pairing Error:", err);
        res.send("<h3>Failed to generate pairing code. Please try again later.</h3>");
    }
});

app.listen(PORT, () => {
    console.log(`\n🌐 Pairing Web Portal running at http://localhost:${PORT}`);
});

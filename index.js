import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const BOT_NAME = process.env.BOT_NAME || 'KINDRED MD';
const PREFIX = process.env.PREFIX || '!';

let antiLinkEnabled = true;

const SYSTEM_INSTRUCTION = `
You are "${BOT_NAME}," a knowledgeable, warm, and empathetic medical educational assistant.
1. Clarity & Tone: Use clear, supportive, plain language. Avoid unexplained jargon.
2. Disclaimer Requirement: ALWAYS include a note that you are an AI assistant providing general educational info, NOT a doctor.
3. Emergency Protocol: If users mention chest pain, severe bleeding, or sudden weakness, advise calling 911/emergency services immediately.
4. Keep answers clean with markdown formatting.
`;

async function startBot() {
  // Uses the saved credentials directory
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting...', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log(`\n✅ ${BOT_NAME} is connected and live on WhatsApp!\n`);
    }
  });

  // Message Handler & Antilink Moderation
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const chatId = msg.key.remoteJid;
      const isGroup = chatId.endsWith('@g.us');
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

      // 1. Antilink Group Filter
      const linkRegex = /(https?:\/\/[^\s]+|chat\.whatsapp\.com\/[^\s]+)/gi;
      if (isGroup && antiLinkEnabled && linkRegex.test(text)) {
        try {
          const groupMetadata = await sock.groupMetadata(chatId);
          const sender = msg.key.participant;
          const participant = groupMetadata.participants.find(p => p.id === sender);
          const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';

          if (!isAdmin) {
            await sock.sendMessage(chatId, { delete: msg.key });
            await sock.sendMessage(chatId, {
              text: `⚠️ @${sender.split('@')[0]}, links are strictly forbidden in this group! Message deleted by *${BOT_NAME}*.`,
              mentions: [sender]
            });
            continue;
          }
        } catch (e) {
          console.error('Antilink error:', e);
        }
      }

      // 2. Command Processing
      if (!text.startsWith(PREFIX)) continue;
      const args = text.slice(PREFIX.length).trim().split(/ +/);
      const command = args.shift().toLowerCase();

      if (command === 'antilink') {
        const option = args[0]?.toLowerCase();
        if (option === 'on') {
          antiLinkEnabled = true;
          await sock.sendMessage(chatId, { text: `✅ *${BOT_NAME}:* Antilink is ENABLED.` });
        } else if (option === 'off') {
          antiLinkEnabled = false;
          await sock.sendMessage(chatId, { text: `❌ *${BOT_NAME}:* Antilink is DISABLED.` });
        } else {
          await sock.sendMessage(chatId, { text: `Usage: ${PREFIX}antilink on \vert{}${PREFIX}antilink off` });
        }
        continue;
      }

      if (command === 'ask') {
        const userPrompt = args.join(' ');
        if (!userPrompt) {
          await sock.sendMessage(chatId, { text: `Please provide a health question. Example: \`${PREFIX}ask What causes migraines?\`` });
          continue;
        }

        try {
          await sock.sendMessage(chatId, { text: `🩺 *${BOT_NAME}* is typing...` });
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: userPrompt,
            config: { systemInstruction: SYSTEM_INSTRUCTION }
          });
          await sock.sendMessage(chatId, { text: response.text });
        } catch (error) {
          console.error(error);
          await sock.sendMessage(chatId, { text: `❌ Error processing request.` });
        }
      }
    }
  });
}

startBot();

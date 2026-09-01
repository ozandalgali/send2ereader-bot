const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SEND2EREADER_URL = process.env.SEND2EREADER_URL || 'https://send.djazz.se';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN environment variable is required. Get one from @BotFather on Telegram.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

// Store user settings (in production, use a database)
const userSettings = {};

const SUPPORTED_EXTENSIONS = ['.epub', '.mobi', '.pdf', '.txt', '.cbz', '.cbr', '.html'];

function getUserSettings(chatId) {
  if (!userSettings[chatId]) {
    userSettings[chatId] = {
      key: null,
      kepubify: true,  // Default on for Kobo
      kindlegen: false,
      pdfcropmargins: false
    };
  }
  return userSettings[chatId];
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  getUserSettings(chatId);

  bot.sendMessage(chatId,
    `*Welcome to Send2Ereader Bot!*\n\n` +
    `This bot forwards ebook files directly to your Kobo/Kindle.\n\n` +
    `*Setup:*\n` +
    `1. On your ereader, open the browser and go to:\n` +
    `   \`send.djazz.se\`\n` +
    `2. Copy your unique key shown on screen\n` +
    `3. Send me the key with: /setkey YOUR_KEY\n\n` +
    `*Then:*\n` +
    `Just forward any ebook file to me and I'll send it to your ereader!\n\n` +
    `*Commands:*\n` +
    `/setkey KEY - Set your ereader key\n` +
    `/settings - View/change conversion settings\n` +
    `/help - Show this message`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id,
    `*Send2Ereader Bot Help*\n\n` +
    `*Supported formats:* EPUB, MOBI, PDF, TXT, CBZ, CBR, HTML\n\n` +
    `*Commands:*\n` +
    `/setkey KEY - Set your ereader key\n` +
    `/settings - View/change conversion settings\n` +
    `/kepubify - Toggle Kepubify (Kobo EPUB enhancement)\n` +
    `/kindlegen - Toggle KindleGen (EPUB to MOBI)\n` +
    `/pdfcrop - Toggle PDF margin cropping\n\n` +
    `*Usage:*\n` +
    `Just forward or send any ebook file to me!`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/setkey (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const key = match[1].trim().toUpperCase();

  if (key.length < 3) {
    bot.sendMessage(chatId, 'Invalid key. Please enter the key shown on your ereader.');
    return;
  }

  const settings = getUserSettings(chatId);
  settings.key = key;

  bot.sendMessage(chatId,
    `Key set to: \`${key}\`\n\nNow send me an ebook file!`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/settings/, (msg) => {
  const chatId = msg.chat.id;
  const settings = getUserSettings(chatId);

  const keyStatus = settings.key ? `\`${settings.key}\`` : 'Not set';

  bot.sendMessage(chatId,
    `*Current Settings:*\n\n` +
    `Key: ${keyStatus}\n` +
    `Kepubify (Kobo): ${settings.kepubify ? 'ON' : 'OFF'}\n` +
    `KindleGen: ${settings.kindlegen ? 'ON' : 'OFF'}\n` +
    `PDF Crop: ${settings.pdfcropmargins ? 'ON' : 'OFF'}\n\n` +
    `Use /kepubify, /kindlegen, /pdfcrop to toggle`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/kepubify/, (msg) => {
  const chatId = msg.chat.id;
  const settings = getUserSettings(chatId);
  settings.kepubify = !settings.kepubify;
  bot.sendMessage(chatId, `Kepubify is now ${settings.kepubify ? 'ON' : 'OFF'}`);
});

bot.onText(/\/kindlegen/, (msg) => {
  const chatId = msg.chat.id;
  const settings = getUserSettings(chatId);
  settings.kindlegen = !settings.kindlegen;
  bot.sendMessage(chatId, `KindleGen is now ${settings.kindlegen ? 'ON' : 'OFF'}`);
});

bot.onText(/\/pdfcrop/, (msg) => {
  const chatId = msg.chat.id;
  const settings = getUserSettings(chatId);
  settings.pdfcropmargins = !settings.pdfcropmargins;
  bot.sendMessage(chatId, `PDF Crop is now ${settings.pdfcropmargins ? 'ON' : 'OFF'}`);
});

// Handle document/file uploads
bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const settings = getUserSettings(chatId);

  if (!settings.key) {
    bot.sendMessage(chatId,
      'Please set your ereader key first!\n\n' +
      '1. Open send.djazz.se on your ereader\n' +
      '2. Send me: /setkey YOUR_KEY'
    );
    return;
  }

  const doc = msg.document;
  const fileName = doc.file_name;
  const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.includes(fileExt)) {
    bot.sendMessage(chatId,
      `Unsupported file type: ${fileExt}\n\n` +
      `Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`
    );
    return;
  }

  const statusMsg = await bot.sendMessage(chatId, `Downloading: ${fileName}...`);

  try {
    // Get file path from Telegram
    const file = await bot.getFile(doc.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    // Download file from Telegram
    await bot.editMessageText(`Uploading to ereader...`, {
      chat_id: chatId,
      message_id: statusMsg.message_id
    });

    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(response.data);

    // Create form data for send2ereader
    const form = new FormData();
    form.append('key', settings.key);
    form.append('file', fileBuffer, {
      filename: fileName,
      contentType: doc.mime_type || 'application/octet-stream'
    });

    if (settings.kepubify) form.append('kepubify', 'on');
    if (settings.kindlegen) form.append('kindlegen', 'on');
    if (settings.pdfcropmargins) form.append('pdfcropmargins', 'on');

    // Upload to send2ereader
    const uploadResponse = await axios.post(`${SEND2EREADER_URL}/upload`, form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    await bot.editMessageText(
      `Sent to ereader: ${fileName}\n\n` +
      `Make sure your ereader is viewing send.djazz.se with your key!`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id
      }
    );

  } catch (error) {
    console.error('Error:', error.message);
    let errorMsg = 'Failed to send file.';

    if (error.response) {
      errorMsg += ` Server returned: ${error.response.status}`;
    }

    await bot.editMessageText(
      `Error: ${errorMsg}\n\nMake sure your ereader key is correct and your device is connected.`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id
      }
    );
  }
});

console.log('Send2Ereader Bot is running...');

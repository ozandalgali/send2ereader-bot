import { Bot, GrammyError, HttpError } from 'grammy';
import { uploadToEreader } from './upload.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const SEND2EREADER_URL = process.env.SEND2EREADER_URL || 'https://send.djazz.se';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN environment variable is required. Get one from @BotFather on Telegram.');
  process.exit(1);
}

const SUPPORTED_EXTENSIONS = ['.epub', '.mobi', '.pdf', '.txt', '.cbz', '.cbr', '.html'];

// Telegram's Bot API refuses to serve files larger than this to bots.
const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

// Per-chat settings. In memory only: a restart or redeploy clears every key.
const userSettings = new Map();

function getUserSettings(chatId) {
  let settings = userSettings.get(chatId);
  if (!settings) {
    settings = {
      key: null,
      kepubify: true, // Default on for Kobo
      kindlegen: false,
      pdfcropmargins: false,
    };
    userSettings.set(chatId, settings);
  }
  return settings;
}

const bot = new Bot(BOT_TOKEN);

bot.command('start', async (ctx) => {
  getUserSettings(ctx.chat.id);
  await ctx.reply(
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
    { parse_mode: 'Markdown' },
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
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
    { parse_mode: 'Markdown' },
  );
});

bot.command('setkey', async (ctx) => {
  const key = ctx.match.trim().toUpperCase();

  if (key.length < 3) {
    await ctx.reply('Invalid key. Please enter the key shown on your ereader.');
    return;
  }

  getUserSettings(ctx.chat.id).key = key;
  await ctx.reply(`Key set to: \`${key}\`\n\nNow send me an ebook file!`, {
    parse_mode: 'Markdown',
  });
});

bot.command('settings', async (ctx) => {
  const settings = getUserSettings(ctx.chat.id);
  await ctx.reply(
    `*Current Settings:*\n\n` +
      `Key: ${settings.key ? `\`${settings.key}\`` : 'Not set'}\n` +
      `Kepubify (Kobo): ${settings.kepubify ? 'ON' : 'OFF'}\n` +
      `KindleGen: ${settings.kindlegen ? 'ON' : 'OFF'}\n` +
      `PDF Crop: ${settings.pdfcropmargins ? 'ON' : 'OFF'}\n\n` +
      `Use /kepubify, /kindlegen, /pdfcrop to toggle`,
    { parse_mode: 'Markdown' },
  );
});

const TOGGLES = {
  kepubify: { field: 'kepubify', label: 'Kepubify' },
  kindlegen: { field: 'kindlegen', label: 'KindleGen' },
  pdfcrop: { field: 'pdfcropmargins', label: 'PDF Crop' },
};

for (const [command, { field, label }] of Object.entries(TOGGLES)) {
  bot.command(command, async (ctx) => {
    const settings = getUserSettings(ctx.chat.id);
    settings[field] = !settings[field];
    await ctx.reply(`${label} is now ${settings[field] ? 'ON' : 'OFF'}`);
  });
}

bot.on('message:document', async (ctx) => {
  const settings = getUserSettings(ctx.chat.id);

  if (!settings.key) {
    await ctx.reply(
      'Please set your ereader key first!\n\n' +
        '1. Open send.djazz.se on your ereader\n' +
        '2. Send me: /setkey YOUR_KEY',
    );
    return;
  }

  const doc = ctx.message.document;
  const fileName = doc.file_name ?? 'file';
  const fileExt = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.includes(fileExt)) {
    await ctx.reply(
      `Unsupported file type: ${fileExt}\n\n` + `Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`,
    );
    return;
  }

  if (doc.file_size && doc.file_size > TELEGRAM_MAX_DOWNLOAD_BYTES) {
    const mb = (doc.file_size / 1024 / 1024).toFixed(1);
    await ctx.reply(
      `File is too large: ${mb} MB.\n\n` +
        `Telegram does not let bots download files over 20 MB, so I cannot forward this one. ` +
        `Try a smaller file, or upload it directly at send.djazz.se.`,
    );
    return;
  }

  const statusMsg = await ctx.reply(`Downloading: ${fileName}...`);
  const editStatus = (text) =>
    ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, text).catch(() => {});

  try {
    const file = await ctx.getFile();
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    await editStatus('Uploading to ereader...');

    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`Telegram file download failed: ${res.status} ${res.statusText}`);
    }
    const data = new Uint8Array(await res.arrayBuffer());

    await uploadToEreader({
      baseUrl: SEND2EREADER_URL,
      key: settings.key,
      filename: fileName,
      data,
      contentType: doc.mime_type || 'application/octet-stream',
      settings,
    });

    await editStatus(
      `Sent to ereader: ${fileName}\n\n` +
        `Make sure your ereader is viewing send.djazz.se with your key!`,
    );
  } catch (error) {
    console.error('Upload failed:', error.message);
    await editStatus(
      `Error: Failed to send file. ${error.message}\n\n` +
        `Make sure your ereader key is correct and your device is connected.`,
    );
  }
});

// Keep the process alive on API/network trouble instead of crash-looping.
bot.catch((err) => {
  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Telegram API error:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Network error contacting Telegram:', e.message);
  } else {
    console.error('Unexpected error:', e);
  }
});

bot.start({
  onStart: () => console.log('Send2Ereader Bot is running...'),
  // Polling failures (bad token, network blips) land here rather than as an
  // unhandled rejection, so Coolify logs show a readable reason.
  drop_pending_updates: false,
}).catch((err) => {
  if (err instanceof GrammyError) {
    console.error(`Polling error: ${err.error_code} ${err.description}`);
  } else {
    console.error('Polling error:', err.message ?? err);
  }
});

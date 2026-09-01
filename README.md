# Send2Ereader Telegram Bot

A Telegram bot that forwards ebook files directly to your Kobo/Kindle via [send.djazz.se](https://send.djazz.se).

Forked from [JarrodJS/send2ereader-bot](https://github.com/JarrodJS/send2ereader-bot), with the
hardcoded bot token removed and Docker/Coolify deployment added.

## Features

- Forward ebook files directly to your ereader
- Supports: EPUB, MOBI, PDF, TXT, CBZ, CBR, HTML
- Kepubify conversion for Kobo
- KindleGen conversion for Kindle
- PDF margin cropping

## Getting a bot token

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the token it gives you — this is your `BOT_TOKEN`

Treat this token like a password. Anyone holding it controls the bot.

## Deploy on Coolify

This bot is a **long-polling worker**: it makes outbound connections to Telegram and listens on
no port. It needs no domain, no exposed port, and no HTTP healthcheck.

1. In Coolify: **+ New** → **Resource** → **Docker Compose**, pointing at this repository
   (Build Pack: `Docker Compose`, Compose file: `docker-compose.yaml`)
2. Under **Environment Variables**, add:
   - `BOT_TOKEN` — your token from @BotFather (mark as secret / build-time not needed)
   - `SEND2EREADER_URL` — optional, defaults to `https://send.djazz.se`
3. **Deploy**
4. Check **Logs** for `Send2Ereader Bot is running...`

If you see `Polling error: ETELEGRAM: 401 Unauthorized`, the token is wrong.
If you see `409 Conflict`, the same token is running in two places at once — see below.

### Only one instance per token

Telegram permits exactly one long-polling consumer per bot token. Do not scale this service
past one replica, and stop any local/other copy before deploying, or both will fight for
updates and drop messages.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `BOT_TOKEN` | yes | — | From @BotFather. Process exits immediately if unset. |
| `SEND2EREADER_URL` | no | `https://send.djazz.se` | Change only if self-hosting send2ereader. |

## Local development

```bash
npm install
cp .env.example .env   # then fill in BOT_TOKEN
BOT_TOKEN=your_token node index.js
```

## Bot commands

- `/start` — Welcome message and setup instructions
- `/setkey KEY` — Set your ereader key from send.djazz.se
- `/settings` — View current settings
- `/kepubify` — Toggle Kepubify conversion (Kobo)
- `/kindlegen` — Toggle KindleGen conversion (Kindle)
- `/pdfcrop` — Toggle PDF margin cropping
- `/help` — Show help message

## Usage

1. On your Kobo/Kindle, open the browser and go to `send.djazz.se`
2. Note the unique key shown on screen
3. In Telegram, send `/setkey YOUR_KEY` to the bot
4. Send or forward any ebook file to the bot
5. The book appears on your ereader

## Known limitations

- **Settings are in-memory.** Every restart or redeploy clears all saved keys and toggles;
  you will need to `/setkey` again. Persisting these would require adding a datastore.
- **The bot is open to anyone who finds it.** There is no allowlist — any Telegram user can
  set their own key and push files through your instance. Keep the bot's username private,
  or add a chat-ID check if that matters to you.
- **Telegram caps bot downloads at 20 MB**, so larger ebooks will fail.

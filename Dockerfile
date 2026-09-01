FROM node:24-alpine

# Bot is long-polling only: no ports exposed, no healthcheck endpoint.
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Drop root; the node image ships an unprivileged `node` user.
USER node

CMD ["node", "index.js"]

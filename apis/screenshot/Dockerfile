FROM node:22-slim

# Install Playwright system dependencies
RUN npx playwright@1.50.1 install --with-deps chromium

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js ./

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]

FROM node:22-slim

# md-to-pdf uses Puppeteer under the hood
RUN apt-get update && \
    apt-get install -y chromium fonts-liberation libatk-bridge2.0-0 libatk1.0-0 \
    libcups2 libdrm2 libgbm1 libnss3 libxcomposite1 libxdamage1 libxrandr2 \
    libpango-1.0-0 libcairo2 libasound2 && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js ./

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]

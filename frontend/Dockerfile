FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN chmod +x /app/healthcheck.js

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node /app/healthcheck.js || exit 1

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

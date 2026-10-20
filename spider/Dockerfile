FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY *.mjs ./
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]

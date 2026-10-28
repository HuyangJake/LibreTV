FROM node:22-alpine
WORKDIR /runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /data && chown node:node /data
COPY . .
USER node
ENV NODE_ENV=production NODE_PATH=/data DEV_HTTP_PORT=9988
CMD ["node", "server.mjs"]

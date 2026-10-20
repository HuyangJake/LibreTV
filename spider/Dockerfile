FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node *.mjs ./
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]

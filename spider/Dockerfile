FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 py3-pip \
    && python3 -m venv /opt/browser-client
COPY requirements.txt ./
RUN /opt/browser-client/bin/pip install --no-cache-dir -r requirements.txt
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node *.mjs ./
COPY --chown=node:node browser_fetch*.py ./
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]

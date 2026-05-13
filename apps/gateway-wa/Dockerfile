FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/gateway-wa/package.json ./apps/gateway-wa/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN npm ci

COPY apps/gateway-wa ./apps/gateway-wa
COPY packages/contracts ./packages/contracts

CMD ["npm", "run", "-w", "@serena/gateway-wa", "start"]

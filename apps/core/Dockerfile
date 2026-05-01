FROM node:22.12-alpine

WORKDIR /app

COPY apps/core/package.json ./package.json
COPY apps/core/src ./src

EXPOSE 3000

CMD ["npm", "run", "start"]

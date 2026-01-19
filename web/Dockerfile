FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && npm install

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]

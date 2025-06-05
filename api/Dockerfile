FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# generate prisma client
RUN npx prisma generate

# remove dev dependencies for a smaller image
RUN npm prune --production

# Copy source code
COPY . .

EXPOSE 8080
CMD ["node", "src/index.js"] 
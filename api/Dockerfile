FROM node:20-alpine

WORKDIR /app

# copy package.json and package-lock.json
COPY package*.json ./

# copy prisma schema and migration files
# this ensures prisma generate can find the schema
COPY prisma ./prisma/ 

# set prisma engine type before install and generate
ENV PRISMA_CLIENT_ENGINE_TYPE="binary"

# install all dependencies (including prisma cli for generation)
RUN npm install 

# generate prisma client
RUN npx prisma generate

# remove dev dependencies for a smaller image (optional, but good practice)
RUN npm prune --production

# copy the rest of your application code
# this will copy src/, etc. and overwrite the prisma folder but that's fine
# as the schema would be the same.
COPY . .

EXPOSE 8080
CMD ["node", "src/index.js"] 
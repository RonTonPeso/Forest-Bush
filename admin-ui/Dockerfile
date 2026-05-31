# Stage 1: Build the React application
FROM node:20-alpine AS builder
WORKDIR /app

# Set the build-time argument
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# Stage 2: Serve the static files in a production environment
FROM node:20-alpine
WORKDIR /app

# Copy built assets and package files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install ONLY production dependencies
RUN npm install --omit=dev --legacy-peer-deps

# Expose the port and start the server
EXPOSE 3000
CMD [ "npx", "serve", "-s", "dist", "-l", "3000" ] 
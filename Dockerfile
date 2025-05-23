# Base image
FROM node:18-bullseye

# Set working directory
WORKDIR /app

# Copy package files first (untuk caching layer)
COPY package*.json ./

# Bersihkan cache npm terlebih dahulu
RUN npm cache clean --force

# Install dependencies
RUN npm install

# Copy semua file project
COPY . .

# Jalankan aplikasi
CMD ["node", "server.js"]

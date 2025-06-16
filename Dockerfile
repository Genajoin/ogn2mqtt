FROM node:18-alpine

WORKDIR /app

# Копируем package.json и package-lock.json для кэширования слоев
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем код приложения
COPY index.js ./
COPY lib/ ./lib/

# Создаем пользователя без прав root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Переключаемся на пользователя nodejs
USER nodejs

# Команда по умолчанию
CMD ["node", "index.js"]
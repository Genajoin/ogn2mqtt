class MessageFilter {
    constructor(config = {}) {
        this.config = {
            rateLimitSeconds: config.rateLimitSeconds || 1,
            maxMessageAge: config.maxMessageAge || 3600000, // 1 час в миллисекундах
            cacheCleanupInterval: config.cacheCleanupInterval || 300000, // 5 минут
            maxCacheSize: config.maxCacheSize || 10000
        };

        // Кэш последних сообщений по device ID
        this.deviceCache = new Map();
        
        // Статистика
        this.stats = {
            processed: 0,
            passed: 0,
            filtered: {
                rateLimited: 0,
                duplicate: 0,
                tooOld: 0,
                invalid: 0
            }
        };

        // Запуск периодической очистки кэша
        this.startCacheCleanup();
    }

    /**
     * Проверяет, должно ли сообщение быть обработано
     * @param {object} aprsData - данные из APRS парсера
     * @returns {boolean} - true если сообщение можно обрабатывать
     */
    shouldProcess(aprsData) {
        this.stats.processed++;

        if (!aprsData) {
            this.stats.filtered.invalid++;
            return false;
        }

        // Пропускаем статусные сообщения без фильтрации
        if (aprsData.messageType !== 'position') {
            this.stats.passed++;
            return true;
        }

        // Проверка возраста сообщения
        if (this.isMessageTooOld(aprsData)) {
            this.stats.filtered.tooOld++;
            return false;
        }

        // Проверка дубликатов и частотного ограничения
        if (this.isRateLimited(aprsData)) {
            this.stats.filtered.rateLimited++;
            return false;
        }

        // Обновляем кэш для устройства
        this.updateDeviceCache(aprsData);
        
        this.stats.passed++;
        return true;
    }

    isMessageTooOld(data) {
        const messageAge = Date.now() - data.receivedTime.getTime();
        return messageAge > this.config.maxMessageAge;
    }

    isRateLimited(data) {
        const deviceId = data.deviceId;
        if (!deviceId) return false;

        const cached = this.deviceCache.get(deviceId);
        if (!cached) {
            return false; // Первое сообщение от устройства
        }

        const timeDiff = data.receivedTime.getTime() - cached.lastMessageTime;
        const rateLimitMs = this.config.rateLimitSeconds * 1000;

        if (timeDiff < rateLimitMs) {
            // Проверяем, не является ли это дубликатом
            if (this.isDuplicate(data, cached)) {
                this.stats.filtered.duplicate++;
                return true;
            }
            
            // Частотное ограничение
            return true;
        }

        return false;
    }

    isDuplicate(newData, cachedData) {
        // Проверяем ключевые поля на совпадение
        const tolerance = 0.0001; // Допуск для координат (~10 метров)
        
        return Math.abs(newData.latitude - cachedData.latitude) < tolerance &&
               Math.abs(newData.longitude - cachedData.longitude) < tolerance &&
               Math.abs((newData.altitude || 0) - (cachedData.altitude || 0)) < 10; // 10 метров допуск по высоте
    }

    updateDeviceCache(data) {
        const deviceId = data.deviceId;
        
        this.deviceCache.set(deviceId, {
            deviceId: deviceId,
            lastMessageTime: data.receivedTime.getTime(),
            latitude: data.latitude,
            longitude: data.longitude,
            altitude: data.altitude,
            messageCount: (this.deviceCache.get(deviceId)?.messageCount || 0) + 1
        });

        // Ограничиваем размер кэша
        if (this.deviceCache.size > this.config.maxCacheSize) {
            this.cleanupOldEntries();
        }
    }

    startCacheCleanup() {
        setInterval(() => {
            this.cleanupOldEntries();
        }, this.config.cacheCleanupInterval);
    }

    cleanupOldEntries() {
        const now = Date.now();
        const cutoffTime = now - this.config.maxMessageAge;
        let removedCount = 0;

        for (const [deviceId, cached] of this.deviceCache.entries()) {
            if (cached.lastMessageTime < cutoffTime) {
                this.deviceCache.delete(deviceId);
                removedCount++;
            }
        }

        if (removedCount > 0) {
            this.log('debug', `Очищено ${removedCount} старых записей из кэша`, {
                cacheSize: this.deviceCache.size
            });
        }
    }

    /**
     * Возвращает статистику фильтрации
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.deviceCache.size,
            passRate: this.stats.processed > 0 ? (this.stats.passed / this.stats.processed * 100).toFixed(2) + '%' : '0%'
        };
    }

    /**
     * Сброс статистики
     */
    resetStats() {
        this.stats = {
            processed: 0,
            passed: 0,
            filtered: {
                rateLimited: 0,
                duplicate: 0,
                tooOld: 0,
                invalid: 0
            }
        };
    }

    /**
     * Получение информации о конкретном устройстве
     */
    getDeviceInfo(deviceId) {
        return this.deviceCache.get(deviceId) || null;
    }

    /**
     * Получение списка активных устройств
     */
    getActiveDevices() {
        const now = Date.now();
        const recentThreshold = now - (5 * 60 * 1000); // 5 минут
        
        const activeDevices = [];
        for (const [deviceId, cached] of this.deviceCache.entries()) {
            if (cached.lastMessageTime > recentThreshold) {
                activeDevices.push({
                    deviceId,
                    lastSeen: new Date(cached.lastMessageTime),
                    messageCount: cached.messageCount,
                    position: {
                        latitude: cached.latitude,
                        longitude: cached.longitude,
                        altitude: cached.altitude
                    }
                });
            }
        }

        return activeDevices.sort((a, b) => b.lastSeen - a.lastSeen);
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logData = data ? ` ${JSON.stringify(data)}` : '';
        console.log(`[${timestamp}] [MESSAGE-FILTER] [${level.toUpperCase()}] ${message}${logData}`);
    }
}

module.exports = MessageFilter;
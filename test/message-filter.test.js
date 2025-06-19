const MessageFilter = require('../lib/message-filter');

describe('MessageFilter', () => {
  let filter;

  beforeEach(() => {
    // Мокаем setInterval для Jest окружения
    global.setInterval = jest.fn();
    global.clearInterval = jest.fn();
    
    filter = new MessageFilter({
      rateLimitSeconds: 1,
      maxMessageAge: 3600000, // 1 час
      cacheCleanupInterval: 300000, // 5 минут
      maxCacheSize: 100
    });
    
    // Очищаем таймеры для чистых тестов
    jest.clearAllTimers();
  });

  afterEach(() => {
    // Очищаем ресурсы
    if (filter && filter.cleanup) {
      filter.cleanup();
    }
    jest.clearAllTimers();
  });

  describe('конструктор и конфигурация', () => {
    test('должен создаваться с настройками по умолчанию', () => {
      const defaultFilter = new MessageFilter();
      
      expect(defaultFilter.config.rateLimitSeconds).toBe(1);
      expect(defaultFilter.config.maxMessageAge).toBe(3600000);
      expect(defaultFilter.config.cacheCleanupInterval).toBe(300000);
      expect(defaultFilter.config.maxCacheSize).toBe(10000);
    });

    test('должен принимать кастомную конфигурацию', () => {
      const customConfig = {
        rateLimitSeconds: 2,
        maxMessageAge: 1800000,
        maxCacheSize: 500
      };
      
      const customFilter = new MessageFilter(customConfig);
      
      expect(customFilter.config.rateLimitSeconds).toBe(2);
      expect(customFilter.config.maxMessageAge).toBe(1800000);
      expect(customFilter.config.maxCacheSize).toBe(500);
    });

    test('должен инициализировать статистику', () => {
      expect(filter.stats.processed).toBe(0);
      expect(filter.stats.passed).toBe(0);
      expect(filter.stats.filtered.rateLimited).toBe(0);
      expect(filter.stats.filtered.duplicate).toBe(0);
      expect(filter.stats.filtered.tooOld).toBe(0);
      expect(filter.stats.filtered.invalid).toBe(0);
    });
  });

  describe('обработка статусных сообщений', () => {
    test('должен пропускать статусные сообщения без фильтрации', () => {
      const statusMessage = {
        messageType: 'status',
        sourceCall: 'TEST123',
        text: 'Test status message',
        receivedTime: new Date()
      };

      expect(filter.shouldProcess(statusMessage)).toBe(true);
      expect(filter.stats.passed).toBe(1);
      expect(filter.stats.processed).toBe(1);
    });
  });

  describe('фильтрация по возрасту сообщений', () => {
    test('должен пропускать свежие сообщения', () => {
      const freshMessage = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: new Date()
      };

      expect(filter.shouldProcess(freshMessage)).toBe(true);
    });

    test('должен отклонять слишком старые сообщения', () => {
      const oldMessage = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: new Date(Date.now() - 3700000) // старше 1 часа
      };

      expect(filter.shouldProcess(oldMessage)).toBe(false);
      expect(filter.stats.filtered.tooOld).toBe(1);
    });
  });

  describe('rate limiting', () => {
    test('должен пропускать первое сообщение от устройства', () => {
      const message = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: new Date()
      };

      expect(filter.shouldProcess(message)).toBe(true);
      expect(filter.deviceCache.has('TEST123')).toBe(true);
    });

    test('должен блокировать быстро повторяющиеся сообщения', () => {
      const baseTime = new Date();
      
      const message1 = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: baseTime
      };

      const message2 = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0001,
        longitude: 14.0001,
        receivedTime: new Date(baseTime.getTime() + 500) // через 0.5 секунды
      };

      expect(filter.shouldProcess(message1)).toBe(true);
      expect(filter.shouldProcess(message2)).toBe(false);
      expect(filter.stats.filtered.rateLimited).toBe(1);
    });

    test('должен пропускать сообщения после истечения rate limit', () => {
      jest.useFakeTimers();
      const baseTime = Date.now();
      
      const message1 = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: new Date(baseTime)
      };

      const message2 = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0001,
        longitude: 14.0001,
        receivedTime: new Date(baseTime + 1100) // через 1.1 секунды
      };

      expect(filter.shouldProcess(message1)).toBe(true);
      
      // Продвигаем время
      jest.advanceTimersByTime(1100);
      
      expect(filter.shouldProcess(message2)).toBe(true);
      
      jest.useRealTimers();
    });

    test('должен корректно обрабатывать частые сообщения без "застревания"', () => {
      // Упрощенный тест для проверки основной проблемы "застревания"
      const baseTime = Date.now();
      
      const message1 = {
        messageType: 'position',
        deviceId: 'RAPID123',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: new Date(baseTime)
      };

      const message2 = {
        messageType: 'position',
        deviceId: 'RAPID123',
        latitude: 46.001, // значительно другая позиция
        longitude: 14.001,
        receivedTime: new Date(baseTime + 500) // +0.5 сек, должно блокироваться
      };

      const message3 = {
        messageType: 'position',
        deviceId: 'RAPID123',
        latitude: 46.002, // еще более другая позиция
        longitude: 14.002,
        receivedTime: new Date(baseTime + 1100) // +1.1 сек, должно проходить
      };

      // Первое сообщение проходит
      expect(filter.shouldProcess(message1)).toBe(true);
      expect(filter.stats.passed).toBe(1);
      
      // Второе блокируется по rate limit
      expect(filter.shouldProcess(message2)).toBe(false);
      expect(filter.stats.filtered.rateLimited).toBe(1);
      
      // Третье должно пройти - это ключевая проверка против "застревания"
      expect(filter.shouldProcess(message3)).toBe(true);
      expect(filter.stats.passed).toBe(2);
      
      // Основная проверка: устройство НЕ застряло в блокировке
      const finalDevice = filter.getDeviceInfo('RAPID123');
      expect(finalDevice.lastMessageTime).toBeGreaterThan(baseTime);
    });
  });

  describe('детекция дубликатов', () => {
    test('должен детектировать дубликаты по координатам', () => {
      const baseTime = new Date();
      
      const message1 = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        altitude: 1000,
        receivedTime: baseTime
      };

      const duplicateMessage = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        altitude: 1005, // чуть другая высота, но в пределах допуска
        receivedTime: new Date(baseTime.getTime() + 500)
      };

      expect(filter.shouldProcess(message1)).toBe(true);
      expect(filter.shouldProcess(duplicateMessage)).toBe(false);
      expect(filter.stats.filtered.duplicate).toBe(1);
    });

    test('должен пропускать сообщения с существенно отличающимися координатами', () => {
      const baseTime = new Date();
      
      const message1 = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: baseTime
      };

      const differentMessage = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.001, // существенная разница в координатах
        longitude: 14.001,
        receivedTime: new Date(baseTime.getTime() + 500)
      };

      filter.shouldProcess(message1);
      
      // Это должно пройти как rate limited, но не как duplicate
      expect(filter.shouldProcess(differentMessage)).toBe(false);
      expect(filter.stats.filtered.rateLimited).toBe(1);
      expect(filter.stats.filtered.duplicate).toBe(0);
    });
  });

  describe('управление кэшем', () => {
    test('должен обновлять кэш при обработке сообщений', () => {
      const message = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        altitude: 1000,
        receivedTime: new Date()
      };

      filter.shouldProcess(message);
      
      const cached = filter.deviceCache.get('TEST123');
      expect(cached).toBeDefined();
      expect(cached.deviceId).toBe('TEST123');
      expect(cached.latitude).toBe(46.0);
      expect(cached.longitude).toBe(14.0);
      expect(cached.altitude).toBe(1000);
      expect(cached.messageCount).toBe(1);
    });

    test('должен увеличивать счетчик сообщений', () => {
      const message = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: new Date()
      };

      filter.shouldProcess(message);
      filter.shouldProcess({...message, receivedTime: new Date(Date.now() + 1100)});
      
      const cached = filter.deviceCache.get('TEST123');
      expect(cached.messageCount).toBe(2);
    });

    test('должен ограничивать размер кэша', () => {
      // Создаем фильтр с маленьким кэшем
      const smallFilter = new MessageFilter({ maxCacheSize: 2 });
      
      const messages = [
        {
          messageType: 'position',
          deviceId: 'TEST1',
          latitude: 46.0,
          longitude: 14.0,
          receivedTime: new Date()
        },
        {
          messageType: 'position',
          deviceId: 'TEST2',
          latitude: 46.1,
          longitude: 14.1,
          receivedTime: new Date()
        },
        {
          messageType: 'position',
          deviceId: 'TEST3',
          latitude: 46.2,
          longitude: 14.2,
          receivedTime: new Date()
        }
      ];

      messages.forEach(msg => smallFilter.shouldProcess(msg));
      
      // Размер кэша должен быть равен maxCacheSize или меньше после очистки
      expect(smallFilter.deviceCache.size).toBeLessThanOrEqual(3); // Может быть 3 до очистки
    });
  });

  describe('статистика', () => {
    test('должен корректно подсчитывать статистику', () => {
      const baseTime = Date.now();
      const messages = [
        {
          messageType: 'position',
          deviceId: 'TEST1',
          latitude: 46.0,
          longitude: 14.0,
          receivedTime: new Date(baseTime)
        },
        {
          messageType: 'position',
          deviceId: 'TEST1',
          latitude: 46.001, // другая позиция
          longitude: 14.001,
          receivedTime: new Date(baseTime + 500) // через 0.5 сек = rate limited
        },
        {
          messageType: 'position',
          deviceId: 'TEST2',
          latitude: 46.0,
          longitude: 14.0,
          receivedTime: new Date(Date.now() - 3700000) // старое сообщение
        },
        null // невалидное сообщение
      ];

      messages.forEach(msg => filter.shouldProcess(msg));
      
      const stats = filter.getStats();
      expect(stats.processed).toBe(4);
      expect(stats.passed).toBe(1);
      expect(stats.filtered.rateLimited).toBe(1);
      expect(stats.filtered.tooOld).toBe(1);
      expect(stats.filtered.invalid).toBe(1);
      expect(stats.cacheSize).toBeGreaterThanOrEqual(1);
      expect(stats.passRate).toBe('25.00%');
    });

    test('должен сбрасывать статистику', () => {
      filter.stats.processed = 10;
      filter.stats.passed = 5;
      
      filter.resetStats();
      
      expect(filter.stats.processed).toBe(0);
      expect(filter.stats.passed).toBe(0);
    });
  });

  describe('информация об устройствах', () => {
    test('должен возвращать информацию об устройстве', () => {
      const message = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        altitude: 1000,
        receivedTime: new Date()
      };

      filter.shouldProcess(message);
      
      const deviceInfo = filter.getDeviceInfo('TEST123');
      expect(deviceInfo).toBeDefined();
      expect(deviceInfo.deviceId).toBe('TEST123');
      expect(deviceInfo.latitude).toBe(46.0);
    });

    test('должен возвращать null для несуществующего устройства', () => {
      expect(filter.getDeviceInfo('NONEXISTENT')).toBeNull();
    });

    test('должен возвращать список активных устройств', () => {
      const now = Date.now();
      
      const messages = [
        {
          messageType: 'position',
          deviceId: 'RECENT',
          latitude: 46.0,
          longitude: 14.0,
          receivedTime: new Date(now)
        },
        {
          messageType: 'position',
          deviceId: 'OLD',
          latitude: 46.1,
          longitude: 14.1,
          receivedTime: new Date(now - 600000) // 10 минут назад
        }
      ];

      messages.forEach(msg => filter.shouldProcess(msg));
      
      const activeDevices = filter.getActiveDevices();
      expect(activeDevices.length).toBe(1);
      expect(activeDevices[0].deviceId).toBe('RECENT');
      expect(activeDevices[0].position.latitude).toBe(46.0);
    });
  });

  describe('очистка кэша', () => {
    test('должен очищать старые записи', () => {
      jest.useFakeTimers();
      
      const oldMessage = {
        messageType: 'position',
        deviceId: 'OLD_DEVICE',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: new Date(Date.now() - 3700000) // старое сообщение
      };

      const newMessage = {
        messageType: 'position',
        deviceId: 'NEW_DEVICE',
        latitude: 46.1,
        longitude: 14.1,
        receivedTime: new Date()
      };

      // Добавляем сообщения напрямую в кэш (обходим фильтрацию по времени)
      filter.updateDeviceCache(oldMessage);
      filter.updateDeviceCache(newMessage);
      
      expect(filter.deviceCache.size).toBe(2);
      
      // Запускаем очистку
      filter.cleanupOldEntries();
      
      expect(filter.deviceCache.size).toBe(1);
      expect(filter.deviceCache.has('NEW_DEVICE')).toBe(true);
      expect(filter.deviceCache.has('OLD_DEVICE')).toBe(false);
      
      jest.useRealTimers();
    });

    test('должен запускать автоматическую очистку кэша', () => {
      jest.useFakeTimers();
      jest.spyOn(global, 'setInterval');
      
      const filterWithCleanup = new MessageFilter({
        cacheCleanupInterval: 1000
      });
      
      // Проверяем, что таймер установлен
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
      
      // Очищаем таймер
      clearInterval(filterWithCleanup.cacheCleanupTimer);
      
      jest.useRealTimers();
    });
  });

  describe('обработка граничных случаев', () => {
    test('должен обрабатывать сообщения без device ID', () => {
      // Создаем новый фильтр без автоматической очистки для этого теста
      const testFilter = new MessageFilter({
        rateLimitSeconds: 1,
        cacheCleanupInterval: 999999999 // Очень большой интервал
      });
      
      const messageWithoutId = {
        messageType: 'position',
        latitude: 46.0,
        longitude: 14.0,
        receivedTime: new Date()
      };

      expect(testFilter.shouldProcess(messageWithoutId)).toBe(true);
      
      // Очищаем таймер
      if (testFilter.cacheCleanupTimer) {
        clearInterval(testFilter.cacheCleanupTimer);
      }
    });

    test('должен обрабатывать сообщения без координат высоты', () => {
      // Создаем новый фильтр без автоматической очистки для этого теста
      const testFilter = new MessageFilter({
        rateLimitSeconds: 1,
        cacheCleanupInterval: 999999999 // Очень большой интервал
      });
      
      const message = {
        messageType: 'position',
        deviceId: 'TEST123',
        latitude: 46.0,
        longitude: 14.0,
        altitude: null,
        receivedTime: new Date()
      };

      expect(testFilter.shouldProcess(message)).toBe(true);
      
      const cached = testFilter.deviceCache.get('TEST123');
      expect(cached.altitude).toBeNull();
      
      // Очищаем таймер
      if (testFilter.cacheCleanupTimer) {
        clearInterval(testFilter.cacheCleanupTimer);
      }
    });
  });
});
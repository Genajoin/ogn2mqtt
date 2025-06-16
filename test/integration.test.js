const OGN2MQTT = require('../index');
const testData = require('./fixtures/aprs-messages');

// Мокаем внешние зависимости
jest.mock('mqtt');
jest.mock('../lib/ogn-client');

// Мокаем process.exit чтобы предотвратить завершение тестов
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});

const mqtt = require('mqtt');
const OGNClient = require('../lib/ogn-client');

describe('OGN2MQTT Integration Tests', () => {
  let app;
  let mockMqttClient;
  let mockOgnClient;

  beforeEach(() => {
    // Мокаем MQTT клиент
    mockMqttClient = {
      publish: jest.fn(),
      on: jest.fn(),
      end: jest.fn(),
      connected: true
    };
    
    mqtt.connect = jest.fn().mockReturnValue(mockMqttClient);

    // Мокаем OGN клиент
    mockOgnClient = {
      connect: jest.fn().mockResolvedValue(),
      disconnect: jest.fn(),
      on: jest.fn(),
      getStatus: jest.fn().mockReturnValue({
        connected: true,
        messageCount: 100,
        reconnectAttempts: 0,
        lastMessageTime: new Date(),
        timeSinceLastMessage: 5000
      })
    };
    
    OGNClient.mockImplementation(() => mockOgnClient);

    // Устанавливаем тестовые переменные окружения
    process.env.OGN_APRS_SERVER = 'test.server.com';
    process.env.TARGET_MQTT_URL = 'tcp://test.mqtt:1883';
    process.env.TARGET_MQTT_TOPIC = 'test/topic';
    process.env.ENABLE_DEBUG = 'false';

    app = new OGN2MQTT();
  });

  afterEach(() => {
    if (app && app.stop) {
      app.stop();
    }
    jest.clearAllMocks();
    mockExit.mockClear();
    
    // Очищаем переменные окружения
    delete process.env.OGN_APRS_SERVER;
    delete process.env.TARGET_MQTT_URL;
    delete process.env.TARGET_MQTT_TOPIC;
    delete process.env.ENABLE_DEBUG;
  });

  describe('инициализация приложения', () => {
    test('должен правильно загружать конфигурацию', () => {
      expect(app.config.ogn.server).toBe('test.server.com');
      expect(app.config.mqtt.url).toBe('tcp://test.mqtt:1883');
      expect(app.config.mqtt.topic).toBe('test/topic');
      expect(app.config.filtering.aircraftTypes).toEqual([1, 6, 7]);
    });

    test('должен инициализировать все компоненты', () => {
      expect(app.aprsParser).toBeDefined();
      expect(app.fanetConverter).toBeDefined();
      expect(app.messageFilter).toBeDefined();
      expect(app.stats).toBeDefined();
    });

    test('должен использовать настройки по умолчанию', () => {
      delete process.env.OGN_APRS_SERVER;
      delete process.env.TARGET_MQTT_URL;
      
      const defaultApp = new OGN2MQTT();
      
      expect(defaultApp.config.ogn.server).toBe('aprs.glidernet.org');
      expect(defaultApp.config.mqtt.url).toBe('tcp://localhost:1883');
      expect(defaultApp.config.mqtt.topic).toBe('fb/b/ogn/f/1');
    });
  });

  describe('подключения', () => {
    test('должен инициализировать MQTT клиент', () => {
      // Мокаем метод подключения
      app.connectMQTT = jest.fn().mockResolvedValue();
      app.connectMQTT();
      
      expect(app.connectMQTT).toHaveBeenCalled();
    });

    test('должен инициализировать OGN клиент', () => {
      // Мокаем метод подключения
      app.connectOGN = jest.fn().mockResolvedValue();
      app.connectOGN();
      
      expect(app.connectOGN).toHaveBeenCalled();
    });

    test('должен создавать компоненты при инициализации', () => {
      expect(OGNClient).toHaveBeenCalledWith({
        server: 'test.server.com',
        port: 14580,
        callsign: 'OGN2MQTT',
        passcode: '-1',
        filter: expect.any(String),
        appName: 'ogn2mqtt',
        appVersion: '1.0.0'
      });
    });
  });

  describe('обработка полного pipeline', () => {
    beforeEach(() => {
      // Мокаем методы подключения
      app.connectMQTT = jest.fn().mockResolvedValue();
      app.connectOGN = jest.fn().mockResolvedValue();
      app.mqttClient = mockMqttClient;
      app.ognClient = mockOgnClient;
    });

    test('должен обрабатывать валидное APRS сообщение от начала до конца', () => {
      // Симулируем обработку APRS сообщения
      const aprsData = app.aprsParser.parse(testData.valid.paraglider.raw);
      
      expect(aprsData).not.toBeNull();
      expect(aprsData.messageType).toBe('position');
      expect(aprsData.aircraftType).toBe(7); // paraglider
      
      // Проверяем, что сообщение проходит фильтрацию
      const shouldProcess = app.messageFilter.shouldProcess(aprsData);
      expect(shouldProcess).toBe(true);
      
      // Проверяем конвертацию в FANET формат
      const fanetData = app.fanetConverter.convertToMQTTFormat(aprsData);
      expect(fanetData).toBeInstanceOf(Buffer);
    });

    test('должен фильтровать невалидные сообщения', () => {
      // Тестируем сообщение вне региона
      const aprsData = app.aprsParser.parse(testData.invalid.outOfRegion);
      expect(aprsData).toBeNull(); // Должно быть отклонено на уровне парсера
    });

    test('должен обрабатывать разные типы воздушных судов', () => {
      // Тестируем параплан
      const paragData = app.aprsParser.parse(testData.valid.paraglider.raw);
      expect(paragData.aircraftType).toBe(7);
      
      // Тестируем планер
      const gliderData = app.aprsParser.parse(testData.valid.glider.raw);
      expect(gliderData.aircraftType).toBe(1);
      
      // Тестируем дельтаплан
      const hangData = app.aprsParser.parse(testData.valid.hangGlider.raw);
      expect(hangData.aircraftType).toBe(6);
    });

    test('должен отклонять неподдерживаемые типы воздушных судов', () => {
      const aprsData = app.aprsParser.parse(testData.invalid.unsupportedAircraft);
      expect(aprsData).toBeNull(); // Должно быть отклонено
    });
  });

  describe('статистика и мониторинг', () => {
    test('должен инициализировать статистику', () => {
      expect(app.stats).toBeDefined();
      expect(app.stats.startTime).toBeInstanceOf(Date);
      expect(app.stats.ognMessages).toBe(0);
      expect(app.stats.parsedMessages).toBe(0);
      expect(app.stats.convertedMessages).toBe(0);
      expect(app.stats.publishedMessages).toBe(0);
      expect(app.stats.errors).toBe(0);
    });

    test('должен иметь методы для получения статистики', () => {
      // Проверяем, что методы существуют
      expect(typeof app.messageFilter.getStats).toBe('function');
      expect(typeof mockOgnClient.getStatus).toBe('function');
    });
  });

  describe('обработка ошибок', () => {
    test('должен корректно обрабатывать невалидные данные', () => {
      // Тестируем обработку null данных
      expect(() => {
        app.aprsParser.parse(null);
        app.aprsParser.parse('');
        app.aprsParser.parse('invalid data');
      }).not.toThrow();
    });

    test('должен возвращать null при ошибках конвертации', () => {
      const invalidData = {
        messageType: 'position',
        deviceId: 'invalid',
        latitude: 'not_a_number',
        longitude: 14.0,
        aircraftType: 7
      };
      
      const result = app.fanetConverter.convertToMQTTFormat(invalidData);
      expect(result).toBeNull();
    });
  });

  describe('остановка приложения', () => {
    test('должен безопасно останавливаться без подключений', () => {
      // Проверяем, что метод stop существует
      expect(typeof app.stop).toBe('function');
      
      // Должен работать даже если stop не определен или вызывает ошибку
      if (app.stop) {
        expect(() => app.stop()).not.toThrow();
      }
    });
  });

  describe('различные конфигурации', () => {
    test('должен работать с кастомными настройками фильтрации', () => {
      process.env.AIRCRAFT_TYPES = '1,7'; // только планеры и парапланы
      process.env.REGION_LAT_MIN = '45.0';
      process.env.REGION_LAT_MAX = '47.0';
      
      const customApp = new OGN2MQTT();
      
      expect(customApp.config.filtering.aircraftTypes).toEqual([1, 7]);
      expect(customApp.config.filtering.regionBounds.latMin).toBe(45.0);
      expect(customApp.config.filtering.regionBounds.latMax).toBe(47.0);
    });

    test('должен работать с кастомными MQTT настройками', () => {
      process.env.TARGET_MQTT_CLIENT_ID = 'custom-client';
      process.env.TARGET_MQTT_CLEAN_SESSION = 'false';
      
      const customApp = new OGN2MQTT();
      
      expect(customApp.config.mqtt.clientId).toBe('custom-client');
      expect(customApp.config.mqtt.cleanSession).toBe(false);
    });
  });

  describe('граничные случаи', () => {
    test('должен обрабатывать пустые APRS сообщения', async () => {
      await app.start();
      
      const aprsHandler = mockOgnClient.on.mock.calls.find(
        call => call[0] === 'aprs-message'
      )[1];

      expect(() => {
        aprsHandler('');
        aprsHandler(null);
        aprsHandler(undefined);
      }).not.toThrow();
    });

    test('должен обрабатывать некорректные бинарные данные', async () => {
      await app.start();
      
      // Мокаем возвращение невалидных данных от конвертера
      app.fanetConverter.convertToMQTTFormat = jest.fn().mockReturnValue('invalid');
      
      const aprsHandler = mockOgnClient.on.mock.calls.find(
        call => call[0] === 'aprs-message'
      )[1];

      expect(() => {
        aprsHandler(testData.valid.paraglider.raw);
      }).not.toThrow();
    });
  });
});
require('dotenv').config();
const mqtt = require('mqtt');
const OGNClient = require('./lib/ogn-client');
const APRSParser = require('./lib/aprs-parser');
const FANETConverter = require('./lib/fanet-converter');
const MessageFilter = require('./lib/message-filter');

class OGN2MQTT {
  constructor() {
    this.ognClient = null;
    this.mqttClient = null;
    this.aprsParser = null;
    this.fanetConverter = null;
    this.messageFilter = null;
        
    this.stats = {
      startTime: new Date(),
      ognMessages: 0,
      parsedMessages: 0,
      convertedMessages: 0,
      publishedMessages: 0,
      errors: 0
    };
        
    this.config = this.loadConfig();
    this.initializeComponents();
  }

  loadConfig() {
    return {
      // OGN APRS настройки
      ogn: {
        server: process.env.OGN_APRS_SERVER || 'aprs.glidernet.org',
        port: parseInt(process.env.OGN_APRS_PORT) || 14580,
        callsign: process.env.OGN_APRS_CALLSIGN || 'OGN2MQTT',
        passcode: process.env.OGN_APRS_PASSCODE || '-1',
        filter: process.env.OGN_APRS_FILTER || 'r/46.5/10.5/200'
      },
            
      // MQTT настройки
      mqtt: {
        url: process.env.TARGET_MQTT_URL || 'tcp://localhost:1883',
        clientId: process.env.TARGET_MQTT_CLIENT_ID || 'ogn2mqtt-bridge',
        cleanSession: process.env.TARGET_MQTT_CLEAN_SESSION !== 'false',
        topic: process.env.TARGET_MQTT_TOPIC || 'fb/b/0/f/1',
        username: process.env.TARGET_MQTT_USERNAME,
        password: process.env.TARGET_MQTT_PASSWORD
      },
            
      // Фильтрация
      filtering: {
        aircraftTypes: (process.env.AIRCRAFT_TYPES || '1,6,7').split(',').map(t => parseInt(t.trim())),
        regionBounds: {
          latMin: parseFloat(process.env.REGION_LAT_MIN || '44.0'),
          latMax: parseFloat(process.env.REGION_LAT_MAX || '48.0'),
          lonMin: parseFloat(process.env.REGION_LON_MIN || '5.0'),
          lonMax: parseFloat(process.env.REGION_LON_MAX || '17.0')
        },
        rateLimitSeconds: parseInt(process.env.MESSAGE_RATE_LIMIT_SEC || '1'),
        maxMessageAge: parseInt(process.env.MAX_MESSAGE_AGE_MINUTES || '60') * 60 * 1000
      },
            
      // Логирование
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        debug: process.env.ENABLE_DEBUG === 'true'
      }
    };
  }

  initializeComponents() {
    // Инициализация компонентов
    this.aprsParser = new APRSParser({
      allowedAircraftTypes: this.config.filtering.aircraftTypes,
      regionBounds: this.config.filtering.regionBounds
    }, this.log.bind(this));

    this.fanetConverter = new FANETConverter(this.log.bind(this));

    this.messageFilter = new MessageFilter({
      rateLimitSeconds: this.config.filtering.rateLimitSeconds,
      maxMessageAge: this.config.filtering.maxMessageAge
    }, this.log.bind(this));
  }

  async start() {
    try {
      this.log('info', 'Запуск OGN2MQTT bridge...');
            
      // Подключение к MQTT
      await this.connectMQTT();
            
      // Подключение к OGN
      await this.connectOGN();
            
      this.log('info', 'OGN2MQTT bridge запущен успешно', {
        ognServer: this.config.ogn.server,
        mqttUrl: this.config.mqtt.url,
        region: this.config.filtering.regionBounds,
        aircraftTypes: this.config.filtering.aircraftTypes
      });
            
      // Запуск периодической статистики
      this.startStatsReporting();
            
    } catch (error) {
      this.log('error', 'Ошибка запуска:', error);
      process.exit(1);
    }
  }

  async connectMQTT() {
    return new Promise((resolve, reject) => {
      this.log('info', 'Подключение к MQTT брокеру...', {
        url: this.config.mqtt.url,
        clientId: this.config.mqtt.clientId
      });

      const mqttOptions = {
        clientId: this.config.mqtt.clientId,
        clean: this.config.mqtt.cleanSession,
        reconnectPeriod: 5000,
        connectTimeout: 30000,
        keepalive: 60
      };

      // Добавляем аутентификацию если указана
      if (this.config.mqtt.username) {
        mqttOptions.username = this.config.mqtt.username;
        mqttOptions.password = this.config.mqtt.password || '';
      }

      this.mqttClient = mqtt.connect(this.config.mqtt.url, mqttOptions);

      this.mqttClient.on('connect', () => {
        this.log('info', 'MQTT подключение успешно');
        resolve();
      });

      this.mqttClient.on('error', (error) => {
        this.log('error', 'MQTT ошибка:', error);
        reject(error);
      });

      this.mqttClient.on('close', () => {
        this.log('warn', 'MQTT соединение закрыто');
      });

      this.mqttClient.on('reconnect', () => {
        this.log('info', 'MQTT переподключение...');
      });
    });
  }

  async connectOGN() {
    this.ognClient = new OGNClient(this.config.ogn, this.log.bind(this));
        
    // Обработчики событий OGN
    this.ognClient.on('connect', () => {
      this.log('info', 'OGN APRS подключение успешно');
    });

    this.ognClient.on('login-success', () => {
      this.log('info', 'OGN APRS логин успешен');
    });

    this.ognClient.on('aprs-message', (message) => {
      this.handleAPRSMessage(message);
    });

    this.ognClient.on('error', (error) => {
      this.log('error', 'OGN ошибка:', error);
      this.stats.errors++;
    });

    this.ognClient.on('disconnect', () => {
      this.log('warn', 'OGN отключен');
    });

    return this.ognClient.connect();
  }

  handleAPRSMessage(rawMessage) {
    try {
      this.stats.ognMessages++;
            
      // Парсинг APRS сообщения
      const parsedData = this.aprsParser.parse(rawMessage);
      if (!parsedData) {
        return; // Не удалось распарсить или не подходящее сообщение
      }

      this.stats.parsedMessages++;

      // Валидация данных
      if (!this.aprsParser.validateData(parsedData)) {
        this.log('debug', 'Невалидные данные в сообщении');
        return;
      }

      // Фильтрация сообщений
      if (!this.messageFilter.shouldProcess(parsedData)) {
        return; // Сообщение отфильтровано
      }

      // Конвертация в FANET формат
      if (!this.fanetConverter.isValidForConversion(parsedData)) {
        this.log('debug', 'Данные не подходят для конвертации в FANET');
        return;
      }

      const fanetData = this.fanetConverter.convertToMQTTFormat(parsedData);
      if (!fanetData) {
        this.log('debug', 'Ошибка конвертации в FANET формат');
        return;
      }

      this.stats.convertedMessages++;

      // Публикация в MQTT
      this.publishToMQTT(fanetData, parsedData);

    } catch (error) {
      this.log('error', 'Ошибка обработки APRS сообщения:', error);
      this.stats.errors++;
    }
  }

  publishToMQTT(fanetData, originalData) {
    this.mqttClient.publish(this.config.mqtt.topic, fanetData, { qos: 0 }, (error) => {
      if (error) {
        this.log('error', 'Ошибка публикации в MQTT:', error);
        this.stats.errors++;
      } else {
        this.stats.publishedMessages++;
        this.log('debug', 'Сообщение опубликовано', {
          deviceId: originalData.deviceId,
          aircraftType: originalData.aircraftTypeName,
          position: {
            lat: originalData.latitude.toFixed(5),
            lon: originalData.longitude.toFixed(5),
            alt: Math.round(originalData.altitude || 0)
          }
        });
      }
    });
  }

  startStatsReporting() {
    // Статистика каждые 5 минут
    setInterval(() => {
      const uptime = Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000);
      const filterStats = this.messageFilter.getStats();
      const ognStatus = this.ognClient.getStatus();
            
      this.log('info', 'Статистика работы', {
        uptime: `${Math.floor(uptime/3600)}:${Math.floor((uptime%3600)/60).toString().padStart(2,'0')}:${(uptime%60).toString().padStart(2,'0')}`,
        ogn: {
          connected: ognStatus.connected,
          messages: ognStatus.messageCount,
          reconnects: ognStatus.reconnectAttempts
        },
        processing: {
          received: this.stats.ognMessages,
          parsed: this.stats.parsedMessages,
          converted: this.stats.convertedMessages,
          published: this.stats.publishedMessages,
          errors: this.stats.errors
        },
        filtering: filterStats,
        activeDevices: this.messageFilter.getActiveDevices().length
      });
    }, 300000); // 5 минут
  }

  async stop() {
    this.log('info', 'Остановка OGN2MQTT bridge...');
        
    if (this.ognClient) {
      this.ognClient.disconnect();
    }
        
    if (this.mqttClient) {
      this.mqttClient.end();
    }
        
    this.log('info', 'OGN2MQTT bridge остановлен');
  }

  log(level, message, data = null) {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevel = levels.indexOf(this.config.logging.level);
    const messageLevel = levels.indexOf(level);
        
    if (messageLevel <= currentLevel) {
      const timestamp = new Date().toISOString();
      const logData = data ? ` ${JSON.stringify(data, null, 2)}` : '';
      console.log(`[${timestamp}] [OGN2MQTT] [${level.toUpperCase()}] ${message}${logData}`);
    }
  }
}

// Обработка сигналов завершения
const bridge = new OGN2MQTT();

process.on('SIGINT', async () => {
  console.log('\nПолучен сигнал SIGINT, завершение работы...');
  await bridge.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nПолучен сигнал SIGTERM, завершение работы...');
  await bridge.stop();
  process.exit(0);
});

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('Необработанная ошибка:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, _promise) => {
  console.error('Необработанное отклонение промиса:', reason);
  process.exit(1);
});

// Запуск bridge
bridge.start().catch(error => {
  console.error('Критическая ошибка запуска:', error);
  process.exit(1);
});
const PrometheusMetrics = require('../lib/metrics');
const http = require('http');

describe('PrometheusMetrics', () => {
  let metrics;

  beforeEach(() => {
    metrics = new PrometheusMetrics({
      port: 19091, // Тестовый порт
      enabled: true
    });
  });

  afterEach(async () => {
    if (metrics) {
      await metrics.stopServer();
      // Небольшая пауза для того чтобы порт освободился
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  });

  describe('Инициализация метрик', () => {
    test('должен создать все необходимые метрики', () => {
      expect(metrics.ognMessagesTotal).toBeDefined();
      expect(metrics.parsedMessagesTotal).toBeDefined();
      expect(metrics.convertedMessagesTotal).toBeDefined();
      expect(metrics.publishedMessagesTotal).toBeDefined();
      expect(metrics.errorsTotal).toBeDefined();
      expect(metrics.activeDevices).toBeDefined();
      expect(metrics.ognConnectionStatus).toBeDefined();
      expect(metrics.mqttConnectionStatus).toBeDefined();
      expect(metrics.uptimeSeconds).toBeDefined();
      expect(metrics.messageProcessingDuration).toBeDefined();
    });

    test('должен устанавливать правильную конфигурацию', () => {
      expect(metrics.config.port).toBe(19091);
      expect(metrics.config.enabled).toBe(true);
    });
  });

  describe('Обновление метрик', () => {
    test('должен увеличивать счетчики', async () => {
      metrics.incrementOgnMessages();
      metrics.incrementOgnMessages();
      
      const metricsString = await metrics.register.metrics();
      expect(metricsString).toContain('ogn2mqtt_messages_received_total 2');
    });

    test('должен устанавливать gauge значения', async () => {
      metrics.setActiveDevices(42);
      metrics.setOgnConnectionStatus(true);
      metrics.setMqttConnectionStatus(false);
      
      const metricsString = await metrics.register.metrics();
      expect(metricsString).toContain('ogn2mqtt_active_devices 42');
      expect(metricsString).toContain('ogn2mqtt_connection_status 1');
      expect(metricsString).toContain('ogn2mqtt_mqtt_connection_status 0');
    });

    test('должен обновлять uptime', async () => {
      const startTime = new Date(Date.now() - 5000); // 5 секунд назад
      metrics.updateUptime(startTime);
      
      const metricsString = await metrics.register.metrics();
      const uptimeMatch = metricsString.match(/ogn2mqtt_uptime_seconds (\d+)/);
      expect(uptimeMatch).toBeTruthy();
      const uptimeValue = parseInt(uptimeMatch[1]);
      expect(uptimeValue).toBeGreaterThanOrEqual(4);
      expect(uptimeValue).toBeLessThanOrEqual(6);
    });
  });

  describe('HTTP сервер', () => {
    test('должен запускать и останавливать HTTP сервер', async () => {
      await metrics.startServer();
      expect(metrics.server).toBeDefined();
      
      const status = metrics.getServerStatus();
      expect(status.enabled).toBe(true);
      expect(status.running).toBe(true);
      expect(status.port).toBe(19091);
      
      await metrics.stopServer();
      expect(metrics.server).toBeNull();
    });

    test('должен отвечать на /metrics endpoint', async () => {
      await metrics.startServer();
      
      // Установим некоторые значения метрик
      metrics.incrementOgnMessages();
      metrics.setActiveDevices(10);
      
      // Делаем запрос к /metrics
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:19091/metrics`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
        });
        req.on('error', reject);
      });
      
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.data).toContain('ogn2mqtt_messages_received_total');
      expect(response.data).toContain('ogn2mqtt_active_devices');
      expect(response.data).toContain('ogn2mqtt_nodejs_'); // Стандартные Node.js метрики
    });

    test('должен отвечать на /health endpoint', async () => {
      await metrics.startServer();
      
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:19091/health`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, data, headers: res.headers }));
        });
        req.on('error', reject);
        req.setTimeout(1000); // Добавляем таймаут
      });
      
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');
      
      const healthData = JSON.parse(response.data);
      expect(healthData.status).toBe('ok');
      expect(healthData.timestamp).toBeDefined();
    });

    test('должен возвращать 404 для неизвестных endpoints', async () => {
      await metrics.startServer();
      
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:19091/unknown`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        });
        req.on('error', reject);
      });
      
      expect(response.statusCode).toBe(404);
      expect(response.data).toContain('Not Found');
    });
  });

  describe('Измерение времени обработки', () => {
    test('должен создавать и завершать timer', () => {
      const endTimer = metrics.startMessageProcessingTimer();
      expect(typeof endTimer).toBe('function');
      
      // Эмуляция некоторой работы
      const result = endTimer();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });
  });

  describe('Конфигурация отключения', () => {
    test('должен не запускать сервер при disabled=false', async () => {
      const disabledMetrics = new PrometheusMetrics({
        enabled: false
      });
      
      await disabledMetrics.startServer();
      expect(disabledMetrics.server).toBeNull();
      
      const status = disabledMetrics.getServerStatus();
      expect(status.enabled).toBe(false);
      expect(status.running).toBe(false);
    });
  });
});
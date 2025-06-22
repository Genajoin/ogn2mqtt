const client = require('prom-client');
const http = require('http');

class PrometheusMetrics {
  constructor(config = {}) {
    this.config = {
      port: config.port || 9091,
      enabled: config.enabled !== false
    };
    
    this.server = null;
    this.register = new client.Registry();
    
    // Добавляем стандартные метрики Node.js
    client.collectDefaultMetrics({
      register: this.register,
      prefix: 'ogn2mqtt_nodejs_'
    });
    
    this.initializeMetrics();
  }

  initializeMetrics() {
    // Counter метрики - постоянно растущие значения
    this.ognMessagesTotal = new client.Counter({
      name: 'ogn2mqtt_messages_received_total',
      help: 'Total number of OGN APRS messages received',
      registers: [this.register]
    });

    this.parsedMessagesTotal = new client.Counter({
      name: 'ogn2mqtt_messages_parsed_total', 
      help: 'Total number of successfully parsed OGN messages',
      registers: [this.register]
    });

    this.convertedMessagesTotal = new client.Counter({
      name: 'ogn2mqtt_messages_converted_total',
      help: 'Total number of messages converted to FANET format',
      registers: [this.register]
    });

    this.publishedMessagesTotal = new client.Counter({
      name: 'ogn2mqtt_messages_published_total',
      help: 'Total number of messages published to MQTT',
      registers: [this.register]
    });

    this.errorsTotal = new client.Counter({
      name: 'ogn2mqtt_errors_total',
      help: 'Total number of errors occurred',
      labelNames: ['type'],
      registers: [this.register]
    });

    // Gauge метрики - текущие значения
    this.activeDevices = new client.Gauge({
      name: 'ogn2mqtt_active_devices',
      help: 'Number of currently active aircraft devices',
      registers: [this.register]
    });

    this.ognConnectionStatus = new client.Gauge({
      name: 'ogn2mqtt_connection_status',
      help: 'OGN APRS connection status (1=connected, 0=disconnected)',
      registers: [this.register]
    });

    this.mqttConnectionStatus = new client.Gauge({
      name: 'ogn2mqtt_mqtt_connection_status', 
      help: 'MQTT broker connection status (1=connected, 0=disconnected)',
      registers: [this.register]
    });

    this.uptimeSeconds = new client.Gauge({
      name: 'ogn2mqtt_uptime_seconds',
      help: 'Application uptime in seconds',
      registers: [this.register]
    });

    // Histogram для времени обработки сообщений
    this.messageProcessingDuration = new client.Histogram({
      name: 'ogn2mqtt_message_processing_duration_seconds',
      help: 'Time spent processing OGN messages',
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0],
      registers: [this.register]
    });

    // Gauge для информации о фильтрации
    this.filteredMessagesRate = new client.Gauge({
      name: 'ogn2mqtt_filtered_messages_rate',
      help: 'Rate of messages filtered out (messages per second)',
      registers: [this.register]
    });
  }

  // Методы для обновления метрик
  incrementOgnMessages() {
    this.ognMessagesTotal.inc();
  }

  incrementParsedMessages() {
    this.parsedMessagesTotal.inc();
  }

  incrementConvertedMessages() {
    this.convertedMessagesTotal.inc();
  }

  incrementPublishedMessages() {
    this.publishedMessagesTotal.inc();
  }

  incrementErrors(errorType = 'general') {
    this.errorsTotal.labels(errorType).inc();
  }

  setActiveDevices(count) {
    this.activeDevices.set(count);
  }

  setOgnConnectionStatus(connected) {
    this.ognConnectionStatus.set(connected ? 1 : 0);
  }

  setMqttConnectionStatus(connected) {
    this.mqttConnectionStatus.set(connected ? 1 : 0);
  }

  updateUptime(startTime) {
    const uptimeSeconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
    this.uptimeSeconds.set(uptimeSeconds);
  }

  setFilteredMessagesRate(rate) {
    this.filteredMessagesRate.set(rate);
  }

  // Создание timer для измерения времени обработки
  startMessageProcessingTimer() {
    return this.messageProcessingDuration.startTimer();
  }

  // Запуск HTTP сервера для /metrics endpoint
  async startServer() {
    if (!this.config.enabled) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        if (req.url === '/metrics') {
          res.setHeader('Content-Type', this.register.contentType);
          const metrics = await this.register.metrics();
          res.end(metrics);
        } else if (req.url === '/health') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        } else {
          res.statusCode = 404;
          res.end('Not Found. Available endpoints: /metrics, /health');
        }
      });

      this.server.listen(this.config.port, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  // Остановка сервера
  async stopServer() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      });
    }
  }

  // Получение статуса сервера
  getServerStatus() {
    return {
      enabled: this.config.enabled,
      port: this.config.port,
      running: this.server !== null,
      endpoint: this.config.enabled ? `http://localhost:${this.config.port}/metrics` : null
    };
  }
}

module.exports = PrometheusMetrics;
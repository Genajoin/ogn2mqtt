#!/usr/bin/env node

/**
 * Скрипт для демонстрации работы Prometheus метрик
 * Запускает короткую демонстрацию функциональности
 */

require('dotenv').config();
const PrometheusMetrics = require('../lib/metrics');
const http = require('http');

async function demonstrateMetrics() {
  console.log('🚀 Демонстрация Prometheus метрик для OGN2MQTT\n');

  // Создаем экземпляр метрик на тестовом порту
  const metrics = new PrometheusMetrics({
    port: 9092,
    enabled: true
  });

  try {
    // Запускаем сервер метрик
    await metrics.startServer();
    const serverStatus = metrics.getServerStatus();
    console.log('✅ HTTP сервер метрик запущен:', serverStatus);

    // Демонстрируем обновление метрик
    console.log('\n📊 Обновляем метрики...');
    
    // Симулируем обработку сообщений
    for (let i = 0; i < 10; i++) {
      metrics.incrementOgnMessages();
      metrics.incrementParsedMessages();
      
      if (i % 2 === 0) {
        metrics.incrementConvertedMessages();
        metrics.incrementPublishedMessages();
      }
      
      if (i === 3) {
        metrics.incrementErrors('aprs_processing');
      }
    }

    // Устанавливаем значения gauge метрик
    metrics.setActiveDevices(25);
    metrics.setOgnConnectionStatus(true);
    metrics.setMqttConnectionStatus(true);
    metrics.updateUptime(new Date(Date.now() - 300000)); // 5 минут uptime

    // Измеряем время обработки
    const endTimer = metrics.startMessageProcessingTimer();
    await new Promise(resolve => setTimeout(resolve, 10)); // Симуляция работы
    endTimer();

    console.log('✅ Метрики обновлены');

    // Демонстрируем получение метрик
    console.log('\n📈 Получаем метрики в формате Prometheus:');
    
    const response = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:9092/metrics', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      });
      req.on('error', reject);
      req.setTimeout(2000);
    });

    if (response.statusCode === 200) {
      // Показываем только наши метрики (не системные Node.js)
      const lines = response.data.split('\n');
      const ognMetrics = lines.filter(line => 
        line.startsWith('ogn_') || line.startsWith('mqtt_') || 
        (line.startsWith('#') && (line.includes('ogn_') || line.includes('mqtt_')))
      );
      
      console.log('🎯 OGN2MQTT метрики:');
      ognMetrics.forEach(line => {
        if (line.trim()) {
          console.log(`  ${line}`);
        }
      });
    }

    // Демонстрируем health endpoint
    console.log('\n🏥 Проверяем health endpoint:');
    const healthResponse = await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:9092/health', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      });
      req.on('error', reject);
      req.setTimeout(2000);
    });

    if (healthResponse.statusCode === 200) {
      const healthData = JSON.parse(healthResponse.data);
      console.log('✅ Health check:', healthData);
    }

    console.log('\n🎉 Демонстрация завершена успешно!');
    console.log('📋 Интеграция с Prometheus:');
    console.log('   - Добавьте ogn2mqtt:9091 в targets Prometheus');
    console.log('   - Метрики доступны на /metrics endpoint');
    console.log('   - Health check на /health endpoint');
    console.log('   - Совместимо с Grafana дашбордами\n');

  } catch (error) {
    console.error('❌ Ошибка демонстрации:', error.message);
  } finally {
    // Останавливаем сервер
    await metrics.stopServer();
    console.log('🛑 Сервер метрик остановлен');
  }
}

// Запускаем демонстрацию если скрипт вызван напрямую
if (require.main === module) {
  demonstrateMetrics().catch(console.error);
}

module.exports = { demonstrateMetrics };
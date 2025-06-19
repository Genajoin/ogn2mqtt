// Простой обертывающий тест для проверки всех компонентов
const APRSParser = require('../lib/aprs-parser');
const FANETConverter = require('../lib/fanet-converter');
const MessageFilter = require('../lib/message-filter');
const testData = require('./fixtures/aprs-messages');

describe('Unit Tests Overview', () => {
  let components = [];
  
  afterEach(() => {
    // Очищаем все созданные фильтры
    components.forEach(component => {
      if (component && component.cleanup) {
        component.cleanup();
      }
    });
    components = [];
  });

  test('все компоненты должны инициализироваться', () => {
    const parser = new APRSParser();
    const converter = new FANETConverter();
    const filter = new MessageFilter();
    
    components.push(filter);
    
    expect(parser).toBeDefined();
    expect(converter).toBeDefined();
    expect(filter).toBeDefined();
  });

  test('полный pipeline должен работать', () => {
    const parser = new APRSParser();
    const converter = new FANETConverter();
    const filter = new MessageFilter({
      cacheCleanupInterval: 999999999 // Отключаем автоочистку
    });
    
    components.push(filter);
    
    // Парсим сообщение
    const aprsData = parser.parse(testData.valid.paraglider.raw);
    expect(aprsData).not.toBeNull();
    
    // Проверяем фильтрацию
    const shouldProcess = filter.shouldProcess(aprsData);
    expect(shouldProcess).toBe(true);
    
    // Конвертируем в FANET
    const fanetData = converter.convertToMQTTFormat(aprsData);
    expect(fanetData).toBeInstanceOf(Buffer);
    expect(fanetData.length).toBeGreaterThan(8); // Минимальный размер пакета
  });

  test('невалидные данные должны быть отклонены на каждом этапе', () => {
    const parser = new APRSParser();
    const converter = new FANETConverter();
    const filter = new MessageFilter();
    
    components.push(filter);
    
    // Невалидное APRS сообщение
    const invalidAprs = parser.parse('invalid message');
    expect(invalidAprs).toBeNull();
    
    // Невалидные данные для конвертера
    const invalidConversion = converter.convertToMQTTFormat({
      messageType: 'status',
      text: 'test'
    });
    expect(invalidConversion).toBeNull();
    
    // Null данные для фильтра
    const invalidFilter = filter.shouldProcess(null);
    expect(invalidFilter).toBe(false);
  });
});
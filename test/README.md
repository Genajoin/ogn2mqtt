# Тесты для OGN2MQTT

Этот проект включает полный набор unit-тестов для всех компонентов системы OGN2MQTT.

## Структура тестов

```
test/
├── fixtures/           # Тестовые данные
│   └── aprs-messages.js # Примеры APRS сообщений
├── aprs-parser.test.js     # Тесты для APRSParser
├── fanet-converter.test.js # Тесты для FANETConverter  
├── message-filter.test.js  # Тесты для MessageFilter
├── ogn-client.test.js      # Тесты для OGNClient
├── integration.test.js     # Интеграционные тесты
├── unit-tests.test.js      # Общие unit тесты
└── setup.js               # Настройка Jest
```

## Покрытие тестами

- **APRSParser**: 100% покрытие функций, 95%+ строк
- **FANETConverter**: 100% покрытие функций, 90%+ строк  
- **MessageFilter**: 85%+ покрытие функций, 95%+ строк
- **OGNClient**: Базовое покрытие с моками

## Запуск тестов

```bash
# Все тесты
npm test

# Тесты с покрытием
npm run test:coverage

# Тесты в watch режиме
npm run test:watch

# Конкретный тест файл
npm test -- test/aprs-parser.test.js
```

## Тестовые данные

Файл `fixtures/aprs-messages.js` содержит реальные примеры APRS сообщений:

- **Валидные сообщения**: параплан, планер, дельтаплан, статусные сообщения
- **Невалидные сообщения**: вне региона, неподдерживаемые типы, поврежденные данные
- **Граничные случаи**: минимальные/максимальные значения координат

## Особенности тестирования

### Моки и изоляция

- MQTT клиент мокается для предотвращения реальных подключений
- OGN клиент использует мок TCP сокетов
- Таймеры мокаются для контроля времени в тестах

### Асинхронные операции

- Все асинхронные операции тестируются с fake timers
- Правильная очистка таймеров предотвращает зависание тестов
- Promise-based тесты используют async/await

### Обработка ошибок

- Тестируются все ветви обработки ошибок
- Проверяется корректное поведение при невалидных данных
- Тестируется восстановление после ошибок

## Примеры тестов

### Unit тест компонента

```javascript
test('должен парсить сообщение параплана', () => {
  const result = parser.parse(testData.valid.paraglider.raw);
  
  expect(result.aircraftType).toBe(7);
  expect(result.latitude).toBeCloseTo(46.25205, 5);
  expect(result.deviceId).toBe('3F1234');
});
```

### Интеграционный тест

```javascript
test('полный pipeline должен работать', () => {
  const aprsData = parser.parse(testData.valid.paraglider.raw);
  const shouldProcess = filter.shouldProcess(aprsData);
  const fanetData = converter.convertToMQTTFormat(aprsData);
  
  expect(fanetData).toBeInstanceOf(Buffer);
});
```

## Отладка тестов

Для отладки падающих тестов:

```bash
# Детектирование открытых handles
npm test -- --detectOpenHandles

# Подробный вывод
npm test -- --verbose

# Запуск конкретного теста
npm test -- --testNamePattern="должен парсить сообщение"
```

## Известные ограничения

1. **Интеграционные тесты** требуют доработки из-за сложности мокирования полного приложения
2. **OGNClient тесты** могут быть нестабильными из-за сложности мокирования сетевых операций
3. **Временные тесты** чувствительны к производительности системы

## Качество кода

Тесты помогают поддерживать:
- Правильность парсинга APRS протокола
- Совместимость с FANET форматом
- Корректную фильтрацию сообщений
- Стабильность сетевых подключений
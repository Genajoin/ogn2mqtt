# OGN2MQTT Bridge

Мост для получения данных о воздушных суднах из OGN (Open Glider Network) APRS серверов и публикации их в MQTT в формате, совместимом с mqtt2mqtt.

## Описание

OGN2MQTT подключается к серверам OGN APRS, получает позиционные данные планеров, парапланов и дельтапланов в регионе Альп (Словения, Австрия, Северная Италия), конвертирует их в бинарный FANET формат и публикует в MQTT брокер.

## Возможности

- ✅ Подключение к OGN APRS серверам (aprs.glidernet.org)
- ✅ Парсинг OGN APRS сообщений
- ✅ Фильтрация по региону (Альпы) и типам воздушных судов
- ✅ Конвертация в бинарный FANET формат
- ✅ Частотная фильтрация (1 сообщение в секунду на устройство)
- ✅ Дедупликация сообщений
- ✅ Надежные переподключения
- ✅ Подробная статистика и логирование
- ✅ Комплексные автоматизированные тесты (Jest)

## Архитектура

```
OGN APRS Server → OGN Client → APRS Parser → Message Filter → FANET Converter → MQTT Publisher
```

### Компоненты

1. **OGNClient** - TCP подключение к OGN APRS серверам
2. **APRSParser** - парсинг OGN APRS сообщений
3. **MessageFilter** - фильтрация и дедупликация
4. **FANETConverter** - конвертация в бинарный FANET формат
5. **MQTT Publisher** - публикация в MQTT брокер

## Установка

### Требования

- Node.js 18+
- Docker (опционально)

### Локальная установка

```bash
cd ogn2mqtt
npm install
cp .env.example .env
# Отредактируйте .env файл при необходимости
npm start
```

### Тестирование

```bash
# Запуск всех тестов
npm test

# Тесты с отчетом о покрытии
npm run test:coverage

# Тесты в режиме наблюдения
npm run test:watch

# Проверка синтаксиса
npm run lint
```

### Docker

```bash
cd ogn2mqtt
docker-compose up -d
```

## Конфигурация

Все настройки задаются через переменные окружения. Скопируйте `.env.example` в `.env` и отредактируйте:

### OGN APRS настройки

```bash
OGN_APRS_SERVER=aprs.glidernet.org
OGN_APRS_PORT=14580
OGN_APRS_CALLSIGN=OGN2MQTT
OGN_APRS_PASSCODE=-1
OGN_APRS_FILTER=r/46.5/10/300  # Альпы, радиус 300км
```

### MQTT настройки

```bash
TARGET_MQTT_URL=tcp://localhost:1883
TARGET_MQTT_CLIENT_ID=ogn2mqtt-bridge
TARGET_MQTT_CLEAN_SESSION=false
TARGET_MQTT_TOPIC=fb/b/ogn/f/1
```

### Фильтрация

```bash
# Типы ВС: 1=планер, 6=дельтаплан, 7=параплан
AIRCRAFT_TYPES=1,6,7

# Географические границы (Альпы)
REGION_LAT_MIN=44.0
REGION_LAT_MAX=48.0
REGION_LON_MIN=8.0
REGION_LON_MAX=17.0

# Частотная фильтрация
MESSAGE_RATE_LIMIT_SEC=1
MAX_MESSAGE_AGE_MINUTES=60
```

## Формат данных

### Входные данные (OGN APRS)

Пример APRS сообщения:
```
FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E'180/025/A=002500 !W77! id073F1234 +150fpm +2.5rot FL008.50 45.2dB 0e +1.2kHz gps2x3
```

### Выходные данные (MQTT)

Бинарный формат совместимый с mqtt2mqtt:
```
[timestamp 4B][rssi 2B][snr 2B][FANET Type 1 packet]
```

FANET Type 1 packet:
```
[header 1B][source_addr 3B][lat 3B][lon 3B][alt_status 2B][speed 1B][climb 1B][heading 1B]
```

## Мониторинг

### Логи

```bash
# Просмотр логов
docker-compose logs -f ogn2mqtt

# Уровни логирования: error, warn, info, debug
LOG_LEVEL=info
ENABLE_DEBUG=false
```

### Статистика

Каждые 5 минут выводится статистика:

```json
{
  "uptime": "2:15:30",
  "ogn": {
    "connected": true,
    "messages": 15420,
    "reconnects": 0
  },
  "processing": {
    "received": 15420,
    "parsed": 8234,
    "converted": 3241,
    "published": 3241,
    "errors": 0
  },
  "filtering": {
    "processed": 8234,
    "passed": 3241,
    "filtered": {
      "rateLimited": 3102,
      "duplicate": 45,
      "tooOld": 1846,
      "invalid": 0
    },
    "passRate": "39.35%"
  },
  "activeDevices": 67
}
```

## Структура проекта

```
ogn2mqtt/
├── index.js              # Основной файл
├── lib/
│   ├── ogn-client.js      # OGN APRS клиент
│   ├── aprs-parser.js     # APRS парсер
│   ├── fanet-converter.js # FANET конвертер
│   └── message-filter.js  # Фильтрация сообщений
├── test/                 # Тесты (Jest)
│   ├── fixtures/         # Тестовые данные
│   ├── aprs-parser.test.js    # Unit тесты парсера
│   ├── fanet-converter.test.js # Unit тесты конвертера  
│   ├── message-filter.test.js  # Unit тесты фильтра
│   ├── ogn-client.test.js     # Unit тесты клиента
│   ├── integration.test.js    # Интеграционные тесты
│   └── setup.js              # Настройка Jest
├── specs/
│   └── ogn/
│       ├── aprs-protocol.md  # Документация OGN APRS
│       └── aprs-examples.md  # Примеры сообщений
├── package.json
├── jest.config.js        # Конфигурация Jest
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Тестирование и качество кода

Проект включает комплексную систему тестирования:

- **115+ автоматизированных тестов** на Jest
- **>90% покрытие кода** для основных компонентов  
- **Unit тесты** для каждого модуля (APRSParser, FANETConverter, MessageFilter, OGNClient)
- **Интеграционные тесты** полного pipeline обработки данных
- **Реальные тестовые данные** из OGN сети
- **Тесты на русском языке** с подробными описаниями
- **Continuous integration** готовность

### Покрытие тестами

| Компонент | Функции | Строки | Описание |
|-----------|---------|--------|----------|
| APRSParser | 100% | 95%+ | Парсинг APRS сообщений |
| FANETConverter | 100% | 90%+ | Конвертация в FANET формат |
| MessageFilter | 85%+ | 95%+ | Фильтрация и дедупликация |
| OGNClient | 60%+ | 70%+ | Сетевое взаимодействие |

## Совместимость

- ✅ Полная совместимость с форматом mqtt2mqtt
- ✅ Тот же бинарный FANET формат
- ✅ Те же MQTT топики
- ✅ Интеграция с существующими системами

## Производительность

- **Пропускная способность**: до 1000 сообщений/мин
- **Память**: ~50MB RAM
- **CPU**: минимальное использование
- **Сеть**: ~10-50 KB/s входящий трафик

## Устранение неполадок

### OGN соединение

```bash
# Проверка подключения к OGN
telnet aprs.glidernet.org 14580
```

### MQTT соединение

```bash
# Проверка MQTT подключения
mosquitto_pub -h localhost -t test -m "hello"
```

### Отладка

```bash
# Включить подробные логи
ENABLE_DEBUG=true
LOG_LEVEL=debug
```

### Частые проблемы

1. **Нет данных от OGN**: проверьте фильтр региона
2. **MQTT ошибки**: проверьте URL и доступность брокера
3. **Высокая нагрузка**: уменьшите регион фильтрации

## Лицензия

ISC License

## Автор

Проект FlyBeeper - OGN to MQTT Bridge
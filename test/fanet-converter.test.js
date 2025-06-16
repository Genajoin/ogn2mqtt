const FANETConverter = require('../lib/fanet-converter');
const testData = require('./fixtures/aprs-messages');

describe('FANETConverter', () => {
  let converter;

  beforeEach(() => {
    converter = new FANETConverter();
  });

  describe('конструктор и маппинг типов', () => {
    test('должен инициализироваться с правильным маппингом типов воздушных судов', () => {
      expect(converter.aircraftTypeMapping[1]).toBe(4); // glider -> glider
      expect(converter.aircraftTypeMapping[6]).toBe(2); // hang_glider -> hangglider  
      expect(converter.aircraftTypeMapping[7]).toBe(1); // paraglider -> paraglider
    });
  });

  describe('валидация данных для конвертации', () => {
    test('должен принимать валидные позиционные данные', () => {
      const validData = {
        messageType: 'position',
        latitude: 46.0,
        longitude: 14.0,
        deviceId: '3F1234',
        aircraftType: 7
      };
      
      expect(converter.isValidForConversion(validData)).toBe(true);
    });

    test('должен отклонять статусные сообщения', () => {
      const statusData = {
        messageType: 'status',
        text: 'Test status'
      };
      
      expect(converter.isValidForConversion(statusData)).toBe(false);
    });

    test('должен отклонять данные без координат', () => {
      const noCoords = {
        messageType: 'position',
        latitude: null,
        longitude: null,
        deviceId: '3F1234',
        aircraftType: 7
      };
      
      expect(converter.isValidForConversion(noCoords)).toBe(false);
    });

    test('должен отклонять данные без device ID', () => {
      const noDeviceId = {
        messageType: 'position',
        latitude: 46.0,
        longitude: 14.0,
        aircraftType: 7
      };
      
      expect(converter.isValidForConversion(noDeviceId)).toBe(false);
    });

    test('должен отклонять неподдерживаемые типы воздушных судов', () => {
      const unsupportedType = {
        messageType: 'position',
        latitude: 46.0,
        longitude: 14.0,
        deviceId: '3F1234',
        aircraftType: 2 // tow_plane - не поддерживается
      };
      
      expect(converter.isValidForConversion(unsupportedType)).toBe(false);
    });
  });

  describe('парсинг device ID', () => {
    test('должен корректно парсить hex device ID', () => {
      expect(converter.parseDeviceId('3F1234')).toBe(0x3F1234);
      expect(converter.parseDeviceId('121ABC')).toBe(0x121ABC);
      expect(converter.parseDeviceId('000001')).toBe(0x000001);
    });

    test('должен ограничивать до 24 бит', () => {
      expect(converter.parseDeviceId('FF1234567')).toBe(0x234567); // только младшие 24 бита
    });
  });

  describe('кодирование высоты и статуса', () => {
    test('должен кодировать высоту и статус для параплана', () => {
      const data = {
        altitude: 1000,
        aircraftType: 7 // paraglider
      };
      
      const encoded = converter.encodeAltitudeStatus(data);
      
      // Проверяем, что установлен online bit (bit 15)
      expect(encoded & 0x8000).toBe(0x8000);
      
      // Проверяем тип воздушного судна (bits 14-12)
      const aircraftTypeBits = (encoded >> 12) & 0x07;
      expect(aircraftTypeBits).toBe(1); // paraglider в FANET
      
      // Проверяем высоту (bits 10-0)
      const altitudeBits = encoded & 0x07FF;
      expect(altitudeBits).toBe(1000);
    });

    test('должен использовать 4x scaling для больших высот', () => {
      const data = {
        altitude: 5000,
        aircraftType: 1 // glider
      };
      
      const encoded = converter.encodeAltitudeStatus(data);
      
      // Проверяем scaling bit (bit 11)
      expect(encoded & 0x0800).toBe(0x0800);
      
      // Проверяем масштабированную высоту
      const altitudeBits = encoded & 0x07FF;
      expect(altitudeBits).toBe(1250); // 5000 / 4
    });

    test('должен ограничивать максимальную высоту', () => {
      const data = {
        altitude: 50000,
        aircraftType: 1
      };
      
      const encoded = converter.encodeAltitudeStatus(data);
      const altitudeBits = encoded & 0x07FF;
      expect(altitudeBits).toBe(2047); // максимум
    });
  });

  describe('кодирование скорости', () => {
    test('должен кодировать скорость в единицах 0.5 км/ч', () => {
      expect(converter.encodeSpeed(50)).toBe(100); // 50 / 0.5
      expect(converter.encodeSpeed(25)).toBe(50);   // 25 / 0.5
      expect(converter.encodeSpeed(0)).toBe(0);
    });

    test('должен использовать 5x scaling для больших скоростей', () => {
      const encoded = converter.encodeSpeed(200); // > 127 * 0.5
      
      // Проверяем scaling bit (bit 7)
      expect(encoded & 0x80).toBe(0x80);
      
      // Проверяем масштабированную скорость
      const speedBits = encoded & 0x7F;
      expect(speedBits).toBe(80); // (200 / 0.5) / 5
    });

    test('должен ограничивать максимальную скорость', () => {
      const encoded = converter.encodeSpeed(1000);
      const speedBits = encoded & 0x7F;
      expect(speedBits).toBe(127); // максимум
    });
  });

  describe('кодирование climb rate', () => {
    test('должен кодировать положительный climb rate', () => {
      expect(converter.encodeClimb(1.0)).toBe(10); // 1.0 / 0.1
      expect(converter.encodeClimb(0.5)).toBe(5);  // 0.5 / 0.1
    });

    test('должен кодировать отрицательный climb rate', () => {
      const encoded = converter.encodeClimb(-1.0);
      expect(encoded).toBe(128 - 10); // Two's complement
    });

    test('должен использовать 5x scaling для больших значений', () => {
      const encoded = converter.encodeClimb(10.0); // > 6.3 м/с
      
      // Проверяем scaling bit (bit 7)
      expect(encoded & 0x80).toBe(0x80);
    });

    test('должен обрабатывать null/undefined значения', () => {
      expect(converter.encodeClimb(null)).toBe(0);
      expect(converter.encodeClimb(undefined)).toBe(0);
    });
  });

  describe('кодирование курса', () => {
    test('должен кодировать курс 0-360° в 0-255', () => {
      expect(converter.encodeHeading(0)).toBe(0);
      expect(converter.encodeHeading(90)).toBeCloseTo(64, 0);
      expect(converter.encodeHeading(180)).toBeCloseTo(128, 0);
      expect(converter.encodeHeading(270)).toBeCloseTo(192, 0);
      expect(converter.encodeHeading(360)).toBe(0); // 360° это то же что 0°
    });

    test('должен обрабатывать null/undefined значения', () => {
      expect(converter.encodeHeading(null)).toBe(0);
      expect(converter.encodeHeading(undefined)).toBe(0);
    });
  });

  describe('запись 24-bit signed integer', () => {
    test('должен записывать положительные значения в little-endian', () => {
      const buffer = Buffer.alloc(3);
      converter.writeInt24LE(buffer, 0, 0x123456);
      
      expect(buffer[0]).toBe(0x56);
      expect(buffer[1]).toBe(0x34);
      expect(buffer[2]).toBe(0x12);
    });

    test('должен записывать отрицательные значения в two\'s complement', () => {
      const buffer = Buffer.alloc(3);
      converter.writeInt24LE(buffer, 0, -1);
      
      expect(buffer[0]).toBe(0xFF);
      expect(buffer[1]).toBe(0xFF);
      expect(buffer[2]).toBe(0xFF);
    });
  });

  describe('создание FANET tracking пакета', () => {
    test('должен создать валидный FANET пакет для параплана', () => {
      const aprsData = {
        deviceId: '3F1234',
        latitude: 46.0,
        longitude: 14.0,
        altitude: 1000,
        speed: 50,
        climbRate: 2.0,
        course: 180,
        aircraftType: 7
      };
      
      const packet = converter.createFANETTrackingPacket(aprsData);
      
      expect(packet).toBeInstanceOf(Buffer);
      expect(packet.length).toBeGreaterThanOrEqual(13);
      
      // Проверяем заголовок (Type 1)
      expect(packet[0] & 0x3F).toBe(1);
      
      // Проверяем source address
      const sourceAddr = packet[1] | (packet[2] << 8) | (packet[3] << 16);
      expect(sourceAddr).toBe(0x3F1234);
    });

    test('должен корректно кодировать координаты', () => {
      const aprsData = {
        deviceId: '3F1234',
        latitude: 46.0,
        longitude: 14.0,
        altitude: 1000,
        aircraftType: 7
      };
      
      const packet = converter.createFANETTrackingPacket(aprsData);
      
      // Извлекаем закодированные координаты
      const latRaw = packet[4] | (packet[5] << 8) | (packet[6] << 16);
      const lonRaw = packet[7] | (packet[8] << 8) | (packet[9] << 16);
      
      // Проверяем формулу кодирования
      const expectedLat = Math.round(46.0 * 93206.04);
      const expectedLon = Math.round(14.0 * 46603.02);
      
      expect(latRaw & 0xFFFFFF).toBe(expectedLat & 0xFFFFFF);
      expect(lonRaw & 0xFFFFFF).toBe(expectedLon & 0xFFFFFF);
    });
  });

  describe('обертка в MQTT формат', () => {
    test('должен создать правильную обертку mqtt2mqtt', () => {
      const fanetPacket = Buffer.from([0x01, 0x34, 0x12, 0x3F]);
      const aprsData = {
        receivedTime: new Date('2023-01-01T12:00:00Z'),
        signalStrength: 45.2
      };
      
      const wrapped = converter.wrapInMQTTFormat(fanetPacket, aprsData);
      
      expect(wrapped).toBeInstanceOf(Buffer);
      expect(wrapped.length).toBe(8 + fanetPacket.length);
      
      // Проверяем timestamp (first 4 bytes)
      const timestamp = wrapped.readUInt32LE(0);
      expect(timestamp).toBe(Math.floor(aprsData.receivedTime.getTime() / 1000));
      
      // Проверяем RSSI (next 2 bytes)
      const rssi = wrapped.readInt16LE(4);
      expect(rssi).toBe(45);
      
      // Проверяем SNR (next 2 bytes)
      const snr = wrapped.readInt16LE(6);
      expect(snr).toBe(10);
      
      // Проверяем FANET пакет
      const fanetPart = wrapped.slice(8);
      expect(fanetPart).toEqual(fanetPacket);
    });

    test('должен использовать дефолтные значения для отсутствующих данных', () => {
      const fanetPacket = Buffer.from([0x01]);
      const aprsData = {
        receivedTime: new Date()
      };
      
      const wrapped = converter.wrapInMQTTFormat(fanetPacket, aprsData);
      
      // Проверяем дефолтный RSSI
      const rssi = wrapped.readInt16LE(4);
      expect(rssi).toBe(-70);
    });
  });

  describe('полная конвертация в MQTT формат', () => {
    test('должен конвертировать валидные APRS данные в MQTT формат', () => {
      const aprsData = {
        messageType: 'position',
        deviceId: '3F1234',
        latitude: 46.0,
        longitude: 14.0,
        altitude: 1000,
        speed: 50,
        climbRate: 2.0,
        course: 180,
        aircraftType: 7,
        receivedTime: new Date(),
        signalStrength: 45.2
      };
      
      const result = converter.convertToMQTTFormat(aprsData);
      
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThanOrEqual(8 + 13); // 8 bytes wrapper + минимум 13 bytes FANET packet
    });

    test('должен возвращать null для невалидных данных', () => {
      const invalidData = {
        messageType: 'status',
        text: 'Test'
      };
      
      expect(converter.convertToMQTTFormat(invalidData)).toBeNull();
    });

    test('должен возвращать null при ошибках', () => {
      const malformedData = {
        messageType: 'position',
        deviceId: 'invalid',
        latitude: 'not_a_number',
        longitude: 14.0,
        aircraftType: 7
      };
      
      expect(converter.convertToMQTTFormat(malformedData)).toBeNull();
    });
  });

  describe('обработка ошибок', () => {
    test('должен обрабатывать исключения при конвертации', () => {
      // Мокаем метод для генерации исключения
      const originalMethod = converter.createFANETTrackingPacket;
      converter.createFANETTrackingPacket = jest.fn(() => {
        throw new Error('Test error');
      });
      
      const result = converter.convertToMQTTFormat({
        messageType: 'position',
        deviceId: '3F1234',
        latitude: 46.0,
        longitude: 14.0,
        aircraftType: 7
      });
      
      expect(result).toBeNull();
      
      // Восстанавливаем оригинальный метод
      converter.createFANETTrackingPacket = originalMethod;
    });
  });

  describe('интеграция с реальными данными', () => {
    test('должен конвертировать данные параплана из fixture', () => {
      // Создаем данные, аналогичные тем, что возвращает APRSParser
      const aprsData = {
        messageType: 'position',
        deviceId: '3F1234',
        latitude: 46.25205,
        longitude: 14.76130,
        altitude: 762,
        speed: 46.3,
        climbRate: 0.762,
        course: 180,
        aircraftType: 7,
        receivedTime: new Date(),
        signalStrength: 45.2
      };
      
      const result = converter.convertToMQTTFormat(aprsData);
      
      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(8);
    });
  });
});
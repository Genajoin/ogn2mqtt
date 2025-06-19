const APRSParser = require('../lib/aprs-parser');
const testData = require('./fixtures/aprs-messages');

describe('APRSParser', () => {
  let parser;

  beforeEach(() => {
    // Используем новые настройки с поддержкой коммерческих самолетов
    parser = new APRSParser({
      allowedAircraftTypes: [1, 6, 7, 8, 9],
      regionBounds: {
        latMin: 44.0,
        latMax: 49.0, // Расширенная северная граница
        lonMin: 5.0,
        lonMax: 17.0
      }
    });
  });

  describe('конструктор и конфигурация', () => {
    test('должен создаваться с настройками по умолчанию', () => {
      const defaultParser = new APRSParser();
      expect(defaultParser.config.allowedAircraftTypes).toEqual([1, 6, 7]);
      expect(defaultParser.config.regionBounds.latMin).toBe(44.0);
      expect(defaultParser.config.regionBounds.latMax).toBe(48.0);
      expect(defaultParser.config.regionBounds.lonMin).toBe(8.0);
      expect(defaultParser.config.regionBounds.lonMax).toBe(17.0);
    });

    test('должен принимать кастомную конфигурацию', () => {
      const customConfig = {
        allowedAircraftTypes: [1, 7],
        regionBounds: {
          latMin: 45.0,
          latMax: 47.0,
          lonMin: 10.0,
          lonMax: 15.0
        }
      };
      const customParser = new APRSParser(customConfig);
      
      expect(customParser.config.allowedAircraftTypes).toEqual([1, 7]);
      expect(customParser.config.regionBounds.latMin).toBe(45.0);
    });
  });

  describe('парсинг валидных сообщений', () => {
    test('должен парсить сообщение параплана', () => {
      const result = parser.parse(testData.valid.paraglider.raw);
      const expected = testData.valid.paraglider.expected;
      
      expect(result).not.toBeNull();
      expect(result.messageType).toBe(expected.messageType);
      expect(result.sourceCall).toBe(expected.sourceCall);
      expect(result.timestamp).toBe(expected.timestamp);
      
      // Проверяем координаты с допуском
      expect(result.latitude).toBeCloseTo(expected.latitude, 5);
      expect(result.longitude).toBeCloseTo(expected.longitude, 5);
      expect(result.altitude).toBeCloseTo(expected.altitude, 1);
      
      expect(result.course).toBe(expected.course);
      expect(result.speed).toBeCloseTo(expected.speed, 1);
      expect(result.deviceId).toBe(expected.deviceId);
      expect(result.aircraftType).toBe(expected.aircraftType);
      expect(result.aircraftTypeName).toBe(expected.aircraftTypeName);
      expect(result.climbRate).toBeCloseTo(expected.climbRate, 3);
      expect(result.turnRate).toBe(expected.turnRate);
      expect(result.signalStrength).toBe(expected.signalStrength);
      expect(result.frequencyOffset).toBe(expected.frequencyOffset);
    });

    test('должен парсить сообщение планера', () => {
      const result = parser.parse(testData.valid.glider.raw);
      const _expected = testData.valid.glider.expected; // eslint-disable-line no-unused-vars
      
      expect(result).not.toBeNull();
      expect(result.aircraftType).toBe(1);
      expect(result.aircraftTypeName).toBe('glider');
      expect(result.climbRate).toBe(0);
    });

    test('должен парсить сообщение дельтаплана', () => {
      const result = parser.parse(testData.valid.hangGlider.raw);
      const _expected = testData.valid.hangGlider.expected; // eslint-disable-line no-unused-vars
      
      expect(result).not.toBeNull();
      expect(result.aircraftType).toBe(6);
      expect(result.aircraftTypeName).toBe('hang_glider');
      expect(result.climbRate).toBeCloseTo(-1.016, 3);
    });

    test('должен парсить статусное сообщение', () => {
      const result = parser.parse(testData.valid.statusMessage.raw);
      const _expected = testData.valid.statusMessage.expected;
      
      expect(result).not.toBeNull();
      expect(result.messageType).toBe('status');
      expect(result.sourceCall).toBe(_expected.sourceCall);
      expect(result.text).toBe(_expected.text);
      expect(result.receivedTime).toBeInstanceOf(Date);
    });

    test('должен парсить сообщение коммерческого самолета (тип 9)', () => {
      const result = parser.parse(testData.valid.commercialAircraft.raw);
      const _expected = testData.valid.commercialAircraft.expected;
      
      expect(result).not.toBeNull();
      expect(result.messageType).toBe(_expected.messageType);
      expect(result.sourceCall).toBe(_expected.sourceCall);
      expect(result.timestamp).toBe(_expected.timestamp);
      
      // Проверяем координаты с допуском
      expect(result.latitude).toBeCloseTo(_expected.latitude, 5);
      expect(result.longitude).toBeCloseTo(_expected.longitude, 5);
      expect(result.altitude).toBeCloseTo(_expected.altitude, 1);
      
      expect(result.aircraftType).toBe(9);
      expect(result.aircraftTypeName).toBe('aircraft_jet');
      expect(result.addressType).toBe(1); // ICAO
      expect(result.deviceId).toBe(_expected.deviceId);
      expect(result.climbRate).toBeCloseTo(_expected.climbRate, 3);
    });

    test('должен парсить сообщение Lufthansa (реальные данные)', () => {
      const result = parser.parse(testData.valid.lufthansaFlight.raw);
      const _expected = testData.valid.lufthansaFlight.expected; // eslint-disable-line no-unused-vars
      
      expect(result).not.toBeNull();
      expect(result.aircraftType).toBe(9);
      expect(result.aircraftTypeName).toBe('aircraft_jet');
      expect(result.addressType).toBe(1);
      expect(result.climbRate).toBeCloseTo(0.3251, 3);
    });

    test('должен парсить сообщение самолета с поршневым двигателем (тип 8)', () => {
      const result = parser.parse(testData.valid.reciprocatingAircraft.raw);
      const _expected = testData.valid.reciprocatingAircraft.expected; // eslint-disable-line no-unused-vars
      
      expect(result).not.toBeNull();
      expect(result.aircraftType).toBe(8);
      expect(result.aircraftTypeName).toBe('aircraft_reciprocating');
      expect(result.addressType).toBe(0); // Исправленное значение для id20*
      expect(result.climbRate).toBeCloseTo(2.54, 2);
    });
  });

  describe('обработка невалидных сообщений', () => {
    test('должен отклонять сообщения вне региона', () => {
      const result = parser.parse(testData.invalid.outOfRegion);
      expect(result).toBeNull();
    });

    test('должен отклонять неподдерживаемые типы воздушных судов', () => {
      const result = parser.parse(testData.invalid.unsupportedAircraft);
      expect(result).toBeNull();
    });

    test('должен отклонять сообщения без OGN расширения', () => {
      const result = parser.parse(testData.invalid.noOgnExtension);
      expect(result).toBeNull();
    });

    test('должен отклонять сообщения с неправильными координатами', () => {
      const result = parser.parse(testData.invalid.invalidCoords);
      expect(result).toBeNull();
    });

    test('должен отклонять не-APRS сообщения', () => {
      const result = parser.parse(testData.invalid.notAprs);
      expect(result).toBeNull();
    });

    test('должен отклонять пустые сообщения', () => {
      expect(parser.parse('')).toBeNull();
      expect(parser.parse(null)).toBeNull();
      expect(parser.parse(undefined)).toBeNull();
    });

    test('должен отклонять самолеты вне расширенного региона (> 49°N)', () => {
      const result = parser.parse(testData.invalid.aircraftOutOfRegion);
      expect(result).toBeNull();
    });

    test('должен отклонять неподдерживаемые типы воздушных судов (balloon)', () => {
      const result = parser.parse(testData.invalid.unsupportedAircraftTypeA);
      expect(result).toBeNull();
    });

    test('должен отклонять тип буксировочного самолета (tow_plane)', () => {
      const result = parser.parse(testData.invalid.towPlaneType);
      expect(result).toBeNull();
    });
  });

  describe('граничные случаи', () => {
    test('должен обрабатывать сообщения без timestamp', () => {
      const result = parser.parse(testData.edge.noTimestamp);
      expect(result).not.toBeNull();
      expect(result.timestamp).toBeNull();
    });

    test('должен обрабатывать нулевые значения скорости и climb rate', () => {
      const result = parser.parse(testData.edge.zeroValues);
      expect(result).not.toBeNull();
      expect(result.speed).toBe(0);
      expect(result.climbRate).toBe(0);
    });

    test('должен принимать координаты на границах региона', () => {
      const minResult = parser.parse(testData.edge.minRegionBounds);
      const maxResult = parser.parse(testData.edge.maxRegionBounds);
      
      expect(minResult).not.toBeNull();
      expect(maxResult).not.toBeNull();
    });

    test('должен принимать координаты на новой северной границе (49°N)', () => {
      const result = parser.parse(testData.edge.northBoundary);
      expect(result).not.toBeNull();
      expect(result.latitude).toBeCloseTo(49.0, 5);
    });

    test('должен правильно декодировать все поддерживаемые типы воздушных судов', () => {
      const type1 = parser.parse(testData.edge.aircraftType1);
      const type6 = parser.parse(testData.edge.aircraftType6);  
      const type7 = parser.parse(testData.edge.aircraftType7);
      const type8 = parser.parse(testData.edge.aircraftType8);
      const type9 = parser.parse(testData.edge.aircraftType9);
      
      expect(type1).not.toBeNull();
      expect(type1.aircraftType).toBe(1);
      expect(type1.aircraftTypeName).toBe('glider');
      
      expect(type6).not.toBeNull();
      expect(type6.aircraftType).toBe(6);
      expect(type6.aircraftTypeName).toBe('hang_glider');
      
      expect(type7).not.toBeNull();
      expect(type7.aircraftType).toBe(7);
      expect(type7.aircraftTypeName).toBe('paraglider');
      
      expect(type8).not.toBeNull();
      expect(type8.aircraftType).toBe(8);
      expect(type8.aircraftTypeName).toBe('aircraft_reciprocating');
      
      expect(type9).not.toBeNull();
      expect(type9.aircraftType).toBe(9);
      expect(type9.aircraftTypeName).toBe('aircraft_jet');
    });

    test('должен правильно декодировать stealth mode и no-tracking флаги', () => {
      const stealthResult = parser.parse(testData.edge.stealthMode);
      const noTrackResult = parser.parse(testData.edge.noTracking);
      
      expect(stealthResult).not.toBeNull();
      expect(stealthResult.aircraftType).toBe(9); // Тип должен быть правильно извлечен несмотря на флаги
      
      expect(noTrackResult).not.toBeNull();
      expect(noTrackResult.aircraftType).toBe(9);
    });
  });

  describe('валидация данных', () => {
    test('должен валидировать корректные позиционные данные', () => {
      const validData = {
        messageType: 'position',
        latitude: 46.0,
        longitude: 14.0,
        altitude: 1000,
        speed: 50
      };
      
      expect(parser.validateData(validData)).toBe(true);
    });

    test('должен пропускать статусные сообщения без валидации координат', () => {
      const statusData = {
        messageType: 'status',
        text: 'Test status'
      };
      
      expect(parser.validateData(statusData)).toBe(true);
    });

    test('должен отклонять невалидные координаты', () => {
      const invalidLat = {
        messageType: 'position',
        latitude: 91.0,
        longitude: 14.0
      };
      const invalidLon = {
        messageType: 'position',
        latitude: 46.0,
        longitude: 181.0
      };
      
      expect(parser.validateData(invalidLat)).toBe(false);
      expect(parser.validateData(invalidLon)).toBe(false);
    });

    test('должен отклонять невалидную высоту', () => {
      const invalidAltitude = {
        messageType: 'position',
        latitude: 46.0,
        longitude: 14.0,
        altitude: 20000
      };
      
      expect(parser.validateData(invalidAltitude)).toBe(false);
    });

    test('должен отклонять невалидную скорость', () => {
      const invalidSpeed = {
        messageType: 'position',
        latitude: 46.0,
        longitude: 14.0,
        speed: 1500, // Больше лимита для обычных самолетов (1000 км/ч)
        aircraftType: 1 // glider
      };
      
      expect(parser.validateData(invalidSpeed)).toBe(false);
    });
  });

  describe('региональные проверки', () => {
    test('должен корректно определять координаты в регионе', () => {
      expect(parser.isInRegion(46.0, 14.0)).toBe(true);
      expect(parser.isInRegion(44.0, 8.0)).toBe(true);
      expect(parser.isInRegion(48.0, 17.0)).toBe(true);
    });

    test('должен отклонять координаты вне региона', () => {
      expect(parser.isInRegion(43.9, 14.0)).toBe(false);
      expect(parser.isInRegion(49.1, 14.0)).toBe(false); // Обновлено для новой границы
      expect(parser.isInRegion(46.0, 4.9)).toBe(false);
      expect(parser.isInRegion(46.0, 17.1)).toBe(false);
    });
  });

  describe('типы воздушных судов', () => {
    test('должен корректно определять разрешенные типы', () => {
      expect(parser.isAllowedAircraftType(1)).toBe(true); // glider
      expect(parser.isAllowedAircraftType(6)).toBe(true); // hang_glider
      expect(parser.isAllowedAircraftType(7)).toBe(true); // paraglider
      expect(parser.isAllowedAircraftType(8)).toBe(true); // aircraft_reciprocating
      expect(parser.isAllowedAircraftType(9)).toBe(true); // aircraft_jet
    });

    test('должен отклонять неразрешенные типы', () => {
      expect(parser.isAllowedAircraftType(0)).toBe(false); // unknown
      expect(parser.isAllowedAircraftType(2)).toBe(false); // tow_plane
      expect(parser.isAllowedAircraftType(3)).toBe(false); // helicopter
      expect(parser.isAllowedAircraftType(4)).toBe(false); // parachute
      expect(parser.isAllowedAircraftType(5)).toBe(false); // drop_plane
      expect(parser.isAllowedAircraftType(10)).toBe(false); // balloon (0xA)
      expect(parser.isAllowedAircraftType(11)).toBe(false); // airship (0xB)
      expect(parser.isAllowedAircraftType(12)).toBe(false); // UAV (0xC)
    });
  });

  describe('обработка ошибок', () => {
    test('должен обрабатывать исключения при парсинге', () => {
      // Создаем специально поврежденное сообщение, которое может вызвать исключение
      const malformedMessage = 'FLR3F1234>APRS,qAS,Slovenia:/' + 'X'.repeat(1000);
      
      expect(() => parser.parse(malformedMessage)).not.toThrow();
      expect(parser.parse(malformedMessage)).toBeNull();
    });
  });

  describe('парсинг заголовков', () => {
    test('должен корректно парсить заголовок APRS', () => {
      const header = parser.parseHeader('FLR3F1234>APRS,qAS,Slovenia');
      
      expect(header).not.toBeNull();
      expect(header.sourceCall).toBe('FLR3F1234');
      expect(header.destination).toBe('APRS');
      expect(header.via).toEqual(['qAS', 'Slovenia']);
    });

    test('должен отклонять неправильные заголовки', () => {
      expect(parser.parseHeader('InvalidHeader')).toBeNull();
      expect(parser.parseHeader('')).toBeNull();
    });
  });

  describe('парсинг OGN расширений', () => {
    test('должен извлекать все OGN данные из комментария', () => {
      const comment = 'id073F1234 +150fpm +2.5rot FL008.50 45.2dB 0e +1.2kHz gps2x3';
      const ognData = parser.parseOGNExtension(comment);
      
      expect(ognData).not.toBeNull();
      expect(ognData.deviceId).toBe('3F1234');
      expect(ognData.addressType).toBe(3); // 0x07 = 00000111 -> addr=3, type=1
      expect(ognData.aircraftType).toBe(1); // Правильный тип после исправления
      expect(ognData.climbRate).toBeCloseTo(0.762, 3);
      expect(ognData.turnRate).toBe(2.5);
      expect(ognData.signalStrength).toBe(45.2);
      expect(ognData.frequencyOffset).toBe(1.2);
      expect(ognData.gpsAccuracy.horizontal).toBe(2);
      expect(ognData.gpsAccuracy.vertical).toBe(3);
    });

    test('должен обрабатывать отрицательные значения', () => {
      const comment = 'id063A5678 -200fpm -1.8rot FL005.80 38.5dB 0e +2.1kHz gps4x6';
      const ognData = parser.parseOGNExtension(comment);
      
      expect(ognData).not.toBeNull();
      expect(ognData.climbRate).toBeCloseTo(-1.016, 3);
      expect(ognData.turnRate).toBe(-1.8);
    });

    test('должен правильно декодировать Aircraft ID по формату STttttaa', () => {
      // Тест реального сообщения: id254BCE08 = 0x25 = 00100101
      // S=0, T=0, tttt=1001=9, aa=01=1
      const comment = 'id254BCE08 +1664fpm FL336.85 A3:SXS9W Sq7666';
      const ognData = parser.parseOGNExtension(comment);
      
      expect(ognData).not.toBeNull();
      expect(ognData.deviceId).toBe('4BCE08');
      expect(ognData.addressType).toBe(1); // ICAO
      expect(ognData.aircraftType).toBe(9); // jet aircraft
    });

    test('должен правильно декодировать различные Aircraft ID', () => {
      // Тест разных комбинаций типов
      const testCases = [
        { id: '04', expectedType: 1, expectedAddr: 0 }, // 00000100 = type 1, addr 0
        { id: '18', expectedType: 6, expectedAddr: 0 }, // 00011000 = type 6, addr 0  
        { id: '1C', expectedType: 7, expectedAddr: 0 }, // 00011100 = type 7, addr 0
        { id: '20', expectedType: 8, expectedAddr: 0 }, // 00100000 = type 8, addr 0
        { id: '24', expectedType: 9, expectedAddr: 0 }, // 00100100 = type 9, addr 0
        { id: '25', expectedType: 9, expectedAddr: 1 }, // 00100101 = type 9, addr 1 (ICAO)
      ];

      testCases.forEach(({ id, expectedType, expectedAddr }) => {
        const comment = `id${id}123456 +100fpm`;
        const ognData = parser.parseOGNExtension(comment);
        
        expect(ognData).not.toBeNull();
        expect(ognData.aircraftType).toBe(expectedType);
        expect(ognData.addressType).toBe(expectedAddr);
        expect(ognData.deviceId).toBe('123456');
      });
    });

    test('должен возвращать null для комментариев без OGN данных', () => {
      expect(parser.parseOGNExtension('Обычный комментарий')).toBeNull();
      expect(parser.parseOGNExtension('')).toBeNull();
      expect(parser.parseOGNExtension(null)).toBeNull();
    });
  });
});
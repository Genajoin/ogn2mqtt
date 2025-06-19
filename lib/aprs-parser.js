class APRSParser {
  constructor(config = {}, logger = null) {
    this.config = {
      allowedAircraftTypes: config.allowedAircraftTypes || [1, 6, 7], // glider, hang_glider, paraglider
      regionBounds: config.regionBounds || {
        latMin: 44.0,
        latMax: 48.0,
        lonMin: 8.0,
        lonMax: 17.0
      }
    };
        
    this.logger = logger;

    // Типы воздушных судов
    this.aircraftTypes = {
      0: 'unknown',
      1: 'glider',
      2: 'tow_plane', 
      3: 'helicopter',
      4: 'parachute',
      5: 'drop_plane',
      6: 'hang_glider',
      7: 'paraglider',
      8: 'aircraft_reciprocating',
      9: 'aircraft_jet',
      'A': 'balloon',
      'B': 'airship',
      'C': 'uav',
      'D': 'static_obstacle'
    };
  }

  /**
     * Парсит APRS сообщение OGN
     * @param {string} message - сырое APRS сообщение
     * @returns {object|null} - распарсенные данные или null если сообщение невалидно
     */
  parse(message) {
    try {
      // Пример: FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E'180/025/A=002500 !W77! id073F1234 +150fpm +2.5rot FL008.50 45.2dB 0e +1.2kHz gps2x3

      // Разделяем на заголовок и тело
      const colonPos = message.indexOf(':');
      if (colonPos === -1) {
        return null; // Не APRS сообщение
      }

      const header = message.substring(0, colonPos);
      const body = message.substring(colonPos + 1);

      // Парсим заголовок
      const headerParts = this.parseHeader(header);
      if (!headerParts) return null;

      // Определяем тип сообщения по первому символу тела
      const messageType = body.charAt(0);
            
      if (messageType === '/') {
        // Позиционное сообщение с timestamp
        return this.parsePositionMessage(headerParts, body);
      } else if (messageType === '!' || messageType === '=') {
        // Позиционное сообщение без timestamp
        return this.parsePositionMessage(headerParts, body);
      } else if (messageType === '>') {
        // Статусное сообщение (name beacon)
        return this.parseStatusMessage(headerParts, body);
      }

      return null; // Неизвестный тип сообщения
            
    } catch (error) {
      this.log('error', 'Ошибка парсинга APRS:', error);
      return null;
    }
  }

  parseHeader(header) {
    // Формат: FLR3F1234>APRS,qAS,Slovenia
    const parts = header.split('>');
    if (parts.length !== 2) return null;

    const sourceCall = parts[0];
    const pathParts = parts[1].split(',');
        
    return {
      sourceCall: sourceCall,
      destination: pathParts[0],
      via: pathParts.slice(1)
    };
  }

  parsePositionMessage(header, body) {
    // Убираем первый символ (/ ! или =)
    let positionData = body.substring(1);

    let timestamp = null;
        
    // Если начинается с /, то есть timestamp
    if (body.charAt(0) === '/') {
      // Извлекаем timestamp (6 символов HHMMSS или DDHHMM)
      if (positionData.length >= 7 && positionData.charAt(6) === 'h') {
        timestamp = positionData.substring(0, 6);
        positionData = positionData.substring(7);
      }
    }

    // Парсим координаты
    const coords = this.parseCoordinates(positionData);
    if (!coords) return null;

    // Проверяем, попадает ли в регион
    if (!this.isInRegion(coords.latitude, coords.longitude)) {
      return null;
    }

    // Ищем OGN расширение в комментарии
    const ognData = this.parseOGNExtension(coords.comment);
    if (!ognData) {
      this.log('debug', 'OGN расширение не найдено в комментарии', {
        comment: coords.comment,
        sourceCall: header.sourceCall
      });
      return null;
    }

    this.log('debug', 'Распарсены OGN данные', {
      deviceId: ognData.deviceId,
      aircraftType: ognData.aircraftType,
      aircraftTypeName: this.aircraftTypes[ognData.aircraftType] || 'unknown',
      sourceCall: header.sourceCall
    });

    // Проверяем тип воздушного судна
    if (!this.isAllowedAircraftType(ognData.aircraftType)) {
      this.log('debug', 'Тип воздушного судна не разрешен', {
        aircraftType: ognData.aircraftType,
        allowedTypes: this.config.allowedAircraftTypes,
        deviceId: ognData.deviceId
      });
      return null;
    }

    return {
      messageType: 'position',
      sourceCall: header.sourceCall,
      timestamp: timestamp,
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: coords.altitude, // в метрах
      course: coords.course,
      speed: coords.speed, // в км/ч
      symbol: coords.symbol,
      comment: coords.comment,
      // OGN данные
      deviceId: ognData.deviceId,
      addressType: ognData.addressType,
      aircraftType: ognData.aircraftType,
      aircraftTypeName: this.aircraftTypes[ognData.aircraftType] || 'unknown',
      climbRate: ognData.climbRate, // м/с
      turnRate: ognData.turnRate,
      signalStrength: ognData.signalStrength,
      frequencyOffset: ognData.frequencyOffset,
      gpsAccuracy: ognData.gpsAccuracy,
      receivedTime: new Date()
    };
  }

  parseCoordinates(positionStr) {
    // Формат: 4615.123N/01445.678E'180/025/A=002500 комментарий
        
    // Ищем паттерн координат (символ может быть ', /, или ^)
    const coordPattern = /(\d{4}\.\d{2,3})([NS])\/(\d{5}\.\d{2,3})([EW])(['^\\/])/;
    const match = positionStr.match(coordPattern);
        
    if (!match) return null;

    const [, latStr, latDir, lonStr, lonDir, symbol] = match;
        
    // Конвертируем широту DDMM.mmm в десятичные градусы
    const latDeg = parseInt(latStr.substring(0, 2));
    const latMin = parseFloat(latStr.substring(2));
    let latitude = latDeg + latMin / 60.0;
    if (latDir === 'S') latitude = -latitude;

    // Конвертируем долготу DDDMM.mmm в десятичные градусы
    const lonDeg = parseInt(lonStr.substring(0, 3));
    const lonMin = parseFloat(lonStr.substring(3));
    let longitude = lonDeg + lonMin / 60.0;
    if (lonDir === 'W') longitude = -longitude;

    // Ищем данные о курсе/скорости и высоте
    const remainingStr = positionStr.substring(match.index + match[0].length);
        
    let course = null, speed = null, altitude = null;
        
    // Курс/скорость: 180/025
    const courseSpeedMatch = remainingStr.match(/(\d{3})\/(\d{3})/);
    if (courseSpeedMatch) {
      course = parseInt(courseSpeedMatch[1]);
      speed = parseInt(courseSpeedMatch[2]) * 1.852; // узлы в км/ч
    }

    // Высота: A=002500 (футы)
    const altitudeMatch = remainingStr.match(/A=(\d{6})/);
    if (altitudeMatch) {
      altitude = parseInt(altitudeMatch[1]) * 0.3048; // футы в метры
    }

    // Остальное считаем комментарием
    const commentStart = remainingStr.search(/\s/);
    const comment = commentStart !== -1 ? remainingStr.substring(commentStart + 1) : '';

    return {
      latitude,
      longitude,
      course,
      speed,
      altitude,
      symbol,
      comment
    };
  }

  parseOGNExtension(comment) {
    if (!comment) return null;

    // Ищем идентификатор устройства: id073F1234
    const idMatch = comment.match(/id([0-9A-F]{2})([0-9A-F]{6})/i);
    if (!idMatch) return null;

    const addressTypeAndAircraft = idMatch[1];
    const deviceAddress = idMatch[2];

    // Правильно декодируем Aircraft ID по формату STttttaa (8 бит)
    // S=stealth, T=no-tracking, tttt=aircraft type (4 бита), aa=address type (2 бита)
    const idByte = parseInt(addressTypeAndAircraft, 16);
    const stealthMode = (idByte & 0x80) !== 0;        // bit 7
    const noTracking = (idByte & 0x40) !== 0;         // bit 6
    const aircraftType = (idByte & 0x3C) >> 2;        // bits 5-2 (4 бита)
    const addressType = idByte & 0x03;                // bits 1-0 (2 бита)
        
    this.log('debug', 'Декодирование Aircraft ID', {
      originalHex: addressTypeAndAircraft,
      idByte: idByte.toString(2).padStart(8, '0'),
      stealthMode,
      noTracking,
      aircraftType,
      addressType,
      deviceAddress
    });

    // Парсим climb rate: +150fpm или -200fpm
    let climbRate = null;
    const climbMatch = comment.match(/([+-]\d+)fpm/);
    if (climbMatch) {
      climbRate = parseInt(climbMatch[1]) * 0.00508; // фут/мин в м/с
    }

    // Парсим turn rate: +2.5rot или -1.8rot
    let turnRate = null;
    const turnMatch = comment.match(/([+-]?\d+\.\d+)rot/);
    if (turnMatch) {
      turnRate = parseFloat(turnMatch[1]);
    }

    // Парсим силу сигнала: 45.2dB
    let signalStrength = null;
    const signalMatch = comment.match(/(\d+\.\d+)dB/);
    if (signalMatch) {
      signalStrength = parseFloat(signalMatch[1]);
    }

    // Парсим частотное смещение: +1.2kHz
    let frequencyOffset = null;
    const freqMatch = comment.match(/([+-]\d+\.\d+)kHz/);
    if (freqMatch) {
      frequencyOffset = parseFloat(freqMatch[1]);
    }

    // Парсим точность GPS: gps2x3
    let gpsAccuracy = null;
    const gpsMatch = comment.match(/gps(\d+)x(\d+)/);
    if (gpsMatch) {
      gpsAccuracy = {
        horizontal: parseInt(gpsMatch[1]),
        vertical: parseInt(gpsMatch[2])
      };
    }

    return {
      deviceId: deviceAddress,
      addressType,
      aircraftType,
      climbRate,
      turnRate,
      signalStrength,
      frequencyOffset,
      gpsAccuracy
    };
  }

  parseStatusMessage(header, body) {
    // Статусные сообщения (name beacon): >094600h Pilot: John Smith
    return {
      messageType: 'status',
      sourceCall: header.sourceCall,
      text: body.substring(1), // убираем >
      receivedTime: new Date()
    };
  }

  isInRegion(lat, lon) {
    const bounds = this.config.regionBounds;
    return lat >= bounds.latMin && lat <= bounds.latMax &&
               lon >= bounds.lonMin && lon <= bounds.lonMax;
  }

  isAllowedAircraftType(type) {
    return this.config.allowedAircraftTypes.includes(type);
  }

  validateData(data) {
    if (!data) return false;
        
    // Базовые проверки
    if (data.messageType !== 'position') return true; // Статусные сообщения пропускаем
        
    // Проверка координат
    if (Math.abs(data.latitude) > 90 || Math.abs(data.longitude) > 180) {
      return false;
    }

    // Проверка высоты (разумные пределы)
    if (data.altitude !== null && (data.altitude < -500 || data.altitude > 15000)) {
      return false;
    }

    // Проверка скорости (разумные пределы) - для коммерческих самолетов выше лимит
    const maxSpeed = (data.aircraftType === 8 || data.aircraftType === 9) ? 2000 : 1000;
    if (data.speed !== null && data.speed > maxSpeed) {
      return false;
    }

    return true;
  }

  log(level, message, data = null) {
    if (this.logger) {
      this.logger(level, `[APRS-PARSER] ${message}`, data);
    } else {
      const timestamp = new Date().toISOString();
      const logData = data ? ` ${JSON.stringify(data)}` : '';
      console.log(`[${timestamp}] [APRS-PARSER] [${level.toUpperCase()}] ${message}${logData}`);
    }
  }
}

module.exports = APRSParser;
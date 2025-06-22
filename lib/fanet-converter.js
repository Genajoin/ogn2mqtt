class FANETConverter {
  constructor(logger = null) {
    this.logger = logger;
        
    // Маппинг типов воздушных судов OGN -> FANET
    // OGN Types: 0=unknown, 1=glider, 2=tow_plane, 3=helicopter, 4=parachute, 5=drop_plane,
    //           6=hang_glider, 7=paraglider, 8=aircraft_reciprocating, 9=aircraft_jet,
    //           10(A)=balloon, 11(B)=airship, 12(C)=uav, 13(D)=static_obstacle
    // FANET Types: 0=other, 1=paraglider, 2=hangglider, 3=balloon, 4=glider, 5=aircraft, 6=helicopter, 7=uav
    this.aircraftTypeMapping = {
      0: 0,  // unknown -> other
      1: 4,  // glider -> glider
      2: 5,  // tow_plane -> aircraft
      3: 6,  // helicopter -> helicopter
      4: 0,  // parachute -> other
      5: 5,  // drop_plane -> aircraft
      6: 2,  // hang_glider -> hangglider  
      7: 1,  // paraglider -> paraglider
      8: 5,  // aircraft_reciprocating -> aircraft
      9: 5,  // aircraft_jet -> aircraft
      10: 3, // balloon -> balloon
      11: 5, // airship -> aircraft
      12: 7, // uav -> uav
      13: 0  // static_obstacle -> other
    };
  }

  /**
     * Конвертирует APRS данные в бинарный FANET формат
     * @param {object} aprsData - данные из APRS парсера
     * @returns {Buffer} - бинарные данные в формате mqtt2mqtt
     */
  convertToMQTTFormat(aprsData) {
    if (!aprsData || aprsData.messageType !== 'position') {
      return null;
    }

    try {
      // Создаем FANET пакет Type 1 (Tracking)
      const fanetPacket = this.createFANETTrackingPacket(aprsData);
            
      // Оборачиваем в формат mqtt2mqtt: [timestamp 4B][rssi 2B][snr 2B][fanet_packet]
      return this.wrapInMQTTFormat(fanetPacket, aprsData);
            
    } catch (error) {
      this.log('error', 'Ошибка конвертации в FANET:', error);
      return null;
    }
  }

  createFANETTrackingPacket(data) {
    // FANET Type 1 packet structure:
    // [header 1B][source_addr 3B][lat 3B][lon 3B][alt_status 2B][speed 1B][climb 1B][heading 1B]

    const buffer = Buffer.alloc(16); // Максимальный размер для tracking packet
    let offset = 0;

    // 1. Header byte
    const packetType = 1; // Type 1 = Tracking
    const forwardFlag = 0;
    const extendedFlag = 0;
    const header = (extendedFlag << 7) | (forwardFlag << 6) | (packetType & 0x3F);
    buffer.writeUInt8(header, offset++);

    // 2. Source address (3 bytes, little-endian)
    const sourceAddr = this.parseDeviceId(data.deviceId);
    buffer.writeUInt8(sourceAddr & 0xFF, offset++);
    buffer.writeUInt8((sourceAddr >> 8) & 0xFF, offset++);
    buffer.writeUInt8((sourceAddr >> 16) & 0xFF, offset++);

    // 3. Coordinates (3+3 bytes, little-endian, 2-complement)
    const latRaw = Math.round(data.latitude * 93206.04);
    const lonRaw = Math.round(data.longitude * 46603.02);
        
    this.writeInt24LE(buffer, offset, latRaw);
    offset += 3;
    this.writeInt24LE(buffer, offset, lonRaw);
    offset += 3;

    // 4. Altitude + status (2 bytes)
    const altStatus = this.encodeAltitudeStatus(data);
    buffer.writeUInt16LE(altStatus, offset);
    offset += 2;

    // 5. Speed (1 byte)
    const speedEncoded = this.encodeSpeed(data.speed);
    buffer.writeUInt8(speedEncoded, offset++);

    // 6. Climb rate (1 byte)
    const climbEncoded = this.encodeClimb(data.climbRate);
    buffer.writeUInt8(climbEncoded, offset++);

    // 7. Heading (1 byte)
    const headingEncoded = this.encodeHeading(data.course);
    buffer.writeUInt8(headingEncoded, offset++);

    return buffer.slice(0, offset);
  }

  wrapInMQTTFormat(fanetPacket, aprsData) {
    // Формат mqtt2mqtt: [timestamp 4B][rssi 2B][snr 2B][fanet_packet]
    const wrapperSize = 8;
    const totalSize = wrapperSize + fanetPacket.length;
    const buffer = Buffer.alloc(totalSize);
        
    let offset = 0;

    // 1. Timestamp (Unix timestamp, little-endian)
    const timestamp = Math.floor(aprsData.receivedTime.getTime() / 1000);
    buffer.writeUInt32LE(timestamp, offset);
    offset += 4;

    // 2. RSSI (используем signal strength если есть, иначе фейк)
    const rssi = aprsData.signalStrength ? Math.round(aprsData.signalStrength) : -70;
    buffer.writeInt16LE(rssi, offset);
    offset += 2;

    // 3. SNR (фейковое значение)
    const snr = 10; // Фиксированное значение SNR
    buffer.writeInt16LE(snr, offset);
    offset += 2;

    // 4. FANET packet
    fanetPacket.copy(buffer, offset);

    return buffer;
  }

  parseDeviceId(deviceIdHex) {
    // Конвертируем hex строку в число
    return parseInt(deviceIdHex, 16) & 0xFFFFFF; // 24 бита
  }

  encodeAltitudeStatus(data) {
    // Bit 15: Online Tracking flag (всегда 1 для живых данных)
    // Bits 14-12: Aircraft Type (0-7) 
    // Bit 11: Altitude scaling (0=1x, 1=4x)
    // Bits 10-0: Altitude в метрах

    let altStatus = 0x8000; // Установить bit 15 (online)

    // Маппинг типа воздушного судна
    const fanetType = this.aircraftTypeMapping[data.aircraftType] || 0;
    altStatus |= (fanetType & 0x07) << 12;

    // Кодирование высоты
    let altitude = Math.round(data.altitude || 0);
    let altScale = 0;

    if (altitude > 2047) {
      // Используем 4x scaling для больших высот
      altitude = Math.round(altitude / 4);
      altScale = 1;
      if (altitude > 2047) altitude = 2047; // Максимум
    }

    if (altitude < 0) altitude = 0; // Минимум

    altStatus |= altScale << 11;
    altStatus |= altitude & 0x07FF;

    return altStatus;
  }

  encodeSpeed(speedKmh) {
    if (!speedKmh) return 0;

    // Конвертируем км/ч в скорость FANET (единицы 0.5 км/ч)
    let speed = Math.round(speedKmh / 0.5);
    let speedScale = 0;

    if (speed > 127) {
      // Используем 5x scaling для больших скоростей
      speed = Math.round(speed / 5);
      speedScale = 1;
      if (speed > 127) speed = 127; // Максимум
    }

    return (speedScale << 7) | (speed & 0x7F);
  }

  encodeClimb(climbMs) {
    if (climbMs === null || climbMs === undefined) return 0;

    // Конвертируем м/с в единицы FANET (0.1 м/с)
    let climb = Math.round(climbMs / 0.1);
    let climbScale = 0;

    if (Math.abs(climb) > 63) {
      // Используем 5x scaling для больших скоростей набора
      climb = Math.round(climb / 5);
      climbScale = 1;
      if (climb > 63) climb = 63;
      if (climb < -64) climb = -64;
    }

    // 7-bit signed value
    if (climb < 0) {
      climb = 128 + climb; // Two's complement для отрицательных
    }

    return (climbScale << 7) | (climb & 0x7F);
  }

  encodeHeading(course) {
    if (!course) return 0;
        
    // Конвертируем 0-360° в 0-255
    return Math.round((course * 256) / 360) & 0xFF;
  }

  writeInt24LE(buffer, offset, value) {
    // Записываем 24-bit signed integer в little-endian формате
    if (value < 0) {
      // Two's complement для отрицательных чисел
      value = 0x1000000 + value;
    }
        
    buffer.writeUInt8(value & 0xFF, offset);
    buffer.writeUInt8((value >> 8) & 0xFF, offset + 1);
    buffer.writeUInt8((value >> 16) & 0xFF, offset + 2);
  }

  /**
     * Проверка валидности данных для конвертации
     */
  isValidForConversion(data) {
    if (!data || data.messageType !== 'position') {
      return false;
    }

    // Проверяем наличие обязательных полей
    if (data.latitude === null || data.longitude === null) {
      return false;
    }

    // Проверяем device ID
    if (!data.deviceId || typeof data.deviceId !== 'string') {
      return false;
    }

    // Проверяем тип воздушного судна
    if (!Object.prototype.hasOwnProperty.call(this.aircraftTypeMapping, data.aircraftType)) {
      return false;
    }

    return true;
  }

  log(level, message, data = null) {
    if (this.logger) {
      this.logger(level, `[FANET-CONVERTER] ${message}`, data);
    } else {
      const timestamp = new Date().toISOString();
      const logData = data ? ` ${JSON.stringify(data)}` : '';
      console.log(`[${timestamp}] [FANET-CONVERTER] [${level.toUpperCase()}] ${message}${logData}`);
    }
  }
}

module.exports = FANETConverter;
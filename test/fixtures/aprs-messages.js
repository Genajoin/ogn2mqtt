// Тестовые данные APRS сообщений на основе реальных примеров

module.exports = {
  // Валидные сообщения
  valid: {
    paraglider: {
      raw: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'180/025/A=002500 !W77! id1C3F1234 +150fpm +2.5rot FL008.50 45.2dB 0e +1.2kHz gps2x3',
      expected: {
        messageType: 'position',
        sourceCall: 'FLR3F1234',
        timestamp: '094530',
        latitude: 46.25205,
        longitude: 14.76130,
        altitude: 762,
        course: 180,
        speed: 46.3,
        deviceId: '3F1234',
        addressType: 0, // 0x1C = 00011100 -> addr=0, type=7
        aircraftType: 7, // paraglider
        aircraftTypeName: 'paraglider',
        climbRate: 0.762,
        turnRate: 2.5,
        signalStrength: 45.2,
        frequencyOffset: 1.2
      }
    },
    
    glider: {
      raw: 'FLR121ABC>APRS,qAS,Austria:/101500h4712.456N/01330.789E\'045/035/A=008500 !W11! id04121ABC +000fpm +0.0rot FL028.00 52.8dB 0e -0.5kHz gps1x2',
      expected: {
        messageType: 'position',
        sourceCall: 'FLR121ABC',
        timestamp: '101500',
        latitude: 47.20760,
        longitude: 13.51315,
        altitude: 2591.04,
        course: 45,
        speed: 64.82,
        deviceId: '121ABC',
        addressType: 0,
        aircraftType: 1,
        aircraftTypeName: 'glider',
        climbRate: 0,
        turnRate: 0,
        signalStrength: 52.8,
        frequencyOffset: -0.5
      }
    },
    
    hangGlider: {
      raw: 'FLR3A5678>APRS,qAS,Italy:/113000h4545.321N/01118.456E\'270/018/A=001800 !W66! id183A5678 -200fpm -1.8rot FL005.80 38.5dB 0e +2.1kHz gps4x6',
      expected: {
        messageType: 'position',
        sourceCall: 'FLR3A5678',
        timestamp: '113000',
        latitude: 45.75535,
        longitude: 11.30760,
        altitude: 548.64,
        course: 270,
        speed: 33.336,
        deviceId: '3A5678',
        addressType: 0,
        aircraftType: 6,
        aircraftTypeName: 'hang_glider',
        climbRate: -1.016,
        turnRate: -1.8,
        signalStrength: 38.5,
        frequencyOffset: 2.1
      }
    },
    
    statusMessage: {
      raw: 'FLR3F1234>APRS,qAS,Slovenia:>094600h Pilot: John Smith',
      expected: {
        messageType: 'status',
        sourceCall: 'FLR3F1234',
        text: '094600h Pilot: John Smith'
      }
    },

    // Реальные сообщения от коммерческих самолетов (типы 8 и 9) - координаты в пределах региона
    commercialAircraft: {
      raw: 'ICA4BCE08>OGADSB,qAS,HLST:/205511h4730.16N/01136.18E^099/444/A=034803 !W54! id254BCE08 +1664fpm FL336.85 A3:SXS9W Sq7666',
      expected: {
        messageType: 'position',
        sourceCall: 'ICA4BCE08',
        timestamp: '205511',
        latitude: 47.50267,
        longitude: 11.60300,
        altitude: 10608,
        course: 99,
        speed: 822.288,
        deviceId: '4BCE08',
        addressType: 1, // ICAO
        aircraftType: 9, // jet aircraft
        aircraftTypeName: 'aircraft_jet',
        climbRate: 8.453,
        signalStrength: null, // В реальных сообщениях может отсутствовать
        frequencyOffset: null
      }
    },

    lufthansaFlight: {
      raw: 'ICA3C674A>OGADSB,qAS,Lengfeld:/205511h4735.49N/01209.94E^112/450/A=038218 !W97! id253C674A +64fpm FL370.25 A3:DLH4YJ Sq6432',
      expected: {
        messageType: 'position',
        sourceCall: 'ICA3C674A',
        timestamp: '205511',
        latitude: 47.5915,
        longitude: 12.16567,
        altitude: 11647.73,
        course: 112,
        speed: 833.4,
        deviceId: '3C674A',
        addressType: 1, // ICAO
        aircraftType: 9, // jet aircraft
        aircraftTypeName: 'aircraft_jet',
        climbRate: 0.3251
      }
    },

    reciprocatingAircraft: {
      raw: 'ICA3A8234>OGADSB,qAS,Station:/120000h4720.456N/01315.234E^045/120/A=005000 !W22! id203A8234 +500fpm FL050.00 A4:CESNA172',
      expected: {
        messageType: 'position',
        sourceCall: 'ICA3A8234',
        timestamp: '120000',
        latitude: 47.34093,
        longitude: 13.25390,
        altitude: 1524,
        course: 45,
        speed: 222.24,
        deviceId: '3A8234',
        addressType: 0, // 0x20 = 00100000 -> addr=0, type=8
        aircraftType: 8, // reciprocating aircraft
        aircraftTypeName: 'aircraft_reciprocating',
        climbRate: 2.54
      }
    }
  },
  
  // Невалидные сообщения
  invalid: {
    // Вне региона (слишком далеко на север)
    outOfRegion: 'FLR3F1234>APRS,qAS,Norway:/094530h5015.123N/01445.678E\'180/025/A=002500 !W77! id073F1234 +150fpm +2.5rot FL008.50 45.2dB 0e +1.2kHz gps2x3',
    
    // Неподдерживаемый тип воздушного судна (тип 2 = tow_plane)
    unsupportedAircraft: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'180/025/A=002500 !W77! id023F1234 +150fpm +2.5rot FL008.50 45.2dB 0e +1.2kHz gps2x3',
    
    // Без OGN расширения
    noOgnExtension: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'180/025/A=002500 !W77!',
    
    // Неправильный формат координат
    invalidCoords: 'FLR3F1234>APRS,qAS,Slovenia:/094530h46XX.123N/01445.678E\'180/025/A=002500 !W77! id073F1234',
    
    // Не APRS сообщение (нет двоеточия)
    notAprs: 'FLR3F1234>APRS,qAS,Slovenia',
    
    // Невалидная высота (слишком высоко)
    invalidAltitude: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'180/025/A=099999 !W77! id1C3F1234 +150fpm +2.5rot',
    
    // Невалидная скорость (слишком быстро для планера)
    invalidSpeed: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'180/999/A=002500 !W77! id043F1234 +150fpm +2.5rot',

    // Коммерческий самолет вне расширенного региона (> 49°N)
    aircraftOutOfRegion: 'ICA4BCE08>OGADSB,qAS,HLST:/205511h4958.16N/01136.18E^099/444/A=034803 !W54! id254BCE08 +1664fpm FL336.85 A3:SXS9W Sq7666',

    // Неподдерживаемый тип воздушного судна (тип A = balloon)
    unsupportedAircraftTypeA: 'ICA4BCE08>OGADSB,qAS,HLST:/205511h4834.16N/01136.18E^099/444/A=034803 !W54! id2A4BCE08 +1664fpm FL336.85',

    // Неподдерживаемый тип воздушного судна (тип 2 = tow_plane) 
    towPlaneType: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'180/025/A=002500 !W77! id083F1234 +150fpm +2.5rot'
  },
  
  // Граничные случаи
  edge: {
    // Минимальные координаты региона
    minRegionBounds: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4400.000N/00800.000E\'180/025/A=002500 !W77! id073F1234 +150fpm +2.5rot',
    
    // Максимальные координаты региона
    maxRegionBounds: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4800.000N/01700.000E\'180/025/A=002500 !W77! id073F1234 +150fpm +2.5rot',
    
    // Без timestamp
    noTimestamp: 'FLR3F1234>APRS,qAS,Slovenia:!4615.123N/01445.678E\'180/025/A=002500 !W77! id073F1234 +150fpm +2.5rot',
    
    // Нулевая скорость и climb rate
    zeroValues: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'000/000/A=002500 !W77! id073F1234 +000fpm +0.0rot',

    // Граничный случай: координаты на новой северной границе (49°N)
    northBoundary: 'ICA4BCE08>OGADSB,qAS,HLST:/205511h4900.00N/01136.18E^099/444/A=034803 !W54! id254BCE08 +1664fpm FL336.85',

    // Все поддерживаемые типы воздушных судов
    aircraftType1: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'180/025/A=002500 !W77! id043F1234 +150fpm', // glider
    aircraftType6: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'180/025/A=002500 !W77! id183F1234 +150fpm', // hang_glider  
    aircraftType7: 'FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E\'180/025/A=002500 !W77! id1C3F1234 +150fpm', // paraglider
    aircraftType8: 'ICA3F1234>OGADSB,qAS,Station:/120000h4720.456N/01315.234E\'045/120/A=005000 !W22! id203F1234 +500fpm', // reciprocating
    aircraftType9: 'ICA3F1234>OGADSB,qAS,Station:/120000h4720.456N/01315.234E\'045/120/A=005000 !W22! id243F1234 +500fpm', // jet

    // Тестирование stealth mode и no-tracking флагов
    stealthMode: 'ICA3F1234>OGADSB,qAS,Station:/120000h4720.456N/01315.234E\'045/120/A=005000 !W22! idA43F1234 +500fpm', // stealth=1, type=9
    noTracking: 'ICA3F1234>OGADSB,qAS,Station:/120000h4720.456N/01315.234E\'045/120/A=005000 !W22! id643F1234 +500fpm'   // no-track=1, type=9
  }
};
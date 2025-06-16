# OGN APRS Message Examples

## Position Messages Examples

### Paraglider Message
```
FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E'180/025/A=002500 !W77! id073F1234 +150fpm +2.5rot FL008.50 45.2dB 0e +1.2kHz gps2x3
```

**Parsed Data:**
- **Callsign**: FLR3F1234
- **Time**: 09:45:30 UTC
- **Position**: 46.25205°N, 14.76130°E (Slovenia)
- **Course/Speed**: 180° / 25 knots (46 km/h)
- **Altitude**: 2500 feet (762m)
- **Aircraft ID**: 073F1234 (Type 7 = Paraglider, Address 3F1234)
- **Climb Rate**: +150 fpm (+0.76 m/s)
- **Turn Rate**: +2.5 rot/min (clockwise turn)
- **Signal**: 45.2 dB, +1.2 kHz offset

### Glider Message
```
FLR121ABC>APRS,qAS,Austria:/101500h4712.456N/01330.789E'045/035/A=008500 !W11! id01121ABC +000fpm +0.0rot FL028.00 52.8dB 0e -0.5kHz gps1x2
```

**Parsed Data:**
- **Callsign**: FLR121ABC  
- **Time**: 10:15:00 UTC
- **Position**: 47.20760°N, 13.51315°E (Austria)
- **Course/Speed**: 045° / 35 knots (65 km/h)
- **Altitude**: 8500 feet (2591m)
- **Aircraft ID**: 01121ABC (Type 1 = Glider, Address 121ABC)
- **Climb Rate**: 0 fpm (level flight)
- **Turn Rate**: 0.0 rot/min (straight)
- **Signal**: 52.8 dB, -0.5 kHz offset

### Hang Glider Message
```
FLR3A5678>APRS,qAS,Italy:/113000h4545.321N/01118.456E'270/018/A=001800 !W66! id063A5678 -200fpm -1.8rot FL005.80 38.5dB 0e +2.1kHz gps4x6
```

**Parsed Data:**
- **Callsign**: FLR3A5678
- **Time**: 11:30:00 UTC  
- **Position**: 45.75535°N, 11.30760°E (Northern Italy)
- **Course/Speed**: 270° / 18 knots (33 km/h)
- **Altitude**: 1800 feet (549m)
- **Aircraft ID**: 063A5678 (Type 6 = Hang glider, Address 3A5678)
- **Climb Rate**: -200 fpm (-1.02 m/s, descending)
- **Turn Rate**: -1.8 rot/min (counterclockwise)
- **Signal**: 38.5 dB, +2.1 kHz offset

## Name Messages Examples

### Pilot Name Beacon
```
FLR3F1234>APRS,qAS,Slovenia:>094600h Pilot: John Smith, Paraglider, Reg: S5-ABC
```

### Glider Registration
```
FLR121ABC>APRS,qAS,Austria:>101600h Glider: Discus-2c, Reg: OE-1234, Competition: AB
```

## Station Status Messages

### Ground Station Beacon
```
Slovenia>APRS,TCPIP*,qAC,T2SLOVENIA:!4615.12N/01445.67E&RNG0010 v1.0.6.RPI-GPU CPU:0.2 RAM:484.7/968.2MB NTP:3.1ms/-20.8ppm +48.2C RF:+33/-112ppm/-0.69dB/+1.2dB@10km/10km
```

## Filter Examples

### Alps Region Coverage
```
# Login for complete Alps coverage
user OGN2MQTT pass -1 vers ogn2mqtt 1.0.0 filter m/120 46.5/13.5
```

### Multi-point Slovenia Coverage  
```
# More precise Slovenia coverage
user OGN2MQTT pass -1 vers ogn2mqtt 1.0.0 filter m/30 46.0/14.5 m/30 46.5/15.0 m/30 45.5/14.0
```

### Aircraft Type Filtering (conceptual)
```
# Note: APRS server doesn't support type filtering, must be done client-side
# We filter for: paragliders (7), hang gliders (6), gliders (1)
```

## Error Cases Examples

### Invalid Position Format
```
FLR3F1234>APRS,qAS,Slovenia:/094530h461X.123N/01445.678E'180/025/A=002500
# Missing valid coordinates - should be rejected
```

### Missing OGN Extension
```
FLR3F1234>APRS,qAS,Slovenia:/094530h4615.123N/01445.678E'180/025/A=002500
# No !Wxx! extension and id field - basic APRS, not OGN
```

### Out of Region
```
FLR3F1234>APRS,qAS,France:/094530h4915.123N/00245.678E'180/025/A=002500 !W77! id073F1234
# Position in France (49°N 2°E) - outside Alps filter region
```

## Message Processing Notes

### Coordinate Conversion
```javascript
// APRS format: 4615.123N = 46° 15.123' North
function parseAPRSCoordinate(aprsLat, aprsLon) {
    // Latitude: DDMM.mmm format
    const latDeg = parseInt(aprsLat.substr(0, 2));
    const latMin = parseFloat(aprsLat.substr(2, 6));
    const latitude = latDeg + latMin / 60.0;
    
    // Longitude: DDDMM.mmm format  
    const lonDeg = parseInt(aprsLon.substr(0, 3));
    const lonMin = parseFloat(aprsLon.substr(3, 6));
    const longitude = lonDeg + lonMin / 60.0;
    
    return { latitude, longitude };
}
```

### Aircraft Type Extraction
```javascript
function extractAircraftType(ognId) {
    // Format: idXXYYYYYY where XX contains type info
    const typeCode = parseInt(ognId.substr(2, 1), 16);
    const typeMap = {
        1: 'glider',
        6: 'hang_glider', 
        7: 'paraglider'
    };
    return typeMap[typeCode] || 'unknown';
}
```

### Region Validation
```javascript
function isInAlpsRegion(lat, lon) {
    // Alps region bounds
    return lat >= 44.0 && lat <= 48.0 && 
           lon >= 8.0 && lon <= 17.0;
}
```
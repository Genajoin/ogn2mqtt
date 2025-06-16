# OGN APRS Protocol Documentation

## Overview

Open Glider Network (OGN) redistributes aircraft position data using APRS (Automatic Packet Reporting System). This protocol allows real-time tracking of gliders, paragliders, and other aircraft equipped with FLARM and OGN trackers.

## Connection Details

- **Server**: aprs.glidernet.org
- **Port**: 14580 (for server-side filters)
- **Protocol**: TCP text-based
- **Authentication**: Required with callsign and passcode

## Login Process

The first line sent to the APRS server should contain login information:

```
user CALLSIGN pass PASSCODE vers APP_NAME VERSION filter FILTER_PARAMS
```

Example:
```
user OGN123456 pass 12345 vers ogn2mqtt 1.0.0 filter m/100 46.0/14.5
```

Where:
- `CALLSIGN`: Your unique APRS callsign
- `PASSCODE`: 15-bit unsigned number (ask OGN for algorithm)
- `APP_NAME VERSION`: Your application name and version
- `FILTER_PARAMS`: Geographic filter (see below)

## Geographic Filters

### Alps Region Filter
For Slovenia, Austria, Northern Italy:
```
filter m/100 46.0/14.5
```
This creates a 100km radius around coordinates 46°N, 14.5°E

### Multiple Region Filter
```
filter m/50 45.8/14.0 m/50 47.0/13.0 m/50 46.0/11.0
```

## Server Response

Successful login response:
```
# logresp CALLSIGN verified, server GLIDERN4
```

## Keep-Alive Messages

Server sends keep-alive messages every ~20 seconds:
```
# aprsc 2.1.4-g408ed49 2 Nov 2019 14:48:58 GMT GLIDERN4 192.168.1.14:14580
```

If no messages received for >1 minute, reconnect.

## OGN APRS Message Format

### Position Messages

Standard format:
```
FLRDDDEAD>APRS,qAS,Station:/time4807.03N/01629.71E'090/054/A=005435 !W33! id3FDDDEAD +000fpm -4.3rot FL050.00 55.0dB 0e -3.7kHz gps3x5
```

Breaking down the components:

#### Header
- `FLRDDDEAD`: Source callsign (FLARM ID)
- `APRS`: Destination 
- `qAS,Station`: Via path and receiving station

#### Position Block
- `/time`: Timestamp (HHMMSS or DDHHMM)
- `4807.03N/01629.71E`: Latitude/Longitude
- `'`: Symbol table and symbol
- `090/054`: Course (degrees) / Speed (knots)
- `A=005435`: Altitude in feet

#### OGN Extension (Comment Field)
- `!W33!`: APRS data extension
- `id3FDDDEAD`: Aircraft ID with type prefix
- `+000fpm`: Climb rate in feet per minute
- `-4.3rot`: Turn rate in rotations per minute
- `FL050.00`: Flight level
- `55.0dB`: Signal strength
- `0e`: Error count
- `-3.7kHz`: Frequency offset
- `gps3x5`: GPS accuracy (horizontal x vertical meters)

### Aircraft ID Encoding

Format: `idXXYYYYYY`
- `XX`: Address type and aircraft type
- `YYYYYY`: Device address (hex)

Address types:
- `0`: Random
- `1`: ICAO
- `2`: FLARM
- `3`: OGN

Aircraft types (second hex digit):
- `0`: Unknown
- `1`: Glider/motor glider
- `2`: Tow plane
- `3`: Helicopter
- `4`: Parachute
- `5`: Drop plane
- `6`: Hang glider
- `7`: Paraglider
- `8`: Aircraft (reciprocating engine)
- `9`: Aircraft (jet/turboprop)
- `A`: Balloon
- `B`: Airship
- `C`: UAV
- `D`: Static obstacle

### Name Messages

Format:
```
FLRDDDEAD>APRS,qAS,Station:>time Text_description
```

## Data Validation

### Coordinate Validation
- Latitude: -90° to +90°
- Longitude: -180° to +180°
- Alps region: 44-48°N, 8-17°E

### Altitude Validation
- Minimum: -500m (below sea level)
- Maximum: 15000m (extreme soaring)

### Speed Validation
- Maximum ground speed: 400 km/h
- Typical glider speeds: 40-200 km/h

## Error Handling

1. **Connection Errors**: Retry with exponential backoff
2. **Parse Errors**: Log and skip malformed messages
3. **Old Data**: Discard messages older than 1 hour
4. **Invalid Coordinates**: Reject coordinates outside valid ranges
5. **Duplicate Messages**: Check by callsign + timestamp

## References

- [APRS-IS Documentation](http://www.aprs-is.net/)
- [OGN Wiki](http://wiki.glidernet.org/)
- [Python OGN Client](https://github.com/glidernet/python-ogn-client)
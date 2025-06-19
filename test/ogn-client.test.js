const OGNClient = require('../lib/ogn-client');
const net = require('net');
const EventEmitter = require('events');

// Мокаем net модуль
jest.mock('net');

describe('OGNClient', () => {
  let client;
  let mockSocket;

  beforeEach(() => {
    // Создаем мок сокета
    mockSocket = new EventEmitter();
    mockSocket.connect = jest.fn();
    mockSocket.write = jest.fn();
    mockSocket.destroy = jest.fn();
    mockSocket.setEncoding = jest.fn();
    mockSocket.setTimeout = jest.fn();
    
    // Мокаем создание сокета
    net.Socket.mockImplementation(() => mockSocket);
    
    // Создаем клиент с тестовой конфигурацией
    client = new OGNClient({
      server: 'test.server.com',
      port: 14580,
      callsign: 'TEST123',
      passcode: '-1',
      filter: 'm/120 46.5/13.5',
      reconnectInterval: 1000,
      keepAliveInterval: 5000
    });
    
    jest.useFakeTimers();
  });

  afterEach(() => {
    client.disconnect();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('конструктор и конфигурация', () => {
    test('должен создаваться с настройками по умолчанию', () => {
      const defaultClient = new OGNClient({});
      
      expect(defaultClient.config.server).toBe('aprs.glidernet.org');
      expect(defaultClient.config.port).toBe(14580);
      expect(defaultClient.config.callsign).toBe('OGN2MQTT');
      expect(defaultClient.config.passcode).toBe('-1');
      expect(defaultClient.config.reconnectInterval).toBe(30000);
      expect(defaultClient.config.keepAliveInterval).toBe(300000);
    });

    test('должен принимать кастомную конфигурацию', () => {
      expect(client.config.server).toBe('test.server.com');
      expect(client.config.port).toBe(14580);
      expect(client.config.callsign).toBe('TEST123');
      expect(client.config.filter).toBe('m/120 46.5/13.5');
    });

    test('должен инициализировать начальное состояние', () => {
      expect(client.connected).toBe(false);
      expect(client.socket).toBe(null);
      expect(client.messageCount).toBe(0);
      expect(client.reconnectAttempts).toBe(0);
    });
  });

  describe('подключение к серверу', () => {
    test('должен успешно подключаться к серверу', async () => {
      const connectPromise = client.connect();
      
      // Симулируем успешное подключение
      mockSocket.connect.mockImplementation((port, server, callback) => {
        setTimeout(callback, 0);
      });
      
      // Эмитируем событие connect
      setTimeout(() => {
        mockSocket.emit('connect');
      }, 10);
      
      jest.advanceTimersByTime(20);
      
      await expect(connectPromise).resolves.toBeUndefined();
      
      expect(mockSocket.connect).toHaveBeenCalledWith(14580, 'test.server.com', expect.any(Function));
      expect(mockSocket.setEncoding).toHaveBeenCalledWith('utf8');
      expect(mockSocket.setTimeout).toHaveBeenCalledWith(30000);
      expect(client.connected).toBe(true);
    });

    test('должен отправлять логин после подключения', async () => {
      // Мокаем успешное подключение ДО вызова connect
      mockSocket.connect.mockImplementation((port, server, callback) => {
        // Сначала вызываем callback (событие TCP подключения)
        setTimeout(() => {
          callback();
          // Затем эмитируем событие 'connect'
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 0);
        }, 0);
      });
      
      const connectPromise = client.connect();
      jest.advanceTimersByTime(10);
      await connectPromise;
      
      expect(mockSocket.write).toHaveBeenCalledWith(
        'user TEST123 pass -1 vers ogn2mqtt 1.0.0 filter m/120 46.5/13.5\r\n'
      );
    });

    test('должен обрабатывать ошибки подключения', async () => {
      // Мокаем ошибку подключения ДО вызова connect
      mockSocket.connect.mockImplementation((port, server, callback) => {
        setTimeout(() => {
          mockSocket.emit('error', new Error('Connection failed'));
        }, 0);
      });
      
      const connectPromise = client.connect();
      jest.advanceTimersByTime(10);
      
      await expect(connectPromise).rejects.toThrow('Connection failed');
      expect(client.connected).toBe(false);
    });

    test('должен устанавливать таймеры после успешного подключения', async () => {
      // Мокаем успешное подключение ДО вызова connect
      mockSocket.connect.mockImplementation((port, server, callback) => {
        setTimeout(() => {
          callback();
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 0);
        }, 0);
      });
      
      const connectPromise = client.connect();
      jest.advanceTimersByTime(10);
      await connectPromise;
      
      expect(client.keepAliveTimer).toBeDefined();
      expect(client.reconnectAttempts).toBe(0);
    });
  });

  describe('обработка данных', () => {
    beforeEach(async () => {
      // Мокаем успешное подключение ДО вызова connect
      mockSocket.connect.mockImplementation((port, server, callback) => {
        setTimeout(() => {
          callback();
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 0);
        }, 0);
      });
      
      // Подключаемся для тестов обработки данных
      const connectPromise = client.connect();
      jest.advanceTimersByTime(10);
      await connectPromise;
    });

    test('должен обрабатывать входящие данные и разделять строки', () => {
      const aprsMessageHandler = jest.fn();
      client.on('aprs-message', aprsMessageHandler);
      
      const testData = 'FLR123>APRS:position data\r\n#system message\r\nFLR456>APRS:more data\r\n';
      
      mockSocket.emit('data', testData);
      
      expect(client.messageCount).toBe(3);
      expect(aprsMessageHandler).toHaveBeenCalledTimes(2);
      expect(aprsMessageHandler).toHaveBeenCalledWith('FLR123>APRS:position data');
      expect(aprsMessageHandler).toHaveBeenCalledWith('FLR456>APRS:more data');
    });

    test('должен обрабатывать системные сообщения', () => {
      const systemMessageHandler = jest.fn();
      client.on('system-message', systemMessageHandler);
      
      mockSocket.emit('data', '# aprsc 2.1.8-g408ed49 29 Apr 2021 13:26:44 GMT TEST123 46.123.45.67:12345\r\n');
      
      expect(systemMessageHandler).toHaveBeenCalledWith(
        '# aprsc 2.1.8-g408ed49 29 Apr 2021 13:26:44 GMT TEST123 46.123.45.67:12345'
      );
    });

    test('должен обрабатывать успешный логин', () => {
      const loginSuccessHandler = jest.fn();
      client.on('login-success', loginSuccessHandler);
      
      mockSocket.emit('data', '# logresp TEST123 verified, server TESTING\r\n');
      
      expect(loginSuccessHandler).toHaveBeenCalled();
    });

    test('должен обрабатывать неподтвержденный логин', () => {
      const loginUnverifiedHandler = jest.fn();
      client.on('login-unverified', loginUnverifiedHandler);
      
      mockSocket.emit('data', '# logresp TEST123 unverified, server TESTING\r\n');
      
      expect(loginUnverifiedHandler).toHaveBeenCalled();
    });

    test('должен обновлять время последнего сообщения', () => {
      const initialTime = client.lastMessageTime;
      
      jest.advanceTimersByTime(1000);
      mockSocket.emit('data', 'FLR123>APRS:test data\r\n');
      
      expect(client.lastMessageTime).toBeGreaterThan(initialTime);
    });

    test('должен игнорировать пустые строки', () => {
      const aprsMessageHandler = jest.fn();
      client.on('aprs-message', aprsMessageHandler);
      
      mockSocket.emit('data', '\r\n\r\nFLR123>APRS:test\r\n\r\n');
      
      expect(client.messageCount).toBe(1);
      expect(aprsMessageHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('keep-alive механизм', () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      
      mockSocket.connect.mockImplementation((port, server, callback) => {
        setTimeout(callback, 0);
      });
      
      setTimeout(() => {
        mockSocket.emit('connect');
      }, 10);
      
      jest.advanceTimersByTime(20);
      await connectPromise;
    });

    test('должен отправлять keep-alive сообщения', () => {
      mockSocket.write.mockClear(); // Очищаем вызовы логина
      
      // Продвигаем время на keep-alive интервал
      jest.advanceTimersByTime(5000);
      
      expect(mockSocket.write).toHaveBeenCalledWith(
        expect.stringMatching(/# ogn2mqtt keep-alive/)
      );
    });

    test('должен переподключаться при долгом отсутствии сообщений', () => {
      const disconnectSpy = jest.spyOn(client, 'disconnect');
      
      // Устанавливаем старое время последнего сообщения
      client.lastMessageTime = Date.now() - 100000;
      
      // Запускаем keep-alive проверку
      jest.advanceTimersByTime(5000);
      
      expect(disconnectSpy).toHaveBeenCalled();
    });

    test('должен останавливать keep-alive при отключении', () => {
      expect(client.keepAliveTimer).toBeDefined();
      
      client.disconnect();
      
      expect(client.keepAliveTimer).toBeNull();
    });
  });

  describe('переподключение', () => {
    beforeEach(async () => {
      // Мокаем успешное подключение ДО вызова connect
      mockSocket.connect.mockImplementation((port, server, callback) => {
        setTimeout(() => {
          callback();
          setTimeout(() => {
            mockSocket.emit('connect');
          }, 0);
        }, 0);
      });
      
      // Подключаемся для тестов переподключения
      const connectPromise = client.connect();
      jest.advanceTimersByTime(10);
      await connectPromise;
    });

    test('должен планировать переподключение при закрытии соединения', () => {
      expect(client.connected).toBe(true);
      
      mockSocket.emit('close');
      
      expect(client.connected).toBe(false);
      expect(client.reconnectTimer).toBeDefined();
    });

    test('должен увеличивать задержку при повторных попытках', () => {
      client.reconnectAttempts = 2;
      const initialDelay = client.config.reconnectInterval;
      const expectedDelay = Math.min(initialDelay * Math.pow(2, 2), 300000);
      
      mockSocket.emit('close');
      
      // Проверяем, что таймер установлен с увеличенной задержкой
      expect(setTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        expectedDelay
      );
    });

    test('должен прекращать попытки после максимального количества', () => {
      const maxReconnectHandler = jest.fn();
      client.on('max-reconnect-attempts', maxReconnectHandler);
      
      client.reconnectAttempts = client.maxReconnectAttempts;
      
      mockSocket.emit('close');
      
      expect(maxReconnectHandler).toHaveBeenCalled();
      expect(client.reconnectTimer).toBeUndefined();
    });

    test('должен успешно переподключаться', async () => {
      client.reconnectAttempts = 1;
      
      // Обновляем мок для нового подключения
      const newMockSocket = new EventEmitter();
      newMockSocket.connect = jest.fn();
      newMockSocket.write = jest.fn();
      newMockSocket.destroy = jest.fn();
      newMockSocket.setEncoding = jest.fn();
      newMockSocket.setTimeout = jest.fn();
      
      net.Socket.mockImplementation(() => newMockSocket);
      
      // Симулируем закрытие текущего соединения
      mockSocket.emit('close');
      
      // Продвигаем время для запуска переподключения
      const delay = Math.min(client.config.reconnectInterval * Math.pow(2, 1), 300000);
      jest.advanceTimersByTime(delay + 100);
      
      // Симулируем успешное переподключение
      newMockSocket.connect.mockImplementation((port, server, callback) => {
        setTimeout(() => {
          callback();
          setTimeout(() => {
            newMockSocket.emit('connect');
          }, 5);
        }, 5);
      });
      
      jest.advanceTimersByTime(20);
      
      expect(client.reconnectAttempts).toBe(0);
      expect(client.connected).toBe(true);
    });
  });

  describe('отключение', () => {
    test('должен корректно отключаться', () => {
      client.connected = true;
      client.keepAliveTimer = setTimeout(() => {}, 1000);
      client.reconnectTimer = setTimeout(() => {}, 1000);
      client.socket = mockSocket;
      
      client.disconnect();
      
      expect(client.connected).toBe(false);
      expect(client.keepAliveTimer).toBeNull();
      expect(client.reconnectTimer).toBeNull();
      expect(mockSocket.destroy).toHaveBeenCalled();
      expect(client.socket).toBeNull();
    });

    test('должен безопасно отключаться при отсутствии сокета', () => {
      client.socket = null;
      
      expect(() => client.disconnect()).not.toThrow();
    });
  });

  describe('получение статуса', () => {
    test('должен возвращать корректный статус', () => {
      client.connected = true;
      client.messageCount = 42;
      client.reconnectAttempts = 1;
      client.lastMessageTime = Date.now();
      
      const status = client.getStatus();
      
      expect(status.connected).toBe(true);
      expect(status.messageCount).toBe(42);
      expect(status.reconnectAttempts).toBe(1);
      expect(status.lastMessageTime).toBeInstanceOf(Date);
      expect(typeof status.timeSinceLastMessage).toBe('number');
    });
  });

  describe('обработка ошибок сокета', () => {
    test('должен обрабатывать таймауты', async () => {
      // Мокаем подключение и таймаут ДО вызова connect
      mockSocket.connect.mockImplementation((port, server, callback) => {
        setTimeout(() => {
          callback();
          setTimeout(() => {
            mockSocket.emit('connect');
            setTimeout(() => {
              mockSocket.emit('timeout');
            }, 0);
          }, 0);
        }, 0);
      });
      
      const connectPromise = client.connect();
      jest.advanceTimersByTime(10);
      await connectPromise;
      
      expect(mockSocket.destroy).toHaveBeenCalled();
    });

    test('должен эмитировать события ошибок', () => {
      const errorHandler = jest.fn();
      client.on('error', errorHandler);
      
      const testError = new Error('Test error');
      
      // Установим connected в true, чтобы проверить, что ошибка его сбрасывает
      client.connected = true;
      
      mockSocket.emit('error', testError);
      
      expect(errorHandler).toHaveBeenCalledWith(testError);
      expect(client.connected).toBe(false);
    });

    test('должен эмитировать события отключения', () => {
      const disconnectHandler = jest.fn();
      client.on('disconnect', disconnectHandler);
      
      client.connected = true; // Устанавливаем, что клиент был подключен
      
      mockSocket.emit('close');
      
      expect(disconnectHandler).toHaveBeenCalled();
      expect(client.connected).toBe(false);
    });
  });

  describe('граничные случаи', () => {
    test('должен обрабатывать неожиданные форматы данных', () => {
      const client = new OGNClient({});
      
      // Тестируем обработку различных типов входных данных
      expect(() => {
        client.handleData('');
        client.handleData('\r\n');
        client.handleData('invalid data without proper format');
      }).not.toThrow();
    });

    test('должен корректно обрабатывать множественные события подключения/отключения', () => {
      const connectHandler = jest.fn();
      const disconnectHandler = jest.fn();
      
      client.on('connect', connectHandler);
      client.on('disconnect', disconnectHandler);
      
      // Множественные события connect
      mockSocket.emit('connect');
      mockSocket.emit('connect');
      
      expect(connectHandler).toHaveBeenCalledTimes(2);
      
      // Устанавливаем состояние подключения
      client.connected = true;
      
      // Множественные события close
      mockSocket.emit('close');
      mockSocket.emit('close');
      
      expect(disconnectHandler).toHaveBeenCalledTimes(2);
    });
  });
});
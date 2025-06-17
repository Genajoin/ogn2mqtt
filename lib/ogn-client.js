const net = require('net');
const EventEmitter = require('events');

class OGNClient extends EventEmitter {
    constructor(config) {
        super();
        this.config = {
            server: config.server || 'aprs.glidernet.org',
            port: config.port || 14580,
            callsign: config.callsign || 'OGN2MQTT',
            passcode: config.passcode || '-1',
            filter: config.filter || 'r/46.5/10.5/300',
            appName: config.appName || 'ogn2mqtt',
            appVersion: config.appVersion || '1.0.0',
            reconnectInterval: config.reconnectInterval || 30000,
            keepAliveInterval: config.keepAliveInterval || 300000 // 5 minutes
        };

        this.socket = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.keepAliveTimer = null;
        this.lastMessageTime = 0;
        this.messageCount = 0;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.log('info', 'Подключение к OGN APRS серверу', {
                server: this.config.server,
                port: this.config.port,
                attempt: this.reconnectAttempts + 1
            });

            this.socket = new net.Socket();
            this.socket.setEncoding('utf8');

            // Таймаут подключения
            this.socket.setTimeout(30000);

            this.socket.connect(this.config.port, this.config.server, () => {
                this.log('info', 'TCP соединение установлено');
                this.sendLogin();
            });

            this.socket.on('data', (data) => {
                this.handleData(data);
            });

            this.socket.on('connect', () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                this.lastMessageTime = Date.now();
                this.startKeepAlive();
                this.emit('connect');
                resolve();
            });

            this.socket.on('error', (err) => {
                this.log('error', 'Ошибка OGN соединения:', err);
                this.connected = false;
                this.emit('error', err);
                if (this.reconnectAttempts === 0) {
                    reject(err);
                }
            });

            this.socket.on('close', () => {
                this.log('warn', 'OGN соединение закрыто');
                this.connected = false;
                this.stopKeepAlive();
                this.emit('disconnect');
                this.scheduleReconnect();
            });

            this.socket.on('timeout', () => {
                this.log('warn', 'Таймаут OGN соединения');
                this.socket.destroy();
            });
        });
    }

    sendLogin() {
        const loginStr = `user ${this.config.callsign} pass ${this.config.passcode} vers ${this.config.appName} ${this.config.appVersion} filter ${this.config.filter}\r\n`;
        
        this.log('info', 'Отправка логина', {
            callsign: this.config.callsign,
            filter: this.config.filter
        });

        this.socket.write(loginStr);
    }

    handleData(data) {
        this.lastMessageTime = Date.now();
        
        // Разделяем сообщения по переводам строк
        const lines = data.split(/\r?\n/);
        
        for (const line of lines) {
            if (line.trim() === '') continue;
            
            this.messageCount++;
            
            if (line.startsWith('#')) {
                this.handleSystemMessage(line);
            } else {
                this.handleAPRSMessage(line);
            }
        }
    }

    handleSystemMessage(message) {
        this.log('debug', 'Системное сообщение OGN:', message);
        
        // Проверяем ответ на логин
        if (message.includes('logresp') && message.includes('verified')) {
            this.log('info', 'OGN логин успешен');
            this.emit('login-success');
        } else if (message.includes('logresp') && message.includes('unverified')) {
            this.log('warn', 'OGN логин неподтвержден (passcode неверный)');
            this.emit('login-unverified');
        }

        this.emit('system-message', message);
    }

    handleAPRSMessage(message) {
        this.log('debug', 'APRS сообщение получено', {
            length: message.length,
            messageCount: this.messageCount,
            content: message
        });

        // Эмитируем сырое APRS сообщение для парсинга
        this.emit('aprs-message', message);
    }

    startKeepAlive() {
        this.stopKeepAlive(); // Останавливаем предыдущий таймер если есть
        
        this.keepAliveTimer = setInterval(() => {
            const timeSinceLastMessage = Date.now() - this.lastMessageTime;
            
            // Если давно не получали сообщений, пересоздаем соединение
            if (timeSinceLastMessage > 90000) { // 1.5 минуты
                this.log('warn', 'Долго нет сообщений от OGN сервера, переподключение');
                this.disconnect();
                return;
            }

            // Отправляем keep-alive комментарий
            if (this.connected) {
                const keepAlive = `# ogn2mqtt keep-alive ${new Date().toISOString()}\r\n`;
                this.socket.write(keepAlive);
                this.log('debug', 'Keep-alive отправлен');
            }
        }, this.config.keepAliveInterval);
    }

    stopKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.log('error', 'Превышено максимальное количество попыток переподключения');
            this.emit('max-reconnect-attempts');
            return;
        }

        const delay = Math.min(this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts), 300000); // Максимум 5 минут
        
        this.log('info', `Переподключение через ${delay}ms (попытка ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect().catch(err => {
                this.log('error', 'Ошибка переподключения:', err);
            });
        }, delay);
    }

    disconnect() {
        this.log('info', 'Отключение от OGN сервера');
        
        this.connected = false;
        this.stopKeepAlive();
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
    }

    getStatus() {
        return {
            connected: this.connected,
            messageCount: this.messageCount,
            reconnectAttempts: this.reconnectAttempts,
            lastMessageTime: new Date(this.lastMessageTime),
            timeSinceLastMessage: Date.now() - this.lastMessageTime
        };
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logData = data ? ` ${JSON.stringify(data)}` : '';
        console.log(`[${timestamp}] [OGN-CLIENT] [${level.toUpperCase()}] ${message}${logData}`);
    }
}

module.exports = OGNClient;
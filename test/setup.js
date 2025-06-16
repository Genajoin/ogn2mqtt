// Тестовая настройка для Jest
// Перехватываем console.log для избежания засорения тестового вывода

global.mockConsoleLog = jest.fn();

beforeEach(() => {
  // Мокаем console методы для чистого тестового вывода
  jest.spyOn(console, 'log').mockImplementation(global.mockConsoleLog);
  jest.spyOn(console, 'warn').mockImplementation(jest.fn());
  jest.spyOn(console, 'error').mockImplementation(jest.fn());
});

afterEach(() => {
  // Восстанавливаем оригинальные методы
  console.log.mockRestore();
  console.warn.mockRestore();
  console.error.mockRestore();
  
  // Очищаем моки
  jest.clearAllMocks();
});
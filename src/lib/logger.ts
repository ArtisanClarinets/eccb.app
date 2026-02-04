const isProduction = process.env.NODE_ENV === 'production';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: any;
}

const formatLog = (level: LogLevel, message: string, data?: any): string => {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };
  return JSON.stringify(entry);
};

export const logger = {
  info: (message: string, data?: any) => {
    console.log(formatLog('info', message, data));
  },
  warn: (message: string, data?: any) => {
    console.warn(formatLog('warn', message, data));
  },
  error: (message: string, error?: any, data?: any) => {
    console.error(formatLog('error', message, { error, ...data }));
  },
  debug: (message: string, data?: any) => {
    if (!isProduction) {
      console.debug(formatLog('debug', message, data));
    }
  },
};

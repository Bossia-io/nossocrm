/**
 * Logger utility
 * @file lib/logger.ts
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
  private isDev = process.env.NODE_ENV === 'development';

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    return data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
  }

  info(message: string, data?: any): void {
    console.log(this.formatMessage('info', message, data));
  }

  warn(message: string, data?: any): void {
    console.warn(this.formatMessage('warn', message, data));
  }

  error(message: string, data?: any): void {
    console.error(this.formatMessage('error', message, data));
  }

  debug(message: string, data?: any): void {
    if (this.isDev) {
      console.debug(this.formatMessage('debug', message, data));
    }
  }
}

export const logger = new Logger();

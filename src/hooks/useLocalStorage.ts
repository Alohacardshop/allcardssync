import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      logger.error('Error reading localStorage', error instanceof Error ? error : new Error(String(error)), { key }, 'local-storage');
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      logger.error('Error setting localStorage', error instanceof Error ? error : new Error(String(error)), { key }, 'local-storage');
    }
  };

  return [storedValue, setValue] as const;
}

export function useLocalStorageString(key: string, initialValue: string) {
  const [storedValue, setStoredValue] = useState<string>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? item : initialValue;
    } catch (error) {
      logger.error('Error reading localStorage string', error instanceof Error ? error : new Error(String(error)), { key }, 'local-storage');
      return initialValue;
    }
  });

  const setValue = (value: string | ((val: string) => string)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, valueToStore);
    } catch (error) {
      logger.error('Error setting localStorage string', error instanceof Error ? error : new Error(String(error)), { key }, 'local-storage');
    }
  };

  return [storedValue, setValue] as const;
}
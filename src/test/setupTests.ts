import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;

// Mock crypto.randomUUID
// In newer jsdom/node versions, `global.crypto` may be a read-only getter.
// Define it safely so tests don't crash.
const existingCrypto: any = (globalThis as any).crypto ?? {};
Object.defineProperty(globalThis, 'crypto', {
  value: {
    ...existingCrypto,
    randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).substring(7)),
  },
  configurable: true,
});

// Mock navigator
Object.defineProperty(global.navigator, 'vibrate', {
  writable: true,
  value: vi.fn(),
});

// Mock FileReader
global.FileReader = class FileReader {
  readAsDataURL = vi.fn(function(this: any) {
    this.result = 'data:image/png;base64,mockbase64data';
    this.onload?.();
  });
  result: string | ArrayBuffer | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
} as any;

// Mock browser-image-compression
vi.mock('browser-image-compression', () => ({
  default: vi.fn((file) => Promise.resolve(file)),
}));

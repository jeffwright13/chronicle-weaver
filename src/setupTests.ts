import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// Mock environment variables
process.env.GEMINI_API_KEY = 'test-gemini-key';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.CLAUDE_API_KEY = 'test-claude-key';

// Mock fetch for API calls
global.fetch = jest.fn() as any;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

import { jest } from '@jest/globals';
import { calculateEstimatedCost } from '../../aiService.ts';
import { AIProvider } from '../../types.ts';

// Mock the AI service functions for testing
jest.mock('../../aiService.ts', () => ({
  calculateEstimatedCost: jest.requireActual('../../aiService.ts').calculateEstimatedCost,
  generateStoryBeat: jest.fn(),
  generateImage: jest.fn(),
  getChatResponse: jest.fn(),
}));

describe('AI Service - Cost Calculation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateEstimatedCost', () => {
    it('should calculate costs correctly for Gemini Flash', () => {
      const cost = calculateEstimatedCost(1000, 500, 2, 1, AIProvider.GEMINI, 'flash');
      
      // Gemini Flash: $0.1/1M input, $0.4/1M output, $0.0008/image
      // Both regular and premium images use the same pricing
      const expectedCost = (1000 * 0.1/1000000) + (500 * 0.4/1000000) + (2 * 0.0008) + (1 * 0.0008);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should calculate costs correctly for Gemini Pro', () => {
      const cost = calculateEstimatedCost(1000, 500, 2, 1, AIProvider.GEMINI, 'pro');
      
      // Gemini Pro: $1.25/1M input, $5.0/1M output, $0.04/image
      const expectedCost = (1000 * 1.25/1000000) + (500 * 5.0/1000000) + (2 * 0.04) + (1 * 0.04);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should calculate costs correctly for OpenAI standard', () => {
      const cost = calculateEstimatedCost(1000, 500, 2, 1, AIProvider.OPENAI, 'standard');
      
      // OpenAI GPT-3.5: $0.5/1M input, $1.5/1M output, $0.02/image
      const expectedCost = (1000 * 0.5/1000000) + (500 * 1.5/1000000) + (2 * 0.02) + (1 * 0.02);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should calculate costs correctly for OpenAI pro', () => {
      const cost = calculateEstimatedCost(1000, 500, 2, 1, AIProvider.OPENAI, 'pro');
      
      // OpenAI GPT-4: $10/1M input, $30/1M output, $0.04/image
      const expectedCost = (1000 * 10/1000000) + (500 * 30/1000000) + (2 * 0.04) + (1 * 0.04);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should calculate costs correctly for Claude Haiku', () => {
      const cost = calculateEstimatedCost(1000, 500, 0, 0, AIProvider.CLAUDE, 'flash');
      
      // Claude Haiku: $0.25/1M input, $1.25/1M output, $0.03/image
      const expectedCost = (1000 * 0.25/1000000) + (500 * 1.25/1000000);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should calculate costs correctly for Claude Sonnet', () => {
      const cost = calculateEstimatedCost(1000, 500, 1, 0, AIProvider.CLAUDE, 'pro');
      
      // Claude Sonnet: $3/1M input, $15/1M output, $0.06/image
      const expectedCost = (1000 * 3/1000000) + (500 * 15/1000000) + (1 * 0.06);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should handle zero values', () => {
      const cost = calculateEstimatedCost(0, 0, 0, 0, AIProvider.GEMINI, 'flash');
      expect(cost).toBe(0);
    });

    it('should default to Gemini Flash for unknown provider', () => {
      const cost = calculateEstimatedCost(1000, 500, 1, 0, 'UNKNOWN' as AIProvider, 'flash');
      
      // Should default to Gemini Flash pricing
      const expectedCost = (1000 * 0.1/1000000) + (500 * 0.4/1000000) + (1 * 0.0008);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });
  });
});

describe('AI Provider Types', () => {
  it('should have correct provider values', () => {
    expect(AIProvider.GEMINI).toBe('gemini');
    expect(AIProvider.OPENAI).toBe('openai');
    expect(AIProvider.CLAUDE).toBe('claude');
  });
});

describe('Environment Configuration', () => {
  it('should have test environment variables set', () => {
    expect(process.env.GEMINI_API_KEY).toBe('test-gemini-key');
    expect(process.env.OPENAI_API_KEY).toBe('test-openai-key');
    expect(process.env.CLAUDE_API_KEY).toBe('test-claude-key');
  });
});

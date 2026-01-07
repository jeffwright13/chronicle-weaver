import { 
  generateStoryBeat, 
  generateImage, 
  getChatResponse, 
  calculateEstimatedCost 
} from '../aiService';
import { AIProvider, GameState } from '../types';

// Mock the GoogleGenAI module
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn(),
    },
    chats: {
      create: jest.fn().mockImplementation(() => ({
        sendMessage: jest.fn(),
      })),
    },
  })),
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
  },
}));

describe('AI Service', () => {
  const mockGameState: GameState = {
    storyText: 'A brave knight enters the dark forest.',
    choices: ['Fight the monster', 'Run away', 'Search for treasure'],
    inventory: ['sword', 'shield', 'health potion'],
    currentQuest: 'Find the lost artifact',
    visualPrompt: 'A knight standing at the edge of a dark forest',
    worldStyle: 'medieval fantasy',
    genre: 'High Fantasy'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('generateStoryBeat', () => {
    describe('with Gemini provider', () => {
      it('should generate story successfully', async () => {
        const { GoogleGenAI } = require('@google/genai');
        const mockGenerateContent = jest.fn().mockResolvedValue({
          text: JSON.stringify(mockGameState),
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 150,
          },
        });
        
        GoogleGenAI.mockImplementation(() => ({
          models: { generateContent: mockGenerateContent }
        }));

        const result = await generateStoryBeat('test prompt', AIProvider.GEMINI);

        expect(result.data).toEqual(mockGameState);
        expect(result.usage.inputTokens).toBe(100);
        expect(result.usage.outputTokens).toBe(150);
        expect(result.usage.provider).toBe(AIProvider.GEMINI);
      });

      it('should handle API errors gracefully', async () => {
        const { GoogleGenAI } = require('@google/genai');
        const mockGenerateContent = jest.fn().mockRejectedValue(new Error('API Error'));
        
        GoogleGenAI.mockImplementation(() => ({
          models: { generateContent: mockGenerateContent }
        }));

        await expect(generateStoryBeat('test prompt', AIProvider.GEMINI))
          .rejects.toThrow('API Error');
      });

      it('should handle malformed JSON response', async () => {
        const { GoogleGenAI } = require('@google/genai');
        const mockGenerateContent = jest.fn().mockResolvedValue({
          text: 'invalid json',
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 150,
          },
        });
        
        GoogleGenAI.mockImplementation(() => ({
          models: { generateContent: mockGenerateContent }
        }));

        await expect(generateStoryBeat('test prompt', AIProvider.GEMINI))
          .rejects.toThrow();
      });
    });

    describe('with OpenAI provider', () => {
      it('should generate story successfully', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify(mockGameState),
              },
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 150,
            },
          }),
        };

        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        const result = await generateStoryBeat('test prompt', AIProvider.OPENAI);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.openai.com/v1/chat/completions',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Authorization': 'Bearer test-openai-key',
              'Content-Type': 'application/json',
            },
            body: expect.stringContaining('gpt-4o-mini'),
          })
        );

        expect(result.data).toEqual(mockGameState);
        expect(result.usage.provider).toBe(AIProvider.OPENAI);
      });

      it('should handle partial OpenAI response with fallbacks', async () => {
        const partialResponse = {
          storyText: 'A mysterious adventure begins.',
          choices: ['Continue'],
        };

        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify(partialResponse),
              },
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 150,
            },
          }),
        };

        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        const result = await generateStoryBeat('test prompt', AIProvider.OPENAI);

        expect(result.data.storyText).toBe('A mysterious adventure begins.');
        expect(result.data.choices).toEqual(['Continue']);
        expect(result.data.inventory).toEqual([]);
        expect(result.data.currentQuest).toBe('Unknown quest');
        expect(result.data.genre).toBe('Fantasy');
      });

      it('should handle OpenAI API errors', async () => {
        const mockResponse = {
          ok: false,
          statusText: 'Unauthorized',
        };

        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        await expect(generateStoryBeat('test prompt', AIProvider.OPENAI))
          .rejects.toThrow('OpenAI API error: Unauthorized');
      });
    });

    describe('with Claude provider', () => {
      it('should generate story successfully', async () => {
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            content: [{
              text: JSON.stringify(mockGameState),
            }],
            usage: {
              input_tokens: 100,
              output_tokens: 150,
            },
          }),
        };

        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        const result = await generateStoryBeat('test prompt', AIProvider.CLAUDE);

        expect(global.fetch).toHaveBeenCalledWith(
          'https://api.anthropic.com/v1/messages',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'x-api-key': 'test-claude-key',
              'Content-Type': 'application/json',
              'anthropic-version': '2023-06-01',
            },
            body: expect.stringContaining('claude-3-5-haiku-20241022'),
          })
        );

        expect(result.data).toEqual(mockGameState);
        expect(result.usage.provider).toBe(AIProvider.CLAUDE);
      });

      it('should handle Claude API errors', async () => {
        const mockResponse = {
          ok: false,
          statusText: 'Rate Limited',
        };

        (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

        await expect(generateStoryBeat('test prompt', AIProvider.CLAUDE))
          .rejects.toThrow('Claude API error: Rate Limited');
      });
    });
  });

  describe('generateImage', () => {
    it('should generate image with Gemini', async () => {
      const { GoogleGenAI } = require('@google/genai');
      const mockImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      
      const mockGenerateContent = jest.fn().mockResolvedValue({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: mockImageData,
              },
            }],
          },
        }],
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 10,
        },
      });
      
      GoogleGenAI.mockImplementation(() => ({
        models: { generateContent: mockGenerateContent }
      }));

      const result = await generateImage('test prompt', 'fantasy', AIProvider.GEMINI);

      expect(result.data).toBe(`data:image/png;base64,${mockImageData}`);
      expect(result.usage.provider).toBe(AIProvider.GEMINI);
    });

    it('should generate image with OpenAI', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{
            url: 'https://oaidalleapiprodscus.blob.core.windows.net/private/image.png',
          }],
        }),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await generateImage('test prompt', 'fantasy', AIProvider.OPENAI);

      expect(result.data).toBe('https://oaidalleapiprodscus.blob.core.windows.net/private/image.png');
      expect(result.usage.provider).toBe(AIProvider.OPENAI);
      expect(result.usage.isPremium).toBe(true);
    });

    it('should return undefined for Claude (no image generation)', async () => {
      const result = await generateImage('test prompt', 'fantasy', AIProvider.CLAUDE);

      expect(result.data).toBeUndefined();
      expect(result.usage.provider).toBe(AIProvider.CLAUDE);
    });
  });

  describe('getChatResponse', () => {
    it('should handle chat with undefined inventory safely', async () => {
      const gameStateWithUndefinedInventory = {
        ...mockGameState,
        inventory: undefined,
      };

      const { GoogleGenAI } = require('@google/genai');
      const mockChat = {
        sendMessage: jest.fn().mockResolvedValue({
          text: 'Hello, brave adventurer!',
          usageMetadata: {
            promptTokenCount: 50,
            candidatesTokenCount: 25,
          },
        }),
      };
      
      GoogleGenAI.mockImplementation(() => ({
        chats: { create: jest.fn().mockReturnValue(mockChat) }
      }));

      const result = await getChatResponse('hello', gameStateWithUndefinedInventory as any, AIProvider.GEMINI);

      expect(result.data).toBe('Hello, brave adventurer!');
      expect(result.usage.provider).toBe(AIProvider.GEMINI);
    });
  });

  describe('calculateEstimatedCost', () => {
    it('should calculate costs correctly for Gemini', () => {
      const cost = calculateEstimatedCost(1000, 500, 2, 1, AIProvider.GEMINI, 'flash');
      
      // Gemini Flash: $0.1/1M input, $0.4/1M output, $0.0008/image
      const expectedCost = (1000 * 0.1/1000000) + (500 * 0.4/1000000) + (2 * 0.0008) + (1 * 0.04);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should calculate costs correctly for OpenAI', () => {
      const cost = calculateEstimatedCost(1000, 500, 2, 1, AIProvider.OPENAI, 'standard');
      
      // OpenAI GPT-4o-mini: $0.5/1M input, $1.5/1M output, $0.02/image
      const expectedCost = (1000 * 0.5/1000000) + (500 * 1.5/1000000) + (2 * 0.02) + (1 * 0.02);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });

    it('should calculate costs correctly for Claude', () => {
      const cost = calculateEstimatedCost(1000, 500, 0, 0, AIProvider.CLAUDE, 'flash');
      
      // Claude Haiku: $0.25/1M input, $1.25/1M output
      const expectedCost = (1000 * 0.25/1000000) + (500 * 1.25/1000000);
      expect(cost).toBeCloseTo(expectedCost, 6);
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported provider error', async () => {
      await expect(generateStoryBeat('test', 'UNSUPPORTED' as AIProvider))
        .rejects.toThrow('Unsupported provider: UNSUPPORTED');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(generateStoryBeat('test', AIProvider.OPENAI))
        .rejects.toThrow('Network error');
    });
  });
});

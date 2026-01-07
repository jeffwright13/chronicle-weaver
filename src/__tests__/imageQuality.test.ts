import { jest } from '@jest/globals';
import { generateImage } from '../../aiService.ts';
import { AIProvider } from '../../types.ts';

// Mock fetch with proper typing
const mockFetch = jest.fn() as any;
global.fetch = mockFetch;

// Helper function to create mock responses
const createMockResponse = (data: any) => ({
  ok: true,
  json: jest.fn().mockResolvedValue(data) as any,
});

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';

describe('Image Quality Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenAI Image Generation', () => {
    it('should use standard quality settings by default', async () => {
      const mockResponse = createMockResponse({
        data: [{ url: 'https://example.com/standard-image.png' }],
      });
      mockFetch.mockResolvedValue(mockResponse);

      await generateImage('A knight in armor', 'fantasy', AIProvider.OPENAI, 'standard');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/images/generations',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-openai-key',
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"size":"1024x1024"'),
        })
      );
    });

    it('should use fast quality settings when specified', async () => {
      const mockResponse = createMockResponse({
        data: [{ url: 'https://example.com/fast-image.png' }],
      });
      mockFetch.mockResolvedValue(mockResponse);

      await generateImage('A knight in armor', 'fantasy', AIProvider.OPENAI, 'fast');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/images/generations',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-openai-key',
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"size":"1024x1024"'),
        })
      );
    });

    it('should use simplified prompts for fast mode', async () => {
      const mockResponse = createMockResponse({
        data: [{ url: 'https://example.com/fast-image.png' }],
      });
      mockFetch.mockResolvedValue(mockResponse);

      await generateImage('A knight in armor', 'fantasy', AIProvider.OPENAI, 'fast');

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body as string);
      
      expect(requestBody.prompt).toBe('Simple fantasy style: A knight in armor. Minimal detail, flat colors.');
      expect(requestBody.style).toBe('natural');
    });

    it('should use detailed prompts for standard mode', async () => {
      const mockResponse = createMockResponse({
        data: [{ url: 'https://example.com/standard-image.png' }],
      });
      mockFetch.mockResolvedValue(mockResponse);

      await generateImage('A knight in armor', 'fantasy', AIProvider.OPENAI, 'standard');

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body as string);
      
      expect(requestBody.prompt).toBe('Art Style: fantasy. Scene: A knight in armor. Cinematic lighting, evocative mood.');
      expect(requestBody.style).toBe('vivid');
    });
  });

  describe('Text-Only Mode', () => {
    it('should handle image generation requests correctly', async () => {
      const mockResponse = createMockResponse({
        data: [{ url: 'https://example.com/image.png' }],
      });
      mockFetch.mockResolvedValue(mockResponse);

      const result = await generateImage('A scene', 'fantasy', AIProvider.OPENAI, 'standard');

      expect(result.data).toBe('https://example.com/image.png');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cost Optimization', () => {
    it('should use natural style for fast mode to reduce costs', async () => {
      const mockResponse = createMockResponse({
        data: [{ url: 'https://example.com/fast-image.png' }],
      });
      mockFetch.mockResolvedValue(mockResponse);

      await generateImage('Test scene', 'fantasy', AIProvider.OPENAI, 'fast');

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body as string);
      
      // Fast mode should use natural style (less processing than vivid)
      expect(requestBody.style).toBe('natural');
    });

    it('should use vivid style for standard mode', async () => {
      const mockResponse = createMockResponse({
        data: [{ url: 'https://example.com/standard-image.png' }],
      });
      mockFetch.mockResolvedValue(mockResponse);

      await generateImage('Test scene', 'fantasy', AIProvider.OPENAI, 'standard');

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body as string);
      
      // Standard mode should use vivid style
      expect(requestBody.style).toBe('vivid');
    });
  });
});

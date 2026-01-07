import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';

// Mock the AI service
jest.mock('../aiService', () => ({
  generateStoryBeat: jest.fn(),
  generateImage: jest.fn(),
  getChatResponse: jest.fn(),
  calculateEstimatedCost: jest.fn(() => 0.001),
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock environment variables
process.env.GEMINI_API_KEY = 'test-key';
process.env.OPENAI_API_KEY = 'test-key';
process.env.CLAUDE_API_KEY = 'test-key';

describe('Game Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('Game Initialization', () => {
    it('should show the main setup screen initially', () => {
      render(<App />);
      
      expect(screen.getByText('Chronicle Weaver')).toBeInTheDocument();
      expect(screen.getByText('AI PROVIDER')).toBeInTheDocument();
      expect(screen.getByText('Initialize Thread Genre')).toBeInTheDocument();
    });

    it('should allow provider selection', async () => {
      render(<App />);
      
      const openaiButton = screen.getByText('OpenAI');
      expect(openaiButton).toBeInTheDocument();
      
      fireEvent.click(openaiButton);
      
      // Should be selected (has different styling)
      expect(openaiButton).toHaveClass('bg-indigo-600');
    });

    it('should start game with selected genre', async () => {
      const { generateStoryBeat, generateImage } = require('../aiService');
      
      generateStoryBeat.mockResolvedValue({
        data: {
          storyText: 'A magical adventure begins!',
          choices: ['Explore the forest', 'Visit the castle'],
          inventory: ['map', 'torch'],
          currentQuest: 'Find the enchanted sword',
          visualPrompt: 'A hero at a crossroads',
          worldStyle: 'fantasy',
          genre: 'High Fantasy'
        },
        usage: {
          inputTokens: 100,
          outputTokens: 150,
          provider: 'openai'
        }
      });

      generateImage.mockResolvedValue({
        data: 'data:image/png;base64,mock-image-data',
        usage: {
          inputTokens: 50,
          outputTokens: 10,
          provider: 'openai'
        }
      });

      render(<App />);
      
      // Select OpenAI provider
      fireEvent.click(screen.getByText('OpenAI'));
      
      // Start game with Fantasy genre
      fireEvent.click(screen.getByText('⚔️ High Fantasy'));

      await waitFor(() => {
        expect(screen.getByText('A magical adventure begins!')).toBeInTheDocument();
      });

      expect(screen.getByText('Explore the forest')).toBeInTheDocument();
      expect(screen.getByText('Visit the castle')).toBeInTheDocument();
    });
  });

  describe('Game State Management', () => {
    it('should handle story progression', async () => {
      const { generateStoryBeat, generateImage } = require('../aiService');
      
      // Mock initial story
      generateStoryBeat.mockResolvedValueOnce({
        data: {
          storyText: 'You stand at the entrance of a dark cave.',
          choices: ['Enter the cave', 'Walk away'],
          inventory: ['torch'],
          currentQuest: 'Explore the cave',
          visualPrompt: 'Cave entrance',
          worldStyle: 'fantasy',
          genre: 'High Fantasy'
        },
        usage: { inputTokens: 100, outputTokens: 150, provider: 'openai' }
      });

      // Mock story progression
      generateStoryBeat.mockResolvedValueOnce({
        data: {
          storyText: 'Inside the cave, you find a treasure chest!',
          choices: ['Open the chest', 'Leave it alone'],
          inventory: ['torch', 'ancient key'],
          currentQuest: 'Explore the cave',
          visualPrompt: 'Treasure chest in cave',
          worldStyle: 'fantasy',
          genre: 'High Fantasy'
        },
        usage: { inputTokens: 100, outputTokens: 150, provider: 'openai' }
      });

      generateImage.mockResolvedValue({
        data: 'data:image/png;base64,cave-image',
        usage: { inputTokens: 50, outputTokens: 10, provider: 'openai' }
      });

      render(<App />);
      
      // Start game
      fireEvent.click(screen.getByText('OpenAI'));
      fireEvent.click(screen.getByText('⚔️ High Fantasy'));

      await waitFor(() => {
        expect(screen.getByText('You stand at the entrance of a dark cave.')).toBeInTheDocument();
      });

      // Make a choice
      fireEvent.click(screen.getByText('Enter the cave'));

      await waitFor(() => {
        expect(screen.getByText('Inside the cave, you find a treasure chest!')).toBeInTheDocument();
      });

      // Check inventory updated
      expect(screen.getByText('ancient key')).toBeInTheDocument();
    });

    it('should handle empty inventory gracefully', async () => {
      const { generateStoryBeat, generateImage } = require('../aiService');
      
      generateStoryBeat.mockResolvedValue({
        data: {
          storyText: 'An adventure begins!',
          choices: ['Continue'],
          inventory: [], // Empty inventory
          currentQuest: 'Start the journey',
          visualPrompt: 'Beginning scene',
          worldStyle: 'fantasy',
          genre: 'High Fantasy'
        },
        usage: { inputTokens: 100, outputTokens: 150, provider: 'openai' }
      });

      generateImage.mockResolvedValue({
        data: 'data:image/png;base64,mock-image',
        usage: { inputTokens: 50, outputTokens: 10, provider: 'openai' }
      });

      render(<App />);
      
      fireEvent.click(screen.getByText('OpenAI'));
      fireEvent.click(screen.getByText('⚔️ High Fantasy'));

      await waitFor(() => {
        expect(screen.getByText('An adventure begins!')).toBeInTheDocument();
      });

      // Should not crash with empty inventory
      expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const { generateStoryBeat } = require('../aiService');
      
      generateStoryBeat.mockRejectedValue(new Error('API Error'));

      render(<App />);
      
      fireEvent.click(screen.getByText('OpenAI'));
      fireEvent.click(screen.getByText('⚔️ High Fantasy'));

      await waitFor(() => {
        // Should show error state or retry option
        expect(screen.getByText(/API Error/i)).toBeInTheDocument();
      });
    });

    it('should handle missing API key', async () => {
      // Temporarily remove API key
      delete process.env.OPENAI_API_KEY;
      
      render(<App />);
      
      // Should show API key modal
      expect(screen.getByText(/Access Protocol/i)).toBeInTheDocument();
      expect(screen.getByText(/AUTHENTICATE/i)).toBeInTheDocument();
    });
  });

  describe('Save/Load Functionality', () => {
    it('should save game state to localStorage', async () => {
      const { generateStoryBeat, generateImage } = require('../aiService');
      
      generateStoryBeat.mockResolvedValue({
        data: {
          storyText: 'Test story',
          choices: ['Choice 1'],
          inventory: ['item1'],
          currentQuest: 'Test quest',
          visualPrompt: 'Test scene',
          worldStyle: 'fantasy',
          genre: 'High Fantasy'
        },
        usage: { inputTokens: 100, outputTokens: 150, provider: 'openai' }
      });

      generateImage.mockResolvedValue({
        data: 'data:image/png;base64,test-image',
        usage: { inputTokens: 50, outputTokens: 10, provider: 'openai' }
      });

      render(<App />);
      
      fireEvent.click(screen.getByText('OpenAI'));
      fireEvent.click(screen.getByText('⚔️ High Fantasy'));

      await waitFor(() => {
        expect(screen.getByText('Test story')).toBeInTheDocument();
      });

      // Check if save was created in localStorage
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'CHRONICLE_WEAVER_SAVES_V2',
        expect.stringContaining('Test story')
      );
    });

    it('should load saved games', async () => {
      const mockSave = {
        id: 'test-save-id',
        name: 'Test Save',
        genre: 'High Fantasy',
        lastUpdated: Date.now(),
        gameState: {
          storyText: 'Saved story',
          choices: ['Choice 1', 'Choice 2'],
          inventory: ['sword', 'shield'],
          currentQuest: 'Saved quest',
          visualPrompt: 'Saved scene',
          worldStyle: 'fantasy',
          genre: 'High Fantasy'
        },
        history: [],
        chatMessages: [],
        usageStats: {
          inputTokens: 100,
          outputTokens: 150,
          imageCount: 1,
          premiumImageCount: 0,
          estimatedCost: 0.01
        }
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify([mockSave]));

      render(<App />);
      
      // Should show saved game
      expect(screen.getByText('Test Save')).toBeInTheDocument();
      expect(screen.getByText('High Fantasy')).toBeInTheDocument();

      // Load the save
      fireEvent.click(screen.getByText('Test Save'));

      await waitFor(() => {
        expect(screen.getByText('Saved story')).toBeInTheDocument();
      });
    });
  });

  describe('Chat Functionality', () => {
    it('should send chat messages and get responses', async () => {
      const { generateStoryBeat, generateImage, getChatResponse } = require('../aiService');
      
      generateStoryBeat.mockResolvedValue({
        data: {
          storyText: 'You are in a tavern.',
          choices: ['Talk to bartender', 'Order drink'],
          inventory: ['gold coins'],
          currentQuest: 'Find information',
          visualPrompt: 'Tavern interior',
          worldStyle: 'fantasy',
          genre: 'High Fantasy'
        },
        usage: { inputTokens: 100, outputTokens: 150, provider: 'openai' }
      });

      generateImage.mockResolvedValue({
        data: 'data:image/png;base64,tavern-image',
        usage: { inputTokens: 50, outputTokens: 10, provider: 'openai' }
      });

      getChatResponse.mockResolvedValue({
        data: 'The bartender nods and says, "Welcome, traveler!"',
        usage: { inputTokens: 50, outputTokens: 25, provider: 'openai' }
      });

      render(<App />);
      
      // Start game
      fireEvent.click(screen.getByText('OpenAI'));
      fireEvent.click(screen.getByText('⚔️ High Fantasy'));

      await waitFor(() => {
        expect(screen.getByText('You are in a tavern.')).toBeInTheDocument();
      });

      // Send chat message
      const chatInput = screen.getByPlaceholderText(/Ask the Chronicler/i);
      fireEvent.change(chatInput, { target: { value: 'Hello bartender' } });
      fireEvent.click(screen.getByText('SEND'));

      await waitFor(() => {
        expect(screen.getByText('The bartender nods and says, "Welcome, traveler!"')).toBeInTheDocument();
      });
    });
  });
});


export enum ImageSize {
  K1 = '1K',
  K2 = '2K',
  K4 = '4K'
}

export interface GameState {
  storyText: string;
  choices: string[];
  inventory: string[];
  currentQuest: string;
  visualPrompt: string;
  worldStyle: string;
  genre: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GameHistoryItem {
  text: string;
  choice: string;
  imageUrl?: string;
  state?: GameState; // Optional state for restoring to this point
}

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  imageCount: number;
  premiumImageCount: number;
  estimatedCost: number;
}

export interface SaveSlot {
  id: string;
  name: string;
  genre: string;
  lastUpdated: number;
  gameState: GameState;
  history: GameHistoryItem[];
  chatMessages: ChatMessage[];
  usageStats: UsageStats;
}

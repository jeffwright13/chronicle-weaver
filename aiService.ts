import { GoogleGenAI, Type } from "@google/genai";
import { GameState, ImageSize, AIProvider } from "./types";

const PRICING = {
  GEMINI_FLASH: { input: 0.1 / 1000000, output: 0.4 / 1000000, image: 0.0008 },
  GEMINI_PRO: { input: 1.25 / 1000000, output: 5.0 / 1000000, image: 0.04 },
  OPENAI_GPT4: { input: 10 / 1000000, output: 30 / 1000000, image: 0.04 },
  OPENAI_GPT3_5: { input: 0.5 / 1000000, output: 1.5 / 1000000, image: 0.02 },
  CLAUDE_HAIKU: { input: 0.25 / 1000000, output: 1.25 / 1000000, image: 0.03 },
  CLAUDE_SONNET: { input: 3 / 1000000, output: 15 / 1000000, image: 0.06 }
};

export interface ServiceResponse<T> {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
    isPremium?: boolean;
    provider: AIProvider;
  };
}

const handleGeminiError = (error: any) => {
  console.error("Gemini Error:", error);
  const errorMessage = (error?.message || error?.error?.message || "").toLowerCase();
  const errorCode = error?.code || error?.error?.code;

  if (
    errorCode === 403 || 
    errorCode === 404 ||
    errorMessage.includes("permission") || 
    errorMessage.includes("not found") ||
    errorMessage.includes("api_key_invalid")
  ) {
    throw new Error("API_KEY_ERROR");
  }
  throw error;
};

const handleOpenAIError = (error: any) => {
  console.error("OpenAI Error:", error);
  if (error?.status === 401) {
    throw new Error("API_KEY_ERROR");
  }
  throw error;
};

const handleClaudeError = (error: any) => {
  console.error("Claude Error:", error);
  if (error?.status === 401) {
    throw new Error("API_KEY_ERROR");
  }
  throw error;
};

const API_KEY_STORAGE_PREFIX = 'CHRONICLE_WEAVER_API_KEY_';

export const getStoredApiKey = (provider: AIProvider): string => {
  const key = localStorage.getItem(`${API_KEY_STORAGE_PREFIX}${provider}`);
  return key || '';
};

export const setStoredApiKey = (provider: AIProvider, key: string): void => {
  if (key) {
    localStorage.setItem(`${API_KEY_STORAGE_PREFIX}${provider}`, key);
  } else {
    localStorage.removeItem(`${API_KEY_STORAGE_PREFIX}${provider}`);
  }
};

export const hasApiKey = (provider: AIProvider): boolean => {
  return getStoredApiKey(provider).length > 0;
};

export const clearAllApiKeys = (): void => {
  Object.values(AIProvider).forEach(provider => {
    localStorage.removeItem(`${API_KEY_STORAGE_PREFIX}${provider}`);
  });
};

const getProviderKey = (provider: AIProvider): string => {
  return getStoredApiKey(provider);
};

// Gemini Functions
const geminiGenerateStory = async (prompt: string): Promise<ServiceResponse<GameState>> => {
  const ai = new GoogleGenAI({ apiKey: getProviderKey(AIProvider.GEMINI) });
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          storyText: { type: Type.STRING },
          choices: { type: Type.ARRAY, items: { type: Type.STRING } },
          inventory: { type: Type.ARRAY, items: { type: Type.STRING } },
          currentQuest: { type: Type.STRING },
          visualPrompt: { type: Type.STRING },
          worldStyle: { type: Type.STRING },
          genre: { type: Type.STRING }
        },
        required: ["storyText", "choices", "inventory", "currentQuest", "visualPrompt", "worldStyle", "genre"]
      }
    }
  });

  const metadata = response.usageMetadata;
  return {
    data: JSON.parse(response.text || '{}') as GameState,
    usage: {
      inputTokens: metadata?.promptTokenCount || 0,
      outputTokens: metadata?.candidatesTokenCount || 0,
      provider: AIProvider.GEMINI
    }
  };
};

const geminiGenerateImage = async (prompt: string, style: string, quality: 'standard' | 'fast' = 'standard'): Promise<ServiceResponse<string | undefined>> => {
  const ai = new GoogleGenAI({ apiKey: getProviderKey(AIProvider.GEMINI) });
  const fullPrompt = quality === 'fast'
    ? `Simple ${style} style: ${prompt}. Minimal detail, basic colors.`
    : `Art Style: ${style}. Scene: ${prompt}. Cinematic lighting, evocative mood.`;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: { parts: [{ text: fullPrompt }] }
  });

  let imageData: string | undefined;
  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      imageData = `data:image/png;base64,${part.inlineData.data}`;
      break;
    }
  }

  const metadata = response.usageMetadata;
  return {
    data: imageData,
    usage: {
      inputTokens: metadata?.promptTokenCount || 0,
      outputTokens: metadata?.candidatesTokenCount || 0,
      isPremium: false,
      provider: AIProvider.GEMINI
    }
  };
};

// OpenAI Functions
const openaiGenerateStory = async (prompt: string): Promise<ServiceResponse<GameState>> => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getProviderKey(AIProvider.OPENAI)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
  
  const data = await response.json();
  console.log('OpenAI response:', data); // Debug log
  let gameState: GameState;
  
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
    // Ensure all required fields are present
    gameState = {
      storyText: parsed.storyText || 'The story begins...',
      choices: parsed.choices || ['Continue'],
      inventory: parsed.inventory || [],
      currentQuest: parsed.currentQuest || 'Unknown quest',
      visualPrompt: parsed.visualPrompt || 'A mysterious scene',
      worldStyle: parsed.worldStyle || 'fantasy',
      genre: parsed.genre || 'Fantasy'
    };
  } catch (parseError) {
    console.error('Failed to parse OpenAI response:', parseError);
    throw new Error('Invalid response format from OpenAI');
  }
  
  return {
    data: gameState,
    usage: {
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      provider: AIProvider.OPENAI
    }
  };
};

const openaiGenerateImage = async (prompt: string, style: string, quality: 'standard' | 'fast' = 'standard'): Promise<ServiceResponse<string | undefined>> => {
  const fullPrompt = quality === 'fast' 
    ? `Simple ${style} style: ${prompt}. Minimal detail, flat colors.`
    : `Art Style: ${style}. Scene: ${prompt}. Cinematic lighting, evocative mood.`;
  
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getProviderKey(AIProvider.OPENAI)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: fullPrompt,
      size: quality === 'fast' ? '1024x1024' : '1024x1024',
      quality: 'standard',
      style: quality === 'fast' ? 'natural' : 'vivid'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenAI API error response:', errorText); // Debug log
    throw new Error(`OpenAI API error: ${response.statusText} - ${errorText}`);
  }
  
  const data = await response.json();
  console.log('OpenAI image response:', data); // Debug log
  
  return {
    data: data.data[0].url,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      isPremium: true,
      provider: AIProvider.OPENAI
    }
  };
};

// Claude Functions (text only)
const claudeGenerateStory = async (prompt: string): Promise<ServiceResponse<GameState>> => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': getProviderKey(AIProvider.CLAUDE),
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.statusText}`);
  
  const data = await response.json();
  console.log('Claude response:', data); // Debug log
  let gameState: GameState;
  
  try {
    const parsed = JSON.parse(data.content[0].text);
    // Ensure all required fields are present
    gameState = {
      storyText: parsed.storyText || 'The story begins...',
      choices: parsed.choices || ['Continue'],
      inventory: parsed.inventory || [],
      currentQuest: parsed.currentQuest || 'Unknown quest',
      visualPrompt: parsed.visualPrompt || 'A mysterious scene',
      worldStyle: parsed.worldStyle || 'fantasy',
      genre: parsed.genre || 'Fantasy'
    };
  } catch (parseError) {
    console.error('Failed to parse Claude response:', parseError);
    throw new Error('Invalid response format from Claude');
  }
  
  return {
    data: gameState,
    usage: {
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
      provider: AIProvider.CLAUDE
    }
  };
};

const claudeGenerateImage = async (): Promise<ServiceResponse<string | undefined>> => {
  // Claude doesn't support image generation, return placeholder
  return {
    data: undefined,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      provider: AIProvider.CLAUDE
    }
  };
};

// Main Export Functions
export const generateStoryBeat = async (
  prompt: string,
  provider: AIProvider = AIProvider.GEMINI
): Promise<ServiceResponse<GameState>> => {
  try {
    switch (provider) {
      case AIProvider.GEMINI:
        return await geminiGenerateStory(prompt);
      case AIProvider.OPENAI:
        return await openaiGenerateStory(prompt);
      case AIProvider.CLAUDE:
        return await claudeGenerateStory(prompt);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    switch (provider) {
      case AIProvider.GEMINI:
        return handleGeminiError(error);
      case AIProvider.OPENAI:
        return handleOpenAIError(error);
      case AIProvider.CLAUDE:
        return handleClaudeError(error);
      default:
        throw error;
    }
  }
};

export const generateImage = async (
  prompt: string,
  style: string,
  provider: AIProvider = AIProvider.GEMINI,
  quality: 'standard' | 'fast' = 'standard'
): Promise<ServiceResponse<string | undefined>> => {
  try {
    switch (provider) {
      case AIProvider.GEMINI:
        return await geminiGenerateImage(prompt, style, quality);
      case AIProvider.OPENAI:
        return await openaiGenerateImage(prompt, style, quality);
      case AIProvider.CLAUDE:
        return await claudeGenerateImage();
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    switch (provider) {
      case AIProvider.GEMINI:
        return handleGeminiError(error);
      case AIProvider.OPENAI:
        return handleOpenAIError(error);
      case AIProvider.CLAUDE:
        return handleClaudeError(error);
      default:
        throw error;
    }
  }
};

export const getChatResponse = async (
  message: string,
  gameContext: GameState,
  provider: AIProvider = AIProvider.GEMINI
): Promise<ServiceResponse<string>> => {
  try {
    switch (provider) {
      case AIProvider.GEMINI:
        const geminiAi = new GoogleGenAI({ apiKey: getProviderKey(AIProvider.GEMINI) });
        const geminiChat = geminiAi.chats.create({
          model: 'gemini-2.0-flash-exp',
          config: {
            systemInstruction: `You are the Chronicler, a wise and helpful sidekick in this infinite adventure game. 
            The current genre is ${gameContext.genre}. The player's quest is: ${gameContext.currentQuest}.
            Their inventory includes: ${(gameContext.inventory || []).join(', ')}.
            If the genre is '80s Sci-Fi Horror', speak with 80s slang like 'rad', 'bogus', or 'tubular' occasionally.`
          }
        });
        const geminiResponse = await geminiChat.sendMessage({ message });
        const geminiMetadata = geminiResponse.usageMetadata;
        return {
          data: geminiResponse.text || "I apologize, my vision is clouded...",
          usage: {
            inputTokens: geminiMetadata?.promptTokenCount || 0,
            outputTokens: geminiMetadata?.candidatesTokenCount || 0,
            provider: AIProvider.GEMINI
          }
        };

      case AIProvider.OPENAI:
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getProviderKey(AIProvider.OPENAI)}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `You are the Chronicler, a wise and helpful sidekick in this infinite adventure game. 
                The current genre is ${gameContext.genre}. The player's quest is: ${gameContext.currentQuest}.
                Their inventory includes: ${(gameContext.inventory || []).join(', ')}.
                If the genre is '80s Sci-Fi Horror', speak with 80s slang like 'rad', 'bogus', or 'tubular' occasionally.`
              },
              { role: 'user', content: message }
            ]
          })
        });
        
        if (!openaiResponse.ok) throw new Error(`OpenAI API error: ${openaiResponse.statusText}`);
        const openaiData = await openaiResponse.json();
        
        return {
          data: openaiData.choices[0].message.content,
          usage: {
            inputTokens: openaiData.usage.prompt_tokens,
            outputTokens: openaiData.usage.completion_tokens,
            provider: AIProvider.OPENAI
          }
        };

      case AIProvider.CLAUDE:
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': getProviderKey(AIProvider.CLAUDE),
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1000,
            system: `You are the Chronicler, a wise and helpful sidekick in this infinite adventure game. 
            The current genre is ${gameContext.genre}. The player's quest is: ${gameContext.currentQuest}.
            Their inventory includes: ${(gameContext.inventory || []).join(', ')}.
            If the genre is '80s Sci-Fi Horror', speak with 80s slang like 'rad', 'bogus', or 'tubular' occasionally.`,
            messages: [{ role: 'user', content: message }]
          })
        });
        
        if (!claudeResponse.ok) throw new Error(`Claude API error: ${claudeResponse.statusText}`);
        const claudeData = await claudeResponse.json();
        
        return {
          data: claudeData.content[0].text,
          usage: {
            inputTokens: claudeData.usage.input_tokens,
            outputTokens: claudeData.usage.output_tokens,
            provider: AIProvider.CLAUDE
          }
        };

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  } catch (error) {
    switch (provider) {
      case AIProvider.GEMINI:
        return handleGeminiError(error);
      case AIProvider.OPENAI:
        return handleOpenAIError(error);
      case AIProvider.CLAUDE:
        return handleClaudeError(error);
      default:
        throw error;
    }
  }
};

export const calculateEstimatedCost = (
  inputTokens: number, 
  outputTokens: number, 
  images: number, 
  premiumImages: number,
  provider: AIProvider = AIProvider.GEMINI,
  modelType: 'flash' | 'pro' | 'standard' = 'flash'
): number => {
  let pricing;
  switch (provider) {
    case AIProvider.GEMINI:
      pricing = modelType === 'pro' ? PRICING.GEMINI_PRO : PRICING.GEMINI_FLASH;
      break;
    case AIProvider.OPENAI:
      pricing = modelType === 'pro' ? PRICING.OPENAI_GPT4 : PRICING.OPENAI_GPT3_5;
      break;
    case AIProvider.CLAUDE:
      pricing = modelType === 'pro' ? PRICING.CLAUDE_SONNET : PRICING.CLAUDE_HAIKU;
      break;
    default:
      pricing = PRICING.GEMINI_FLASH;
  }
  
  const textCost = (inputTokens * pricing.input) + (outputTokens * pricing.output);
  const imageCost = (images * pricing.image) + (premiumImages * pricing.image);
  return textCost + imageCost;
};

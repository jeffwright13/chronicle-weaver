
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GameState, ImageSize } from "./types";

const PRICING = {
  FLASH_TEXT: { input: 0.1 / 1000000, output: 0.4 / 1000000 },
  PRO_TEXT: { input: 1.25 / 1000000, output: 5.0 / 1000000 },
  FLASH_IMAGE: 0.0008, // Estimated per image
  PRO_IMAGE: 0.04 // Estimated per image
};

const handleGenAIError = (error: any) => {
  console.error("GenAI Error context:", error);
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

export interface ServiceResponse<T> {
  data: T;
  usage: {
    inputTokens: number;
    outputTokens: number;
    isPremium?: boolean;
  };
}

export const generateStoryBeat = async (
  prompt: string,
  currentGameState?: GameState
): Promise<ServiceResponse<GameState>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
        outputTokens: metadata?.candidatesTokenCount || 0
      }
    };
  } catch (error) {
    return handleGenAIError(error);
  }
};

export const generateImage = async (
  prompt: string,
  style: string,
  size: ImageSize = ImageSize.K1,
  isHighResRequested: boolean = false
): Promise<ServiceResponse<string | undefined>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const model = isHighResRequested ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
  const fullPrompt = `Art Style: ${style}. Scene: ${prompt}. Cinematic lighting, evocative mood.`;
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: { parts: [{ text: fullPrompt }] },
      config: isHighResRequested ? {
        imageConfig: { aspectRatio: "16:9", imageSize: size }
      } : {}
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
        isPremium: isHighResRequested
      }
    };
  } catch (error) {
    return handleGenAIError(error);
  }
};

export const getChatResponse = async (
  message: string,
  gameContext: GameState
): Promise<ServiceResponse<string>> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  try {
    const chat = ai.chats.create({
      model: 'gemini-3-pro-preview',
      config: {
        systemInstruction: `You are the Chronicler, a wise and helpful sidekick in this infinite adventure game. 
        The current genre is ${gameContext.genre}. The player's quest is: ${gameContext.currentQuest}.
        Their inventory includes: ${gameContext.inventory.join(', ')}.
        If the genre is '80s Sci-Fi Horror', speak with 80s slang like 'rad', 'bogus', or 'tubular' occasionally.`
      }
    });

    const response = await chat.sendMessage({ message: message });
    const metadata = response.usageMetadata;
    
    return {
      data: response.text || "I apologize, my vision is clouded...",
      usage: {
        inputTokens: metadata?.promptTokenCount || 0,
        outputTokens: metadata?.candidatesTokenCount || 0
      }
    };
  } catch (error) {
    return handleGenAIError(error);
  }
};

export const calculateEstimatedCost = (
  inputTokens: number, 
  outputTokens: number, 
  images: number, 
  premiumImages: number,
  modelType: 'flash' | 'pro' = 'flash'
): number => {
  const textPrice = modelType === 'pro' ? PRICING.PRO_TEXT : PRICING.FLASH_TEXT;
  const textCost = (inputTokens * textPrice.input) + (outputTokens * textPrice.output);
  const imageCost = (images * PRICING.FLASH_IMAGE) + (premiumImages * PRICING.PRO_IMAGE);
  return textCost + imageCost;
};

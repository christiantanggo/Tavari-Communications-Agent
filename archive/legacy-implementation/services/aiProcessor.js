import OpenAI from 'openai';
import { Business } from '../models/Business.js';
import { AIAgent } from '../models/AIAgent.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class AIProcessor {
  /**
   * Process speech text and generate AI response
   * Similar to the example ai-processor, but adapted for our architecture
   */
  static async processSpeech(speechText, businessId, conversationHistory = [], rememberedInfo = {}) {
    try {
      // Get business and AI agent config
      const business = await Business.findById(businessId);
      if (!business) {
        throw new Error('Business not found');
      }

      const agentConfig = await AIAgent.findByBusinessId(businessId);
      if (!agentConfig) {
        throw new Error('AI agent not configured');
      }

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(business, agentConfig);

      // Build messages array
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-12), // Last 12 messages for context
        { role: 'user', content: speechText },
      ];

      // Call OpenAI chat completions (not Realtime)
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 150,
        temperature: 0.7,
      });

      const response = completion.choices[0].message.content || 'I understand. How else can I help you?';

      // Update conversation history
      const updatedHistory = [
        ...conversationHistory,
        { role: 'user', content: speechText },
        { role: 'assistant', content: response },
      ].slice(-50); // Keep last 50 messages

      return {
        response,
        conversation_history: updatedHistory,
        remembered_info: rememberedInfo,
      };
    } catch (error) {
      console.error('AI Processor error:', error);
      throw error;
    }
  }

  /**
   * Build system prompt for AI
   */
  static buildSystemPrompt(business, agentConfig) {
    const openingMessage = business.opening_message || `Hello! Thank you for calling ${business.name}. How can I help you today?`;
    
    return `You are a friendly, helpful phone assistant for ${business.name}. You're speaking to a customer on the phone right now.

Your personality:
- Warm, friendly, and conversational
- Use natural speech patterns
- Keep responses brief (1-2 sentences max for phone conversations)
- Be helpful and professional

Business Information:
- Name: ${business.name}
- Phone: ${business.phone || 'Not available'}
- Address: ${business.address || 'Not available'}

Opening Message: ${openingMessage}

Remember: You're having a real conversation with a real person. Be natural, friendly, and helpful.`;
  }
}


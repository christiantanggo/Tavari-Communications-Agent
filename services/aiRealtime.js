import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export class AIRealtimeService {
  constructor(callSessionId, businessId, agentConfig) {
    this.callSessionId = callSessionId;
    this.businessId = businessId;
    this.agentConfig = agentConfig;
    this.ws = null;
    this.audioBuffer = [];
    this.transcript = '';
    this.isResponding = false;
    this.responseLock = false;
  }
  
  // Connect to OpenAI Realtime API
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const url = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01&api_key=${OPENAI_API_KEY}`;
        
        this.ws = new WebSocket(url);
        
        this.ws.on('open', () => {
          console.log('Connected to OpenAI Realtime API');
          
          // Send session configuration
          this.ws.send(JSON.stringify({
            type: 'session.update',
            session: {
              modalities: ['text', 'audio'],
              instructions: this.buildSystemInstructions(),
              voice: 'alloy',
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16',
              temperature: 0.8,
              max_response_output_tokens: 4096,
            },
          }));
          
          resolve(true);
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
          } catch (error) {
            // Handle binary audio data
            if (Buffer.isBuffer(data)) {
              this.handleAudioOutput(data);
            }
          }
        });
        
        this.ws.on('error', (error) => {
          console.error('OpenAI Realtime WebSocket error:', error);
          reject(error);
        });
        
        this.ws.on('close', (code, reason) => {
          console.log('OpenAI Realtime WebSocket closed', { code, reason: reason?.toString() });
        });
        
      } catch (error) {
        console.error('Failed to connect to OpenAI Realtime:', error);
        reject(error);
      }
    });
  }
  
  // Handle incoming messages from OpenAI
  handleMessage(message) {
    switch (message.type) {
      case 'response.audio_transcript.delta':
        if (message.delta) {
          this.transcript += message.delta;
        }
        break;
        
      case 'response.audio_transcript.done':
        this.isResponding = false;
        this.responseLock = false;
        break;
        
      case 'response.audio.delta':
        // Audio chunks come as base64
        if (message.delta) {
          const audioBuffer = Buffer.from(message.delta, 'base64');
          this.handleAudioOutput(audioBuffer);
        }
        break;
        
      case 'response.done':
        this.isResponding = false;
        this.responseLock = false;
        break;
        
      case 'error':
        console.error('OpenAI Realtime error:', JSON.stringify(message, null, 2));
        if (message.error) {
          console.error('Error details:', JSON.stringify(message.error, null, 2));
        }
        break;
    }
  }
  
  // Build system instructions
  buildSystemInstructions() {
    const { greeting_text, faqs, business_hours, message_settings } = this.agentConfig;
    
    let instructions = `You are a helpful AI phone assistant. `;
    
    if (greeting_text) {
      instructions += `Start with this greeting: "${greeting_text}" `;
    }
    
    instructions += `\n\nBusiness hours: ${JSON.stringify(business_hours)}`;
    
    if (faqs && faqs.length > 0) {
      instructions += `\n\nFrequently Asked Questions:\n`;
      faqs.forEach((faq, index) => {
        instructions += `${index + 1}. Q: ${faq.question}\n   A: ${faq.answer}\n`;
      });
    }
    
    if (message_settings) {
      instructions += `\n\nWhen taking a message, collect: `;
      if (message_settings.ask_name) instructions += `caller's name, `;
      if (message_settings.ask_phone) instructions += `phone number, `;
      if (message_settings.ask_email) instructions += `email address, `;
      if (message_settings.ask_reason) instructions += `reason for calling. `;
    }
    
    instructions += `\n\nKeep responses concise and natural. If you can't answer a question, offer to take a message.`;
    
    return instructions;
  }
  
  // Send audio input to OpenAI
  sendAudio(audioData) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // Convert audio to base64 if it's a buffer
        const base64Audio = Buffer.isBuffer(audioData) 
          ? audioData.toString('base64')
          : audioData;
        
        this.ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64Audio,
        }));
      } catch (error) {
        console.error('Error sending audio to OpenAI:', error);
      }
    }
  }
  
  // Handle audio output from OpenAI
  handleAudioOutput(audio) {
    // This will be called by the WebSocket handler
    // Audio will be streamed back to Voximplant
    if (this.onAudioOutput) {
      this.onAudioOutput(audio);
    }
  }
  
  // Get full transcript
  getTranscript() {
    return this.transcript.trim();
  }
  
  // Close connection
  async close() {
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'session.update', session: { modalities: [] } }));
          this.ws.close();
        }
      } catch (error) {
        console.error('Error closing OpenAI connection:', error);
      }
    }
  }
  
  // Prevent overlapping responses
  async waitForResponse() {
    while (this.responseLock) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.responseLock = true;
  }
  
  // Handle interruption
  async interrupt() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isResponding) {
      try {
        this.ws.send(JSON.stringify({ type: 'response.create_interruption' }));
        this.isResponding = false;
        this.responseLock = false;
      } catch (error) {
        console.error('Error interrupting response:', error);
      }
    }
  }
}


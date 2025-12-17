/**
 * Audio format conversion utilities
 * Converts Telnyx PCMU (G.711 μ-law) at 8kHz to OpenAI PCM16 at 24kHz
 */

// G.711 μ-law to linear PCM conversion table
const MULAW_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  let sign = (i & 0x80) ? -1 : 1;
  let exponent = (i & 0x70) >> 4;
  let mantissa = (i & 0x0F) | 0x10;
  let sample = sign * ((mantissa << (exponent + 2)) - (0x84 << exponent));
  MULAW_TABLE[i] = sample;
}

/**
 * Decode G.711 μ-law (PCMU) to linear PCM16
 * @param {Buffer} mulawBuffer - Input μ-law audio buffer
 * @returns {Buffer} - Linear PCM16 buffer
 */
export function decodeMulaw(mulawBuffer) {
  // Validation
  if (!Buffer.isBuffer(mulawBuffer)) {
    throw new Error(`decodeMulaw: Expected Buffer, got ${typeof mulawBuffer}`);
  }
  if (mulawBuffer.length === 0) {
    throw new Error('decodeMulaw: Input buffer is empty');
  }
  
  const pcm16Buffer = Buffer.allocUnsafe(mulawBuffer.length * 2);
  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = MULAW_TABLE[mulawBuffer[i]];
    pcm16Buffer.writeInt16LE(sample, i * 2);
  }
  return pcm16Buffer;
}

/**
 * Simple linear resampling from 8kHz to 24kHz (3x upsampling)
 * Uses linear interpolation
 * @param {Buffer} inputBuffer - Input PCM16 buffer at 8kHz
 * @returns {Buffer} - Resampled PCM16 buffer at 24kHz
 */
export function resample8kTo24k(inputBuffer) {
  // Validation
  if (!Buffer.isBuffer(inputBuffer)) {
    throw new Error(`resample8kTo24k: Expected Buffer, got ${typeof inputBuffer}`);
  }
  if (inputBuffer.length === 0) {
    throw new Error('resample8kTo24k: Input buffer is empty');
  }
  if (inputBuffer.length % 2 !== 0) {
    throw new Error(`resample8kTo24k: Input buffer length must be even (PCM16), got ${inputBuffer.length}`);
  }
  
  // 3x upsampling: 8kHz -> 24kHz
  const inputSamples = inputBuffer.length / 2; // 16-bit samples
  const outputSamples = inputSamples * 3;
  const outputBuffer = Buffer.allocUnsafe(outputSamples * 2);
  
  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = i / 3;
    const srcIndexInt = Math.floor(srcIndex);
    const fraction = srcIndex - srcIndexInt;
    
    if (srcIndexInt >= inputSamples - 1) {
      // Last sample, just repeat
      const sample = inputBuffer.readInt16LE((inputSamples - 1) * 2);
      outputBuffer.writeInt16LE(sample, i * 2);
    } else {
      // Linear interpolation
      const sample1 = inputBuffer.readInt16LE(srcIndexInt * 2);
      const sample2 = inputBuffer.readInt16LE((srcIndexInt + 1) * 2);
      const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
      outputBuffer.writeInt16LE(interpolated, i * 2);
    }
  }
  
  return outputBuffer;
}

/**
 * Convert Telnyx PCMU audio to OpenAI PCM16 format
 * @param {Buffer} telnyxAudio - Telnyx audio buffer (PCMU at 8kHz)
 * @returns {Buffer} - OpenAI-compatible audio buffer (PCM16 at 24kHz)
 */
export function convertTelnyxToOpenAI(telnyxAudio) {
  // Validation
  if (!Buffer.isBuffer(telnyxAudio)) {
    throw new Error(`convertTelnyxToOpenAI: Expected Buffer, got ${typeof telnyxAudio}`);
  }
  if (telnyxAudio.length === 0) {
    throw new Error('convertTelnyxToOpenAI: Input buffer is empty');
  }
  
  try {
    // Step 1: Decode μ-law to linear PCM16 (8kHz)
    const pcm16_8k = decodeMulaw(telnyxAudio);
    
    // Step 2: Resample from 8kHz to 24kHz
    const pcm16_24k = resample8kTo24k(pcm16_8k);
    
    return pcm16_24k;
  } catch (error) {
    console.error('Error converting Telnyx audio to OpenAI format:', error);
    console.error('Input buffer length:', telnyxAudio?.length);
    throw error;
  }
}

/**
 * Encode linear PCM16 to G.711 μ-law (PCMU)
 * @param {Buffer} pcm16Buffer - Input linear PCM16 buffer
 * @returns {Buffer} - μ-law encoded buffer
 */
export function encodeMulaw(pcm16Buffer) {
  // Validation
  if (!Buffer.isBuffer(pcm16Buffer)) {
    throw new Error(`encodeMulaw: Expected Buffer, got ${typeof pcm16Buffer}`);
  }
  if (pcm16Buffer.length === 0) {
    throw new Error('encodeMulaw: Input buffer is empty');
  }
  if (pcm16Buffer.length % 2 !== 0) {
    throw new Error(`encodeMulaw: Input buffer length must be even (PCM16), got ${pcm16Buffer.length}`);
  }
  
  const mulawBuffer = Buffer.allocUnsafe(pcm16Buffer.length / 2);
  for (let i = 0; i < mulawBuffer.length; i++) {
    const sample = pcm16Buffer.readInt16LE(i * 2);
    let sign = sample < 0 ? 0x80 : 0x00;
    let magnitude = Math.abs(sample);
    
    // Clamp to 16-bit range
    if (magnitude > 32635) magnitude = 32635;
    
    // Add bias
    magnitude += 33;
    
    // Find exponent (0-7)
    let exponent = 7;
    for (let exp = 0; exp < 8; exp++) {
      if (magnitude <= (0x1F << (exp + 2))) {
        exponent = exp;
        break;
      }
    }
    
    // Calculate mantissa (4 bits)
    let mantissa = (magnitude >> (exponent + 3)) & 0x0F;
    
    // Combine into μ-law byte
    mulawBuffer[i] = ~(sign | (exponent << 4) | mantissa);
  }
  return mulawBuffer;
}

/**
 * Simple linear resampling from 24kHz to 8kHz (3x downsampling)
 * Uses simple decimation (takes every 3rd sample)
 * @param {Buffer} inputBuffer - Input PCM16 buffer at 24kHz
 * @returns {Buffer} - Resampled PCM16 buffer at 8kHz
 */
export function resample24kTo8k(inputBuffer) {
  // Validation
  if (!Buffer.isBuffer(inputBuffer)) {
    throw new Error(`resample24kTo8k: Expected Buffer, got ${typeof inputBuffer}`);
  }
  if (inputBuffer.length === 0) {
    throw new Error('resample24kTo8k: Input buffer is empty');
  }
  if (inputBuffer.length % 2 !== 0) {
    throw new Error(`resample24kTo8k: Input buffer length must be even (PCM16), got ${inputBuffer.length}`);
  }
  
  // 3x downsampling: 24kHz -> 8kHz
  const inputSamples = inputBuffer.length / 2; // 16-bit samples
  const outputSamples = Math.floor(inputSamples / 3);
  const outputBuffer = Buffer.allocUnsafe(outputSamples * 2);
  
  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = i * 3;
    if (srcIndex < inputSamples) {
      const sample = inputBuffer.readInt16LE(srcIndex * 2);
      outputBuffer.writeInt16LE(sample, i * 2);
    }
  }
  
  return outputBuffer;
}

/**
 * Convert OpenAI PCM16 audio to Telnyx PCMU format
 * @param {Buffer} openAIAudio - OpenAI audio buffer (PCM16 at 24kHz)
 * @returns {Buffer} - Telnyx-compatible audio buffer (PCMU at 8kHz)
 */
export function convertOpenAIToTelnyx(openAIAudio) {
  // Validation
  if (!Buffer.isBuffer(openAIAudio)) {
    throw new Error(`convertOpenAIToTelnyx: Expected Buffer, got ${typeof openAIAudio}`);
  }
  if (openAIAudio.length === 0) {
    throw new Error('convertOpenAIToTelnyx: Input buffer is empty');
  }
  if (openAIAudio.length % 2 !== 0) {
    throw new Error(`convertOpenAIToTelnyx: Input buffer length must be even (PCM16), got ${openAIAudio.length}`);
  }
  
  try {
    // Step 1: Resample from 24kHz to 8kHz
    const pcm16_8k = resample24kTo8k(openAIAudio);
    
    // Step 2: Encode linear PCM16 to μ-law (PCMU)
    const pcmu_8k = encodeMulaw(pcm16_8k);
    
    return pcmu_8k;
  } catch (error) {
    console.error('Error converting OpenAI audio to Telnyx format:', error);
    console.error('Input buffer length:', openAIAudio?.length);
    throw error;
  }
}


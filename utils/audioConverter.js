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
  try {
    // Step 1: Decode μ-law to linear PCM16 (8kHz)
    const pcm16_8k = decodeMulaw(telnyxAudio);
    
    // Step 2: Resample from 8kHz to 24kHz
    const pcm16_24k = resample8kTo24k(pcm16_8k);
    
    return pcm16_24k;
  } catch (error) {
    console.error('Error converting audio format:', error);
    throw error;
  }
}


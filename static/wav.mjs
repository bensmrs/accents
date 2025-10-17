// This module implements a simple WAV encoder


// Encode sound data to WAV
export function encodeWAV(buffers, sampleRate) {
  const totalSamples = buffers.reduce((acc, arr) => acc + arr.length, 0);
  const dataBytes = totalSamples * 2;
  const wavBuffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(wavBuffer);

  function writeStr(offset, str) {
      for (let i = 0; i < str.length; i++)
          view.setUint8(offset + i, str.charCodeAt(i));
  }

  // WAV header
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // channels = 1
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  // Samples
  let offset = 44;
  for (const block of buffers) {
    const b = block; // Float32Array
    for (let i = 0; i < b.length; i++, offset += 2) {
      // clamp to [-1,1] then convert to int16 little-endian
      let s = b[i];
      if (s > 1) s = 1; else if (s < -1) s = -1;
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

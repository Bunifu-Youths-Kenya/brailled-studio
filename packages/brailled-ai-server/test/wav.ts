// A WAV file of silence, as the editor would write it.
export const wav = (seconds = 1, changes: (bytes: Buffer) => void = () => {}) => {
  const bytes = Buffer.alloc(44 + Math.round(seconds * 16000) * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(16000, 24)
  bytes.writeUInt32LE(32000, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(bytes.length - 44, 40)
  changes(bytes)
  return { data: bytes.toString('base64'), format: 'wav' }
}

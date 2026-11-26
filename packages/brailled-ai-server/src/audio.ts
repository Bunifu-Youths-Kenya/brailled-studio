// Checks a recording the editor sends: a WAV file of one channel of 16 bit PCM at 16 kHz, as base64.
export const RATE = 16000
const HEADER_BYTES = 44
const BYTES_A_SECOND = RATE * 2

export interface Recording {
  data: string
  seconds: number
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

// The most characters a recording of so many seconds can take.
export const base64Length = (seconds: number) => Math.ceil((HEADER_BYTES + seconds * BYTES_A_SECOND) / 3) * 4

const isSound = (bytes: Buffer) =>
  bytes.length > HEADER_BYTES &&
  bytes.toString('latin1', 0, 4) === 'RIFF' &&
  bytes.readUInt32LE(4) === bytes.length - 8 &&
  bytes.toString('latin1', 8, 16) === 'WAVEfmt ' &&
  // The format block's size, PCM, one channel, the rate, and 16 bits.
  bytes.readUInt32LE(16) === 16 &&
  bytes.readUInt16LE(20) === 1 &&
  bytes.readUInt16LE(22) === 1 &&
  bytes.readUInt32LE(24) === RATE &&
  bytes.readUInt16LE(34) === 16 &&
  bytes.toString('latin1', 36, 40) === 'data' &&
  bytes.readUInt32LE(40) === bytes.length - HEADER_BYTES &&
  (bytes.length - HEADER_BYTES) % 2 === 0

// The recording, or null if it is anything else or longer than allowed.
export const readRecording = (value: unknown, maxSeconds: number): Recording | null => {
  if (!value || typeof value !== 'object') return null
  const { data, format, seconds: _, ...rest } = value as Record<string, unknown>
  if (format !== 'wav' || Object.keys(rest).length > 0) return null
  if (typeof data !== 'string' || data.length > base64Length(maxSeconds) || !BASE64.test(data)) return null
  const bytes = Buffer.from(data, 'base64')
  if (!isSound(bytes)) return null
  // Measured here, whatever the editor says.
  const seconds = (bytes.length - HEADER_BYTES) / BYTES_A_SECOND
  return seconds <= maxSeconds ? { data, seconds } : null
}

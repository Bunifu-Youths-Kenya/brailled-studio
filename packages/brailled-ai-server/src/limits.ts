// Limits how many requests are taken, per address, per minute and per day. Counts are kept in memory.
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

export interface Limits {
  perAddressPerMinute: number
  perMinute: number
  perDay: number
}

export const createRateLimiter = (limits: Limits, now: () => number = Date.now) => {
  // Times of the requests taken in the last day, oldest first.
  let taken: { time: number; address: string }[] = []

  // Takes the request, or returns how many seconds to wait before trying again.
  return (address: string): number | null => {
    const time = now()
    taken = taken.filter((request) => time - request.time < DAY)
    const recent = taken.filter((request) => time - request.time < MINUTE)
    const waits: number[] = []
    const check = (requests: typeof taken, limit: number, period: number) => {
      if (requests.length >= limit) waits.push(requests[requests.length - limit].time + period - time)
    }
    check(recent.filter((request) => request.address === address), limits.perAddressPerMinute, MINUTE)
    check(recent, limits.perMinute, MINUTE)
    check(taken, limits.perDay, DAY)
    if (waits.length > 0) return Math.ceil(Math.max(...waits) / 1000)
    taken.push({ time, address })
    return null
  }
}

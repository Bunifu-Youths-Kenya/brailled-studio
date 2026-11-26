// A daily allowance of something counted, such as characters read aloud. Kept in memory.
const DAY = 24 * 60 * 60 * 1000

export const createAllowance = (perDay: number, now: () => number = Date.now) => {
  let taken: { time: number; amount: number }[] = []
  return {
    // Takes the amount if there is enough of the day's allowance left.
    take: (amount: number): boolean => {
      const time = now()
      taken = taken.filter((item) => time - item.time < DAY)
      const used = taken.reduce((sum, item) => sum + item.amount, 0)
      if (used + amount > perDay) return false
      taken.push({ time, amount })
      return true
    },
  }
}

export const DOMAIN_WEIGHTS = {
  data_quality: 0.25,
  automation:   0.20,
  security:     0.15,
  knowledge:    0.15,
  metadata:     0.10,
  adoption:     0.10,
  limits:       0.05,
} as const

export const HARD_BLOCKER_THRESHOLD = 50

// Source: IBM IBV 2025-26, 150-300 user orgs
export const INDUSTRY_BENCHMARKS: Record<keyof typeof DOMAIN_WEIGHTS, number> = {
  data_quality: 54,
  automation:   58,
  security:     69,
  knowledge:    38,
  metadata:     55,
  adoption:     68,
  limits:       77,
}

export interface DomainScore {
  domain:    string
  score:     number
  isBlocker: boolean
  weight:    number
}

export interface ScoredResult {
  domains:      DomainScore[]
  overallIndex: number
  hardBlockers: string[]
}

/**
 * Maps a metric value to a 0–100 score using ordered bands (best → worst, descending min).
 * Interpolates linearly within the matched band. Last entry must have min: 0.
 *
 * Example bands for a completion-rate metric:
 *   [{ min: 80, scoreFloor: 80, scoreCeil: 100 },
 *    { min: 70, scoreFloor: 65, scoreCeil: 79 },
 *    { min: 50, scoreFloor: 40, scoreCeil: 64 },
 *    { min: 0,  scoreFloor: 0,  scoreCeil: 39 }]
 */
export function bandScore(
  value: number,
  bands: Array<{ min: number; scoreFloor: number; scoreCeil: number }>
): number {
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i]
    if (value >= band.min) {
      // Upper boundary of this band is the previous band's min (or scoreCeil for the top band)
      const upperBound = i === 0 ? band.scoreCeil : bands[i - 1].min
      const bandWidth  = upperBound - band.min
      if (bandWidth <= 0 || band.scoreCeil === band.scoreFloor) return band.scoreFloor
      const position = Math.min(Math.max((value - band.min) / bandWidth, 0), 1)
      return Math.round(band.scoreFloor + position * (band.scoreCeil - band.scoreFloor))
    }
  }
  return 0
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max)
}

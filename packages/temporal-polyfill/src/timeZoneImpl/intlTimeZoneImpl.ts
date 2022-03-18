import { hashIntlFormatParts, normalizeShortEra } from '../dateUtils/intlFormat'
import { epochNanoToISOYear, isoToEpochMilli, isoYearToEpochSeconds } from '../dateUtils/isoMath'
import { milliInSecond, nanoInSecond, nanoInSecondBI, secondsInDay } from '../dateUtils/units'
import { OrigDateTimeFormat } from '../native/intlUtils'
import { compareValues } from '../utils/math'
import { specialCases } from './specialCases'
import { RawTransition, TimeZoneImpl } from './timeZoneImpl'

// Europe/Amsterdam and America/New_York have long gaps
// see timezone.spec.ts
// TODO: this is probably very expensive for timezones WITHOUT transitions
const MAX_YEAR_TRAVEL = 100

const ISLAND_SEARCH_DAYS = [
  182, // 50% through year
  91, // 25% through year
  273, // 75% through year
]

// TODO: general question: why not use minutes internally instead of seconds?

export class IntlTimeZoneImpl extends TimeZoneImpl {
  private format: Intl.DateTimeFormat

  // a cache of second offsets at the last second of each year
  private yearEndOffsets: { [year: string]: number }

  private transitionsInYear: { [year: string]: RawTransition[] }

  constructor(id: string) {
    const format = new OrigDateTimeFormat('en-GB', { // gives 24-hour clock
      era: 'short',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      timeZone: id,
    })
    super(format.resolvedOptions().timeZone)
    this.format = format
    this.yearEndOffsets = {}
    this.transitionsInYear = specialCases[id] || {}
  }

  // `zoneNano` is like epochNano, but from zone's pseudo-epoch
  getPossibleOffsets(zoneNano: bigint): number[] {
    let lastOffsetNano: number | undefined

    const transitions = [
      this.getTransition(zoneNano, -1),
      this.getTransition(zoneNano - 1n, 1), // subtract 1 b/c getTransition is always exclusive
    ].filter(Boolean) as RawTransition[]

    // loop transitions from past to future
    for (const transition of transitions) {
      const [transitionEpochNano, offsetNanoBefore, offsetNanoAfter] = transition
      // FYI, a transition's switchover to offsetNanoAfter happens
      // *inclusively* as transitionEpochNano

      // two possibilities (no guarantee of chronology)
      const epochNanoA = zoneNano - BigInt(offsetNanoBefore)
      const epochNanoB = zoneNano - BigInt(offsetNanoAfter)

      // is the transition after both possibilities?
      if (transitionEpochNano > epochNanoA && transitionEpochNano > epochNanoB) {
        return [offsetNanoBefore]

      // is the transition before both possibilities?
      } else if (transitionEpochNano <= epochNanoA && transitionEpochNano <= epochNanoB) {
        // keep looping...

      // stuck in a transition?
      } else {
        return [offsetNanoBefore, offsetNanoAfter]
      }

      lastOffsetNano = offsetNanoAfter
    }

    // only found transitions before zoneSecs
    if (lastOffsetNano !== undefined) {
      return [lastOffsetNano]
    }

    // found no transitions?
    return [
      this.getYearEndOffsetSec(epochNanoToISOYear(zoneNano)) * nanoInSecond,
    ]
  }

  getOffset(epochNano: bigint): number {
    return this.getOffsetForEpochSecs(Number(epochNano / nanoInSecondBI)) * nanoInSecond
  }

  private getOffsetForEpochSecs(epochSec: number): number {
    // NOTE: if Intl.DateTimeFormat's timeZoneName:'shortOffset' option were available,
    // we could parse that.
    const map = hashIntlFormatParts(this.format, epochSec * milliInSecond)

    let year = parseInt(map.year)
    if (normalizeShortEra(map.era) === 'bce') {
      year = -(year - 1)
    }

    const zoneMilli = isoToEpochMilli(
      year,
      parseInt(map.month),
      parseInt(map.day),
      parseInt(map.hour),
      parseInt(map.minute),
      parseInt(map.second),
    )
    const zoneSecs = Math.floor(zoneMilli / milliInSecond)

    return zoneSecs - epochSec
  }

  /*
  Always exclusive. Will never return a transition that starts exactly on epochSec
  */
  getTransition(epochNano: bigint, direction: -1 | 1): RawTransition | undefined {
    const startYear = epochNanoToISOYear(epochNano)

    for (let yearTravel = 0; yearTravel < MAX_YEAR_TRAVEL; yearTravel++) {
      const year = startYear + yearTravel * direction
      const transitions = this.getTransitionsInYear(year)
      const len = transitions.length
      const startIndex = direction < 0 ? len - 1 : 0

      for (let travel = 0; travel < len; travel++) {
        const transition = transitions[startIndex + travel * direction]

        // does the current transition overtake epochNano in the direction of travel?
        if (compareValues(transition[0], epochNano) === direction) {
          return transition
        }
      }
    }
  }

  private getYearEndOffsetSec(utcYear: number): number {
    const { yearEndOffsets } = this
    return yearEndOffsets[utcYear] ||
      (yearEndOffsets[utcYear] = this.getOffsetForEpochSecs(
        isoYearToEpochSeconds(utcYear + 1) - 1,
      ))
  }

  private getTransitionsInYear(utcYear: number): RawTransition[] {
    const { transitionsInYear } = this
    return transitionsInYear[utcYear] ||
      (transitionsInYear[utcYear] = this.computeTransitionsInYear(utcYear))
  }

  private computeTransitionsInYear(utcYear: number): RawTransition[] {
    const startOffsetSec = this.getYearEndOffsetSec(utcYear - 1) // right before start of year
    const endOffsetSec = this.getYearEndOffsetSec(utcYear) // at end of year
    // FYI, a transition could be in the first second of the year, thus the exclusiveness

    // TODO: make a isoYearEndEpochSeconds util? use in getYearEndOffsetSec?
    const startEpochSec = isoYearToEpochSeconds(utcYear) - 1
    const endEpochSec = isoYearToEpochSeconds(utcYear + 1) - 1

    if (startOffsetSec !== endOffsetSec) {
      return [this.searchTransition(startEpochSec, endEpochSec, startOffsetSec, endOffsetSec)]
    }

    const island = this.searchIsland(startOffsetSec, startEpochSec)
    if (island !== undefined) {
      return [
        this.searchTransition(startEpochSec, island[0], startOffsetSec, island[1]),
        this.searchTransition(island[0], endEpochSec, island[1], endOffsetSec),
      ]
    }

    return []
  }

  // assumes the offset changes at some point between startSecs -> endSecs.
  // finds the point where it switches over to the new offset.
  private searchTransition(
    startEpochSec: number,
    endEpochSec: number,
    startOffsetSec: number,
    endOffsetSec: number,
  ): RawTransition {
    // keep doing binary search until start/end are 1 second apart
    while (endEpochSec - startEpochSec > 1) {
      const middleEpochSecs = Math.floor(startEpochSec + (endEpochSec - startEpochSec) / 2)
      const middleOffsetSecs = this.getOffsetForEpochSecs(middleEpochSecs)

      if (middleOffsetSecs === startOffsetSec) {
        // middle is same as start. move start to the middle
        startEpochSec = middleEpochSecs
      } else {
        // middle is same as end. move end to the middle
        endEpochSec = middleEpochSecs
      }
    }
    return [
      BigInt(endEpochSec) * nanoInSecondBI,
      startOffsetSec * nanoInSecond,
      endOffsetSec * nanoInSecond,
    ]
  }

  // assumes the offset is the same at startSecs and endSecs.
  // pokes around the time in-between to see if there's a temporary switchover.
  private searchIsland(
    outerOffsetSec: number,
    startEpochSec: number,
  ): [number, number] | undefined { // [epochSec, offsetSec]
    for (const days of ISLAND_SEARCH_DAYS) {
      const epochSec = startEpochSec + days * secondsInDay
      const offsetSec = this.getOffsetForEpochSecs(epochSec)
      if (offsetSec !== outerOffsetSec) {
        return [epochSec, offsetSec]
      }
    }
  }
}

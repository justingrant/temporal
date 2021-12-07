import { DAY, UnitInt, nanoIn, nanoInDay } from '../dateUtils/units'
import { RoundingOptions, Unit } from '../public/types'
import { RoundingFunc } from '../utils/math'
import { ensureOptionsObj, isObjectLike } from './refine'
import { parseRoundingModeOption } from './roundingMode'
import { parseUnit } from './unitStr'

export interface RoundingConfig<UnitType extends UnitInt = UnitInt> {
  smallestUnit: UnitType
  roundingMode: RoundingFunc
  roundingIncrement: number
}

export function parseRoundingOptions<
  UnitArgType extends Unit,
  UnitType extends UnitInt
>(
  options: Partial<RoundingOptions<UnitArgType>> | undefined,
  smallestUnitDefault: UnitType | undefined,
  minUnit: UnitType,
  maxUnit: UnitType,
  forDiffing?: boolean,
): RoundingConfig<UnitType> {
  if (smallestUnitDefault === undefined && !isObjectLike(options)) {
    throw new TypeError('Need rounding options')
  }

  const ensuredOptions = ensureOptionsObj(options)
  const roundingIncrement = ensuredOptions.roundingIncrement ?? 1
  const smallestUnit = parseUnit(ensuredOptions.smallestUnit, smallestUnitDefault, minUnit, maxUnit)

  if (smallestUnit < DAY) {
    const currentNano = nanoIn[smallestUnit]

    if (forDiffing) {
      const higherNano = nanoIn[smallestUnit + 1]

      if (higherNano % roundingIncrement) {
        throw new RangeError('roundingIncrement does not divide evenly into next highest unit')
      }
      if (higherNano <= roundingIncrement * currentNano) {
        throw new RangeError('roundingIncrement must be less than next highest unit')
      }
    } else {
      if (nanoInDay % roundingIncrement * currentNano) {
        throw new RangeError('Increment must evenly divide into 24 hours')
      }
    }
  }

  return {
    smallestUnit,
    roundingMode: parseRoundingModeOption(options, forDiffing ? Math.trunc : Math.round),
    roundingIncrement,
  }
}

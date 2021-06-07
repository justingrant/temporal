import { mstoIsoDate } from './convert'
import { Duration } from './duration'
import { PlainDate } from './plainDateTime'
import { asRoundOptions } from './round'
import {
  AssignmentOptionsLike,
  AssignmentOptions,
  RoundOptionsLike,
  UNIT_INCREMENT,
  Part,
  CompareReturn,
} from './types'
import {
  asDate,
  comparePlainDate,
  dateValue,
  reduceFormat,
  toUnitMs,
} from './utils'

export type CalendarId =
  | 'buddhist'
  | 'chinese'
  | 'coptic'
  | 'ethiopia'
  | 'ethiopic'
  | 'gregory'
  | 'hebrew'
  | 'indian'
  | 'islamic'
  | 'iso8601'
  | 'japanese'
  | 'persian'
  | 'roc'

type CalendarDate = {
  year: number
  month: number
  day: number
}

// Diff Utils
const diffYears = (
  one: Part<CalendarDate, 'year'>,
  two: Part<CalendarDate, 'year'>,
  calendar: Calendar,
  rejectOverflow: boolean
): [number, CalendarDate] => {
  let current = { month: 1, day: 1, ...one }
  const end = { month: 1, day: 1, ...two }

  let years = end.year - current.year
  current = addYears(current, years, calendar, rejectOverflow)

  if (compareCalendarDates(current, end, calendar) > 0) {
    current.year--
    years--
  }
  return [years, current]
}

const diffMonths = (
  one: Part<CalendarDate, 'year' | 'month'>,
  two: Part<CalendarDate, 'year' | 'month'>,
  calendar: Calendar,
  rejectOverflow: boolean
): [number, CalendarDate] => {
  let current = { day: 1, ...one }
  const end = { day: 1, ...two }

  let months = 0

  while (current.year < end.year) {
    current.year++
    months += calendar.monthsInYear(calendar.dateFromFields(current))
  }

  if (compareCalendarDates(current, end, calendar) > 0) {
    current.year--
    months--
  }
  months += end.month - current.month

  current = addMonths(current, months, calendar, rejectOverflow)

  if (compareCalendarDates(current, end, calendar) > 0) {
    current.month--
    months--
  }

  return [months, current]
}

const diffDays = (one: PlainDate, two: PlainDate): number => {
  return Math.trunc((dateValue(two) - dateValue(one)) / toUnitMs('days'))
}

// Add Utils
const addYears = (
  date: Part<CalendarDate, 'year'>,
  years: number,
  calendar: Calendar,
  rejectOverflow = false
): CalendarDate => {
  const fullDate: CalendarDate = {
    year: date.year + years,
    month: date.month || 1,
    day: date.day || 1,
  }
  return {
    ...fullDate,
    month: handleMonthOverflow(calendar, fullDate, rejectOverflow),
  }
}

const addMonths = (
  date: CalendarDate,
  months: number,
  calendar: Calendar,
  rejectOverflow = false
): CalendarDate => {
  const fullDate: CalendarDate = {
    year: date.year,
    month: date.month + months,
    day: date.day || 1,
  }
  return {
    ...fullDate,
    day: handleDayOverflow(calendar, fullDate, rejectOverflow),
  }
}

const addDays = (date: PlainDate, days: number): PlainDate => {
  return mstoIsoDate(dateValue(date) + days * toUnitMs('days'))
}

// Conversion Utils
const isoToCal = (date: PlainDate, calendar: Calendar): CalendarDate => {
  return {
    year: calendar.year(date),
    month: calendar.month(date),
    day: calendar.day(date),
  }
}

const compareCalendarDates = (
  one: CalendarDate,
  two: CalendarDate,
  calendar: Calendar
): CompareReturn => {
  return comparePlainDate(
    calendar.dateFromFields(one),
    calendar.dateFromFields(two)
  )
}

// Overflow Utils
const handleMonthOverflow = (
  calendar: Calendar,
  fields: CalendarDate,
  rejectOverflow: boolean
): number => {
  const { isoYear, isoMonth } =
    'year' in fields ? calendar.dateFromFields(fields) : fields
  const totalMonths = calendar.monthsInYear({ isoYear }) + 1

  if (rejectOverflow && isoMonth > totalMonths) {
    throw new Error('Month overflow is disabled')
  }
  return isoMonth % totalMonths
}

const handleDayOverflow = (
  calendar: Calendar,
  fields: CalendarDate,
  rejectOverflow: boolean
): number => {
  const { isoYear, isoMonth, isoDay } =
    'year' in fields ? calendar.dateFromFields(fields) : fields
  const totalDays = calendar.daysInMonth({ isoYear, isoMonth }) + 1

  if (rejectOverflow && isoDay > totalDays) {
    throw new Error('Day overflow is disabled')
  }
  return isoDay % totalDays
}

export class Calendar {
  private formatter: Intl.DateTimeFormat

  constructor(readonly id: CalendarId = 'iso8601') {
    this.formatter = Intl.DateTimeFormat('en-us', {
      calendar: this.id,
      weekday: 'long',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    })
  }

  year({ isoYear }: Part<PlainDate, 'isoYear'>): number {
    return reduceFormat({ isoYear, isoMonth: 1, isoDay: 1 }, this.formatter)[
      'year'
    ] as number
  }
  month({
    isoYear,
    isoMonth,
  }: Part<PlainDate, 'isoYear' | 'isoMonth'>): number {
    return reduceFormat({ isoYear, isoMonth, isoDay: 1 }, this.formatter)[
      'month'
    ] as number
  }
  day(dt: PlainDate): number {
    return reduceFormat(dt, this.formatter)['day'] as number
  }

  // IN methods
  daysInWeek(): number {
    return UNIT_INCREMENT.WEEK
  }
  daysInMonth({
    isoYear,
    isoMonth,
  }: Part<PlainDate, 'isoYear' | 'isoMonth'>): number {
    return asDate({ isoYear, isoMonth: isoMonth + 1 }).getUTCDate()
  }
  daysInYear({ isoYear }: Part<PlainDate, 'isoYear'>): number {
    return asDate({ isoYear: isoYear + 1 }).getUTCDate()
  }
  monthsInYear({ isoYear }: Part<PlainDate, 'isoYear'>): number {
    return asDate({ isoYear: isoYear + 1, isoDay: 0 }).getUTCMonth() + 1
  }

  // OF methods
  dayOfWeek(dt: PlainDate): string {
    return reduceFormat(dt, this.formatter)['weekday'] as string
  }
  dayOfYear(dt: PlainDate): number {
    return this.dateUntil(
      { isoYear: dt.isoYear, isoMonth: 0, isoDay: 1 },
      dt
    ).total({ unit: 'days' })
  }
  weekOfYear(dt: PlainDate): number {
    return Math.ceil(
      ((dateValue(dt) - dateValue({ isoYear: dt.isoYear, isoMonth: 1 })) /
        toUnitMs('days') +
        1) /
        UNIT_INCREMENT.WEEK
    )
  }

  // Boolean methods
  inLeapYear({ isoYear }: PlainDate): boolean {
    return isoYear % 400 === 0 || (isoYear % 4 === 0 && isoYear % 100 !== 0)
  }

  dateFromFields(
    fields: Part<CalendarDate, 'year' | 'month'>,
    options?: AssignmentOptions
  ): PlainDate {
    // FIXME: Overflow does nothing
    const overflow = options?.overflow || 'constrain'
    return {
      isoYear: fields.year,
      isoMonth: fields.month,
      isoDay: fields.day || 1,
    }
  }

  // Calendar Math
  dateAdd(
    date: PlainDate,
    duration: Duration,
    options?: AssignmentOptionsLike
  ): PlainDate {
    const { years, months, weeks, days } = duration
    let fields: CalendarDate = {
      year: this.year(date),
      month: this.month(date),
      day: this.day(date),
    }
    const rejectOverflow = options?.overflow === 'reject'
    fields = addYears(fields, years, this, rejectOverflow)
    fields = addMonths(fields, months, this, rejectOverflow)
    const { isoYear, isoMonth, isoDay } = addDays(
      this.dateFromFields(fields),
      days + weeks * UNIT_INCREMENT.WEEK
    )
    return { isoYear, isoMonth, isoDay }
  }
  dateUntil(
    one: PlainDate,
    two: PlainDate,
    options?: RoundOptionsLike
  ): Duration {
    const { largestUnit } = asRoundOptions(options)

    const negative =
      compareCalendarDates(isoToCal(one, this), isoToCal(two, this), this) > 0
    let current = isoToCal(negative ? two : one, this)
    const end = isoToCal(negative ? one : two, this)
    let years = 0,
      months = 0,
      weeks = 0,
      days = 0

    switch (largestUnit) {
      case 'years':
        ;[years, current] = diffYears(current, end, this, false)
      case 'months':
        ;[months, current] = diffMonths(current, end, this, false)
      case 'weeks':
      case 'days':
      default:
        days = diffDays(this.dateFromFields(current), negative ? one : two)
    }

    if (largestUnit === 'weeks') {
      weeks = Math.trunc(days / UNIT_INCREMENT.WEEK)
      days = days % UNIT_INCREMENT.WEEK
    }

    const dur = new Duration(years, months, weeks, days)
    return negative ? dur.negated() : dur
  }
}


export type ValueOf<T> = T[keyof T]

// The `object` type is literally required for WeakMap
// eslint-disable-next-line @typescript-eslint/ban-types
export function createWeakMap<Subject extends object, Storage>(): [
  (obj: Subject) => Storage, // getter
  (obj: Subject, storage: Storage) => void // setter
] {
  const map = new WeakMap<Subject, Storage>()
  return [
    map.get.bind(map) as (obj: Subject) => Storage, // assume always previously set
    map.set.bind(map),
  ]
}

export function attachGetters<Obj>(
  ObjClass: { prototype: Obj },
  getters: { [methodName: string]: (this: Obj) => unknown },
): void {
  Object.defineProperties(
    ObjClass.prototype,
    mapHash(
      getters,
      (func) => ({ get: func }),
    ),
  )
}

export function mapHash<Hash, ResType>(
  hash: Hash,
  func: (input: ValueOf<Hash>, key: string) => ResType,
): { [Key in keyof Hash]: ResType } {
  const res = {} as { [Key in keyof Hash]: ResType }
  for (const key in hash) {
    res[key] = func(hash[key], key)
  }
  return res
}

export function strArrayToHash<FieldType>(
  strs: string[],
  func: (str: string, index: number) => FieldType,
): { [key: string]: FieldType } {
  const res: { [key: string]: FieldType } = {}
  strs.forEach((str, i) => {
    res[str] = func(str, i)
  })
  return res
}

export function throwNew(ErrorClass: { new(message: string): Error }, message: string): any {
  throw new ErrorClass(message)
}

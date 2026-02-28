export function deepCloneJSON<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    const arr = new Array(obj.length);
    for (let i = 0; i < obj.length; i++) {
      arr[i] = obj[i] === undefined ? null : deepCloneJSON(obj[i]);
    }
    return arr as unknown as T;
  }

  const result: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val !== undefined) {
        if (typeof val === 'function' || typeof val === 'symbol') {
          // JSON.stringify omits functions and symbols
          continue;
        }
        if (val !== null && typeof val === 'object' && typeof (val as any).toJSON === 'function') {
          result[key] = (val as any).toJSON();
        } else {
          result[key] = deepCloneJSON(val);
        }
      }
    }
  }
  return result as T;
}

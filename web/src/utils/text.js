const INVISIBLE = /[ ​-‏‪-‮⁠﻿]/g

export function sanitizeEmail(value) {
  return String(value ?? '').replace(INVISIBLE, '').trim()
}

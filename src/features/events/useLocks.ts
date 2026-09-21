import { useContext } from 'react'
import { LocksContext, type LocksContextValue } from './locksContext'

export function useLocks(): LocksContextValue {
  const value = useContext(LocksContext)
  if (value === null) {
    throw new Error('useLocks must be used within a <LocksProvider>')
  }
  return value
}

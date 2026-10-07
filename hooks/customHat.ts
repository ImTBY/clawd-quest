import type { CustomHat } from '../types'

// A hat Claude designed for one project: pixel rows over a small palette, '.' is empty.
// Anything off is repaired or dropped, so a hat can always be drawn safely.

const MAX_W = 16
const MAX_H = 8 // taller hats would reach the spellbook and thought bubble above Clawd

// Unicode-safe text: keeps every language, drops control, zero-width and bidi characters.
// (A copy of projectQuests' clean(): customHat must not import projectQuests, which imports it.)
function clean(text: unknown, max: number): string {
  const s = String(text ?? '')
    .normalize('NFC')
    .replace(/[\p{Cc}​-‏‪-‮⁠-⁩﻿؜]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(s).slice(0, max).join('').trim()
}

// One row as code points; a row wider than MAX_W loses the same amount from both sides (it stays centred),
// anything that is not a string is an empty row.
function cells(row: unknown): string[] {
  if (typeof row !== 'string') return []
  const all = Array.from(row)
  const cut = all.length - MAX_W
  return cut > 0 ? all.slice(Math.floor(cut / 2), Math.floor(cut / 2) + MAX_W) : all
}

export function sanitizeHat(raw: unknown): CustomHat | null {
  const h = (raw ?? {}) as Record<string, unknown>
  if (!Array.isArray(h.rows) || typeof h.palette !== 'object' || h.palette === null) return null

  const palette: Record<string, string> = {}
  for (const [key, value] of Object.entries(h.palette as Record<string, unknown>)) {
    if (/^[a-zA-Z]$/.test(key) && typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) palette[key] = value
  }
  if (Object.keys(palette).length === 0) return null

  // the last rows are kept: the brim sits on the head
  const rows = (h.rows as unknown[])
    .map(cells)
    .filter(row => row.length > 0)
    .slice(-MAX_H)
  if (rows.length < 2) return null
  const width = Math.max(...rows.map(row => row.length))
  if (width < 4) return null
  const fixed = rows.map(row => [...row, ...Array<string>(width - row.length).fill('.')].map(ch => (palette[ch] ? ch : '.')).join(''))
  if (!fixed.some(row => /[^.]/.test(row))) return null

  const name = clean(h.name, 32) || 'Project Hat'
  const id = clean(h.id ?? name, 64).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32).replace(/-$/, '') || 'hat'
  return { id, name, rows: fixed, palette }
}

// The worn hat as read back from the store: drawn like any custom hat, but its id stays as saved (up to 52
// characters, case kept, the way the board loader keeps it), so the Wardrobe still finds the board hat it is.
export function sanitizeWornHat(raw: unknown): CustomHat | null {
  const hat = sanitizeHat(raw)
  if (!hat) return null
  const id = clean((raw as Record<string, unknown>).id, 52)
  return id ? { ...hat, id } : hat
}

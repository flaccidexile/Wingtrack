import fs from 'fs'
import path from 'path'

const DATA_DIR = path.resolve(__dirname, '../../data')
const METADATA_FILE = path.join(DATA_DIR, 'product_metadata.json')

let cache: Record<string, string> | null = null

function ensureLoaded(): Record<string, string> {
  if (cache) return cache
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    if (fs.existsSync(METADATA_FILE)) {
      const raw = fs.readFileSync(METADATA_FILE, 'utf-8')
      cache = JSON.parse(raw)
      return cache || {}
    }
  } catch (err) {
    console.error('[productMetadata] Failed to load metadata cache:', err)
  }
  cache = {}
  return cache
}

function persist(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(METADATA_FILE, JSON.stringify(cache || {}, null, 2), 'utf-8')
  } catch (err) {
    console.error('[productMetadata] Failed to persist metadata cache:', err)
  }
}

export function getProductType(productId: string): string {
  const map = ensureLoaded()
  return map[productId] || 'Regular'
}

export function setProductType(productId: string, type: string): void {
  const map = ensureLoaded()
  map[productId] = type
  persist()
}

export function getAllProductTypes(): Record<string, string> {
  return { ...ensureLoaded() }
}

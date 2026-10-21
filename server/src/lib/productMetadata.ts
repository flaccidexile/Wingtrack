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

// ── Unit Cost Persistence (Fallback / Local Cache) ─────────
const COSTS_FILE = path.join(DATA_DIR, 'product_costs.json')
let costCache: Record<string, number> | null = null

function ensureCostLoaded(): Record<string, number> {
  if (costCache) return costCache
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    if (fs.existsSync(COSTS_FILE)) {
      const raw = fs.readFileSync(COSTS_FILE, 'utf-8')
      costCache = JSON.parse(raw)
      return costCache || {}
    }
  } catch (err) {
    console.error('[productMetadata] Failed to load cost cache:', err)
  }
  costCache = {}
  return costCache
}

function persistCosts(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(COSTS_FILE, JSON.stringify(costCache || {}, null, 2), 'utf-8')
  } catch (err) {
    console.error('[productMetadata] Failed to persist cost cache:', err)
  }
}

export function getProductCost(productId: string): number {
  const map = ensureCostLoaded()
  return typeof map[productId] === 'number' ? map[productId] : 0
}

export function setProductCost(productId: string, cost: number): void {
  const map = ensureCostLoaded()
  map[productId] = Math.round(Number(cost || 0) * 100) / 100
  persistCosts()
}

export function getAllProductCosts(): Record<string, number> {
  return { ...ensureCostLoaded() }
}

// ── Order Item Cost Persistence (Historical cost fallback) ──
const ORDER_ITEM_COSTS_FILE = path.join(DATA_DIR, 'order_item_costs.json')
let orderItemCostCache: Record<string, number> | null = null

function ensureOrderItemCostsLoaded(): Record<string, number> {
  if (orderItemCostCache) return orderItemCostCache
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    if (fs.existsSync(ORDER_ITEM_COSTS_FILE)) {
      const raw = fs.readFileSync(ORDER_ITEM_COSTS_FILE, 'utf-8')
      orderItemCostCache = JSON.parse(raw)
      return orderItemCostCache || {}
    }
  } catch (err) {
    console.error('[productMetadata] Failed to load order item cost cache:', err)
  }
  orderItemCostCache = {}
  return orderItemCostCache
}

function persistOrderItemCosts(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(ORDER_ITEM_COSTS_FILE, JSON.stringify(orderItemCostCache || {}, null, 2), 'utf-8')
  } catch (err) {
    console.error('[productMetadata] Failed to persist order item cost cache:', err)
  }
}

export function getOrderItemCost(orderItemId: string): number | null {
  const map = ensureOrderItemCostsLoaded()
  return typeof map[orderItemId] === 'number' ? map[orderItemId] : null
}

export function setOrderItemCost(orderItemId: string, cost: number): void {
  const map = ensureOrderItemCostsLoaded()
  map[orderItemId] = Math.round(Number(cost || 0) * 100) / 100
  persistOrderItemCosts()
}

export function setOrderItemCosts(items: Array<{ id: string; cost: number }>): void {
  const map = ensureOrderItemCostsLoaded()
  for (const item of items) {
    if (item.id) {
      map[item.id] = Math.round(Number(item.cost || 0) * 100) / 100
    }
  }
  persistOrderItemCosts()
}

export function getAllOrderItemCosts(): Record<string, number> {
  return { ...ensureOrderItemCostsLoaded() }
}


import fs from 'fs'
import path from 'path'

const DATA_DIR = path.resolve(__dirname, '../../data')
const METADATA_FILE = path.join(DATA_DIR, 'product_metadata.json')

/**
 * Fallback caches can hold records that were inserted manually to represent
 * previous (historical) data. Those records wrap their real value together
 * with a `note: 'inserted'` marker, e.g. `{ value: 'cash', note: 'inserted' }`.
 * Records written automatically at checkout stay plain scalars. Readers unwrap
 * via `unwrapNoted()` so both shapes behave identically to the rest of the app.
 */
type NotedValue<T> = T | { value: T; note?: string }

function unwrapNoted<T>(entry: NotedValue<T> | undefined | null): T | null {
  if (entry === undefined || entry === null) return null
  if (typeof entry === 'object' && entry !== null && 'value' in (entry as Record<string, unknown>)) {
    return (entry as { value: T }).value
  }
  return entry as T
}

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
let orderItemCostCache: Record<string, NotedValue<number>> | null = null

function ensureOrderItemCostsLoaded(): Record<string, NotedValue<number>> {
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
  const value = unwrapNoted(map[orderItemId])
  return typeof value === 'number' ? value : null
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
  const map = ensureOrderItemCostsLoaded()
  const out: Record<string, number> = {}
  for (const [id, entry] of Object.entries(map)) {
    const value = unwrapNoted(entry)
    if (typeof value === 'number') out[id] = value
  }
  return out
}

// ── Order Payment Method Persistence (Distinguishes GCash vs Maya) ──
const ORDER_PAYMENT_METHODS_FILE = path.join(DATA_DIR, 'order_payment_methods.json')
let orderPaymentMethodCache: Record<string, NotedValue<string>> | null = null

function ensureOrderPaymentMethodsLoaded(): Record<string, NotedValue<string>> {
  if (orderPaymentMethodCache) return orderPaymentMethodCache
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    if (fs.existsSync(ORDER_PAYMENT_METHODS_FILE)) {
      const raw = fs.readFileSync(ORDER_PAYMENT_METHODS_FILE, 'utf-8')
      orderPaymentMethodCache = JSON.parse(raw)
      return orderPaymentMethodCache || {}
    }
  } catch (err) {
    console.error('[productMetadata] Failed to load order payment method cache:', err)
  }
  orderPaymentMethodCache = {}
  return orderPaymentMethodCache
}

function persistOrderPaymentMethods(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(ORDER_PAYMENT_METHODS_FILE, JSON.stringify(orderPaymentMethodCache || {}, null, 2), 'utf-8')
  } catch (err) {
    console.error('[productMetadata] Failed to persist order payment method cache:', err)
  }
}

export function getOrderPaymentMethod(orderId: string): string | null {
  const map = ensureOrderPaymentMethodsLoaded()
  const value = unwrapNoted(map[orderId])
  return typeof value === 'string' ? value : null
}

export function setOrderPaymentMethod(orderId: string, method: string): void {
  const map = ensureOrderPaymentMethodsLoaded()
  map[orderId] = method
  persistOrderPaymentMethods()
}

export function getAllOrderPaymentMethods(): Record<string, string> {
  const map = ensureOrderPaymentMethodsLoaded()
  const out: Record<string, string> = {}
  for (const [id, entry] of Object.entries(map)) {
    const value = unwrapNoted(entry)
    if (typeof value === 'string') out[id] = value
  }
  return out
}

// ── Inventory Item Metadata Persistence (Expiration Date & Lead Time) ──
export interface InventoryItemMeta {
  expiration_date?: string | null
  lead_time_days?: number
}

const INVENTORY_META_FILE = path.join(DATA_DIR, 'inventory_metadata.json')
let inventoryMetaCache: Record<string, InventoryItemMeta> | null = null

function ensureInventoryMetaLoaded(): Record<string, InventoryItemMeta> {
  if (inventoryMetaCache) return inventoryMetaCache
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    if (fs.existsSync(INVENTORY_META_FILE)) {
      const raw = fs.readFileSync(INVENTORY_META_FILE, 'utf-8')
      inventoryMetaCache = JSON.parse(raw)
      return inventoryMetaCache || {}
    }
  } catch (err) {
    console.error('[productMetadata] Failed to load inventory metadata cache:', err)
  }
  inventoryMetaCache = {}
  return inventoryMetaCache
}

function persistInventoryMeta(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(INVENTORY_META_FILE, JSON.stringify(inventoryMetaCache || {}, null, 2), 'utf-8')
  } catch (err) {
    console.error('[productMetadata] Failed to persist inventory metadata cache:', err)
  }
}

export function getInventoryMeta(itemId: string): InventoryItemMeta {
  const map = ensureInventoryMetaLoaded()
  return map[itemId] || {}
}

export function setInventoryMeta(itemId: string, patch: InventoryItemMeta): void {
  const map = ensureInventoryMetaLoaded()
  const existing = map[itemId] || {}
  map[itemId] = {
    ...existing,
    ...(patch.expiration_date !== undefined ? { expiration_date: patch.expiration_date } : {}),
    ...(typeof patch.lead_time_days === 'number' && Number.isFinite(patch.lead_time_days)
      ? { lead_time_days: Math.max(1, Math.round(patch.lead_time_days)) }
      : {}),
  }
  persistInventoryMeta()
}

export function getAllInventoryMeta(): Record<string, InventoryItemMeta> {
  return { ...ensureInventoryMetaLoaded() }
}

// ── Order Extra Metadata (Order Type, Table #, SC/PWD Discount, Payment Ref) ──
export interface OrderExtraMeta {
  order_type?: 'dine_in' | 'take_out' | 'delivery'
  table_number?: string | null
  discount_type?: 'none' | 'senior' | 'pwd'
  discount_id?: string | null
  discount_amount?: number
  payment_reference?: string | null
  /** Present ("inserted") on records manually back-filled to represent previous data. */
  note?: string
}

const ORDER_META_FILE = path.join(DATA_DIR, 'order_metadata.json')
let orderMetaCache: Record<string, OrderExtraMeta> | null = null

function ensureOrderMetaLoaded(): Record<string, OrderExtraMeta> {
  if (orderMetaCache) return orderMetaCache
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    if (fs.existsSync(ORDER_META_FILE)) {
      const raw = fs.readFileSync(ORDER_META_FILE, 'utf-8')
      orderMetaCache = JSON.parse(raw)
      return orderMetaCache || {}
    }
  } catch (err) {
    console.error('[productMetadata] Failed to load order metadata cache:', err)
  }
  orderMetaCache = {}
  return orderMetaCache
}

function persistOrderMeta(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    fs.writeFileSync(ORDER_META_FILE, JSON.stringify(orderMetaCache || {}, null, 2), 'utf-8')
  } catch (err) {
    console.error('[productMetadata] Failed to persist order metadata cache:', err)
  }
}

export function setOrderExtraMeta(orderId: string, meta: OrderExtraMeta): void {
  const map = ensureOrderMetaLoaded()
  map[orderId] = { ...meta }
  persistOrderMeta()
}

export function getAllOrderExtraMeta(): Record<string, OrderExtraMeta> {
  return { ...ensureOrderMetaLoaded() }
}





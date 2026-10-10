// Shared TypeScript types for the WINGTRACK system

export type StaffRole = 'admin' | 'cashier' | 'inventory_personnel'

export interface StaffProfile {
  id: string
  user_id: string
  full_name: string
  email: string
  role: StaffRole
  is_active: boolean
  created_at: string
}

export interface ProductCategory {
  id: string
  name: string
  sort_order: number
}

export interface ProductRecipe {
  id?: string
  inventory_id: string
  qty_per_unit: number
  inventory?: {
    name: string
    unit: string
    stock_qty?: number
  }
}

export interface Product {
  id: string
  name: string
  category_id: string
  category?: ProductCategory
  price: number
  is_available: boolean
  image_url?: string
  recipes?: ProductRecipe[]
}

export interface InventoryItem {
  id: string
  name: string
  category: string
  unit: string
  stock_qty: number
  min_stock_level: number
  unit_cost: number
  supplier?: string
  status: 'ok' | 'low' | 'critical'
  updated_at: string
}

export interface Order {
  id: string
  order_number: number
  cashier_id: string
  cashier?: StaffProfile
  status: 'open' | 'completed' | 'void'
  payment_method: 'cash' | 'gcash' | 'card'
  subtotal: number
  vat_amount: number
  total_amount: number
  notes?: string
  created_at: string
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
  line_total: number
}

export interface CartItem extends Product {
  qty: number
}

// API payload shapes
export interface CheckoutPayload {
  items: { product_id: string; quantity: number }[]
  payment_method: 'cash' | 'gcash' | 'card'
  notes?: string
}

export interface InventoryAdjustmentPayload {
  inventory_id: string
  qty_change: number
  movement_type: 'restock' | 'adjustment' | 'waste'
  notes?: string
}

export interface InventoryMovement {
  id: string
  inventory_id: string
  order_id?: string | null
  movement_type: 'restock' | 'deduction' | 'adjustment' | 'waste'
  qty_change: number
  qty_before: number
  qty_after: number
  performed_by?: string | null
  notes?: string | null
  created_at: string
  inventory?: { name: string; unit: string }
  staff?: { full_name: string }
}

export interface CreateInventoryItemPayload {
  name: string
  category: string
  unit: string
  stock_qty?: number
  min_stock_level?: number
  unit_cost?: number
  supplier?: string
}


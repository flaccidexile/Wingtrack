import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

/** Upper bound for a menu price. Keeps values inside the numeric(10,2) column. */
const MAX_PRICE = 1_000_000
/** Upper bound for a recipe quantity per unit sold. */
const MAX_QTY_PER_UNIT = 1_000_000

/**
 * Validate a price coming from the client.
 * Returns the normalised number, or an error message.
 */
function parsePrice(raw: unknown): { ok: true; value: number } | { ok: false; message: string } {
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    return { ok: false, message: 'Price must be a number.' }
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return { ok: false, message: 'Price must be a valid number.' }
  }
  if (value < 0) {
    return { ok: false, message: 'Price must be 0 or greater.' }
  }
  if (value > MAX_PRICE) {
    return { ok: false, message: `Price must not exceed ${MAX_PRICE.toLocaleString()}.` }
  }
  return { ok: true, value: Math.round(value * 100) / 100 }
}

/**
 * Validate and normalise the recipe list.
 * Silently drops malformed rows rather than failing the whole request,
 * but never lets a non-finite / out-of-range quantity reach the database.
 */
function parseRecipes(
  raw: unknown,
  productId: string,
): Array<{ product_id: string; inventory_id: string; qty_per_unit: number }> {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is { inventory_id?: unknown; qty_per_unit?: unknown } => !!r && typeof r === 'object')
    .map(r => {
      const qty = Number(r.qty_per_unit)
      return { inventory_id: typeof r.inventory_id === 'string' ? r.inventory_id : '', qty }
    })
    .filter(
      r =>
        r.inventory_id !== '' &&
        Number.isFinite(r.qty) &&
        r.qty > 0 &&
        r.qty <= MAX_QTY_PER_UNIT,
    )
    .map(r => ({
      product_id: productId,
      inventory_id: r.inventory_id,
      qty_per_unit: r.qty,
    }))
}

/**
 * GET /api/products
 * List all products, optionally including inactive/unavailable items.
 * Authenticated users (cashier, admin, inventory) can view.
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*, category:product_categories(id, name, sort_order), recipes:product_recipes(id, inventory_id, qty_per_unit, inventory:inventory(name, unit, stock_qty))')
      .order('name')

    if (error) throw error
    res.json(data)
  } catch (err: unknown) {
    console.error('[Products] Failed to list products:', err)
    res.status(500).json({ message: 'Failed to fetch products.' })
  }
})

/**
 * GET /api/products/categories
 * List all product categories.
 */
router.get('/categories', requireAuth, async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('product_categories')
      .select('*')
      .order('sort_order')

    if (error) throw error
    res.json(data)
  } catch (err: unknown) {
    console.error('[Products] Failed to list categories:', err)
    res.status(500).json({ message: 'Failed to fetch categories.' })
  }
})

/**
 * POST /api/products/categories
 * Add a new product category (Admin only).
 */
router.post('/categories', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { name } = req.body as { name?: string }
  if (!name?.trim()) {
    res.status(400).json({ message: 'Category name is required.' })
    return
  }

  try {
    const { data: countData } = await supabaseAdmin
      .from('product_categories')
      .select('sort_order', { count: 'exact' })

    const nextOrder = (countData?.length ?? 0) + 1

    const { data, error } = await supabaseAdmin
      .from('product_categories')
      .insert({ name: name.trim(), sort_order: nextOrder })
      .select()
      .single()

    if (error) throw error
    res.status(201).json(data)
  } catch (err: unknown) {
    console.error('[Products] Failed to create category:', err)
    res.status(500).json({ message: 'Failed to create category.' })
  }
})

/**
 * POST /api/products
 * Create a new menu product (Admin only).
 * Supports adding recipe ingredient mappings at the same time.
 */
router.post('/', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { name, category_id, price, is_available = true, image_url, recipes } = req.body as {
    name?: string
    category_id?: string
    price?: number
    is_available?: boolean
    image_url?: string
    recipes?: Array<{ inventory_id: string; qty_per_unit: number }>
  }

  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ message: 'Product name is required.' })
    return
  }

  if (typeof category_id !== 'string' || !category_id) {
    res.status(400).json({ message: 'Category is required.' })
    return
  }

  if (price == null) {
    res.status(400).json({ message: 'Price is required.' })
    return
  }

  const parsedPrice = parsePrice(price)
  if (!parsedPrice.ok) {
    res.status(400).json({ message: parsedPrice.message })
    return
  }

  try {
    // 1. Insert product
    const { data: newProduct, error: prodErr } = await supabaseAdmin
      .from('products')
      .insert({
        name: name.trim().slice(0, 120),
        category_id,
        price: parsedPrice.value,
        is_available: Boolean(is_available),
        image_url: typeof image_url === 'string' ? image_url.trim().slice(0, 500) || null : null,
      })
      .select('*, category:product_categories(id, name, sort_order)')
      .single()

    if (prodErr) {
      if (prodErr.code === '23503') {
        res.status(400).json({ message: 'That category no longer exists. Please pick another one.' })
        return
      }
      throw prodErr
    }

    // 2. Insert recipes if provided
    const validRecipes = parseRecipes(recipes, newProduct.id)
    if (validRecipes.length > 0) {
      const { error: recErr } = await supabaseAdmin
        .from('product_recipes')
        .insert(validRecipes)

      if (recErr) {
        // Roll the product back so the caller never ends up with a half-created item.
        console.warn('[Products] Recipe mapping failed — rolling back product creation:', recErr)
        const { error: rollbackErr } = await supabaseAdmin.from('products').delete().eq('id', newProduct.id)
        if (rollbackErr) {
          console.error('CRITICAL: failed to roll back product after recipe failure:', rollbackErr)
        }
        res.status(400).json({ message: 'Could not save the recipe ingredients, so the product was not created. Please check the ingredient quantities and try again.' })
        return
      }
    }

    res.status(201).json(newProduct)
  } catch (err: unknown) {
    // Log the real error server-side; never hand raw database text to the client.
    console.error('[Products] Failed to create product:', err)
    res.status(500).json({ message: 'Failed to create product. Please try again.' })
  }
})

/**
 * PATCH /api/products/:id
 * Update product details and optionally update recipe ingredients (Admin only).
 */
router.patch('/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params as { id: string }
  const { name, category_id, price, is_available, image_url, recipes } = req.body as {
    name?: string
    category_id?: string
    price?: number
    is_available?: boolean
    image_url?: string
    recipes?: Array<{ inventory_id: string; qty_per_unit: number }>
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ message: 'Product name cannot be empty.' })
      return
    }
    updates.name = name.trim().slice(0, 120)
  }
  if (category_id !== undefined) {
    if (typeof category_id !== 'string' || !category_id) {
      res.status(400).json({ message: 'Category cannot be empty.' })
      return
    }
    updates.category_id = category_id
  }
  if (price !== undefined) {
    const parsedPrice = parsePrice(price)
    if (!parsedPrice.ok) {
      res.status(400).json({ message: parsedPrice.message })
      return
    }
    updates.price = parsedPrice.value
  }
  if (is_available !== undefined) updates.is_available = Boolean(is_available)
  if (image_url !== undefined) {
    updates.image_url = typeof image_url === 'string' ? image_url.trim().slice(0, 500) || null : null
  }

  try {
    const { data: updatedProduct, error: updateErr } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .select('*, category:product_categories(id, name, sort_order)')
      .maybeSingle()

    if (updateErr) {
      if (updateErr.code === '23503') {
        res.status(400).json({ message: 'That category no longer exists. Please pick another one.' })
        return
      }
      throw updateErr
    }

    if (!updatedProduct) {
      res.status(404).json({ message: 'Product not found.' })
      return
    }

    // Update recipes if provided
    if (recipes && Array.isArray(recipes)) {
      // Delete existing recipes for this product
      await supabaseAdmin.from('product_recipes').delete().eq('product_id', id)

      const validRecipes = parseRecipes(recipes, id)
      if (validRecipes.length > 0) {
        const { error: recErr } = await supabaseAdmin.from('product_recipes').insert(validRecipes)
        if (recErr) {
          console.warn('[Products] Recipe update had an error:', recErr)
          res.status(400).json({ message: 'Product details were saved, but the recipe ingredients could not be. Please review the ingredient quantities.' })
          return
        }
      }
    }

    res.json(updatedProduct)
  } catch (err: unknown) {
    console.error('[Products] Failed to update product:', err)
    res.status(500).json({ message: 'Failed to update product. Please try again.' })
  }
})

/**
 * PATCH /api/products/:id/toggle
 * Quickly toggle availability (Admin only).
 */
router.patch('/:id/toggle', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params
  const { is_available } = req.body as { is_available: boolean }

  try {
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ is_available, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, name, is_available')
      .single()

    if (error) throw error
    res.json(data)
  } catch (err: unknown) {
    console.error('[Products] Failed to toggle product:', err)
    res.status(500).json({ message: 'Failed to update product availability.' })
  }
})

/**
 * DELETE /api/products/:id
 * Delete a product (Admin only).
 */
router.delete('/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params

  try {
    // First remove recipe mappings
    await supabaseAdmin.from('product_recipes').delete().eq('product_id', id)

    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id)

    if (error) {
      if (error.code === '23503') {
        res.status(400).json({
          message: 'Cannot delete product because it has past order records. You can toggle it to "Out of Stock" / unavailable instead.'
        })
        return
      }
      throw error
    }

    res.json({ message: 'Product deleted successfully.' })
  } catch (err: unknown) {
    console.error('[Products] Failed to delete product:', err)
    res.status(500).json({ message: 'Failed to delete product.' })
  }
})

export default router

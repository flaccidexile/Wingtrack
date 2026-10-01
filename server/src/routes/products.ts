import { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

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

  if (!name?.trim() || !category_id || price == null) {
    res.status(400).json({ message: 'Name, category, and price are required.' })
    return
  }

  if (Number(price) < 0) {
    res.status(400).json({ message: 'Price must be 0 or greater.' })
    return
  }

  try {
    // 1. Insert product
    const { data: newProduct, error: prodErr } = await supabaseAdmin
      .from('products')
      .insert({
        name: name.trim(),
        category_id,
        price: Number(price),
        is_available,
        image_url: image_url?.trim() || null,
      })
      .select('*, category:product_categories(id, name, sort_order)')
      .single()

    if (prodErr) throw prodErr

    // 2. Insert recipes if provided
    if (recipes && Array.isArray(recipes) && recipes.length > 0) {
      const validRecipes = recipes
        .filter(r => r.inventory_id && Number(r.qty_per_unit) > 0)
        .map(r => ({
          product_id: newProduct.id,
          inventory_id: r.inventory_id,
          qty_per_unit: Number(r.qty_per_unit),
        }))

      if (validRecipes.length > 0) {
        const { error: recErr } = await supabaseAdmin
          .from('product_recipes')
          .insert(validRecipes)

        if (recErr) {
          console.warn('[Products] Product created, but recipe mapping had error:', recErr)
        }
      }
    }

    res.status(201).json(newProduct)
  } catch (err: unknown) {
    console.error('[Products] Failed to create product:', err)
    res.status(500).json({ message: (err as Error).message || 'Failed to create product.' })
  }
})

/**
 * PATCH /api/products/:id
 * Update product details and optionally update recipe ingredients (Admin only).
 */
router.patch('/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { id } = req.params
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
  if (name !== undefined) updates.name = name.trim()
  if (category_id !== undefined) updates.category_id = category_id
  if (price !== undefined) updates.price = Number(price)
  if (is_available !== undefined) updates.is_available = is_available
  if (image_url !== undefined) updates.image_url = image_url?.trim() || null

  try {
    const { data: updatedProduct, error: updateErr } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .select('*, category:product_categories(id, name, sort_order)')
      .single()

    if (updateErr) throw updateErr

    // Update recipes if provided
    if (recipes && Array.isArray(recipes)) {
      // Delete existing recipes for this product
      await supabaseAdmin.from('product_recipes').delete().eq('product_id', id)

      const validRecipes = recipes
        .filter(r => r.inventory_id && Number(r.qty_per_unit) > 0)
        .map(r => ({
          product_id: id,
          inventory_id: r.inventory_id,
          qty_per_unit: Number(r.qty_per_unit),
        }))

      if (validRecipes.length > 0) {
        await supabaseAdmin.from('product_recipes').insert(validRecipes)
      }
    }

    res.json(updatedProduct)
  } catch (err: unknown) {
    console.error('[Products] Failed to update product:', err)
    res.status(500).json({ message: (err as Error).message || 'Failed to update product.' })
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

import express, { Router, type Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireRole } from '../middleware/rbac'
import { supabaseAdmin } from '../lib/supabase'

const router = Router()

/** Upper bound for a menu price. Keeps values inside the numeric(10,2) column. */
const MAX_PRICE = 1_000_000
/** Upper bound for a recipe quantity per unit sold. */
const MAX_QTY_PER_UNIT = 1_000_000

/** Dish photos are capped at 5 MB, matching the avatar upload in staff.ts. */
const MAX_MENU_IMAGE_BYTES = 5 * 1024 * 1024

/** Image types the product-images bucket accepts. */
const MENU_IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * Bucket holding dish photos.
 *
 * This is the bucket the seeded menu already uses, so uploads and the existing
 * catalogue share one naming scheme — and replacing a seeded photo actually
 * cleans the old object up rather than orphaning it in a second bucket.
 *
 * Deliberately separate from `avatars`: the two are policed differently (these
 * are public marketing images, those are people), and keeping them apart means
 * clearing one can never touch the other.
 */
const PRODUCT_IMAGE_BUCKET = 'product-images'

/** Rejects a malformed `:id` before it reaches Postgres. */
function requireUuidParam(req: AuthenticatedRequest, res: Response): string | null {
  const id = String(req.params.id ?? '')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    // Without this guard Postgres raises `invalid input syntax for type uuid`,
    // which surfaces to the client as a 500 echoing the raw database error.
    res.status(400).json({ message: 'Invalid product id.' })
    return null
  }
  return id
}

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

// ── Dish photos ──────────────────────────────────────────────
/*
 * Uploads mirror the staff-avatar path in `staff.ts`, and for the same reason:
 * the bytes are written with the service-role key, so photos work on a project
 * where the Storage RLS policies have not been created yet. The client never
 * talks to Storage directly.
 *
 * The image is uploaded to its own endpoint AFTER the product row exists,
 * rather than being part of the create payload. That keeps one write path for
 * photos (so "add" and "change" cannot drift apart) and means the object path
 * can be keyed on a real product id.
 */

/**
 * Creates the `product-images` bucket if it is missing.
 *
 * A fresh project will not have it, and a missing bucket surfaces to the user
 * as an opaque upload failure. Creating it on demand keeps the feature
 * self-contained.
 */
async function ensureProductImagesBucket() {
  try {
    const { data } = await supabaseAdmin.storage.getBucket(PRODUCT_IMAGE_BUCKET)
    if (data) return
  } catch {
    // getBucket throws when the bucket is absent — fall through and create it.
  }

  const { error } = await supabaseAdmin.storage.createBucket(PRODUCT_IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: MAX_MENU_IMAGE_BYTES,
    allowedMimeTypes: Object.keys(MENU_IMAGE_MIME),
  })

  // A concurrent request may have created it first; that is not a failure.
  if (error && !/already exists/i.test(error.message)) {
    console.warn('[Products] Could not create the product-images bucket:', error.message)
  }
}

/**
 * Validates the raw image body of a dish-photo upload.
 *
 * Returns the decoded buffer plus the extension to store it under, or null
 * after having already sent the failure response — so callers can simply
 * `if (!image) return`.
 */
function readMenuImageUpload(
  req: AuthenticatedRequest,
  res: Response,
): { body: Buffer; contentType: string; ext: string } | null {
  const contentType = String(req.headers['content-type'] ?? '').split(';')[0].trim()
  const ext = MENU_IMAGE_MIME[contentType]

  if (!ext) {
    res.status(415).json({ message: 'Only JPG, PNG or WebP images are supported.' })
    return null
  }

  const body = req.body as Buffer
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ message: 'The uploaded file is empty.' })
    return null
  }
  if (body.length > MAX_MENU_IMAGE_BYTES) {
    res.status(413).json({ message: 'Image must be 5 MB or smaller.' })
    return null
  }

  return { body, contentType, ext }
}

/**
 * Writes image bytes to the product-images bucket and returns the public URL.
 *
 * The filename carries a timestamp so a replaced photo is served from a new
 * URL. This is load-bearing, not tidiness: the bucket is public and served
 * through a CDN that honours `cacheControl`, so a deleted object can keep
 * answering 200 from an edge node for up to an hour. Overwriting a fixed
 * filename would therefore leave browsers showing the old dish photo long
 * after the new one was uploaded.
 */
async function storeMenuImageObject(
  productId: string,
  body: Buffer,
  contentType: string,
  ext: string,
): Promise<{ url: string } | { error: string }> {
  await ensureProductImagesBucket()

  const path = `${productId}/dish-${Date.now()}.${ext}`
  const { error } = await supabaseAdmin.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, body, { contentType, upsert: true, cacheControl: '3600' })

  if (error) return { error: error.message }

  const { data } = supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}

/** Deletes the stored object behind a dish-photo URL. Best effort by design. */
async function deleteMenuImageObject(url: string | null | undefined) {
  const path = url?.split(`/${PRODUCT_IMAGE_BUCKET}/`)[1]
  if (!path) return
  await supabaseAdmin.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]).catch(() => undefined)
}

/** Express middleware chain for a raw image body. */
const rawImage = express.raw({ type: Object.keys(MENU_IMAGE_MIME), limit: MAX_MENU_IMAGE_BYTES })

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
 * POST /api/products/:id/image
 * Upload or replace a menu item's photo (Admin only).
 *
 * The request body is the raw image bytes (`Content-Type: image/png` etc.)
 * rather than multipart form data — a single file field does not justify a
 * multipart parser. `express.json()` ignores non-JSON content types, so the
 * buffer arrives intact.
 */
router.post('/:id/image', requireAuth, requireRole('admin'), rawImage, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = requireUuidParam(req, res)
  if (!id) return

  const image = readMenuImageUpload(req, res)
  if (!image) return

  try {
    const { data: product, error: lookupErr } = await supabaseAdmin
      .from('products')
      .select('id, image_url')
      .eq('id', id)
      .maybeSingle()

    if (lookupErr) throw lookupErr
    if (!product) {
      res.status(404).json({ message: 'Menu item not found.' })
      return
    }

    const stored = await storeMenuImageObject(id, image.body, image.contentType, image.ext)
    if ('error' in stored) {
      res.status(500).json({ message: `Upload failed: ${stored.error}` })
      return
    }

    const { data: updated, error: saveErr } = await supabaseAdmin
      .from('products')
      .update({ image_url: stored.url, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, category:product_categories(id, name, sort_order)')
      .maybeSingle()

    if (saveErr) throw saveErr
    if (!updated) {
      res.status(404).json({ message: 'Menu item not found.' })
      return
    }

    // Only bin the previous file once the new URL is durably stored, and never
    // delete the object we have just written.
    if (product.image_url && product.image_url !== stored.url) {
      await deleteMenuImageObject(product.image_url)
    }

    res.json(updated)
  } catch (err: unknown) {
    console.error('[Products] Failed to upload menu image:', err)
    res.status(500).json({ message: 'Failed to upload the photo. Please try again.' })
  }
})

/**
 * DELETE /api/products/:id/image
 * Remove a menu item's photo and return it to the placeholder (Admin only).
 */
router.delete('/:id/image', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = requireUuidParam(req, res)
  if (!id) return

  try {
    const { data: product, error: lookupErr } = await supabaseAdmin
      .from('products')
      .select('id, image_url')
      .eq('id', id)
      .maybeSingle()

    if (lookupErr) throw lookupErr
    if (!product) {
      res.status(404).json({ message: 'Menu item not found.' })
      return
    }

    const { data: updated, error: saveErr } = await supabaseAdmin
      .from('products')
      .update({ image_url: null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, category:product_categories(id, name, sort_order)')
      .maybeSingle()

    if (saveErr) throw saveErr
    if (!updated) {
      res.status(404).json({ message: 'Menu item not found.' })
      return
    }

    await deleteMenuImageObject(product.image_url)

    res.json(updated)
  } catch (err: unknown) {
    console.error('[Products] Failed to remove menu image:', err)
    res.status(500).json({ message: 'Failed to remove the photo. Please try again.' })
  }
})

/**
 * DELETE /api/products/:id
 * Delete a product (Admin only).
 */
router.delete('/:id', requireAuth, requireRole('admin'), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const id = String(req.params.id ?? '')

  try {
    // Read the photo first: once the row is gone there is nothing left to tell
    // us which object in the bucket belonged to it.
    const { data: doomed } = await supabaseAdmin
      .from('products')
      .select('image_url')
      .eq('id', id)
      .maybeSingle()

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

    // Best effort: a leftover object is untidy, not a reason to report failure.
    await deleteMenuImageObject(doomed?.image_url)

    res.json({ message: 'Product deleted successfully.' })
  } catch (err: unknown) {
    console.error('[Products] Failed to delete product:', err)
    res.status(500).json({ message: 'Failed to delete product.' })
  }
})

export default router

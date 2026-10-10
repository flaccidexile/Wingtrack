import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  apiGetProducts,
  apiGetCategories,
  apiCreateCategory,
  apiCreateProduct,
  apiUpdateProduct,
  apiToggleProductAvailability,
  apiDeleteProduct,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { Product, ProductCategory, InventoryItem } from '@/types'

interface RecipeRow {
  inventory_id: string
  qty_per_unit: number | string
}

export default function MenuManager() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCat, setSelectedCat] = useState('All')

  // Modals
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showCategoryModal, setShowCategoryModal] = useState(false)

  // Item form state
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('Regular')
  const [formCatId, setFormCatId] = useState('')
  const [formPrice, setFormPrice] = useState('')
  const [formAvailable, setFormAvailable] = useState(true)
  const [formRecipes, setFormRecipes] = useState<RecipeRow[]>([])
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Category form state
  const [newCatName, setNewCatName] = useState('')
  const [catLoading, setCatLoading] = useState(false)
  const [catError, setCatError] = useState<string | null>(null)

  // Feedback banner
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showBanner = (type: 'success' | 'error', message: string) => {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 4000)
  }

  useEffect(() => {
    if (showItemModal || showCategoryModal) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [showItemModal, showCategoryModal])

  const loadData = useCallback(async () => {
    try {
      const [prods, cats, invRes] = await Promise.all([
        apiGetProducts(),
        apiGetCategories(),
        supabase.from('inventory').select('id, name, unit, stock_qty').order('name'),
      ])

      setProducts(prods)
      setCategories(cats)
      if (invRes.data) {
        setInventoryList(invRes.data as InventoryItem[])
      }
    } catch (err: unknown) {
      console.error('Failed to load menu data:', err)
      showBanner('error', 'Failed to load menu data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function openCreateModal() {
    setEditingProduct(null)
    setFormName('')
    setFormType('Regular')
    setFormCatId(categories[0]?.id || '')
    setFormPrice('')
    setFormAvailable(true)
    setFormRecipes([])
    setFormError(null)
    setShowItemModal(true)
  }

  function openEditModal(prod: Product) {
    setEditingProduct(prod)
    setFormName(prod.name)
    setFormType((prod as Product & { product_type?: string }).product_type ?? 'Regular')
    setFormCatId(prod.category_id)
    setFormPrice(String(prod.price))
    setFormAvailable(prod.is_available)
    setFormRecipes(
      prod.recipes?.map(r => ({
        inventory_id: r.inventory_id,
        qty_per_unit: r.qty_per_unit,
      })) || []
    )
    setFormError(null)
    setShowItemModal(true)
  }

  function addRecipeRow() {
    if (inventoryList.length === 0) return
    setFormRecipes(prev => [...prev, { inventory_id: inventoryList[0].id, qty_per_unit: 1 }])
  }

  function updateRecipeRow(index: number, field: keyof RecipeRow, value: string | number) {
    setFormRecipes(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function removeRecipeRow(index: number) {
    setFormRecipes(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!formName.trim()) {
      setFormError('Item name is required.')
      return
    }
    if (!formCatId) {
      setFormError('Please select a category.')
      return
    }
    const priceNum = Number(formPrice)
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError('Please enter a valid price (>= 0).')
      return
    }
    if (priceNum > 10000) {
      setFormError('Price cannot exceed ₱10,000.00. Please enter a valid amount.')
      return
    }

    // Validate recipes
    const recipesPayload = formRecipes
      .filter(r => r.inventory_id && Number(r.qty_per_unit) > 0)
      .map(r => ({
        inventory_id: r.inventory_id,
        qty_per_unit: Number(r.qty_per_unit),
      }))

    setFormLoading(true)
    try {
      if (editingProduct) {
        await apiUpdateProduct(editingProduct.id, {
          name: formName.trim(),
          category_id: formCatId,
          price: priceNum,
          is_available: formAvailable,
          recipes: recipesPayload,
        })
        showBanner('success', `"${formName}" updated successfully.`)
      } else {
        await apiCreateProduct({
          name: formName.trim(),
          category_id: formCatId,
          price: priceNum,
          is_available: formAvailable,
          recipes: recipesPayload,
        })
        showBanner('success', `"${formName}" added to the menu!`)
      }

      setShowItemModal(false)
      await loadData()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to save product')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleToggleAvailability(prod: Product) {
    const nextState = !prod.is_available
    try {
      await apiToggleProductAvailability(prod.id, nextState)
      setProducts(prev =>
        prev.map(p => (p.id === prod.id ? { ...p, is_available: nextState } : p))
      )
      showBanner(
        'success',
        `"${prod.name}" marked as ${nextState ? 'Available' : 'Out of Stock'}.`
      )
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to toggle availability')
    }
  }

  async function handleDeleteProduct(prod: Product) {
    if (!confirm(`Are you sure you want to delete "${prod.name}" from the menu?`)) return
    try {
      await apiDeleteProduct(prod.id)
      setProducts(prev => prev.filter(p => p.id !== prod.id))
      showBanner('success', `"${prod.name}" deleted from menu.`)
    } catch (err: unknown) {
      showBanner('error', err instanceof Error ? err.message : 'Failed to delete product')
    }
  }

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault()
    setCatError(null)
    if (!newCatName.trim()) {
      setCatError('Category name is required.')
      return
    }

    setCatLoading(true)
    try {
      const created = await apiCreateCategory(newCatName.trim())
      setCategories(prev => [...prev, created])
      setFormCatId(created.id)
      setNewCatName('')
      setShowCategoryModal(false)
      showBanner('success', `Category "${created.name}" created!`)
    } catch (err: unknown) {
      setCatError(err instanceof Error ? err.message : 'Failed to create category')
    } finally {
      setCatLoading(false)
    }
  }

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchesCat =
      selectedCat === 'All' ||
      (p.category as ProductCategory | undefined)?.name === selectedCat
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.category as ProductCategory | undefined)?.name?.toLowerCase().includes(search.toLowerCase())
    return matchesCat && matchesSearch
  })

  // Summary counts
  const totalItems = products.length
  const activeItems = products.filter(p => p.is_available).length
  const outOfStockItems = totalItems - activeItems

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 28,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'Fraunces',
              fontSize: 32,
              fontWeight: 700,
              color: 'var(--foreground)',
              marginBottom: 6,
            }}
          >
            Menu & Food Items
          </h1>
          <p style={{ fontSize: 15, color: 'var(--muted-foreground)' }}>
            Add new food items, update prices, configure raw ingredient consumption, and toggle POS availability.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            id="btn-add-category"
            className="btn-ghost"
            onClick={() => {
              setCatError(null)
              setNewCatName('')
              setShowCategoryModal(true)
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
            + Add Category
          </button>

          <button
            id="btn-add-food-item"
            className="btn-primary"
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 14 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            + Add Food Item
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {banner && (
        <div
          className="fade-in"
          style={{
            padding: '12px 18px',
            borderRadius: 8,
            marginBottom: 20,
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: banner.type === 'success' ? '#e8f5e9' : '#fee2e2',
            color: banner.type === 'success' ? '#15803d' : '#991b1b',
            border: `1px solid ${banner.type === 'success' ? '#86efac' : '#fca5a5'}`,
          }}
        >
          <span>{banner.message}</span>
          <button
            onClick={() => setBanner(null)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 700 }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        <div className="card" style={{ padding: '20px 22px' }}>
          <p style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Total Menu Items
          </p>
          <p style={{ fontFamily: 'Fraunces', fontSize: 30, fontWeight: 700, color: 'var(--foreground)' }}>
            {totalItems}
          </p>
        </div>

        <div className="card" style={{ padding: '20px 22px' }}>
          <p style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Active in POS
          </p>
          <p style={{ fontFamily: 'Fraunces', fontSize: 30, fontWeight: 700, color: '#15803d' }}>
            {activeItems}
          </p>
        </div>

        <div className="card" style={{ padding: '20px 22px' }}>
          <p style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Out of Stock
          </p>
          <p style={{ fontFamily: 'Fraunces', fontSize: 30, fontWeight: 700, color: outOfStockItems > 0 ? '#b91c1c' : 'var(--muted-foreground)' }}>
            {outOfStockItems}
          </p>
        </div>

        <div className="card" style={{ padding: '20px 22px' }}>
          <p style={{ fontSize: 12, fontFamily: 'DM Mono', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Categories
          </p>
          <p style={{ fontFamily: 'Fraunces', fontSize: 30, fontWeight: 700, color: 'var(--primary)' }}>
            {categories.length}
          </p>
        </div>
      </div>

      {/* Filters and search */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginBottom: 24,
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedCat('All')}
            style={{
              padding: '7px 16px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid var(--border)',
              background: selectedCat === 'All' ? 'var(--primary)' : 'var(--card)',
              color: selectedCat === 'All' ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
              transition: 'all 0.15s',
            }}
          >
            All ({totalItems})
          </button>
          {categories.map(c => {
            const count = products.filter(p => (p.category as ProductCategory | undefined)?.name === c.name).length
            const active = selectedCat === c.name
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCat(c.name)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: '1px solid var(--border)',
                  background: active ? 'var(--primary)' : 'var(--card)',
                  color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  transition: 'all 0.15s',
                }}
              >
                {c.name} ({count})
              </button>
            )
          })}
        </div>

        <input
          id="menu-search-input"
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search food name or category..."
          style={{ width: 280, padding: '9px 14px', fontSize: 13 }}
        />
      </div>

      {/* Products Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '50px 20px',
            textAlign: 'center',
            color: 'var(--muted-foreground)',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: '0 auto 14px', opacity: 0.6 }}
          >
            <circle cx="12" cy="12" r="10"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--foreground)' }}>No food items found</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>
            {search || selectedCat !== 'All'
              ? 'Try changing your search query or filter category.'
              : 'Click "+ Add Food Item" above to add your first menu dish!'}
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
                  <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', fontSize: 12 }}>ITEM NAME</th>
                  <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', fontSize: 12 }}>CATEGORY</th>
                  <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', fontSize: 12 }}>PRICE</th>
                  <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', fontSize: 12 }}>INVENTORY RECIPE</th>
                  <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', fontSize: 12, textAlign: 'center' }}>POS STATUS</th>
                  <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', fontSize: 12, textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(prod => {
                  const catName = (prod.category as ProductCategory | undefined)?.name ?? '—'
                  const recipeCount = prod.recipes?.length ?? 0
                  const prodType = (prod as Product & { product_type?: string }).product_type ?? 'Regular'
                  const typeConfig: Record<string, { label: string; bg: string; color: string }> = {
                    Bestseller: { label: 'Bestseller', bg: '#fff7e6', color: '#b45309' },
                    New:        { label: 'New',        bg: '#e8f5e9', color: '#15803d' },
                    Seasonal:   { label: 'Seasonal',   bg: '#fce8e8', color: '#b91c1c' },
                    Special:    { label: 'Special',    bg: '#f0f4ff', color: '#4338ca' },
                    Regular:    { label: 'Regular',    bg: 'transparent', color: 'var(--muted-foreground)' },
                  }
                  const tc = typeConfig[prodType] ?? typeConfig.Regular

                  return (
                    <tr
                      key={prod.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background 0.15s',
                        opacity: prod.is_available ? 1 : 0.65,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.015)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Name */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>
                            {prod.name}
                          </span>
                          {prodType !== 'Regular' && (
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: tc.bg, color: tc.color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {tc.label}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '16px 20px' }}>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 500,
                            background: 'rgba(155,94,40,0.1)',
                            color: 'var(--primary)',
                            fontFamily: 'DM Mono',
                          }}
                        >
                          {catName}
                        </span>
                      </td>

                      {/* Price */}
                      <td style={{ padding: '16px 20px', fontFamily: 'DM Mono', fontWeight: 700, fontSize: 15, color: 'var(--foreground)' }}>
                        &#8369;{Number(prod.price).toFixed(2)}
                      </td>

                      {/* Inventory Recipe */}
                      <td style={{ padding: '16px 20px' }}>
                        {recipeCount === 0 ? (
                          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                            None linked
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 300 }}>
                            {prod.recipes?.map((r, i) => (
                              <span
                                key={i}
                                style={{
                                  fontSize: 11,
                                  background: 'rgba(0,0,0,0.05)',
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  color: 'var(--foreground)',
                                  fontFamily: 'DM Mono',
                                }}
                              >
                                {r.inventory?.name ?? 'Item'} &times; {r.qty_per_unit} {r.inventory?.unit ?? ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* POS Availability */}
                      <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleToggleAvailability(prod)}
                          title="Click to toggle availability"
                          style={{
                            padding: '5px 12px',
                            borderRadius: 14,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: 'none',
                            transition: 'all 0.15s',
                            background: prod.is_available ? '#e8f5e9' : '#fee2e2',
                            color: prod.is_available ? '#15803d' : '#991b1b',
                          }}
                        >
                          {prod.is_available ? 'In Stock' : 'Out of Stock'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => openEditModal(prod)}
                            className="btn-ghost"
                            style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6 }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(prod)}
                            style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              borderRadius: 6,
                              border: '1px solid #fee2e2',
                              background: '#fff5f5',
                              color: '#b91c1c',
                              cursor: 'pointer',
                              fontWeight: 500,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => {
                              ;(e.currentTarget as HTMLElement).style.background = '#fee2e2'
                            }}
                            onMouseLeave={e => {
                              ;(e.currentTarget as HTMLElement).style.background = '#fff5f5'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ===================== ADD / EDIT FOOD ITEM MODAL ===================== */}
      {showItemModal && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setShowItemModal(false)
          }}
        >
          <div
            className="card fade-in"
            style={{
              width: '100%',
              maxWidth: 580,
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px 30px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h2 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 700, color: 'var(--foreground)' }}>
                  {editingProduct ? 'Edit Food Item' : 'Add New Food Item'}
                </h2>
                <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginTop: 2 }}>
                  Set menu pricing and map ingredient deductions for automated inventory tracking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                style={{ background: 'transparent', border: 'none', fontSize: 22, color: 'var(--muted-foreground)', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Item Name */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  FOOD / DISH NAME *
                </label>
                <input
                  className="input"
                  autoFocus
                  required
                  placeholder="e.g. Garlic Butter Parmesan Wings (6pcs)"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', fontSize: 14 }}
                />
              </div>

              {/* Product Type */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  PRODUCT TYPE
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['Regular', 'Bestseller', 'New', 'Seasonal', 'Special'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormType(t)}
                      style={{
                        padding: '7px 16px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: `1.5px solid ${formType === t ? 'var(--primary)' : 'var(--border)'}`,
                        background: formType === t ? 'rgba(234,88,12,0.12)' : 'transparent',
                        color: formType === t ? 'var(--primary)' : 'var(--muted-foreground)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {t === 'Bestseller' ? 'Bestseller' :
                       t === 'New' ? 'New' :
                       t === 'Seasonal' ? 'Seasonal' :
                       t === 'Special' ? 'Special' : 'Regular'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category & Price */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
                      CATEGORY *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCategoryModal(true)}
                      style={{ fontSize: 11, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                    >
                      + New Category
                    </button>
                  </div>
                  <select
                    className="input"
                    value={formCatId}
                    onChange={e => setFormCatId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', fontSize: 13 }}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                    PRICE (PHP) *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: 10, color: 'var(--muted-foreground)', fontFamily: 'DM Mono', fontWeight: 600 }}>
                      &#8369;
                    </span>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0"
                      max="10000"
                      required
                      placeholder="0.00"
                      value={formPrice}
                      onChange={e => {
                        const val = e.target.value
                        // Clamp to max immediately
                        if (Number(val) > 10000) {
                          setFormPrice('10000')
                        } else {
                          setFormPrice(val)
                        }
                      }}
                      style={{ width: '100%', padding: '10px 14px 10px 30px', fontSize: 14, fontFamily: 'DM Mono' }}
                    />
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>Max ₱10,000.00</p>
                </div>
              </div>

              {/* Availability Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  background: 'rgba(0,0,0,0.02)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>Visible on POS</p>
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Allow cashiers to select and charge this item</p>
                </div>
                <input
                  type="checkbox"
                  checked={formAvailable}
                  onChange={e => setFormAvailable(e.target.checked)}
                  style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary)' }}
                />
              </div>

              {/* Recipe / Ingredients Mapper */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                      Recipe / Inventory Deductions (Optional)
                    </span>
                    <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                      When sold at POS, automatically deduct raw ingredients from stock.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addRecipeRow}
                    className="btn-ghost"
                    style={{ fontSize: 12, padding: '5px 10px' }}
                  >
                    + Add Ingredient
                  </button>
                </div>

                {formRecipes.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--muted-foreground)', fontStyle: 'italic', padding: '10px 0' }}>
                    No raw inventory items linked yet. Click "+ Add Ingredient" if this dish consumes inventory stock.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    {formRecipes.map((row, idx) => {
                      const selectedItem = inventoryList.find(i => i.id === row.inventory_id)
                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            gap: 10,
                            alignItems: 'center',
                            background: 'rgba(0,0,0,0.02)',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                          }}
                        >
                          <select
                            className="input"
                            value={row.inventory_id}
                            onChange={e => updateRecipeRow(idx, 'inventory_id', e.target.value)}
                            style={{ flex: 2, padding: '7px 10px', fontSize: 13 }}
                          >
                            {inventoryList.map(inv => (
                              <option key={inv.id} value={inv.id}>
                                {inv.name} ({inv.stock_qty} {inv.unit} in stock)
                              </option>
                            ))}
                          </select>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                            <input
                              className="input"
                              type="number"
                              step="0.01"
                              min="0.01"
                              placeholder="Qty"
                              value={row.qty_per_unit}
                              onChange={e => updateRecipeRow(idx, 'qty_per_unit', e.target.value)}
                              style={{ width: '100%', padding: '7px 10px', fontSize: 13, fontFamily: 'DM Mono' }}
                            />
                            <span style={{ fontSize: 12, color: 'var(--muted-foreground)', minWidth: 30 }}>
                              {selectedItem?.unit ?? ''}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeRecipeRow(idx)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#b91c1c',
                              cursor: 'pointer',
                              fontSize: 16,
                              padding: '4px 8px',
                            }}
                            title="Remove ingredient"
                          >
                            &times;
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {formError && (
                <div style={{ padding: '10px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="btn-ghost"
                  style={{ flex: 1, padding: '11px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="btn-primary"
                  style={{ flex: 1, padding: '11px', fontSize: 14 }}
                >
                  {formLoading ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Food Item'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===================== ADD CATEGORY MODAL ===================== */}
      {showCategoryModal && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setShowCategoryModal(false)
          }}
        >
          <div
            className="card fade-in"
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '24px 26px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginBottom: 6 }}>
              New Category
            </h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 16 }}>
              Add a new menu section (e.g. Desserts, Specials, Shakes).
            </p>

            <form onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 6 }}>
                  CATEGORY NAME *
                </label>
                <input
                  className="input"
                  autoFocus
                  required
                  placeholder="e.g. Desserts"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', fontSize: 14 }}
                />
              </div>

              {catError && (
                <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 12 }}>
                  {catError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="btn-ghost"
                  style={{ flex: 1, padding: '9px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={catLoading}
                  className="btn-primary"
                  style={{ flex: 1, padding: '9px' }}
                >
                  {catLoading ? 'Creating...' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

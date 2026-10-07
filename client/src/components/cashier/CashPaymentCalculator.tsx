import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface CashPaymentCalculatorProps {
  total: number
  onConfirm: (cashReceived: number, change: number) => void
  onCancel: () => void
}

const PHP_BILL_AMOUNTS = [20, 50, 100, 200, 500, 1000]

export default function CashPaymentCalculator({ total, onConfirm, onCancel }: CashPaymentCalculatorProps) {
  const [cashInput, setCashInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const cashReceived = parseFloat(cashInput) || 0
  const change = cashReceived - total
  const isInsufficient = cashInput !== '' && cashReceived < total
  const canConfirm = cashInput !== '' && cashReceived >= total

  // Auto-focus the input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function handleBillAmount(amount: number) {
    setCashInput(amount.toString())
  }

  function handleExactAmount() {
    setCashInput(total.toFixed(2))
  }

  function handleInputChange(value: string) {
    // Allow only numbers and one decimal point
    const cleaned = value.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    if (parts.length > 2) return
    if (parts[1] && parts[1].length > 2) return
    setCashInput(cleaned)
  }

  function handleConfirm() {
    if (canConfirm) {
      onConfirm(cashReceived, Math.round(change * 100) / 100)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && canConfirm) {
      handleConfirm()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  // Suggest the smallest bill amount that covers the total
  const suggestedAmount = PHP_BILL_AMOUNTS.find(d => d >= total)

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="fade-in"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '32px 28px 28px',
          maxWidth: 440,
          width: '92%',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #ea580c, #f97316)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(234,88,12,0.25)',
            }}>
              {/* Cash/money icon */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <circle cx="12" cy="12" r="3"/>
                <line x1="1" y1="8" x2="3" y2="8"/>
                <line x1="21" y1="8" x2="23" y2="8"/>
                <line x1="1" y1="16" x2="3" y2="16"/>
                <line x1="21" y1="16" x2="23" y2="16"/>
              </svg>
            </div>
            <div>
              <h2 style={{ fontFamily: 'Fraunces', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
                Cash Payment
              </h2>
              <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0 0', fontFamily: 'DM Mono' }}>
                Calculate change due
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--muted-foreground)',
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.color = 'var(--foreground)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted-foreground)' }}
          >
            ✕
          </button>
        </div>

        {/* Total Bill Display */}
        <div style={{
          background: 'var(--sidebar)',
          borderRadius: 12,
          padding: '20px 22px',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: 'var(--sidebar-muted)', fontWeight: 500 }}>Total Bill</span>
            <span style={{
              fontSize: 28,
              fontFamily: 'DM Mono',
              fontWeight: 700,
              color: 'var(--sidebar-active)',
              letterSpacing: '-0.02em',
            }}>
              ₱{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Cash Received Input */}
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--foreground)',
            marginBottom: 8,
          }}>
            Cash Received
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 20,
              fontFamily: 'DM Mono',
              fontWeight: 700,
              color: cashInput ? 'var(--foreground)' : 'var(--muted-foreground)',
              pointerEvents: 'none',
            }}>
              ₱
            </span>
            <input
              ref={inputRef}
              id="cash-received-input"
              type="text"
              inputMode="decimal"
              value={cashInput}
              onChange={e => handleInputChange(e.target.value)}
              placeholder="0.00"
              style={{
                width: '100%',
                padding: '16px 18px 16px 42px',
                fontSize: 22,
                fontFamily: 'DM Mono',
                fontWeight: 700,
                color: 'var(--foreground)',
                background: 'var(--card)',
                border: `2px solid ${isInsufficient ? 'var(--danger)' : cashInput ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 10,
                outline: 'none',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: cashInput ? (isInsufficient ? '0 0 0 3px rgba(185,28,28,0.12)' : '0 0 0 3px rgba(234,88,12,0.12)') : 'none',
              }}
              onFocus={e => { if (!isInsufficient) e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={e => { if (!cashInput) e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </div>
        </div>

        {/* Quick Cash Amount Buttons */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8, fontWeight: 500 }}>
            Quick select amount
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {PHP_BILL_AMOUNTS.map(d => {
              const isSelected = cashInput === d.toString()
              const isRecommended = d === suggestedAmount
              return (
                <button
                  key={d}
                  id={`cash-amount-${d}`}
                  onClick={() => handleBillAmount(d)}
                  style={{
                    padding: '12px 4px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: 'DM Mono',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: `1.5px solid ${isSelected ? 'var(--accent)' : isRecommended ? 'rgba(234,88,12,0.35)' : 'var(--border)'}`,
                    background: isSelected ? 'rgba(234,88,12,0.12)' : isRecommended ? 'rgba(234,88,12,0.05)' : 'var(--card)',
                    color: isSelected ? 'var(--accent)' : 'var(--foreground)',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(234,88,12,0.08)'; e.currentTarget.style.borderColor = 'var(--accent)' }}}
                  onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = isRecommended ? 'rgba(234,88,12,0.05)' : 'var(--card)'; e.currentTarget.style.borderColor = isRecommended ? 'rgba(234,88,12,0.35)' : 'var(--border)' }}}
                >
                  ₱{d.toLocaleString()}
                  {isRecommended && !isSelected && (
                    <span style={{
                      position: 'absolute',
                      top: -6,
                      right: -4,
                      fontSize: 8,
                      background: 'var(--accent)',
                      color: '#fff',
                      padding: '1px 5px',
                      borderRadius: 4,
                      fontFamily: 'DM Sans',
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                    }}>
                      FIT
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {/* Exact Amount Button */}
          <button
            id="cash-exact-amount"
            onClick={handleExactAmount}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '11px 12px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              border: `1.5px solid ${cashInput === total.toFixed(2) ? 'var(--accent)' : 'var(--border)'}`,
              background: cashInput === total.toFixed(2) ? 'rgba(234,88,12,0.12)' : 'var(--card)',
              color: cashInput === total.toFixed(2) ? 'var(--accent)' : 'var(--muted-foreground)',
              transition: 'all 0.15s',
              fontFamily: 'DM Sans',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(234,88,12,0.08)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
            onMouseLeave={e => { if (cashInput !== total.toFixed(2)) { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.borderColor = 'var(--border)' }}}
          >
            Exact Amount — ₱{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </button>
        </div>

        {/* Change Due Display */}
        <div style={{
          borderRadius: 12,
          padding: '18px 20px',
          marginBottom: 22,
          background: isInsufficient
            ? 'rgba(185,28,28,0.08)'
            : canConfirm
              ? 'rgba(21,128,61,0.08)'
              : 'var(--muted)',
          border: `1.5px solid ${
            isInsufficient
              ? 'rgba(185,28,28,0.3)'
              : canConfirm
                ? 'rgba(21,128,61,0.25)'
                : 'transparent'
          }`,
          transition: 'all 0.2s',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: isInsufficient ? 'var(--danger)' : canConfirm ? 'var(--success)' : 'var(--muted-foreground)',
                marginBottom: 2,
              }}>
                {isInsufficient ? 'Insufficient Funds' : 'Change Due'}
              </span>
              {isInsufficient && (
                <span style={{
                  fontSize: 11,
                  color: 'var(--danger)',
                  opacity: 0.8,
                }}>
                  Short by ₱{Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
            <span style={{
              fontSize: canConfirm || isInsufficient ? 30 : 22,
              fontFamily: 'DM Mono',
              fontWeight: 700,
              color: isInsufficient
                ? 'var(--danger)'
                : canConfirm
                  ? 'var(--success)'
                  : 'var(--muted-foreground)',
              transition: 'all 0.2s',
            }}>
              {cashInput === ''
                ? '—'
                : `₱${Math.abs(change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              }
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            id="cash-cancel"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--muted-foreground)',
              fontFamily: 'DM Sans',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--muted)'; e.currentTarget.style.color = 'var(--foreground)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.color = 'var(--muted-foreground)' }}
          >
            Cancel
          </button>
          <button
            id="cash-confirm"
            disabled={!canConfirm}
            onClick={handleConfirm}
            style={{
              flex: 2,
              padding: '14px',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              cursor: canConfirm ? 'pointer' : 'not-allowed',
              border: 'none',
              background: canConfirm
                ? 'linear-gradient(135deg, #ea580c, #f97316)'
                : 'var(--muted)',
              color: canConfirm ? '#fff' : 'var(--muted-foreground)',
              fontFamily: 'Fraunces',
              transition: 'all 0.2s',
              boxShadow: canConfirm ? '0 4px 14px rgba(234,88,12,0.3)' : 'none',
              opacity: canConfirm ? 1 : 0.6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Confirm Payment
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

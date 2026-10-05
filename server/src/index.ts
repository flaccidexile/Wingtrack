import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

import checkoutRouter  from './routes/checkout'
import inventoryRouter from './routes/inventory'
import staffRouter     from './routes/staff'
import ordersRouter    from './routes/orders'
import productsRouter  from './routes/products'
import authRouter      from './routes/auth'

const app  = express()
const PORT = Number(process.env.PORT ?? 4000)

// ── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}))

app.use(express.json())

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'WINGTRACK API', timestamp: new Date().toISOString() })
})

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',      authRouter)
app.use('/api/checkout',  checkoutRouter)
app.use('/api/inventory', inventoryRouter)
app.use('/api/staff',     staffRouter)
app.use('/api/orders',    ordersRouter)
app.use('/api/products',  productsRouter)

// ── 404 catch-all ────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' })
})

// ── Error handler ────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[WINGTRACK API Error]', err)
  res.status(500).json({ message: 'Internal server error.' })
})

app.listen(PORT, () => {
  console.log(`\n  WINGTRACK API running at http://localhost:${PORT}`)
  console.log(`  Health check: http://localhost:${PORT}/api/health\n`)
})

export default app

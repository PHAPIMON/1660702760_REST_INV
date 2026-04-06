import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url)

    // --- SERVE FRONTEND UI ---
    if (url.pathname === '/') {
      const html = await Bun.file('public/index.html').text()
      return new Response(html, {
        headers: { 'Content-Type': 'text/html' }
      })
    }

    // --- API: GET ALL PRODUCTS ---
    if (url.pathname === '/api/inventory' && req.method === 'GET') {
      const lowStock = url.searchParams.get('low_stock') === 'true'
      const where = lowStock ? { quantity: { lte: 10 } } : {}
      const products = await prisma.product.findMany({
        where,
        orderBy: { name: 'asc' }
      })
      return Response.json(products)
    }

    // --- API: CREATE PRODUCT ---
    if (url.pathname === '/api/inventory' && req.method === 'POST') {
      try {
        const body = await req.json()
        
        // Validation เบื้องต้น
        if (!body.name || !body.sku || !body.zone) {
          return Response.json({ error: 'กรุณากรอก ชื่อ, SKU และ โซน ให้ครบถ้วน' }, { status: 400 })
        }

        const product = await prisma.product.create({
          data: {
            name: body.name,
            sku: body.sku,
            zone: body.zone,
            quantity: Number(body.quantity) || 0
          }
        })
        return Response.json(product, { status: 201 })
      } catch (err: any) {
        return Response.json({ error: 'ไม่สามารถเพิ่มได้ (SKU อาจซ้ำในระบบ)' }, { status: 400 })
      }
    }

    // --- API: ADJUST & DELETE (Using UUID Regex) ---
    // ปรับ Regex ให้รองรับ UUID (ที่มีขีด -)
    const idMatch = url.pathname.match(/^\/api\/inventory\/([a-z0-9-]+)(\/adjust)?$/)
    
    if (idMatch) {
      const [, id, adjust] = idMatch

      // PATCH: Adjust Stock
      if (adjust && req.method === 'PATCH') {
        const body = await req.json()
        const product = await prisma.product.findUnique({ where: { id } })
        
        if (!product) return Response.json({ error: 'ไม่พบสินค้า' }, { status: 404 })

        const newQuantity = product.quantity + Number(body.change)
        if (newQuantity < 0) {
          return Response.json({ error: 'สต็อกติดลบไม่ได้' }, { status: 400 })
        }

        const updated = await prisma.product.update({
          where: { id },
          data: { quantity: newQuantity }
        })
        return Response.json(updated)
      }

      // DELETE: Remove Product
      if (!adjust && req.method === 'DELETE') {
        const product = await prisma.product.findUnique({ where: { id } })
        
        if (!product) return Response.json({ error: 'ไม่พบสินค้า' }, { status: 404 })
        if (product.quantity > 0) {
          return Response.json({ error: 'ไม่สามารถลบสินค้าที่ยังมีสต็อกเหลืออยู่ได้' }, { status: 400 })
        }

        await prisma.product.delete({ where: { id } })
        return Response.json({ message: 'ลบสำเร็จ' })
      }
    }

    return new Response('Route Not Found', { status: 404 })
  }
})

console.log('🚀 System Running at http://localhost:3000')
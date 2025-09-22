// server/notification.routes.js (ESM)
import express from 'express'
import path from 'path'
import fs from 'fs'

const NOTI_DIR = path.join(process.cwd(), 'public/assets/notification')
const ALLOW_IMG = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
const ALLOW_VID = ['.mp4', '.webm', '.mov']

const notificationRoutes = express.Router()

notificationRoutes.use(
  '/assets/notification',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    next()
  },
  express.static(NOTI_DIR, {
    maxAge: '1h',
    etag: true,
    acceptRanges: true,
    fallthrough: true,
  }),
)

notificationRoutes.get('/api/notification/media', (req, res) => {
  try {
    const files = fs.readdirSync(NOTI_DIR)
    const allow = [...ALLOW_IMG, ...ALLOW_VID]
    const items = files
      .filter((f) => allow.some((ext) => f.toLowerCase().endsWith(ext)))
      .map((f) => {
        const ext = path.extname(f).toLowerCase()
        const type = ALLOW_IMG.includes(ext) ? 'image' : 'video'
        return {
          name: f,
          type,
          url: `/assets/notification/${encodeURIComponent(f)}`,
        }
      })
    res.json(items)
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '목록 조회 실패' })
  }
})

export { notificationRoutes }   // 🔥 ESM named export
// 또는 export default notificationRoutes

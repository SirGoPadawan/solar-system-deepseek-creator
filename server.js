// Простой статический сервер без внешних зависимостей (ES-модуль).
// Запуск: npm start  (или: node server.js)
// Нужен потому, что проект использует ES-модули (import + importmap),
// а браузер не грузит модули с file:// — требуется http.

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 8000

// Правильные MIME-типы. Для ES-модулей .js обязательно должен быть text/javascript.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm'
}

const server = http.createServer((req, res) => {
  let urlPath
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0])
  } catch (e) {
    res.writeHead(400)
    res.end('Bad request')
    return
  }

  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath)

  // Защита от выхода за пределы каталога проекта
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      res.writeHead(404)
      res.end('Not found: ' + urlPath)
      return
    }
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html')

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404)
        res.end('Not found: ' + urlPath)
        return
      }
      const ext = path.extname(filePath).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(data)
    })
  })
})

server.listen(PORT, () => {
  console.log('')
  console.log('  Солнечная система запущена:  http://localhost:' + PORT)
  console.log('  Остановить сервер:           Ctrl+C')
  console.log('')
})

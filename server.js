const { createServer } = require('http')
const { Server } = require('socket.io')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'
// Для локальной разработки используем localhost, для продакшена - 0.0.0.0
const hostname = process.env.HOSTNAME || (dev ? 'localhost' : '0.0.0.0')
const port = parseInt(process.env.PORT || '3000', 10)

console.log(`Starting server in ${dev ? 'development' : 'production'} mode`)
console.log(`Port: ${port}, Hostname: ${hostname}`)

const app = next({ 
  dev,
  hostname,
  port,
})

const handle = app.getRequestHandler()

app.prepare().then(() => {
  console.log('Next.js app prepared successfully')
  const httpServer = createServer(async (req, res) => {
    try {
      await handle(req, res)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  // CORS настройки - разрешаем подключения с Vercel и локального хоста
  let allowedOrigins = ['*'] // По умолчанию разрешаем все
  
  if (process.env.FRONTEND_URL) {
    // Поддерживаем несколько URL через запятую
    const frontendUrls = process.env.FRONTEND_URL.split(',').map(url => url.trim())
    allowedOrigins = [
      ...frontendUrls,
      'http://localhost:3000',
      'http://localhost:3001',
      // Добавляем поддержку всех Vercel поддоменов
      /^https:\/\/.*\.vercel\.app$/,
    ]
  }

  console.log('Allowed CORS origins:', allowedOrigins)

  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Если origin не указан (например, для same-origin запросов), разрешаем
        if (!origin) {
          return callback(null, true)
        }
        
        // Проверяем точное совпадение
        if (allowedOrigins.includes(origin)) {
          return callback(null, true)
        }
        
        // Проверяем регулярные выражения
        for (const allowedOrigin of allowedOrigins) {
          if (allowedOrigin instanceof RegExp && allowedOrigin.test(origin)) {
            return callback(null, true)
          }
        }
        
        // Если '*' в списке, разрешаем все
        if (allowedOrigins.includes('*')) {
          return callback(null, true)
        }
        
        callback(new Error('Not allowed by CORS'))
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  const rooms = new Map()

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id)

    socket.on('join-room', ({ roomId, userName }) => {
      socket.join(roomId)
      socket.data.roomId = roomId
      socket.data.userName = userName

      const room = rooms.get(roomId) || []
      room.push({ socketId: socket.id, userName })
      rooms.set(roomId, room)

      // Уведомляем других пользователей в комнате
      socket.to(roomId).emit('user-joined', {
        userId: socket.id,
        userName,
      })

      console.log(`${userName} joined room ${roomId}`)
    })

    socket.on('offer', ({ roomId, offer, to }) => {
      socket.to(to).emit('offer', {
        offer,
        from: socket.id,
      })
    })

    socket.on('answer', ({ roomId, answer, to }) => {
      socket.to(to).emit('answer', {
        answer,
      })
    })

    socket.on('ice-candidate', ({ roomId, candidate }) => {
      const room = rooms.get(roomId)
      if (room) {
        room.forEach((user) => {
          if (user.socketId !== socket.id) {
            socket.to(user.socketId).emit('ice-candidate', {
              candidate,
            })
          }
        })
      }
    })

    socket.on('leave-room', ({ roomId }) => {
      const room = rooms.get(roomId)
      if (room) {
        const index = room.findIndex((user) => user.socketId === socket.id)
        if (index > -1) {
          room.splice(index, 1)
          if (room.length === 0) {
            rooms.delete(roomId)
          } else {
            rooms.set(roomId, room)
          }
        }
      }
      socket.to(roomId).emit('user-left')
      socket.leave(roomId)
      console.log(`User left room ${roomId}`)
    })

    socket.on('disconnect', () => {
      const roomId = socket.data.roomId
      if (roomId) {
        const room = rooms.get(roomId)
        if (room) {
          const index = room.findIndex((user) => user.socketId === socket.id)
          if (index > -1) {
            room.splice(index, 1)
            if (room.length === 0) {
              rooms.delete(roomId)
            } else {
              rooms.set(roomId, room)
            }
          }
        }
        socket.to(roomId).emit('user-left')
      }
      console.log('User disconnected:', socket.id)
    })
  })

  httpServer
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, hostname === '0.0.0.0' ? undefined : hostname, () => {
      const displayHost = hostname === '0.0.0.0' ? 'localhost' : hostname
      console.log(`> Server ready on http://${displayHost}:${port}`)
      console.log(`> Socket.io server is running`)
      if (hostname === '0.0.0.0') {
        console.log(`> Also available on http://localhost:${port}`)
      }
    })
}).catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})


// Упрощенный Socket.io сервер для Railway/Render
// Используйте этот файл для деплоя только Socket.io сервера

const { createServer } = require('http')
const { Server } = require('socket.io')

const port = parseInt(process.env.PORT || '3001', 10)
const hostname = process.env.HOSTNAME || '0.0.0.0'

const httpServer = createServer((req, res) => {
  // Простой health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'socket-server' }))
    return
  }
  
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('Socket.io Server is running')
})

// CORS настройки - разрешаем подключения с Vercel и локального хоста
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').concat(['http://localhost:3000'])
  : ['*']

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
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
  .listen(port, hostname, () => {
    console.log(`Socket.io Server running on http://${hostname}:${port}`)
    console.log(`Allowed origins: ${allowedOrigins.join(', ')}`)
  })


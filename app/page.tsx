'use client'

import { useState, useEffect } from 'react'
import VideoCall from '@/components/VideoCall'

export default function Home() {
  const [roomId, setRoomId] = useState('')
  const [joined, setJoined] = useState(false)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    // Генерируем комнату по умолчанию
    const defaultRoom = 'love-room-2024'
    setRoomId(defaultRoom)
  }, [])

  const handleJoin = () => {
    if (roomId.trim() && userName.trim()) {
      setJoined(true)
    }
  }

  if (joined) {
    return <VideoCall roomId={roomId} userName={userName} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent mb-2">
            💕 Love Connect
          </h1>
          <p className="text-gray-600">Приватные видеозвонки для двоих</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ваше имя
            </label>
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Введите ваше имя"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none transition text-gray-900 placeholder:text-gray-400 bg-white"
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ID комнаты
            </label>
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Введите ID комнаты"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none transition text-gray-900 placeholder:text-gray-400 bg-white"
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>

          <button
            onClick={handleJoin}
            disabled={!roomId.trim() || !userName.trim()}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white py-4 rounded-lg font-semibold text-lg hover:from-pink-600 hover:to-purple-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:scale-95"
          >
            🎥 Подключиться и начать видеозвонок
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Поделитесь ID комнаты со своим партнером</p>
        </div>
      </div>
    </div>
  )
}


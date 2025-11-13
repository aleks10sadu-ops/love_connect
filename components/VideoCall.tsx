'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import VideoControls from './VideoControls'

interface VideoCallProps {
  roomId: string
  userName: string
}

interface PeerConnection {
  [key: string]: RTCPeerConnection
}

export default function VideoCall({ roomId, userName }: VideoCallProps) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [remoteUserName, setRemoteUserName] = useState<string>('')
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string>('')
  const [isScreenSharing, setIsScreenSharing] = useState(false)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  }

  useEffect(() => {
    // Инициализация Socket.io
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
    })

    socketRef.current = newSocket
    setSocket(newSocket)

    newSocket.on('connect', () => {
      console.log('Connected to server')
      setIsConnected(true)
      newSocket.emit('join-room', { roomId, userName })
    })

    newSocket.on('user-joined', async (data: { userId: string; userName: string }) => {
      console.log('User joined:', data)
      setRemoteUserName(data.userName)
      await createOffer(data.userId)
    })

    newSocket.on('offer', async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
      console.log('Received offer')
      await handleOffer(data.offer, data.from)
    })

    newSocket.on('answer', async (data: { answer: RTCSessionDescriptionInit }) => {
      console.log('Received answer')
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          )
          console.log('Remote description set from answer')
        } catch (error) {
          console.error('Error setting remote description from answer:', error)
        }
      } else {
        console.warn('No peer connection when receiving answer')
      }
    })

    newSocket.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit }) => {
      console.log('Received ICE candidate')
      if (peerConnectionRef.current && data.candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
          console.log('ICE candidate added successfully')
        } catch (error) {
          console.error('Error adding ICE candidate:', error)
        }
      }
    })

    newSocket.on('user-left', () => {
      console.log('User left')
      setRemoteStream(null)
      setRemoteUserName('')
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }
    })

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server')
      setIsConnected(false)
      setError('Соединение с сервером потеряно')
    })

    newSocket.on('connect_error', (err) => {
      console.error('Connection error:', err)
      setError('Не удалось подключиться к серверу. Проверьте настройки.')
      setIsConnected(false)
    })

    // Инициализация локального потока
    initializeLocalStream()

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop())
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }
      newSocket.disconnect()
    }
  }, [roomId, userName])

  const initializeLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      cameraStreamRef.current = stream
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
    } catch (error) {
      console.error('Error accessing media devices:', error)
      setError('Не удалось получить доступ к камере/микрофону. Проверьте разрешения.')
    }
  }

  const startScreenShare = async () => {
    try {
      // Запрашиваем экран с аудио (system audio)
      // В Chrome/Edge можно захватить системный звук, выбрав "Share audio" в диалоге
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          cursor: 'always',
        } as MediaTrackConstraints,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
          // Включаем системный звук (работает в Chrome/Edge при выборе "Share audio")
          suppressLocalAudioPlayback: false,
        } as MediaTrackConstraints,
      })

      screenStreamRef.current = screenStream
      setIsScreenSharing(true)
      setLocalStream(screenStream)

      // Обновляем видео элемент
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream
      }

      // Обновляем треки в peer connection
      if (peerConnectionRef.current) {
        const videoTrack = screenStream.getVideoTracks()[0]
        const audioTracks = screenStream.getAudioTracks()

        // Заменяем видео трек
        const sender = peerConnectionRef.current
          .getSenders()
          .find((s) => s.track && s.track.kind === 'video')
        if (sender && videoTrack) {
          await sender.replaceTrack(videoTrack)
        }

        // Добавляем аудио треки если есть
        audioTracks.forEach((audioTrack) => {
          const audioSender = peerConnectionRef.current
            ?.getSenders()
            .find((s) => s.track && s.track.kind === 'audio')
          if (audioSender) {
            audioSender.replaceTrack(audioTrack)
          } else if (peerConnectionRef.current) {
            peerConnectionRef.current.addTrack(audioTrack, screenStream)
          }
        })
      }

      // Обработка остановки стриминга пользователем
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare()
      }

      setIsVideoEnabled(true)
    } catch (error) {
      console.error('Error starting screen share:', error)
      setError('Не удалось начать стриминг экрана. Проверьте разрешения.')
    }
  }

  const stopScreenShare = async () => {
    try {
      // Останавливаем стриминг экрана
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
        screenStreamRef.current = null
      }

      // Возвращаемся к камере
      if (cameraStreamRef.current) {
        setLocalStream(cameraStreamRef.current)
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = cameraStreamRef.current
        }

        // Обновляем треки в peer connection
        if (peerConnectionRef.current) {
          const videoTrack = cameraStreamRef.current.getVideoTracks()[0]
          const audioTrack = cameraStreamRef.current.getAudioTracks()[0]

          const videoSender = peerConnectionRef.current
            .getSenders()
            .find((s) => s.track && s.track.kind === 'video')
          if (videoSender && videoTrack) {
            await videoSender.replaceTrack(videoTrack)
          }

          const audioSender = peerConnectionRef.current
            .getSenders()
            .find((s) => s.track && s.track.kind === 'audio')
          if (audioSender && audioTrack) {
            await audioSender.replaceTrack(audioTrack)
          }
        }
      }

      setIsScreenSharing(false)
    } catch (error) {
      console.error('Error stopping screen share:', error)
      setError('Ошибка при остановке стриминга экрана.')
    }
  }

  const toggleScreenShare = () => {
    if (isScreenSharing) {
      stopScreenShare()
    } else {
      startScreenShare()
    }
  }

  const createPeerConnection = (userId: string) => {
    // Закрываем предыдущее соединение если есть
    if (peerConnectionRef.current) {
      console.log('Closing existing peer connection')
      peerConnectionRef.current.close()
    }

    const pc = new RTCPeerConnection(configuration)

    // Добавляем локальные треки (используем текущий активный поток)
    const activeStream = isScreenSharing && screenStreamRef.current 
      ? screenStreamRef.current 
      : localStream
      
    if (activeStream) {
      console.log('Adding local tracks to peer connection', {
        videoTracks: activeStream.getVideoTracks().length,
        audioTracks: activeStream.getAudioTracks().length,
      })
      activeStream.getTracks().forEach((track) => {
        console.log('Adding track:', track.kind, track.enabled)
        pc.addTrack(track, activeStream)
      })
    } else {
      console.warn('No local stream available when creating peer connection')
    }

    // Обработка удаленного потока
    pc.ontrack = (event) => {
      console.log('Received remote stream', event.streams)
      if (event.streams && event.streams.length > 0) {
        setRemoteStream(event.streams[0])
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0]
        }
      }
    }

    // Обработка состояния соединения
    pc.onconnectionstatechange = () => {
      console.log('Peer connection state:', pc.connectionState)
      if (pc.connectionState === 'failed') {
        console.error('Peer connection failed')
        setError('Не удалось установить соединение. Попробуйте переподключиться.')
      }
    }

    // Обработка ICE кандидатов
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        console.log('Sending ICE candidate')
        socketRef.current.emit('ice-candidate', {
          roomId,
          candidate: event.candidate,
        })
      } else if (!event.candidate) {
        console.log('All ICE candidates have been sent')
      }
    }

    // Обработка ошибок ICE
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'failed') {
        console.error('ICE connection failed')
      }
    }

    peerConnectionRef.current = pc
    return pc
  }

  const createOffer = async (userId: string) => {
    console.log('Creating offer for user:', userId)
    const pc = createPeerConnection(userId)
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      console.log('Offer created:', offer.type)
      await pc.setLocalDescription(offer)
      console.log('Local description set')

      if (socketRef.current) {
        console.log('Sending offer to:', userId)
        socketRef.current.emit('offer', {
          roomId,
          offer,
          to: userId,
        })
      }
    } catch (error) {
      console.error('Error creating offer:', error)
      setError('Ошибка при создании предложения соединения')
    }
  }

  const handleOffer = async (offer: RTCSessionDescriptionInit, from: string) => {
    console.log('Handling offer from:', from)
    const pc = createPeerConnection(from)
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      console.log('Remote description set')
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      console.log('Answer created:', answer.type)
      await pc.setLocalDescription(answer)
      console.log('Local description set for answer')

      if (socketRef.current) {
        console.log('Sending answer to:', from)
        socketRef.current.emit('answer', {
          roomId,
          answer,
          to: from,
        })
      }
    } catch (error) {
      console.error('Error handling offer:', error)
      setError('Ошибка при обработке предложения соединения')
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsAudioEnabled(audioTrack.enabled)
      }
    }
  }

  const handleLeave = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop())
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop())
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
    }
    if (socketRef.current) {
      socketRef.current.emit('leave-room', { roomId })
      socketRef.current.disconnect()
    }
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 bg-clip-text text-transparent">
                💕 Love Connect
              </h1>
              <p className="text-sm text-gray-600">Комната: {roomId}</p>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-gray-600">
                {isConnected ? 'Подключено' : 'Отключено'}
              </span>
            </div>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Video Container */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Remote Video */}
          <div className="bg-black rounded-lg overflow-hidden shadow-xl relative aspect-video">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="text-6xl mb-4">👤</div>
                  <p className="text-xl">
                    {remoteUserName || 'Ожидание подключения...'}
                  </p>
                </div>
              </div>
            )}
            {remoteUserName && (
              <div className="absolute bottom-4 left-4 bg-black/50 text-white px-4 py-2 rounded-lg">
                {remoteUserName}
              </div>
            )}
          </div>

          {/* Local Video */}
          <div className="bg-black rounded-lg overflow-hidden shadow-xl relative aspect-video">
            {localStream ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="text-6xl mb-4">📹</div>
                  <p className="text-xl">Загрузка камеры...</p>
                </div>
              </div>
            )}
            <div className="absolute bottom-4 left-4 bg-black/50 text-white px-4 py-2 rounded-lg flex items-center gap-2">
              {userName} (Вы)
              {isScreenSharing && (
                <span className="bg-purple-500 px-2 py-1 rounded text-xs">
                  🖥️ Экран
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <VideoControls
          isVideoEnabled={isVideoEnabled}
          isAudioEnabled={isAudioEnabled}
          isScreenSharing={isScreenSharing}
          onToggleVideo={toggleVideo}
          onToggleAudio={toggleAudio}
          onToggleScreenShare={toggleScreenShare}
          onLeave={handleLeave}
        />
      </div>
    </div>
  )
}


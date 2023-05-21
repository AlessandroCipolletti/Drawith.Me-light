import { Peer } from 'peerjs'
import Params from 'main/Params'

import { exponentialTimeout } from 'utils/jsUtils'


class PeerSocket {
  connections = [] // connections with other users
  connected = false // if one or more connections are open
  online = false // connected to the peer websocket server
  id = null // local peer id

  #peer = null
  #reconnectTimeout = false
  #reopenTimeout = false

  #eventsCallbacks = {
    newConnection: [],
    message: [],
    connectionClosed: [],
    online: [],
    offline: [],
  }

  constructor() {
    if (navigator.onLine) {
      this.#initPeerConnection()
    } else {
      window.addEventListener('online', this.#initPeerConnection)
    }
  }

  on(event, callback) {
    if (typeof(event) !== 'string' || typeof(callback) !== 'function' || !this.#eventsCallbacks[event]) {
      return
    }

    this.#eventsCallbacks[event].push(callback)
  }

  sendMessage(message) {
    this.connections.forEach((conn) => {
      conn.send(message)
    })
  }

  #initPeerConnection = () => {
    window.removeEventListener('online', this.#initPeerConnection)
    this.#peer = new Peer({
      host: Params.peerServerHost,
      port: Params.peerServerPort,
      path: Params.peerServerPath,
      pingInterval: Params.peerPingInterval,
      secure: true,
      debug: Params.debugMode ? 3 : 0,
    })

    this.#peer.on('open', (id) => {
      if (!this.online) {
        // perché viene chiamato anche quando si riconnette per una semplice perdita di connessione momentanea
        // ma l'id ed il peer non cambiano
        this.#eventsCallbacks.online.forEach(callback => callback(id))
        console.log('peer open', id)
      } else {
        console.log('peer reconnected')
      }

      this.#reconnectTimeout = false
      this.#reopenTimeout = false
    })

    this.#peer.on('close', () => {
      console.log('peer close')
      this.connections = []
      this.connected = []
      this.online = false
      this.id = null
      this.#eventsCallbacks.offline.forEach(callback => callback())

      if (!this.#reopenTimeout && this.#reopenIfNeeded()) {
        exponentialTimeout(this.#reopenIfNeeded)
      }
    })

    this.#peer.on('connection', (conn) => {
      console.log('peer connection')
      this.#saveConnection(conn)
    })

    this.#peer.on('disconnected', (data) => {
      console.log('peer disconnected', data)
      this.online = false
      if (!this.#reconnectTimeout && this.#reconnectIfNeeded()) {
        exponentialTimeout(this.#reconnectIfNeeded)
      }
    })

    this.#peer.on('error', (e) => {
      console.log('peer error', e)
      this.#peer.destroy()
    })
  }

  #saveConnection = (conn) => {
    if (conn) {
      conn.on('open', () => {
        this.connections.push(conn)
        console.log('new conn:', this.connections)
        this.#eventsCallbacks.newConnection.forEach(callback => callback())

        conn.on('data', (data) => {
          console.log('Received:', data)
          this.#eventsCallbacks.message.forEach(callback => callback(data))
        })
        conn.on('close', () => {
          console.log('connection close', conn)
          this.#removeClosedConnections()
        })
        conn.on('error', (error) => {
          console.log('connection error', error)
          conn.close()
        })
        conn.peerConnection.oniceconnectionstatechange = () => {
          if (conn.peerConnection.iceConnectionState === 'disconnected') {
            console.log('l altro utente ha chiuso il tab cosi de botto senza senso')
            conn.close()
          }
          // else if (conn.peerConnection.iceConnectionState === 'failed') {
          //   console.log('FAILED')
          //   conn.close()
          // }
        }
      })
    }
  }

  #reconnectIfNeeded = () => {
    if (this.#peer.disconnected && !this.#peer.destroyed) {
      this.#peer.reconnect()
      this.#reconnectTimeout = true
      return true
    }
    return false
  }

  #reopenIfNeeded = () => {
    if (this.#peer.destroyed) {
      this.#initPeerConnection()
      this.#reopenTimeout = true
      return true
    }
    return false
  }

  #removeClosedConnections = () => {
    this.connections = this.connections.filter(conn => conn.peerConnection)
    this.connected = !!this.connections.length
    this.#eventsCallbacks.connectionClosed.forEach(callback => callback())
  }
}

export default PeerSocket

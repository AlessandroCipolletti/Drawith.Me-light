import { Peer } from 'peerjs'
import Params from 'main/Params'

import { exponentialTimeout } from 'utils/jsUtils'

const CONFIRMED = 'confirmed'
const REFUSED = 'refused'

class PeerSocket {
  connections = [] // connections with other users
  connected = false // if one or more connections are open
  online = false // connected to the peer websocket server
  id = null // local peer id

  #peer = null
  #maxConcurrentConnections = 1
  #reconnectTimeout = false
  #reopenTimeout = false

  #eventsCallbacks = {
    newConnection: [],
    newConnectionFailed: [],
    newConnectionRefused: [],
    message: [],
    connectionClosed: [],
    online: [],
    offline: [],
    peerError: [],
  }

  constructor({
    maxConcurrentConnections = 1,
  } = {}) {
    this.#maxConcurrentConnections = maxConcurrentConnections
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

  connectTo(peerId) {
    if (peerId === this.id) {
      console.error('cannot connect to yourself')
      return
    }

    this.#handleNewConnection(this.#peer.connect(peerId))
  }

  disconnectFrom(peerId = this.connections[0]?.peer) {
    if (peerId) {
      const dataConnection = this.connections.find(conn => conn.peer === peerId)

      if (dataConnection) {
        dataConnection.close()
      } else {
        console.error(`not connected to ${peerId}`)
      }
    }
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
      this.id = id
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
      this.#eventsCallbacks.offline.forEach(callback => callback(this.connected))
      this.connections = []
      this.connected = false
      this.online = false
      this.id = null

      if (!this.#reopenTimeout && this.#reopenIfNeeded()) {
        exponentialTimeout(this.#reopenIfNeeded)
      }
    })

    this.#peer.on('connection', (conn) => {
      console.log('peer connection')
      if (this.connections.length < this.#maxConcurrentConnections) {
        this.#handleNewConnection(conn)
      } else {
        conn.close
      }
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
      if (e.type === 'peer-unavailable') {
        this.#eventsCallbacks.newConnectionFailed.forEach(callback => callback())
      } else {
        this.#eventsCallbacks.peerError.forEach(callback => callback(this.connected))
        this.#peer.destroy()
      }
    })
  }

  #confirmConnection = (conn) => {
    this.connections.push(conn)
    this.connected = true
    console.log('new conn:', this.connections)
    this.#eventsCallbacks.newConnection.forEach(callback => callback())

    conn.on('close', () => {
      console.log('connection close', conn)
      this.#eventsCallbacks.connectionClosed.forEach(callback => callback())
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
  }

  #handleNewConnection = (conn) => {
    if (conn) {
      conn.on('open', () => {
        conn.on('data', (data) => {
          if (data === REFUSED) {
            console.log('refused')
            this.#eventsCallbacks.newConnectionRefused.forEach(callback => callback())
            conn.close()
            return
          }
          if (data === CONFIRMED) {
            console.log('peer connection')
            this.#confirmConnection(conn)
            return
          }

          console.log('Received:', data)
          this.#eventsCallbacks.message.forEach(callback => callback(data))
        })
        if (this.connections.length >= this.#maxConcurrentConnections) {
          console.log('new connection refused')
          conn.send(REFUSED)
        } else {
          conn.send(CONFIRMED)
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
    this.connections = this.connections.filter(conn => !!conn.peerConnection)
    this.connected = !!this.connections.length
  }
}

export default PeerSocket

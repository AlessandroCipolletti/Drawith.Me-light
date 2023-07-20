import { Peer } from 'peerjs'

const fibonacciTimeoutSequence = [
  1, 1, 1,
  2, 2, 2,
  3, 3, 3,
  5, 5, 5,
  8, 8, 8,
  13, 13, 13,
  21, 21, 21,
  34, 34, 34,
  55, 55, 55,
]

export const exponentialTimeout = (fn, iteration = 0) => {
  setTimeout(() => {
    // console.log('ESEGUO', (fibonacciTimeoutSequence[iteration] || Math.max(fibonacciTimeoutSequence)) * 1000, Date.now())

    const shouldTryAgain = fn()
    if (shouldTryAgain) {
      exponentialTimeout(fn, iteration + 1)
    }
  }, (fibonacciTimeoutSequence[iteration] || Math.max(fibonacciTimeoutSequence)) * 1000)
}

let connections = []
let peer = null
let idLabel = null
let reconnectTimeout = false
let reopenTimeout = false
window.connections = connections

const removeClosedConnections = () => {
  connections = connections.filter(conn => conn.peerConnection)
  window.connections = connections
}

const reconnectIfNeeded = () => {
  if (peer.disconnected && !peer.destroyed) {
    console.log('reconnectIfNeeded')
    peer.reconnect()
    reconnectTimeout = true
    return true
  }
  return false
}

const reopenIfNeeded = () => {
  if (peer.destroyed) {
    console.log('reopenIfNeeded')
    openPeer()
    reopenTimeout = true
    return true
  }
  return false
}

const connectionConfirmed = (conn) => {
  connections.push(conn)
  console.log('new conn:', connections)

  conn.on('close', () => {
    console.log('connection close', conn)
    removeClosedConnections()
  })
  conn.peerConnection.oniceconnectionstatechange = (data) => {
    console.log('oniceconnectionstatechange', conn.peerConnection.iceConnectionState, data)
    if (conn.peerConnection.iceConnectionState === 'disconnected') {
      console.log('l altro utente ha chiuso il tab cosi de botto senza senso')
      conn.close()
    } else if (conn.peerConnection.iceConnectionState === 'failed') {
      console.log('FAILED')
      conn.close()
    }
  }
  conn.on('error', (error) => {
    console.log('connection error', error)
  })
}

const handleNewConnection = (conn) => {
  if (conn) {
    console.log('handleNewConnection')

    conn.on('open', () => {
      console.log('open')
      conn.on('data', (data) => {
        if (data === 'refused') {
          console.log('refused')
          conn.close()
          return
        }
        if (data === 'confirmed') {
          console.log('peer connection')
          connectionConfirmed(conn)
          return
        }
        console.log('Received:', data)
      })
      if (connections.length) {
        console.log('new connection refused')
        conn.send('refused')
      } else {
        conn.send('confirmed')
      }
    })
  }
}

const initDom = () => {
  idLabel = document.querySelector('span')
  const button = document.querySelector('button')
  const textarea = document.querySelector('textarea')

  button.addEventListener('click', () => {
    if (!textarea.value) {
      return
    }

    if (connections.length) {
      connections.forEach(conn => {
        console.log('send: ', textarea.value)
        conn.send(textarea.value)
      })
    } else {
      handleNewConnection(peer.connect(textarea.value))
    }
  })
}

const openPeer = () => {
  console.log('openPeer')
  window.removeEventListener('online', openPeer)

  peer = new Peer({
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    pingInterval: 5000,
    secure: true,
    // debug: 0,
  })
  window.peer = peer
  peer.on('open', (id) => {
    idLabel.innerHTML = id
    reconnectTimeout = false
    reopenTimeout = false
    console.log('peer open', id)
  })
  peer.on('close', (data) => {
    !reopenTimeout && exponentialTimeout(reopenIfNeeded)
    console.log('peer close', data)
  })
  peer.on('connection', (conn) => {
    console.log('peer connection')
    handleNewConnection(conn)
  })
  peer.on('disconnected', (data) => {
    console.log('peer disconnected', data)
    !reconnectTimeout && exponentialTimeout(reconnectIfNeeded)
  })
  peer.on('error', (e) => {
    console.log('peer error', e.type, e)
  })
}

const init = () => {
  initDom()
  if (navigator.onLine) {
    openPeer()
  } else {
    window.addEventListener('online', openPeer)
  }
}

document.onreadystatechange = async() => {
  if (document.readyState === 'complete') {
    await init()
  }
}

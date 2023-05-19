import { Peer } from 'peerjs'

/* API Peer.js
peer.id
peer.disconnected
peer.destroyed
peer.connect()
peer.call()
peer.disconnect()
peer.reconnect()
peer.destroy()
peer.on('open', (id) => {})
peer.on('close')
peer.on('connection', (dataConnection) => {})
peer.on('call', (mediaConnection) => {})
peer.on('disconnected', () => {})
peer.on('error', (error) => {})

dataConnection.send(data)
dataConnection.close()
dataConnection.on('data', (data) => {})
dataConnection.on('open', () => {})
dataConnection.on('close', () => {})
dataConnection.on('error', (error) => {})
dataConnection.dataChannel
dataConnection.label
dataConnection.medadata
dataConnection.open
dataConnection.peerConnection
dataConnection.peer
dataConnection.reliable
dataConnection.serialization
dataConnection.bufferSize

*/
const init = () => {
  let connections = []
  const peer = new Peer({
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    pingInterval: 5000,
    secure: true,
    // debug: 3,
  })
  window.connections = connections
  const saveConnection = (conn) => {
    connections.push(conn)
    console.log('new conn:', connections)
    conn.on('data', (data) => {
      console.log('Received:', data)
    })
    conn.on('open', (data) => {
      console.log('connection open', data)
    })
    conn.on('close', (data) => {
      console.log('connection close', data)
    })
    conn.on('error', (error) => {
      console.log('connection error', error)
    })
  }

  const idLabel = document.querySelector('span')
  const button = document.querySelector('button')
  const textarea = document.querySelector('textarea')

  button.addEventListener('click', () => {
    if (!textarea.value) {
      return
    }

    if (connections.length) {
      connections.forEach(conn => {
        conn.send(textarea.value)
      })
    } else {
      saveConnection(peer.connect(textarea.value))
    }
  })

  peer.on('open', (id) => {
    idLabel.innerHTML = id
    console.log('peer open', id)
  })
  peer.on('close', (data) => {
    console.log('peer close', data, peer.connections)
  })
  peer.on('connection', (conn) => {
    console.log('peer connection')
    saveConnection(conn)
  })
  peer.on('disconnected', (data) => {
    console.log('peer disconnected', data, peer.connections)
  })
  peer.on('call', (data) => {
    console.log('peer call', data)
  })
  peer.on('error', (e) => {
    console.log('peer error', e.type)
  })
}

document.onreadystatechange = async() => {
  if (document.readyState === 'complete') {
    await init()
  }
}

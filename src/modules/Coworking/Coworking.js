import Params from 'main/Params'
import PeerSocket from 'modules/PeerSocket'
import { goToPage } from 'modules/Router'
import * as Messages from 'modules/Messages'
import { deepCopy } from 'utils/jsUtils'
import { drawCoworkingMultipleStepsData, getCanvasPxSizes } from 'pages/Editor'
import { editorEvents, SOCKET_CONNECTED_STATUS } from './constants'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'


let peerClient = {}
const config = {
  maxConcurrentConnections: 1,
}
const state = {
  isOpen: false,
  clientData: {
    codeVersion: 0,
    screenWidth: 0,
    screenHeight: 0,
    deviceType: '',
    canvasWidth: 0,
    canvasHeight: 0,
  },
  coworkingData: {
    minCanvasWidth: 0,
    minCanvasHeight: 0,
  },
  isWaitingConnection: false,
  waitingToConnectToCliendId: false, // false or coworkerClientId. If coworkerClientId, onConnect we try to open coworking with that coworkerClientId
  callbackOnConnection: null,
  stepsBuffer: [],
}
const labels = {
  networkError: 'Network Error',
  coworkingClosed: 'Session closed',
  errorHimself: 'You can\'t connect to yourself',
  alreadyConnected: 'You are already connected to someone',
  badCode: 'Your friend is no longer connected to Drawith.me, you need a new url',
  coworkingStarted: 'Coworking session started!',
  userNotAvailable: 'Selected user is already connected with someone',
  coworkerNeedsToUpdate: 'Your coworker needs to update the app at the latest version',
  youNeedToUpdate: 'You need to update the app to connect with someone else',
}

export const isOnline = () => peerClient.online
export const isConnectedToSomeone = () => peerClient.connected
export const isOpen = () => state.isOpen
export const getClientId = () => peerClient.id


const handlePeerMessage = (message) => {
  if (message.event === editorEvents.coworkingSteps) {
    drawCoworkingMultipleStepsData(message.data)
  } else if (message.event === editorEvents.clientEnvironment) {
    checkCoworkerEnvironment(message.data)
  }
}

export const addStep = (step, tool = false) => {
  state.stepsBuffer.push(step)
}

export const clearSteps = () => state.stepsBuffer = []

export const sendSteps = (tool) => {
  tool = deepCopy(tool)
  delete tool.frameImageFile

  const message = {
    event: editorEvents.coworkingSteps,
    data: {
      steps: state.stepsBuffer,
      tool,
    },
  }

  peerClient.sendMessage(message)
  clearSteps()
}

const startCoworkingSession = () => {
  state.isOpen = true
  // qui passo la dimensione dello schermo piú piccolo tra i due per farli disegnare sullo stesso foglio
  // ma questa cosa dovrà essere modificata quando sarà possibile anche aprire un coworking da dentro l'editor con un disegno già esistente
  // il canvas li resterà alle sue dimensioni attuali, ma chi ha lo schermo più piccolo deve ricevere una notifica
  Messages.info(labels.coworkingStarted)
  goToPage(`/editor/open/false/true/${state.coworkingData.minCanvasWidth}/${state.coworkingData.minCanvasHeight}`)
}

export const updateClientEnvironment = () => {
  if (isOnline()) {
    const [canvasWidth, canvasHeight] = getCanvasPxSizes(true)
    state.clientData.canvasWidth = canvasWidth
    state.clientData.canvasHeight = canvasHeight
    state.clientData.codeVersion = Params.appVersion
    state.clientData.screenWidth = Params.width
    state.clientData.screenHeight = Params.height
    state.clientData.deviceType = Params.deviceType
  }
}

const sendClientEnvironmentToCoworker = () => {
  peerClient.sendMessage({
    event: editorEvents.clientEnvironment,
    data: state.clientData,
  })
}

const checkCoworkerEnvironment = (coworkerEnvironment) => {
  if (coworkerEnvironment.codeVersion !== state.clientData.codeVersion) {
    if (coworkerEnvironment.codeVersion < state.clientData.codeVersion) {
      Messages.info(labels.coworkerNeedsToUpdate)
    } else {
      Messages.info(labels.youNeedToUpdate)
    }
    return
  }

  state.coworkingData.minCanvasWidth = Math.min(coworkerEnvironment.canvasWidth, state.clientData.canvasWidth)
  state.coworkingData.minCanvasHeight = Math.min(coworkerEnvironment.canvasHeight, state.clientData.canvasHeight)

  startCoworkingSession()
}

// to call from module Editor, when url drawith.me/editor/coworking/abc123 is open
export const requestSession = (coworkerClientId) => {
  console.log('requestSession', coworkerClientId)
  if (!coworkerClientId) {
    return
  }
  if (!isOnline()) {
    state.waitingToConnectToCliendId = coworkerClientId
    return
  }
  if (isOpen()) {
    Messages.error(labels.alreadyConnected)
    return
  }
  if (coworkerClientId === peerClient.id) {
    Messages.error(labels.errorHimself)
    return
  }

  peerClient.connectTo(coworkerClientId)
}

export const stop = () => {
  if (isOpen()) {
    peerClient.disconnectFrom()
    Messages.info(labels.coworkingClosed)
  }
}

const handlePeerClientConnect = async(id) => {
  console.log('Peer client online', id)
  state.isWaitingConnection = false
  addGlobalStatus(SOCKET_CONNECTED_STATUS)
  updateClientEnvironment()
  if (state.waitingToConnectToCliendId) {
    requestSession(state.waitingToConnectToCliendId)
    state.waitingToConnectToCliendId = false
  }
  if (state.callbackOnConnection) {
    await state.callbackOnConnection()
  }
}

const handlePeerClientDisonnect = (duringCoworkingSession) => {
  console.log('Peer client offline')
  removeGlobalStatus(SOCKET_CONNECTED_STATUS)
  if (duringCoworkingSession) {
    Messages.error(labels.networkError)
  }
}

const handleNewConnection = () => {
  console.log('Coworking newConnection')
  sendClientEnvironmentToCoworker()
}

const handleConnectionFailed = () => {
  console.log('Coworking newConnectionFailed')
  Messages.error(labels.badCode)
}

const handleConnectionRefused = () => {
  console.log('Coworking newConnectionRefused')
  Messages.error(labels.userNotAvailable)
}

const handleConnectionClosed = () => {
  console.log('Coworking connectionClosed')
  Messages.info(labels.coworkingClosed)
  state.isOpen = false
}

export const init = () => {
  return new Promise((resolve, reject) => {
    if (!isOnline() && !state.isWaitingConnection) {
      state.isWaitingConnection = true
      state.callbackOnConnection = resolve

      peerClient = new PeerSocket({
        maxConcurrentConnections: config.maxConcurrentConnections,
      })

      peerClient.on('online', handlePeerClientConnect)
      peerClient.on('offline', handlePeerClientDisonnect)
      peerClient.on('newConnection', handleNewConnection)
      peerClient.on('message', handlePeerMessage)
      peerClient.on('newConnectionFailed', handleConnectionFailed)
      peerClient.on('newConnectionRefused', handleConnectionRefused)
      peerClient.on('connectionClosed', handleConnectionClosed)
    } else {
      resolve()
    }
  })
}

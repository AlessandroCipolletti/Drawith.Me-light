import { v4 as uuidv4 } from 'uuid'
import Params from 'main/Params'
import PeerSocket from 'modules/PeerSocket'
import { goToPage, openPageFolder, getCurrentPage } from 'modules/Router'
import * as Messages from 'modules/Messages'
import { deepCopy } from 'utils/jsUtils'
import { drawCoworkingMultipleStepsData, getCanvasPxSizes } from 'pages/Editor'
import { closeCoworkingPopup } from 'pages/Folder'
import { editorEvents, SOCKET_CONNECTED_STATUS } from './constants'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'


let peerClient = {}
const config = {
  maxConcurrentConnections: 1,
}
export const state = {
  userId: uuidv4(),
  isOpen: false,
  connectedUsersId: '',
  iAskedForCoworking: false, // true if I'm connecting to someone else
  clientData: {
    userId: '',
    codeVersion: 0,
    deviceType: '',
    screenWidth: 0,
    screenHeight: 0,
    canvasWidth: 0,
    canvasHeight: 0,
  },
  coworkingData: {
    minCanvasWidth: 0,
    minCanvasHeight: 0,
  },
  isWaitingPeerConnection: false,
  waitingToConnectToSocketId: false, // false or coworkerSocketId. If coworkerSocketId, onConnect we try to open coworking with that coworkerSocketId
  stepsBuffer: [],
}
const labels = {
  networkError: 'Network Error',
  coworkingClosed: 'Session closed',
  errorHimself: 'You can\'t connect to yourself',
  alreadyConnected: 'You are already connected to someone',
  badCode: 'This code is not valid',
  coworkingStarted: 'Coworking session started!',
  userNotAvailable: 'Selected user is already connected with someone',
  coworkerNeedsToUpdate: 'Your coworker needs to update the app at the latest version',
  youNeedToUpdate: 'You need to update the app to connect with someone else',
}

export const isOnline = () => !!peerClient.online
export const isConnectedWithSomeone = () => !!peerClient.connected
export const isOpen = () => !!state.isOpen
export const getSocketId = () => peerClient.id
export const getUserId = () => state.userId
export const getCoworkerUserId = () => state.connectedUsersId


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

const startCoworkingSession = (userId) => {
  state.isOpen = true
  state.connectedUsersId = userId
  // qui passo la dimensione dello schermo piú piccolo tra i due per farli disegnare sullo stesso foglio
  // ma questa cosa dovrà essere modificata quando sarà possibile anche aprire un coworking da dentro l'editor con un disegno già esistente
  // il canvas li resterà alle sue dimensioni attuali, ma chi ha lo schermo più piccolo deve ricevere una notifica
  Messages.info(labels.coworkingStarted)
  const editorOptions = {
    withCoworking: true,
    isHostingCoworking: !state.iAskedForCoworking,
    coworkingCanvasWidth: state.coworkingData.minCanvasWidth,
    coworkingCanvasHeight: state.coworkingData.minCanvasHeight,
  }
  goToPage(`/editor/open/false/${JSON.stringify(editorOptions)}`)
}

export const updateClientEnvironment = () => {
  if (isOnline()) {
    const [canvasWidth, canvasHeight] = getCanvasPxSizes(true)
    state.clientData.userId = state.userId
    state.clientData.codeVersion = Params.appVersion
    state.clientData.deviceType = Params.deviceType
    state.clientData.canvasWidth = canvasWidth
    state.clientData.canvasHeight = canvasHeight
    state.clientData.screenWidth = Params.width
    state.clientData.screenHeight = Params.height
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

  startCoworkingSession(coworkerEnvironment.userId)
}

// to call from module Editor, when url drawith.me/editor/coworking/abc123 is open
export const requestSession = (coworkerSocketId) => {
  console.log('requestSession', coworkerSocketId)
  state.iAskedForCoworking = true
  if (!coworkerSocketId) {
    return
  }
  if (!isOnline()) {
    state.waitingToConnectToSocketId = coworkerSocketId
    return
  }
  if (isOpen()) {
    Messages.error(labels.alreadyConnected)
    return
  }
  if (coworkerSocketId === peerClient.id) {
    Messages.error(labels.errorHimself)
    return
  }

  peerClient.connectTo(coworkerSocketId)
}

export const stop = () => {
  if (isOpen()) {
    peerClient.disconnectFrom()
  }
}

const handlePeerClientConnect = async(id) => {
  console.log('Peer client online', id)
  state.isWaitingPeerConnection = false
  addGlobalStatus(SOCKET_CONNECTED_STATUS)
  updateClientEnvironment()
  if (state.waitingToConnectToSocketId) {
    requestSession(state.waitingToConnectToSocketId)
    state.waitingToConnectToSocketId = false
  }
}

const handlePeerClientDisonnect = (duringCoworkingSession) => {
  console.log('Peer client offline')
  removeGlobalStatus(SOCKET_CONNECTED_STATUS)
  if (duringCoworkingSession) {
    Messages.error(labels.networkError)
  }
  if (getCurrentPage() === 'folder') {
    closeCoworkingPopup()
  }
}

const handleNewConnection = () => {
  console.log('Coworking newConnection')
  sendClientEnvironmentToCoworker()
}

const handleConnectionFailed = () => {
  console.log('Coworking newConnectionFailed')
  Messages.error(labels.badCode)
  openPageFolder()
}

const handleConnectionRefused = () => {
  console.log('Coworking newConnectionRefused')
  Messages.error(labels.userNotAvailable)
  openPageFolder()
}

const handleConnectionClosed = () => {
  console.log('Coworking connectionClosed')
  Messages.info(labels.coworkingClosed)
  state.connectedUsersId = ''
  state.isOpen = false
  state.iAskedForCoworking = false
}

export const init = () => {
  return new Promise((resolve, reject) => {
    if (!isOnline() && !state.isWaitingPeerConnection) {
      state.isWaitingPeerConnection = true

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
    }
    resolve()
  })
}

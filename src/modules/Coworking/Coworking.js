
import io from 'socket.io-client'

import Params from 'main/Params'
import { drawCoworkingMultipleStepsData, getCanvasPxSizes } from 'pages/Editor'
import * as Messages from 'modules/Messages'
import * as Tracking from 'modules/Tracking'
import { isLogged, onUserDeletedByServer, startUserSessionOnSocketConnect } from 'modules/User'
import { goToPage, openPageFolder } from 'modules/Router'
import { editorEvents, SOCKET_CONNECTED_STATUS } from './constants'
import { deepCopy } from 'utils/jsUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { syncUserDrawings } from 'utils/localDbUtils'


let socket
const state = {
  isConnected: false, // socket connected to our server
  isWaitingConnection: false,
  isOpen: false, // user is coworking with someone else
  waitingToConnectToCliendId: false, // false or coworkerClientId. If coworkerClientId, onConnect we try to open coworking with that coworkerClientId
  steps: [],
  callbackOnConnection: false,
}
const labels = {
  networkError: 'Network Error',
  coworkingClosed: 'Session successfully stopped',
  coworkerDisconnected: 'Your coworker lost connection',
  coworkerHasClosed: 'Your coworker quit the session',
  errorHimself: 'You can\'t connect to yourself',
  alreadyConnected: 'You are already connected to someone',
  badCode: 'Your friend is no longer connected to Drawith.me, you will need a new url',
  notAvailable: 'Selected user is already connected with someone',
  coworkingConfirmed: 'Session started!',
  coworkingStarted: 'Someone just connected with you!',
  preventRefresh: 'This will stop your coworking session. Are you sure?',
  genericError: 'Something went wrong. Refresh the page and retry later.',
  coworkerNeedsToUpdate: 'Your coworker needs to update the app at the latest version',
  youNeedToUpdate: 'You need to update the app to connect with someone else',
}

export const isConnected = () => state.isConnected
export const isOpen = () => state.isOpen
export const getSocketId = () => socket?.id || false

// TODO che succede che io inserisco l'url di qualcun'altro, ma quest'altro è già dentro l'editor ?
// a me si apre l'editor vuoto, e a lui ?


export const addStep = (step, tool = false) => {
  state.steps.push(step)
}

export const clearSteps = () => state.steps = []

export const sendSteps = (tool) => {
  // console.log('SEND STEPS', state.steps.length)
  tool = deepCopy(tool)
  delete tool.frameImageFile

  socket.emit(editorEvents.sendCoworkingSteps, {
    steps: state.steps,
    tool,
  })

  clearSteps()
}

const requestConnectionTo = (coworkerClientId) => {
  socket.emit(editorEvents.requestCoworking, {
    coworkerClientId,
  })
}

// to call from module Editor, when url drawith.me/editor/coworking/abc123 is open
export const requestSession = (coworkerClientId) => {
  if (coworkerClientId) {
    console.log('requestSession', coworkerClientId)
    if (isConnected()) {
      requestConnectionTo(coworkerClientId)
    } else {
      state.waitingToConnectToCliendId = coworkerClientId
    }
  }
}

const startCoworkingSession = (minCanvasWidth, minCanvasHeight) => {
  state.isOpen = true
  // qui passo la dimensione dello schermo piú piccolo tra i due per farli disegnare sullo stesso foglio
  // ma questa cosa dovrà essere modificata quando sarà possibile anche aprire un coworking da dentro l'editor con un disegno già esistente
  // il canvas li resterà alle sue dimensioni attuali, ma chi ha lo schermo più piccolo deve ricevere una notifica
  goToPage(`/editor/open/false/true/${minCanvasWidth}/${minCanvasHeight}`)
}

export const stop = () => { // to call from Editor, if the user want to stop
  if (isOpen()) {
    socket.emit(editorEvents.stopCoworking)
    Messages.info(labels.coworkingClosed)
    state.isOpen = false
  }
}

// when you asked to connect to someone else by opening his url, and connection is now open
const onCoworkingConfirmed = (data) => {
  Messages.success(labels.coworkingConfirmed)
  startCoworkingSession(data.minCanvasWidth, data.minCanvasHeight)
}

// when someone asked to connect to you, and connection is now open
const onCoworkingStarted = (data) => {
  Messages.success(labels.coworkingStarted)
  startCoworkingSession(data.minCanvasWidth, data.minCanvasHeight)
}

// you received some data from your coworker drawing
const onReceiveCoworkinSteps = (data) => {
  drawCoworkingMultipleStepsData(data)
}

export const updateClientEnvironment = () => {
  if (isConnected() && isLogged()) {
    const [canvasWidth, canvasHeight] = getCanvasPxSizes(true)
    socket.emit(editorEvents.clientEnvironment, {
      codeVersion: Params.appVersion,
      screenWidth: Params.width,
      screenHeight: Params.height,
      deviceType: Params.deviceType,
      canvasWidth,
      canvasHeight,
    })
  }
}

const onSocketConnect = async() => {
  console.log('Socket Connection OK. ID:', socket.id)
  state.isConnected = true
  state.isWaitingConnection = false
  addGlobalStatus(SOCKET_CONNECTED_STATUS)
  await startUserSessionOnSocketConnect()
  if (state.waitingToConnectToCliendId) {
    requestConnectionTo(state.waitingToConnectToCliendId)
    state.waitingToConnectToCliendId = false
  }
  if (state.callbackOnConnection) {
    await state.callbackOnConnection()
  }
}

const onSocketDisconnect = (reason) => {
  console.log('socket disconnect:', reason)
  removeGlobalStatus(SOCKET_CONNECTED_STATUS)
  state.isConnected = false
  if (state.isOpen) {
    Messages.error(labels.networkError)
    state.isOpen = false
  }
  if (isLogged()) {
    Tracking.trackAction(Tracking.actions.USER_LOST_CONNECTION, {
      reason,
    })
    if (reason === 'transport error') {
      Tracking.trackAction(Tracking.actions.SOCKET_TRANSPORT_ERROR)
    }
  }
}

const onSocketError = (e) => {
  console.log('socket error:', e)
  state.isWaitingConnection = false
  Messages.error(labels.networkError)
}

// coworker disconnected
const onCoworkerSocketDisconnect = () => {
  console.log('coworker disconnected')
  Messages.error(labels.coworkerDisconnected)
  state.isOpen = false
}

// coworker closed the session
const onCoworkingClosed = () => {
  console.log('coworker closed the session')
  Messages.info(labels.coworkerHasClosed)
  state.isOpen = false
}

const handleInfo = (msg) => {
  Messages.info(msg)
  openPageFolder()
}

const handleError = (msg) => {
  Messages.error(msg)
  openPageFolder()
}

export const connect = () => {
  return new Promise((resolve, reject) => {
    if (!isConnected() && !state.isWaitingConnection) {
      state.isWaitingConnection = true
      state.callbackOnConnection = resolve

      if (socket) {
        // try to fix
        socket.disconnect()
        socket.close()
        socket = undefined
      }

      socket = io(Params.socketUrl)
      socket.on('connect', onSocketConnect)
      socket.on('disconnect', onSocketDisconnect)
      socket.on('error', onSocketError)
      socket.on(editorEvents.coworkingConfirmed, onCoworkingConfirmed)
      socket.on(editorEvents.coworkingStarted, onCoworkingStarted)
      socket.on(editorEvents.receiveCoworkingSteps, onReceiveCoworkinSteps)
      socket.on(editorEvents.disconnectCoworker, onCoworkerSocketDisconnect)
      socket.on(editorEvents.coworkingClosed, onCoworkingClosed)
      socket.on(editorEvents.userDeleted, onUserDeletedByServer)
      socket.on(editorEvents.needToSync, syncUserDrawings)
      socket.on(editorEvents.coworkerNeedsToUpdate, handleInfo.bind({}, labels.coworkerNeedsToUpdate)) // coworker is using a older code version than yours
      socket.on(editorEvents.youNeedToUpdate, handleInfo.bind({}, labels.youNeedToUpdate)) // you are using a older code version than your coworker
      socket.on(editorEvents.coworkingErrorHimself, handleError.bind({}, labels.errorHimself)) // user tryed to connected to himself
      socket.on(editorEvents.coworkingErrorAlreadyConnected, handleError.bind({}, labels.alreadyConnected)) // you are already in session, u can not open another one
      socket.on(editorEvents.coworkingErrorBadCode, handleError.bind({}, labels.badCode)) // the code you tryed to connect to, doesn't exist
      socket.on(editorEvents.coworkingErrorNotAvailable, handleError.bind({}, labels.notAvailable)) // other user is already connected with someone
      socket.on(editorEvents.coworkingGenericError, handleError.bind({}, labels.genericError)) // clientCodeVersion not found serverside
    } else {
      resolve()
    }
  })
}

export const disconnect = () => {
  if (socket) {
    socket.disconnect()
    socket.close()
    socket = undefined
  }
  state.isConnected = false
  state.isOpen = false
  state.isWaitingConnection = false
}

const tplPage = require('./tpl/folder.tpl')
const tplContent = require('./tpl/folderContent.tpl')
const tplSharePopup = require('./tpl/folderSharePopup.tpl')
import './tpl/folder.css'
import './tpl/folderContent.css'
import './tpl/folderSharePopup.css'

// import { v4 as uuidv4 } from 'uuid'
import Params from 'main/Params'
import * as Messages from 'modules/Messages'
import * as LocalDB from 'utils/localDbUtils'
import { addSpinnerOverlayTo, setSpinner, loadTemplate, preventDefault, enableElements, disableElements } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { fillCanvasWithImage } from 'utils/canvasUtils'
import { cleanRefs } from 'utils/moduleUtils'
import { shareImageWithBase64 } from 'utils/imageUtils'
import { deepCopy, copyTextToClipboard } from 'utils/jsUtils'
import { addListScrollClickAndPressHandlers } from 'utils/uiUtils'

import { goToPage } from 'modules/Router'
import * as Coworking from 'modules/Coworking'

const MAX_DRAWING_PREVIEW_SIZE = 300


let state = {}
const initialState = {
  selectionMode: false,
  coworkingPopupOpened: false,
  sendCheckboxChecked: false,
}
const refs = {
  container: null,
  drawingsContainer: null,
  selectButton: null,
  doneButton: null,
  exportButton: null,
  deleteButton: null,
  sendButton: null,
  topnav: null,
  coworkingPopup: null,
  coworkingId: null,
  copyCoworkingUrlButton: null,
  copiedCoworkingLabel: null,
  // sendPopup: null,
  // sendPopupCheckbox: null,
  // confirmSendPopupButton: null,
}
const labels = {
  select: 'Select',
  done: 'Done',
  areYouSure: 'Are you sure?',
  tapAndHoldOneImage: 'Tap and hold the image to share it',
  tapAndHoldImages: 'Tap and hold an image to share it',
  withWhiteBackground: 'With white background',
  withoutBackground: 'With no background',
  newDrawing: 'Draw alone',
  drawWithAFriend: 'Draw with a friend',
  navbarTitle: 'YOUR DRAWINGS',
  tapToShare: '^ Double tap to share ^',
  copied: 'Copied!',
  coworkingPopupTitle: 'Send this url to a friend to start drawing together',
  coworkingPopupIstructions1: 'Each unique url works for one session only.',
  coworkingPopupIstructions2: 'Do not reload the page until your friend has connected.',
  waitingToReconnect: 'Waiting for connections...',
}

let toolsButtons = []


const createNewDrawing = (e) => {
  preventDefault(e)
  setSpinner(true)
  goToPage('editor/open/')
}

const openDrawing = async(drawingId) => {
  setSpinner(true)
  goToPage(`editor/open/${drawingId}`)
}

const copyCoworkingUrl = (() => {
  let lastTapTimestamp = 0
  const doubleTapDelay = 250
  return () => {
    copyTextToClipboard(refs.coworkingId.innerHTML)
    const now = Date.now()
    if (Params.isDesktop || now - lastTapTimestamp < doubleTapDelay) {
      refs.copyCoworkingUrlButton.classList.add('displayNone')
      refs.copiedCoworkingLabel.classList.remove('displayNone')
    }
    lastTapTimestamp = now
  }
})()

const shareCoworkingUrl = (e) => {
  preventDefault(e)
  copyCoworkingUrl()
  if (!Params.isDesktop && navigator.share) {
    navigator.share({
      title: 'Let\'s draw together on Drawith.me',
      // text: 'Let\'s draw together on Drawith.me',
      url: refs.coworkingId.innerHTML,
    })
  }
}

const onCloseCoworkingPopup = () => {
  state.coworkingPopupOpened = false
}

export const closeCoworkingPopup = () => {
  if (state.coworkingPopupOpened) {
    onCloseCoworkingPopup()
    Messages.panel(refs.coworkingPopup)
  }
}

const openCoworkingPopup = (e) => {
  preventDefault(e)
  if (Coworking.isOnline()) {
    state.coworkingPopupOpened = true
    refs.coworkingId.innerHTML = `${document.location.origin}/E/${Coworking.getClientId()}`
    Messages.panel(refs.coworkingPopup, {
      onClose: onCloseCoworkingPopup,
    })
    refs.copyCoworkingUrlButton.classList.remove('displayNone')
    refs.copiedCoworkingLabel.classList.add('displayNone')
  }
}

const onCoworkingSpinnerClick = (() => {
  let lastMessageTimestamp = 0
  const messagesDelay = 5 * 1000

  return (e) => {
    preventDefault(e)
    const now = Date.now()
    if (now > lastMessageTimestamp + messagesDelay) {
      Messages.info(labels.waitingToReconnect)
      lastMessageTimestamp = now
    }
  }
})()

const onDrawingClick = (e) => {
  if (e.target.classList.contains('folder__drawing') || e.target.classList.contains('folder__drawing-preview-canvas')) {
    if (state.selectionMode) {
      if (!e.target.classList.contains('folder__drawing-new-drawing')) {
        e.target.classList.toggle('folder__drawing-selected')
        updateTopnavButtons()
      }
    } else {
      const drawingId = parseInt(e.target.getAttribute('data-local-id')) || parseInt(e.target.parentNode.getAttribute('data-local-id'))
      openDrawing(drawingId)
    }
  }
}

const onDrawingLongPress = (e) => {
  onDrawingClick(e)
}

const updateTopnavButtons = () => {
  if (refs.drawingsContainer.querySelectorAll('.folder__drawing-selected').length) {
    enableElements(toolsButtons)
  } else {
    disableElements(toolsButtons)
  }
}

const onTopnavTouchStart = (e) => {
  preventDefault(e)
  if (e.target === refs.selectButton) {
    selectButtonClick()
  } else if (e.target === refs.doneButton) {
    doneButtonClick()
  } else if (e.target === refs.exportButton) {
    exportButtonClick()
  } else if (e.target === refs.deleteButton) {
    deleteButtonClick()
  // } else if (e.target === refs.sendButton) {
  //   sendButtonClick()
  }
}

const selectButtonClick = () => {
  if (refs.selectButton.classList.contains('disabled') || refs.selectButton.classList.contains('displayNone')) {
    return
  }
  state.selectionMode = true
  addGlobalStatus('drawith__FOLDER-SELECT-MODE')
  refs.selectButton.classList.add('disabled', 'displayNone')
  refs.doneButton.classList.remove('disabled', 'displayNone')
}

const doneButtonClick = () => {
  if (refs.doneButton.classList.contains('disabled') || refs.doneButton.classList.contains('displayNone')) {
    return
  }
  state.selectionMode = false
  removeGlobalStatus('drawith__FOLDER-SELECT-MODE')
  refs.doneButton.classList.add('disabled', 'displayNone')
  refs.selectButton.classList.remove('disabled', 'displayNone')
  deselectAll()
}

const exportButtonClick = async() => {
  if (refs.exportButton.classList.contains('disabled')) {
    return
  }
  setSpinner(true)
  let urls = await Promise.all(
    getSelectedIds().map(LocalDB.getOneDrawing)
  )
  urls = urls.map(d => d.localPathBig)
  urls = await Promise.all(
    urls.map(async(url) => ({
      w: await shareImageWithBase64(url, true), // white bg
      t: await shareImageWithBase64(url, false), // transparent bg
    }))
  )
  const popupContent = await loadTemplate(tplSharePopup, {
    urls,
    subtitleLabel: urls.length === 1 ? labels.tapAndHoldOneImage : labels.tapAndHoldImages,
    withoutBackgroundLabel: labels.withoutBackground,
    withBackgroundLabel: labels.withWhiteBackground,
  })
  urls = undefined
  popupContent.addEventListener('gesturestart', preventDefault)

  setSpinner(false)
  Messages.panel(popupContent, {
    // onClose: doneButtonClick,
  })
}

const deleteButtonClick = async() => {
  if (refs.deleteButton.classList.contains('disabled')) {
    return
  }
  if (await Messages.confirm(labels.areYouSure, true)) {
    deleteSelectedDrawings()
  }
}

const deleteSelectedDrawings = async() => {
  setSpinner(true)
  const currentIds = getSelectedIds()
  disableElements(toolsButtons)
  await LocalDB.deleteLocalDrawings(currentIds)
  await refreshContent()
  doneButtonClick()
  setSpinner(false)
}

const deselectAll = () => {
  const selected = refs.drawingsContainer.querySelectorAll('.folder__drawing-selected')
  for (let i = selected.length; i--; ) {
    selected[i].classList.remove('folder__drawing-selected')
  }
  disableElements(toolsButtons)
}

const getSelectedIds = () => {
  return [...refs.drawingsContainer.querySelectorAll('.folder__drawing-selected')]
    .map(el => parseInt(el.getAttribute('data-local-id')))
}

export const refreshContent = async() => {
  let drawings = await LocalDB.getAllLocalDrawings()
  const scroll = refs.drawingsContainer.scrollTop
  refs.drawingsContainer.innerHTML = ''
  await loadTemplate(tplContent, { drawings }, refs.drawingsContainer)
  refs.drawingsContainer.scrollTop = scroll
  for (const drawing of drawings) {
    const drawingCanvas = refs.drawingsContainer.querySelector(`[data-local-id='${drawing.localDbId}'] canvas`)
    drawingCanvas.width = MAX_DRAWING_PREVIEW_SIZE
    drawingCanvas.height = MAX_DRAWING_PREVIEW_SIZE * (drawing.bitmap.height / drawing.bitmap.width)
    fillCanvasWithImage(drawingCanvas.getContext('2d'), drawing.bitmap, 0, 0, drawingCanvas.width, drawingCanvas.height)
  }
  refs.topnav.classList.toggle('displayNone', !drawings.length)
  drawings = undefined
}

const initDom = async() => {
  refs.container = await loadTemplate(tplPage, {
    labels,
  }, Params.pagesContainer)
  refs.selectButton = refs.container.querySelector('.folder__topbar-button-select')
  refs.doneButton = refs.container.querySelector('.folder__topbar-button-done')
  refs.exportButton = refs.container.querySelector('.folder__topbar-button-export')
  refs.deleteButton = refs.container.querySelector('.folder__topbar-button-delete')
  refs.topnav = refs.container.querySelector('.folder__topbar')
  refs.drawingsContainer = refs.container.querySelector('.folder__drawings-container')
  refs.coworkingPopup = refs.container.querySelector('.folder__coworking-popup')
  refs.coworkingId = refs.coworkingPopup.querySelector('.folder__coworking-popup-id')
  refs.copyCoworkingUrlButton = refs.coworkingPopup.querySelector('.folder__coworking-popup-copy')
  refs.copiedCoworkingLabel = refs.coworkingPopup.querySelector('.folder__coworking-popup-copied')
  refs.topnav.addEventListener(Params.eventStart, onTopnavTouchStart, true)
  refs.coworkingId.addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.copyCoworkingUrlButton.addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.coworkingPopup.querySelector('.folder__coworking-copy-icon').addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.coworkingPopup.addEventListener(Params.eventStart, preventDefault)
  refs.container.querySelector('.folder__drawing-new-drawing').addEventListener(Params.eventStart, createNewDrawing)
  refs.container.querySelector('.folder__drawing-new-coworking').addEventListener(Params.eventStart, openCoworkingPopup)
  refs.container.querySelector('.folder__new-container').addEventListener(Params.eventStart, preventDefault)
  refs.coworkingPopup.remove()
  addListScrollClickAndPressHandlers(refs.drawingsContainer, onDrawingClick, onDrawingLongPress)
  addSpinnerOverlayTo(refs.container.querySelector('.folder__drawing-new-coworking'), onCoworkingSpinnerClick)
  toolsButtons.push(refs.exportButton, refs.deleteButton /*, refs.sendButton */)
}

export const open = async() => {
  state = deepCopy(initialState)
  await initDom()
  setSpinner(true)
  await refreshContent()
  setSpinner(false)
  addGlobalStatus('drawith__FOLDER-OPEN')
  fadeInElements(refs.container)
}

export const close = async() => {
  await fadeOutElements(refs.container)
  removeGlobalStatus('drawith__FOLDER-OPEN')
  closeCoworkingPopup()
  toolsButtons = []
  state = {}
  cleanRefs(refs)
}

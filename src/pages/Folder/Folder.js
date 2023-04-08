const tplPage = require('./tpl/folder.tpl')
const tplContent = require('./tpl/folderContent.tpl')
const tplSharePopup = require('./tpl/folderSharePopup.tpl')
import './tpl/folder.css'
import './tpl/folderContent.css'
import './tpl/folderSharePopup.css'

// import { v4 as uuidv4 } from 'uuid'
import Params from 'main/Params'
import * as Tracking from 'modules/Tracking'
import * as Messages from 'modules/Messages'
import * as LocalDB from 'utils/localDbUtils'
import { callServerSideDrawingsDelete } from 'utils/serverDbUtils'
import { addSpinnerOverlayTo, setSpinner, loadTemplate, preventDefault, enableElements, disableElements } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { cleanRefs } from 'utils/moduleUtils'
import { shareImageWithBase64 } from 'utils/imageUtils'
import { deepCopy, copyTextToClipboard } from 'utils/jsUtils'
import { addListScrollClickAndPressHandlers } from 'utils/uiUtils'

import { goToPage } from 'modules/Router'
import * as Coworking from 'modules/Coworking'


const config = {
  updateDrawingsLoadingDelay: 1000, // ms
}
let state = {}
const initialState = {
  selectionMode: false,
  coworkingPopupOpened: false,
  sendCheckboxChecked: false,
  checkDrawingsInterval: false,
  loadingDrawingsIds: [],
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
  // sendPopupTitle: 'Just a moment...',
  // sendPopupMessage: 'Every illustration needs to be approved by our team. We work hard to review all illustrations and make sure they fit the purpose. You will receive a feedback by email.',
  // send: 'Submit',
  // iUnderstand: 'I understand',
  // byClickingYouAccept: 'By clicking on "I understand" you accept',
  // termsAndConditions: 'Terms and Conditions',
  // drawingSentConfirmation: 'Thank you! We will give you a feedback within a week.',
  // drawingSentError: 'Something went wrong, please contact us at info@drawith.me',
}

let toolsButtons = []


const createNewDrawing = (e) => {
  preventDefault(e)
  Tracking.trackAction(Tracking.actions.CREATE_NEW_DRAWING)
  Tracking.incrementProp('createdDrawings')
  setSpinner(true)
  goToPage('editor/open/')
}

const openDrawing = async(drawingId) => {
  setSpinner(true)
  goToPage(`editor/open/${drawingId}`)

  const drawing = await LocalDB.getOneDrawing(drawingId)
  if (drawing.globalId) {
    Tracking.trackAction(Tracking.actions.OPEN_DRAWING, {
      drawingId: drawing.globalId,
    })
  }
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

const closeCoworkingPopup = () => {
  if (state.coworkingPopupOpened) {
    onCloseCoworkingPopup()
    Messages.panel(refs.coworkingPopup)
  }
}

const openCoworkingPopup = (e) => {
  preventDefault(e)
  if (Coworking.isConnected()) {
    state.coworkingPopupOpened = true
    refs.coworkingId.innerHTML = `${document.location.origin}/E/${Coworking.getSocketId()}`
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
  if (e.target.classList.contains('folder__drawing')) {
    if (state.selectionMode) {
      if (!e.target.classList.contains('folder__drawing-new-drawing')) {
        if (!e.target.classList.contains('folder__drawing-loading')) {
          e.target.classList.toggle('folder__drawing-selected')
          updateTopnavButtons()
        }
      }
    } else {
      openDrawing(parseInt(e.target.getAttribute('data-local-id')))
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
      w: await shareImageWithBase64(url, true),
      t: await shareImageWithBase64(url, false),
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

  Tracking.trackAction(Tracking.actions.OPEN_SHARE_POPUP)
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
  const drawingIds = getSelectedDrawingIds()
  disableElements(toolsButtons)

  if (Coworking.isConnected()) {
    callServerSideDrawingsDelete(drawingIds)
    await LocalDB.deleteLocalDrawings(currentIds)
  } else {
    await LocalDB.setDrawingsDeleted(currentIds)
  }

  await refreshContent()
  doneButtonClick()
  setSpinner(false)
  Tracking.trackAction(Tracking.actions.DELETE_DRAWING, {
    deletedIds: drawingIds,
    length: drawingIds.length,
  })
  Tracking.incrementProp('deletedDrawings', currentIds.length)
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

const getSelectedDrawingIds = () => {
  return [...refs.drawingsContainer.querySelectorAll('.folder__drawing-selected')]
    .map(el => el.getAttribute('data-global-id'))
}

const updateDrawingsLoading = async() => {
  const drawings = await LocalDB.getSomeDrawings(state.loadingDrawingsIds)
  for (const drawing of drawings) {
    const drawingDom = document.querySelector(`.folder__drawing[data-local-id="${drawing.localDbId}"]`)
    drawingDom.classList.toggle('folder__drawing-loading', LocalDB.drawingIsLoading(drawing))
    drawingDom.classList.toggle('folder__drawing-error', LocalDB.drawingHasError(drawing))
    drawingDom.dataset.globalId = drawing.globalId
  }
  state.loadingDrawingsIds = drawings.filter(LocalDB.drawingIsLoading).map(d => d.localDbId)
  if (state.loadingDrawingsIds.length === 0) {
    clearInterval(state.checkDrawingsInterval)
  }
}

export const refreshContent = async() => {
  let drawings = await LocalDB.getAllLocalDrawings()

  for (const drawing of drawings) {
    drawing.hasError = LocalDB.drawingHasError(drawing)
    drawing.isLoading = LocalDB.drawingIsLoading(drawing)
  }

  state.loadingDrawingsIds = drawings.filter(LocalDB.drawingIsLoading).map(d => d.localDbId)
  if (state.loadingDrawingsIds.length > 0) {
    clearInterval(state.checkDrawingsInterval)
    state.checkDrawingsInterval = setInterval(updateDrawingsLoading, config.updateDrawingsLoadingDelay)
  }

  const scroll = refs.drawingsContainer.scrollTop
  refs.drawingsContainer.innerHTML = ''
  await loadTemplate(tplContent, { drawings }, refs.drawingsContainer)
  refs.drawingsContainer.scrollTop = scroll
  refs.topnav.classList.toggle('displayNone', !drawings.length)
  drawings = undefined
}

const initDom = async() => {
  refs.container = await loadTemplate(tplPage, {
    labels,
    // termsLink: config.termsAndConditionLink,
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
  // refs.sendButton = refs.container.querySelector('.folder__topbar-button-send')
  // refs.sendPopup = refs.container.querySelector('.folder__send-popup')
  // refs.sendPopupCheckbox = refs.sendPopup.querySelector('input')
  // refs.confirmSendPopupButton = refs.sendPopup.querySelector('button')

  // refs.sendPopup.remove()
  refs.coworkingPopup.remove()

  refs.topnav.addEventListener(Params.eventStart, onTopnavTouchStart, true)
  refs.coworkingId.addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.copyCoworkingUrlButton.addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.coworkingPopup.querySelector('.folder__coworking-copy-icon').addEventListener(Params.eventStart, shareCoworkingUrl)
  refs.coworkingPopup.addEventListener(Params.eventStart, preventDefault)
  // refs.confirmSendPopupButton.addEventListener(Params.eventStart, sendSelectedDrawings)
  // refs.sendPopupCheckbox.addEventListener('change', sendCheckboxChange)
  // refs.sendPopup.addEventListener(Params.eventStart, (e) => {
  //   if (e.target.tagName.toLowerCase() !== 'a' && e.target.tagName.toLowerCase() !== 'input') {
  //     e.preventDefault()
  //   }
  // })
  // refs.sendPopup.querySelector('span').addEventListener(Params.eventStart, sendCheckboxChange)
  refs.container.querySelector('.folder__drawing-new-drawing').addEventListener(Params.eventStart, createNewDrawing)
  refs.container.querySelector('.folder__drawing-new-coworking').addEventListener(Params.eventStart, openCoworkingPopup)
  refs.container.querySelector('.folder__new-container').addEventListener(Params.eventStart, preventDefault)

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
  clearInterval(state.checkDrawingsInterval)
  closeCoworkingPopup()
  toolsButtons = []
  state = {}
  cleanRefs(refs)
}

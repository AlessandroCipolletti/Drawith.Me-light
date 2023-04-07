/*
  layer.localPathBig è sempre aggiornato in ogni momento all'attuale contentuto del layer
  ma layer.img viene aggiornato solo quando il layer viene deselezionato.
  Se il layer è attualmente selezionato, il suo contenuto aggiornato è dentro il Editor.canvas e non dentro layer.img
*/

const tplLayers = require('./layers.tpl')
import './layers.css'

import { v4 as uuidv4 } from 'uuid'
import { debounce } from 'debounce'
import { getRealScreenMaxSize } from 'main/main'
import Params from 'main/Params'
import History from 'modules/History'
import * as Editor from 'pages/Editor'
import * as Toolbar from 'pages/Editor/components/Toolbar'
import * as Tools from 'pages/Editor/components/Tools'
import * as Coworking from 'modules/Coworking'
import * as ColorPicker from 'pages/Editor/components/ColorPicker'
import * as Messages from 'modules/Messages'
import * as Tracking from 'modules/Tracking'
import { preventDefault, loadTemplate, createDom } from 'utils/domUtils'
import { cleanRefs } from 'utils/moduleUtils'
import { addInElement, removeOutElement, fadeOutElements, fadeInElements } from 'utils/animationsUtils'
import { round, convertAngleDegToRad } from 'utils/mathUtils'
import { loadImageOffThread, resizeImageAndGetBase64, cropImageWithMargin, flipImage, findImageContentCoords, getCanvasBase64Async, mergeBase64Images } from 'utils/imageUtils'
import { getNewContextForCanvas, fillCanvasWithImage } from 'utils/canvasUtils'
import { addListScrollClickAndPressHandlers, addVerticalDragSliderHandler, handleElementsListDragAndDrop } from 'utils/uiUtils'
import { getMagnetismCoordXForLayer, getMagnetismCoordYForLayer, getMagnetismCoordLeftForLayer, getMagnetismCoordTopForLayer, getMagnetismCoordRightForLayer, getMagnetismCoordBottomForLayer } from './layersUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { deepCopy, delay } from 'utils/jsUtils'
import { timing } from 'main/Theme'

import { HISTORY_STEP_LAYER_CONTENT, HISTORY_STEP_LAYER_OPACITY, HISTORY_STEP_LAYER_SHOW, HISTORY_STEP_LAYER_HIDE, HISTORY_STEP_LAYER_ORDER, HISTORY_STEP_LAYER_DUPLICATE, HISTORY_STEP_LAYER_NEW, HISTORY_STEP_LAYER_DELETE, HISTORY_STEP_LAYERS_MERGE } from './constants'
const MAX_LAYER_NAME_LENGTH = 12
const PREVIEW_SIZE = 300
const EMPTY_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const config = {
  stepHistoryMaxLength: 20 + 1,
  maxLayersNumber: 20,
  maxLayersNumberLowPerf: 15,
  maxLayersNumberMediumPerf: 20,
  maxLayersNumberHightPerf: 25,
  paramsCloseDelay: 7 * 1000,
  coordsImgScale: 1,
}
let state
const initialState = {
  layers: {},
  deletedLayers: {},
  currentSelectedLayerId: false,
  resizeMode: false,
  gcoMode: false,
  editorIsUsingEraser: false,
  paramsTimeout: false,
  maxLayerCount: 0,
  resizeModeMadeChanges: false,
  listDragStartIndex: -1,
  canvases: {
    width: 0,
    height: 0,
  },
  magnetismCoords: {
    x: [],
    y: [],
    l: [],
    t: [],
    r: [],
    b: [],
  },
}
const refs = {
  layersContainer: null,
  layersList: null,
  layerListElement: null,
  addNewLayerButton: null,
  paramsContainer: null,
  editLayerNameButton: null,
  duplicateLayerButton: null,
  mergeDownLayerButton: null,
  deleteLayerButton: null,
  flipVerticalButton: null,
  flipHorizontalButton: null,
  gcoButton: null,
  resizeButton: null,
  visibilityLayerButton: null,
  imageForResize: null,
  opacitySlider: null,
  opacityCursor: null,
  opacityLabel: null,
  canvas: null,
  context: null,
}
const labels = {
  areYouSureToDeleteLayer: 'Are you sure ?',
  changeLayerName: 'Insert new name for layer',
}

const LayersHistory = new History(config.stepHistoryMaxLength)

const layerCanBeResized = (layerId) => state.layers[layerId].active && Number.isFinite(state.layers[layerId].minX) && state.layers[layerId].opacity > 0

const updateUndoRedoButtons = () => {
  Tools.toggleButton('undo', LayersHistory.canGoBack)
  Tools.toggleButton('redo', LayersHistory.canGoForward)
}

const cleanLayersHistoryOldActionIfNeeded = (action) => {
  if (action.type === HISTORY_STEP_LAYER_CONTENT) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteFarest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_DELETE) {
    if (state.deletedLayers[action.layerId]) {
      state.deletedLayers[action.layerId].history.clear()
      delete state.deletedLayers[action.layerId]
    }
  } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
    if (state.deletedLayers[action.layerOneId]) {
      state.deletedLayers[action.layerOneId].history.clear()
      delete state.deletedLayers[action.layerOneId]
    }
    if (state.deletedLayers[action.layerTwoId]) {
      state.deletedLayers[action.layerTwoId].history.clear()
      delete state.deletedLayers[action.layerTwoId]
    }
  }
}

const cleanLayersHistoryOverwrittenActionIfNeeded = (action) => {
  if (action.type === HISTORY_STEP_LAYER_CONTENT) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteNewest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE) {
    if (state.deletedLayers[action.newLayerId]) {
      state.deletedLayers[action.newLayerId].history.clear()
      delete state.deletedLayers[action.newLayerId]
    }
  } else if (action.type === HISTORY_STEP_LAYER_NEW) {
    if (state.deletedLayers[action.layerId]) {
      state.deletedLayers[action.layerId].history.clear()
      delete state.deletedLayers[action.layerId]
    }
  } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
    if (state.deletedLayers[action.newLayerId]) {
      state.deletedLayers[action.newLayerId].history.clear()
      delete state.deletedLayers[action.newLayerId]
    }
  }
}

const addGlobalLayersHistoryAction = (action) => {
  // Adding a new action may result in deleting some others actions from the history.
  // We need to clean memory for those actions, if they kept in memory a deleted layer or a layer drawing step
  if (LayersHistory.isFull) {
    const deletedAction = LayersHistory.deleteFarest()
    if (deletedAction) {
      cleanLayersHistoryOldActionIfNeeded(deletedAction)
    }
  }
  const deletedActions = LayersHistory.add(action)
  deletedActions.forEach(cleanLayersHistoryOverwrittenActionIfNeeded)
  updateUndoRedoButtons()
}

const getLayerCurrentData = async(layerId = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId]
  return {
    data: await getCanvasBase64Async(layer.selected ? refs.canvas : layer.img),
    minX: layer.minX,
    minY: layer.minY,
    maxX: layer.maxX,
    maxY: layer.maxY,
  }
}

const restoreLayerContentStep = async(layerId, step) => {
  const layer = state.layers[layerId]
  layer.minX = step.minX
  layer.minY = step.minY
  layer.maxX = step.maxX
  layer.maxY = step.maxY
  layer.localPathBig = step.data
  if (layer.localPathBig) {
    await loadImageOffThread(layer.img, layer.localPathBig)
  }
  if (layerId === state.currentSelectedLayerId) {
    const canBeResized = layerCanBeResized(layerId)
    fillCanvasWithImage(refs.context, layer.img)
    updateLayerPreview(layerId)
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
  } else {
    selectLayer(layerId, false)
  }
}

// funzione chiamata da editor ad ogni fine tratto
export const addLayerHistoryContentChangedStep = async() => {
  await updateLayerRealCoords(state.currentSelectedLayerId)
  const layer = state.layers[state.currentSelectedLayerId]
  const canBeResized = layerCanBeResized(state.currentSelectedLayerId)
  layer.updateTimestamp = Date.now()
  const step = await getLayerCurrentData(state.currentSelectedLayerId)
  addGlobalLayersHistoryAction({
    layerId: state.currentSelectedLayerId,
    type: HISTORY_STEP_LAYER_CONTENT,
  })
  layer.history.add(step)
  updateLayerPreview(state.currentSelectedLayerId)
  state.layers[state.currentSelectedLayerId].localPathBig = step.data
  updateResizeMode(state.resizeMode && canBeResized, canBeResized)
  updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
  // await loadImageOffThread(layer.img, layer.localPathBig)
}

const addLayerHistoryOpacityStep = async(layerId, newValue, oldValue) => {
  addGlobalLayersHistoryAction({
    layerId,
    type: HISTORY_STEP_LAYER_OPACITY,
    newValue,
    oldValue,
  })
}

const addLayerHistoryShowStep = async(layerId) => {
  addGlobalLayersHistoryAction({
    layerId,
    type: HISTORY_STEP_LAYER_SHOW,
  })
}

const addLayerHistoryHideStep = async(layerId) => {
  addGlobalLayersHistoryAction({
    layerId,
    type: HISTORY_STEP_LAYER_HIDE,
  })
}

const addLayerHistoryOrderStep = async(layerId, newValue, oldValue) => {
  addGlobalLayersHistoryAction({
    layerId,
    type: HISTORY_STEP_LAYER_ORDER,
    newValue,
    oldValue,
  })
}

const addLayerHistoryDuplicateStep = async(layerId, newLayerId) => {
  addGlobalLayersHistoryAction({
    layerId,
    type: HISTORY_STEP_LAYER_DUPLICATE,
    newLayerId,
  })
}

const addLayerHistoryNewStep = async(layerId, prevSelectedId) => {
  addGlobalLayersHistoryAction({
    layerId,
    type: HISTORY_STEP_LAYER_NEW,
    prevSelectedId,
  })
}

const addLayerHistoryDeleteStep = async(layerId, nextSelectedId) => {
  addGlobalLayersHistoryAction({
    layerId,
    type: HISTORY_STEP_LAYER_DELETE,
    nextSelectedId,
  })
}

const addLayerHistoryMergeStep = async(layerOneId, layerTwoId, newLayerId) => {
  addGlobalLayersHistoryAction({
    type: HISTORY_STEP_LAYERS_MERGE,
    layerOneId,
    layerTwoId,
    newLayerId,
  })
}

// questa andrebbe fatta in un altro thread
const updateLayerRealCoords = async(layerId = state.currentSelectedLayerId) => {
  const dom = state.layers[layerId].selected ? refs.canvas : state.layers[layerId].img

  state.layers[layerId] = {
    ...state.layers[layerId],
    ...(await findImageContentCoords(dom, config.coordsImgScale)),
  }
}

export const setLayerCoordsAfterDragResize = (minX, minY, maxX, maxY) => {
  state.layers[state.currentSelectedLayerId] = {
    ...state.layers[state.currentSelectedLayerId],
    minX, minY, maxX, maxY,
  }
}

// credo che non si possa ottimizzare più di cosi,
// ritorna una promise per caricare l'immagine in un altro thread
const updateLayerPreview = (layerId = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId]
  if (Number.isFinite(layer.minX)) {
    const [content] = cropImageWithMargin(layer.selected ? refs.canvas : layer.img, layer.minX, layer.minY, layer.maxX, layer.maxY)
    layer.localPathSmall = resizeImageAndGetBase64(content, PREVIEW_SIZE)
  } else {
    layer.localPathSmall = EMPTY_BASE64
  }
  return loadImageOffThread(layer.previewRef, layer.localPathSmall)
}

export const undoLayers = async(madeByTools = false) => {
  if (state.resizeMode) {
    // if I'm in resize mode, I just 'cancel' the changes made during this resize mode
    const step = state.layers[state.currentSelectedLayerId].history.getCurrent()
    if (step) {
      await restoreLayerContentStep(state.currentSelectedLayerId, step)
      startResizeMode()
      Tools.toggleButton('undo', false)
      state.resizeModeMadeChanges = false
      Tracking.trackAction(Tracking.actions.EDITOR_UNDO, {
        madeByTools,
        forResize: true,
      })
    }
  } else if (!Coworking.isOpen()) {
    if (LayersHistory.canGoBack) {
      const action = LayersHistory.getCurrent()
      LayersHistory.back()
      updateUndoRedoButtons()

      if (action.layerId || action.newLayerId) {
        Tracking.trackAction(Tracking.actions.EDITOR_UNDO, {
          madeByTools,
          forResize: false,
        })
        let selectedLayerId = action.layerId
        if (action.type === HISTORY_STEP_LAYER_CONTENT) {
          const step = state.layers[action.layerId].history.back()
          await restoreLayerContentStep(action.layerId, step)
        } else if (action.type === HISTORY_STEP_LAYER_OPACITY) {
          _updateLayerOpacity(action.layerId, action.oldValue)
        } else if (action.type === HISTORY_STEP_LAYER_SHOW) {
          disableLayer(action.layerId, false)
        } else if (action.type === HISTORY_STEP_LAYER_HIDE) {
          enableLayer(action.layerId, false)
        } else if (action.type === HISTORY_STEP_LAYER_ORDER) {
          onListDragChange(refs.layersList.querySelector(`div[data-id="${action.layerId}"]`), Object.values(state.layers).length - 1 - action.oldValue)
        } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE) {
          await _deleteLayer(action.newLayerId, action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_NEW) {
          await _deleteLayer(action.layerId, action.prevSelectedId)
          selectedLayerId = action.prevSelectedId
        } else if (action.type === HISTORY_STEP_LAYER_DELETE) {
          restoreDeletedLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
          await Promise.all([
            restoreDeletedLayer(action.layerOneId),
            restoreDeletedLayer(action.layerTwoId),
          ])
          await _deleteLayer(action.newLayerId, action.layerOneId)
          selectedLayerId = action.layerOneId
        }
        selectLayer(selectedLayerId, false)
      }
    }
  }
}

export const redoLayers = async(madeByTools = false) => {
  if (!Coworking.isOpen()) {
    if (LayersHistory.canGoForward && !state.resizeMode) {
      const action = LayersHistory.forward()
      updateUndoRedoButtons()

      if (action.layerId || action.newLayerId) {
        Tracking.trackAction(Tracking.actions.EDITOR_REDO, {
          madeByTools,
          forResize: false,
        })
        let selectedLayerId = action.layerId
        if (action.type === HISTORY_STEP_LAYER_CONTENT) {
          const step = state.layers[action.layerId].history.forward()
          await restoreLayerContentStep(action.layerId, step)
        } else if (action.type === HISTORY_STEP_LAYER_OPACITY) {
          _updateLayerOpacity(action.layerId, action.newValue)
        } else if (action.type === HISTORY_STEP_LAYER_SHOW) {
          enableLayer(action.layerId, false)
        } else if (action.type === HISTORY_STEP_LAYER_HIDE) {
          disableLayer(action.layerId, false)
        } else if (action.type === HISTORY_STEP_LAYER_ORDER) {
          onListDragChange(refs.layersList.querySelector(`div[data-id="${action.layerId}"]`), Object.values(state.layers).length - 1 - action.newValue)
        } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE) {
          restoreDeletedLayer(action.newLayerId)
          selectedLayerId = action.newLayerId
        } else if (action.type === HISTORY_STEP_LAYER_NEW) {
          restoreDeletedLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_DELETE) {
          await _deleteLayer(action.layerId, action.nextSelectedId)
          selectedLayerId = action.nextSelectedId
        } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
          await restoreDeletedLayer(action.newLayerId)
          await _deleteLayer(action.layerOneId, action.newLayerId)
          await _deleteLayer(action.layerTwoId, action.newLayerId)
          selectedLayerId = action.newLayerId
        }
        selectLayer(selectedLayerId, false)
      }
    }
  }
}

const layerDeepCopy = (layer) => ({
  id: layer.id,
  minX: layer.minX,
  minY: layer.minY,
  maxX: layer.maxX,
  maxY: layer.maxY,
  active: layer.active,
  name: layer.name,
  opacity: layer.opacity,
  localPathSmall: layer.localPathSmall,
  localPathBig: layer.localPathBig,
  selected: layer.selected,
  order: layer.order,
  selectedByCoworker: layer.selectedByCoworker,
  createTimestamp: layer.createTimestamp,
  updateTimestamp: layer.updateTimestamp,
})

export const getGlobalDrawingFullInfo = async() => {
  const currentDrawingInfo = await getCurrentGlobalImageData()
  if (state.resizeMode) {
    updateLayerPreview(state.currentSelectedLayerId)
    state.layers[state.currentSelectedLayerId].localPathBig = await getCanvasBase64Async(refs.canvas)
  }
  currentDrawingInfo.layers = Object.values(state.layers)
    .filter(layer => !currentLayerIsEmpty(layer.id))
    .sort((l1, l2) => l1.order > l2.order ? 1 : -1)
    .map(layerDeepCopy)
    .map(l => {
      delete l.selectedByCoworker
      delete l.resizeMode
      delete l.gco
      l.localPathSmall = ''
      return l
    })
  return currentDrawingInfo
}

export const getCurrentGlobalImageData = async(returnCanvas = false) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let tempCanvas = document.createElement('canvas')
  let tempContext = tempCanvas.getContext('2d')
  tempCanvas.width = state.canvases.width
  tempCanvas.height = state.canvases.height

  const layers = Object.values(state.layers).sort((l1, l2) => l1.order > l2.order ? 1 : -1)
  for (const layer of layers) {
    if (layer.active) {
      tempContext.globalAlpha = layer.opacity
      tempContext.drawImage(layer.selected ? refs.canvas : layer.img, 0, 0)
      minX = Math.min(minX, layer.minX)
      minY = Math.min(minY, layer.minY)
      maxX = Math.max(maxX, layer.maxX)
      maxY = Math.max(maxY, layer.maxY)
    }
  }
  const width = round(maxX - minX, 0)
  const height = round(maxY - minY, 0)
  let localPathBig, localPathSmall

  if (Number.isFinite(minX)) {
    if (returnCanvas) {
      localPathBig = tempCanvas.toDataURL('image/png')
      localPathSmall = resizeImageAndGetBase64(tempCanvas)
    } else {
      const [drawing] = cropImageWithMargin(tempCanvas, minX, minY, maxX, maxY)
      localPathBig = drawing.toDataURL('image/png')
      localPathSmall = resizeImageAndGetBase64(drawing)
    }
  } else {
    localPathBig = EMPTY_BASE64
    localPathSmall = EMPTY_BASE64
  }

  const res = {
    localPathBig, localPathSmall,
    minX, minY, maxX, maxY,
    width, height,
    canvasWidth: tempCanvas.width,
    canvasHeight: tempCanvas.height,
  }

  if (returnCanvas) {
    res.tempCanvas = tempCanvas
    res.tempContext = tempContext
  } else {
    tempCanvas.width = tempCanvas.height = 0
    tempCanvas = tempContext = null
  }
  return res
}

export const currentLayerIsEmpty = (layerId = state.currentSelectedLayerId) => {
  return Number.isFinite(state.layers[layerId].maxX) === false ||
  state.layers[layerId].minX === null ||
  state.layers[layerId].maxX === null ||
  state.layers[layerId].minY === null ||
  state.layers[layerId].maxY === null
}

export const clearCurrentLayer = () => {
  const layer = state.layers[state.currentSelectedLayerId]
  closeParams()
  updateGcoMode(false, false)
  if (Number.isFinite(layer.maxX)) {
    refs.context.clearRect(0, 0, state.canvases.width, state.canvases.height)
    layer.img.src = refs.canvas.toDataURL('image/png')
    layer.minX = Infinity
    layer.minY = Infinity
    layer.maxY = -Infinity
    layer.maxX = -Infinity
    return true
  } else {
    return false
  }
}

const createNewLayerObject = () => {
  const now = Date.now()
  return {
    id: uuidv4(),
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    active: true,
    name: `Layer ${++state.maxLayerCount}`,
    opacity: 1,
    localPathSmall: '',
    localPathBig: '',
    selected: false,
    order: getMaxOrder() + 1,
    selectedByCoworker: false,
    history: new History(config.stepHistoryMaxLength),
    img: null,
    previewRef: null,
    createTimestamp: now,
    updateTimestamp: now,
  }
}

const getMaxOrder = () => Math.max(...Object.values(state.layers).map(l => l.order))

const initLayers = async(initialLayers, canvasWidth, canvasHeight) => {
  state.canvases.width = canvasWidth
  state.canvases.height = canvasHeight
  if (initialLayers.length) {
    initialLayers = initialLayers.map(layerDeepCopy)
    state.layers = Object.fromEntries(initialLayers.map((l, i) => ([l.id, {
      ...l,
      selectedByCoworker: false,
      history: new History(config.stepHistoryMaxLength),
    }])))
  } else {
    const newLayerData = createNewLayerObject()
    state.layers[newLayerData.id] = newLayerData
  }

  const layersIds = Object.keys(state.layers)
  await Promise.all(layersIds.map(createNewLayerDom))

  await selectLayer(layersIds.find(layerId => state.layers[layerId].selected) || layersIds[0])
  closeParams()
  reorderLayersList()

  LayersHistory.add({
    type: 'init',
  })
}

const toggleParams = () => {
  if (refs.paramsContainer.classList.contains('params-container-visible')) {
    closeParams()
  } else {
    openParams()
  }
}

const openParams = async() => {
  if (state.paramsTimeout !== false) {
    clearTimeout(state.paramsTimeout)
  }
  state.paramsTimeout = setTimeout(closeParams, config.paramsCloseDelay)
  refs.paramsContainer.classList.add('params-container-visible')
}

export const closeParams = async() => {
  if (state.paramsTimeout !== false) {
    refs.paramsContainer.classList.remove('params-container-visible')
    clearTimeout(state.paramsTimeout)
    state.paramsTimeout = false
    await delay(parseInt(timing.OPTIONS_SHOW_TRANSITION))
  }
}

const restoreDeletedLayer = async(layerId, withAnimation = true) => {
  const layer = state.deletedLayers[layerId]
  state.layers[layerId] = layer
  delete state.deletedLayers[layerId]

  createNewLayerListElementDom(layerId, withAnimation)
  reorderLayersList()
  layer.img.style.zIndex = layer.order * 10
  layer.img.style.opacity = layer.opacity

  if (state.layers[layerId].active) {
    enableLayer(layerId, false)
  } else {
    disableLayer(layerId, false)
  }

  await updateLayerPreview(layerId)
  Editor.appendLayer(layer.img)
}

const createNewLayerListElementDom = (layerId, withAnimation = true) => {
  const layerListDom = refs.layerListElement.cloneNode(true)
  layerListDom.setAttribute('data-id', layerId)
  state.layers[layerId].previewRef = layerListDom.querySelector('.editor-layers__layer-preview')
  if (state.layers[layerId].selected) {
    layerListDom.classList.add('editor-layers__layer-selected')
  }
  layerListDom.querySelector('input').value = state.layers[layerId].name

  layerListDom.querySelector('input').addEventListener(Params.eventStart, (e) => {
    e.preventDefault()
  })
  if (Params.isDesktop) {
    layerListDom.querySelector('input').onchange = (e) => {
      saveLayerName(layerId, e.target.value)
    }
  }

  refs.layersList.appendChild(layerListDom)
  if (withAnimation) {
    addInElement(layerListDom, { commitResult: false })
  }
}

const createNewLayerDom = async(layerId, withAnimation = false) => {
  createNewLayerListElementDom(layerId, withAnimation)
  const layer = state.layers[layerId]
  layer.img = new Image()
  layer.img.crossOrigin = 'Anonymous'
  layer.img.style.zIndex = layer.order * 10
  layer.img.style.opacity = layer.opacity

  if (state.layers[layerId].active) {
    enableLayer(layerId, false)
  } else {
    disableLayer(layerId, false)
  }

  if (layer.localPathBig) {
    await loadImageOffThread(layer.img, layer.localPathBig)
    const { minX, minY, maxX, maxY } = await findImageContentCoords(layer.img, config.coordsImgScale)
    layer.minX = minX
    layer.minY = minY
    layer.maxX = maxX
    layer.maxY = maxY
    updateLayerPreview(layerId)
  } else {
    layer.localPathBig = EMPTY_BASE64
    await loadImageOffThread(layer.img, EMPTY_BASE64)
  }
  layer.history.add({
    data: layer.localPathBig,
    minX: layer.minX,
    minY: layer.minY,
    maxX: layer.maxX,
    maxY: layer.maxY,
  })
  Editor.appendLayer(layer.img)
}

const addNewLayer = (e) => {
  preventDefault(e)
  if (Object.keys(state.layers).length >= config.maxLayersNumber) {
    return
  }

  const newLayerData = createNewLayerObject()
  state.layers[newLayerData.id] = newLayerData
  createNewLayerDom(newLayerData.id, true)
  reorderLayersList()
  addLayerHistoryNewStep(newLayerData.id, state.currentSelectedLayerId)
  selectLayer(newLayerData.id, false)
  refs.layersList.scrollTop = 0
  Tracking.trackAction(Tracking.actions.ADD_LAYER)
}

const updateEditorCanvas = () => {
  Editor.updateEditorLayer(
    parseInt(state.layers[state.currentSelectedLayerId].img.style.zIndex),
    state.layers[state.currentSelectedLayerId].opacity,
    state.gcoMode ? 'source-atop' : 'source-over',
    state.layers[state.currentSelectedLayerId].active
  )
}

const selectLayer = async(layerId, showParams = true) => {
  if (layerId !== state.currentSelectedLayerId && state.layers[layerId].selectedByCoworker === false) {
    const wasInResizeMode = state.resizeMode

    if (state.currentSelectedLayerId) {
      if (state.resizeMode) {
        await saveResizeModeIfNeeded()
      }
      if (state.layers[state.currentSelectedLayerId].localPathBig) {
        await loadImageOffThread(state.layers[state.currentSelectedLayerId].img, state.layers[state.currentSelectedLayerId].localPathBig)
      }
      state.layers[state.currentSelectedLayerId].img.classList.remove('editor__layer-img-selected')
    }

    Object.values(state.layers).forEach(l => {
      l.selected = (l.id === layerId)
      refs.layersList.querySelector(`div[data-id="${l.id}"]`).classList.toggle('editor-layers__layer-selected', l.selected)
    })
    state.currentSelectedLayerId = layerId

    updateParamsByLayer(layerId)
    if (showParams) {
      openParams()
    }

    fillCanvasWithImage(refs.context, state.layers[layerId].img)
    state.layers[layerId].img.classList.add('editor__layer-img-selected')
    refs.canvas.style.zIndex = state.layers[layerId].order * 10
    refs.canvas.style.opacity = state.layers[layerId].opacity
    refs.canvas.classList.toggle('displayNone', !state.layers[layerId].active)
    updateLayerPreview(layerId)
    updateEditorCanvas()
    if (state.resizeMode) {
      startResizeMode()
    } else if (wasInResizeMode) {
      endResizeMode()
    }
  }
}

const reorderLayersList = () => {
  Object.values(state.layers).sort((l1, l2) => l1.order > l2.order ? 1 : -1).forEach((layer, i) => {
    layer.order = i
    layer.img.style.zIndex = i * 10
    if (layer.selected) {
      refs.canvas.style.zIndex = i * 10
    }
  })

  const layersCount = Object.keys(state.layers).length
  removeGlobalStatus('drawith__LAYERS_FULL')
  removeGlobalStatus('drawith__LAYERS_EMPTY')
  if (layersCount === config.maxLayersNumber) {
    addGlobalStatus('drawith__LAYERS_FULL')
  } else if (layersCount === 1) {
    addGlobalStatus('drawith__LAYERS_EMPTY')
  }

  [...refs.layersList.children]
    .sort((l1, l2) => state.layers[l1.getAttribute('data-id')].order < state.layers[l2.getAttribute('data-id')].order ? 1 : -1)
    .forEach(node => refs.layersList.appendChild(node))
  updateEditorCanvas()
}

const _deleteLayer = async(layerId, nextSelectedId) => {
  refs.imageForResize = null
  await selectLayer(nextSelectedId, false)
  closeParams()
  fadeOutElements(state.layers[layerId].img)
  await removeOutElement(refs.layersList.querySelector(`div[data-id="${layerId}"]`))
  state.layers[layerId].previewRef = null
  state.layers[layerId].img.remove()
  state.deletedLayers[layerId] = state.layers[layerId]
  delete state.layers[layerId]
  updateUndoRedoButtons()
  reorderLayersList()
}
const deleteLayer = async(e, layerId = state.currentSelectedLayerId) => {
  preventDefault(e)
  if (state.paramsTimeout === false) {
    return
  } // params are closed
  openParams()
  if (
    state.layers[layerId].selectedByCoworker ||
    Object.values(state.layers).filter(l => l.selectedByCoworker === false).length <= 1
  ) {
    return
  }

  Tracking.trackAction(Tracking.actions.DELETE_LAYER)
  const layers = Object.values(state.layers).filter(l => !l.selectedByCoworker && l.id !== layerId)
  const maxOrder = Math.max(...layers.map(l => l.order))
  const nextSelectedId = layers.filter(l => l.order === maxOrder)[0].id
  addLayerHistoryDeleteStep(layerId, nextSelectedId)
  await _deleteLayer(layerId, nextSelectedId)
}

const renameLayer = async(e, id = state.currentSelectedLayerId) => {
  preventDefault(e)
  if (state.paramsTimeout === false) {
    return
  } // params are closed
  openParams()
  const newName = await Messages.input(`${labels.changeLayerName}: ${state.layers[id].name}`, state.layers[id].name)
  if (newName) {
    saveLayerName(id, newName, true)
  }
}

const saveLayerName = (id, name, updateDom = false) => {
  if (id && name) {
    state.layers[id].name = name
    Tracking.trackAction(Tracking.actions.RENAME_LAYER)
    if (updateDom) {
      refs.layersList.querySelector(`div[data-id="${id}"] input`).value = name
    }
  }
}

const duplicateSelectedLayer = async(e) => {
  preventDefault(e)
  if (state.paramsTimeout === false) {
    return
  } // params are closed
  openParams()
  if (
    refs.duplicateLayerButton.classList.contains('disabled') ||
    !Number.isFinite(state.layers[state.currentSelectedLayerId].maxX) ||
    Object.keys(state.layers).length >= config.maxLayersNumber
  ) {
    return
  }

  Tracking.trackAction(Tracking.actions.DUPLICATE_LAYER)
  await saveResizeModeIfNeeded()
  const newId = uuidv4()
  const newLayer = layerDeepCopy(state.layers[state.currentSelectedLayerId])
  const now = Date.now()
  newLayer.id = newId
  newLayer.selected = false
  newLayer.createTimestamp = now
  newLayer.updateTimestamp = now
  newLayer.name = `Layer ${++state.maxLayerCount}`
  newLayer.history = new History(config.stepHistoryMaxLength)
  newLayer.active = true
  Object.keys(state.layers).forEach(id => {
    if (state.layers[id].order >= newLayer.order) {
      state.layers[id].order++
    }
  })
  state.layers[newId] = newLayer
  createNewLayerDom(newId, true)
  reorderLayersList()
  refs.mergeDownLayerButton.classList.remove('disabled')
  addLayerHistoryDuplicateStep(state.currentSelectedLayerId, newId)
  if (state.resizeMode) {
    startResizeMode()
  }
}

const mergeDownSelectedLayer = async(e) => {
  preventDefault(e)
  if (state.paramsTimeout === false) {
    return
  } // params are closed
  openParams()
  if (
    refs.mergeDownLayerButton.classList.contains('disabled') ||
    !Number.isFinite(state.layers[state.currentSelectedLayerId].maxX) ||
    Object.keys(state.layers).length === 1
  ) {
    return
  }

  await saveResizeModeIfNeeded()
  const selectedLayer = state.layers[state.currentSelectedLayerId]
  const lowerLayer = Object.values(state.layers).find(layer => layer.order === selectedLayer.order - 1)

  if (lowerLayer) {
    Tracking.trackAction(Tracking.actions.MERGE_DOWN_LAYERS)
    // create a new layer
    const newLayerData = createNewLayerObject()
    newLayerData.order = lowerLayer.order
    state.layers[newLayerData.id] = newLayerData

    // merge the two source layers
    const res = await Promise.all([
      mergeBase64Images([lowerLayer.localPathBig, selectedLayer.localPathBig]),
      loadImageOffThread(selectedLayer.img, selectedLayer.localPathBig || EMPTY_BASE64),
    ])
    state.layers[newLayerData.id].localPathBig = res[0]

    // animate in and out new and old list dom
    closeParams()
    await Promise.all([
      fadeOutElements([state.layers[selectedLayer.id].img, state.layers[lowerLayer.id].img, refs.canvas]),
      removeOutElement(refs.layersList.querySelector(`div[data-id="${selectedLayer.id}"]`)),
      removeOutElement(refs.layersList.querySelector(`div[data-id="${lowerLayer.id}"]`)),
    ])
    await createNewLayerDom(newLayerData.id, true)
    await updateLayerRealCoords(newLayerData.id)

    // delete the two source layers
    state.layers[selectedLayer.id].previewRef = null
    state.layers[lowerLayer.id].previewRef = null
    state.layers[selectedLayer.id].img.remove()
    state.layers[lowerLayer.id].img.remove()
    state.deletedLayers[selectedLayer.id] = state.layers[selectedLayer.id]
    state.deletedLayers[lowerLayer.id] = state.layers[lowerLayer.id]
    delete state.layers[selectedLayer.id]
    delete state.layers[lowerLayer.id]
    addLayerHistoryMergeStep(selectedLayer.id, lowerLayer.id, newLayerData.id)
    updateUndoRedoButtons()

    // select the new one
    state.currentSelectedLayerId = false
    await selectLayer(newLayerData.id)
    reorderLayersList()
  }
}

const enableLayer = (layerId = state.currentSelectedLayerId, track = true) => {
  const layer = state.layers[layerId]
  layer.active = true
  refs.layersList.querySelector(`div[data-id="${layerId}"]`).classList.add('editor-layers__layer-active')
  const layerOptionButton = refs.layersList.querySelector(`div[data-id="${layerId}"] .editor-layers__layer-options-button`)
  layerOptionButton.classList.add('svg-icon-visible')
  layerOptionButton.classList.remove('svg-icon-hidden')

  fadeInElements(layer.img, { maxFadeIn: layer.opacity })
  if (layerId === state.currentSelectedLayerId) {
    const canBeResized = layerCanBeResized(layerId)
    updateEditorCanvas()
    fadeInElements(refs.canvas, { maxFadeIn: layer.opacity })
    updateResizeMode(false, canBeResized)
    updateGcoMode(false, canBeResized)
    refs.visibilityLayerButton.classList.toggle('svg-icon-visible', layer.active)
    refs.visibilityLayerButton.classList.toggle('svg-icon-hidden', !layer.active)
  }
  track && Tracking.trackAction(Tracking.actions.SHOW_LAYER)
}

const disableLayer = (layerId = state.currentSelectedLayerId, track = true) => {
  const layer = state.layers[layerId]
  layer.active = false
  refs.layersList.querySelector(`div[data-id="${layerId}"]`).classList.remove('editor-layers__layer-active')
  const layerOptionButton = refs.layersList.querySelector(`div[data-id="${layerId}"] .editor-layers__layer-options-button`)
  layerOptionButton.classList.add('svg-icon-hidden')
  layerOptionButton.classList.remove('svg-icon-visible')

  fadeOutElements(layer.img, { maxFadeIn: layer.opacity })
  if (layerId === state.currentSelectedLayerId) {
    updateEditorCanvas()
    fadeOutElements(refs.canvas, { maxFadeIn: layer.opacity })
    updateResizeMode(false, false)
    updateGcoMode(state.gcoMode, false)
    refs.visibilityLayerButton.classList.toggle('svg-icon-visible', layer.active)
    refs.visibilityLayerButton.classList.toggle('svg-icon-hidden', !layer.active)
  }
  track && Tracking.trackAction(Tracking.actions.HIDE_LAYER)
}

const toggleEnableLayer = (e, layerId = state.currentSelectedLayerId, clickedByList = false) => {
  preventDefault(e)
  if (!clickedByList && state.paramsTimeout === false) {
    return
  } // params are closed
  if (layerId === state.currentSelectedLayerId && state.resizeMode) {
    return
  }
  if (state.layers[layerId].active) {
    disableLayer(layerId)
    addLayerHistoryHideStep(layerId)
  } else {
    enableLayer(layerId)
    addLayerHistoryShowStep(layerId)
  }
  if (state.resizeMode) {
    updateMagnetismCoords(state.currentSelectedLayerId)
  }
}

export const updateCanvasContent = (minX, minY, w, h, rotation) => {
  fillCanvasWithImage(refs.context, refs.imageForResize, minX, minY, w, h, convertAngleDegToRad(rotation))
  state.resizeModeMadeChanges = true
  Tools.toggleButton('undo', true)
}

export const updateMagnetismCoords = (layerId = state.currentSelectedLayerId, hasRotation = false) => {
  state.magnetismCoords.x = getMagnetismCoordXForLayer(state, layerId, hasRotation)
  state.magnetismCoords.y = getMagnetismCoordYForLayer(state, layerId, hasRotation)
  if (hasRotation) {
    state.magnetismCoords.l = state.magnetismCoords.t = state.magnetismCoords.r = state.magnetismCoords.b = []
  } else {
    state.magnetismCoords.l = getMagnetismCoordLeftForLayer(state, layerId)
    state.magnetismCoords.t = getMagnetismCoordTopForLayer(state, layerId)
    state.magnetismCoords.r = getMagnetismCoordRightForLayer(state, layerId)
    state.magnetismCoords.b = getMagnetismCoordBottomForLayer(state, layerId)
  }
}
export const getMagnetismCoords = () => state.magnetismCoords

const startResizeMode = (track = false) => {
  const layerOptionButton = refs.layersList.querySelector(`div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`)
  layerOptionButton.classList.add('disabled')
  updateResizeMode(true, true)
  updateGcoMode(state.gcoMode, false)
  state.resizeModeMadeChanges = false
  Tools.toggleButton('undo', false)
  Tools.toggleButton('redo', false)
  Tools.toggleButton('clear', false)
  refs.resizeButton.classList.toggle('selected', state.resizeMode)
  refs.visibilityLayerButton.classList.add('disabled')
  ColorPicker.deselectPipette(true, false, true)

  const layer = state.layers[state.currentSelectedLayerId]
  const dom = layer.selected ? refs.canvas : layer.img
  const [image, minX, minY, width, height] = cropImageWithMargin(dom, layer.minX, layer.minY, layer.maxX, layer.maxY, 0)
  refs.imageForResize = image
  updateMagnetismCoords(state.currentSelectedLayerId)
  Editor.showDragBox(round(minX + width / 2, 1), round(minY + height / 2, 1), width, height, true)
  if (track) {
    Tracking.trackAction(Tracking.actions.RESIZE_LAYER)
  }
}
const saveResizeModeIfNeeded = async() => {
  if (state.resizeModeMadeChanges) {
    await addLayerHistoryContentChangedStep()
    updateUndoRedoButtons()
  }
  state.resizeModeMadeChanges = false
  refs.imageForResize = null
}
const endResizeMode = async() => {
  const canBeResized = layerCanBeResized(state.currentSelectedLayerId)
  const layerOptionButton = refs.layersList.querySelector(`div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`)
  layerOptionButton.classList.remove('disabled')
  updateResizeMode(false, canBeResized)
  updateGcoMode(state.gcoMode, canBeResized)
  Tools.toggleButton('clear', true)
  await saveResizeModeIfNeeded()
  refs.visibilityLayerButton.classList.remove('disabled')
  refs.resizeButton.classList.toggle('selected', state.resizeMode)
  Editor.hideDragBox()
}

export const closeResizeModeIfNeeded = () => {
  if (state && state.currentSelectedLayerId) {
    if (state.resizeMode) {
      endResizeMode()
    }
  }
}
export const updateCurrentTool = (isUsingEraser) => {
  if (state && state.currentSelectedLayerId) {
    state.editorIsUsingEraser = isUsingEraser
    updateGcoMode(state.gcoMode, layerCanBeResized(state.currentSelectedLayerId))
  }
}

const flipLayer = async(e, layerId, horizontally) => {
  preventDefault(e)
  if (state.paramsTimeout === false) {
    return
  } // params are closed
  openParams()
  const layer = state.layers[layerId]
  if (Number.isFinite(layer.maxX)) {
    const dom = layer.selected ? refs.canvas : layer.img
    if (state.resizeMode) {
      refs.imageForResize = flipImage(refs.imageForResize, horizontally)
      const { minX, minY, maxX, maxY } = await findImageContentCoords(dom, config.coordsImgScale)
      const [content, x, y] = cropImageWithMargin(dom, minX, minY, maxX, maxY)
      fillCanvasWithImage(refs.context, flipImage(content, horizontally), x, y)
    } else {
      const [content, x, y] = cropImageWithMargin(dom, layer.minX, layer.minY, layer.maxX, layer.maxY)
      fillCanvasWithImage(refs.context, flipImage(content, horizontally), x, y)
    }
    addLayerHistoryContentChangedStep()
  }
}
const flipVertically = (e, layerId = state.currentSelectedLayerId) => flipLayer(e, layerId, false)
const flipHorizontally = (e, layerId = state.currentSelectedLayerId) => flipLayer(e, layerId, true)

const resizeButtonTouchStart = (e) => {
  preventDefault(e)
  closeParams()
  if (!refs.resizeButton.classList.contains('disabled')) {
    if (state.resizeMode) {
      endResizeMode()
    } else {
      startResizeMode(true)
    }
  }
}
const gcoModeTouchStart = (e) => {
  preventDefault(e)
  closeParams()
  if (layerCanBeResized(state.currentSelectedLayerId) && !state.resizeMode) {
    updateGcoMode(!state.gcoMode, true)
    Tracking.trackAction(Tracking.actions.CHANGE_LAYER_GCO, {
      cgo: state.gcoMode ? 'source-atop' : 'source-over',
    })
  }
}

const updateResizeMode = (selected, active) => {
  refs.resizeButton.classList.toggle('disabled', !active)
  if (selected !== state.resizeMode) {
    state.resizeMode = selected
    refs.resizeButton.classList.toggle('selected', selected)
  }
}
const updateGcoMode = (selected, active) => {
  refs.gcoButton.classList.toggle('disabled', !active || state.editorIsUsingEraser)
  if (selected !== state.gcoMode) {
    state.gcoMode = selected
    refs.gcoButton.classList.remove('png-icon-source-atop', 'png-icon-source-over', 'png-icon-source-over-atop')
    refs.gcoButton.classList.toggle('selected', selected)
    if (selected) {
      refs.gcoButton.classList.add('png-icon-source-atop')
    } else {
      refs.gcoButton.classList.add('png-icon-source-over')
    }
    updateEditorCanvas()
  }
}

const trackLayerOpacityChanges = debounce((opacity) => {
  Tracking.trackAction(Tracking.actions.CHANGE_LAYER_OPACITY, { opacity })
}, 5000)

const _updateLayerOpacity = (layerId, opacity, inProgress) => {
  refs.opacityCursor.style.bottom = `${opacity}%`
  refs.opacityLabel.innerHTML = `${opacity}`
  refs.opacitySlider.style.background = `linear-gradient(0deg, var(--palette-green-1) ${opacity}%, var(--palette-white) ${opacity}%)`
  opacity = round(opacity / 100, 2)
  state.layers[layerId].opacity = opacity
  trackLayerOpacityChanges(opacity)
  state.layers[layerId].img.style.opacity = opacity
  refs.canvas.style.opacity = opacity

  if (!inProgress) {
    const canBeResized = layerCanBeResized(layerId)
    const wasInResizeMode = state.resizeMode
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateGcoMode(state.gcoMode, !state.resizeMode && canBeResized)
    if (wasInResizeMode && !state.resizeMode) {
      endResizeMode()
    }
  }
  updateEditorCanvas()
}
const updateLayerOpacity = (() => {
  let startValue = 0
  return (opacity, inProgress, changed) => {
    if (state.paramsTimeout === false) {
      return
    } // params are closed
    if (!changed) { // just touchDown without drag yet
      startValue = state.layers[state.currentSelectedLayerId].opacity * 100
    }
    openParams()
    _updateLayerOpacity(state.currentSelectedLayerId, opacity, inProgress)
    if (!inProgress) {
      addLayerHistoryOpacityStep(state.currentSelectedLayerId, opacity, startValue)
    }
  }
})()

const updateParamsByLayer = (layerId = state.currentSelectedLayerId) => {
  if (layerId) {
    const layer = state.layers[layerId]
    const layerIsEmpty = !Number.isFinite(layer.minX)
    const canBeResized = layerCanBeResized(layerId)
    const opacity = round(layer.opacity * 100, 0)
    refs.opacityLabel.innerHTML = opacity
    refs.opacityCursor.style.bottom = `${opacity}%`
    refs.opacitySlider.style.background = `linear-gradient(0deg, var(--palette-green-1) ${opacity}%, var(--palette-white) ${opacity}%)`
    refs.deleteLayerButton.classList.toggle('disabled', layer.selectedByCoworker)
    refs.duplicateLayerButton.classList.toggle('disabled', layerIsEmpty)
    refs.mergeDownLayerButton.classList.toggle('disabled', layerIsEmpty || layer.order === 0)
    refs.flipVerticalButton.classList.toggle('disabled', layerIsEmpty)
    refs.flipHorizontalButton.classList.toggle('disabled', layerIsEmpty)
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
    refs.visibilityLayerButton.classList.toggle('svg-icon-visible', layer.active)
    refs.visibilityLayerButton.classList.toggle('svg-icon-hidden', !layer.active)
  }
}

const onListDragChange = (draggedElement, domOrder, inProgress = true) => {
  const layers = Object.values(state.layers)
  const currentLayerOrder = state.layers[draggedElement.getAttribute('data-id')].order
  const newOrder = layers.length - 1 - domOrder

  if (!inProgress) {
    addLayerHistoryOrderStep(draggedElement.getAttribute('data-id'), newOrder, state.listDragStartIndex)
    state.listDragStartIndex = -1
  }

  if (currentLayerOrder === newOrder) {
    return
  }

  if (currentLayerOrder > newOrder) {
    layers.forEach(layer => {
      if (layer.order >= newOrder) {
        layer.order++
      }
    })
    state.layers[draggedElement.getAttribute('data-id')].order = newOrder
  } else {
    layers.forEach(layer => {
      if (layer.order > newOrder) {
        layer.order++
      }
    })
    state.layers[draggedElement.getAttribute('data-id')].order = newOrder + 1
  }
  reorderLayersList()
}

const startDragLayer = (e, layerListDom) => {
  closeParams()
  state.listDragStartIndex = state.layers[layerListDom.getAttribute('data-id')].order
  handleElementsListDragAndDrop(e, refs.layersList, layerListDom, onListDragChange, 'vertical')
  Tracking.trackAction(Tracking.actions.DRAG_LAYER)
}

const findListTargetLayerParent = (target) => {
  if (target === refs.layersList) {return false}
  while (!target.classList.contains('editor-layers__layer')) {
    target = target.parentNode
    if (target === refs.layersList) {return false}
  }
  return target
}

const onLayerTouchDown = (layerId) => {
  if (layerId !== state.currentSelectedLayerId) {
    if (state.layers[layerId].selectedByCoworker) {
      updateParamsByLayer(layerId)
      openParams()
    } else {
      Tracking.trackAction(Tracking.actions.SELECT_LAYER)
      selectLayer(layerId)
    }
  } else {
    updateParamsByLayer(layerId)
    toggleParams()
  }
}

const onListClick = (e) => {
  const layerListDom = findListTargetLayerParent(e.target)
  if (layerListDom) {
    if (
      e.target === layerListDom ||
      e.target.classList.contains('editor-layers__layer-preview') ||
      e.target.nodeName.toLowerCase() === 'input'
    ) {
      onLayerTouchDown(layerListDom.getAttribute('data-id'))
    } else if (e.target.classList.contains('editor-layers__layer-options-button')) {
      toggleEnableLayer(e, layerListDom.getAttribute('data-id'), true)
    }
  }
}

const onListLongPress = async(e) => {
  e.preventDefault()
  if (Object.keys(state.layers).length > 1) {
    const layerListDom = findListTargetLayerParent(e.target)
    if (layerListDom) {
      await selectLayer(layerListDom.getAttribute('data-id'))
      startDragLayer(e, layerListDom)
    }
  }
}

const onContainerTouchStart = (e) => {
  if (e.target === refs.layersContainer) {
    preventDefault(e)
  }
}

const initDom = async(moduleContainer, canvasWidth, canvasHeight, withCoworking) => {
  let dom = await loadTemplate(tplLayers, {
    maxLength: MAX_LAYER_NAME_LENGTH,
  }, moduleContainer)
  refs.layersContainer = dom[0]
  refs.paramsContainer = dom[1]
  refs.resizeButton = dom[2]
  refs.gcoButton = createDom('png-icon-source-over')
  refs.layersList = refs.layersContainer.querySelector('.editor-layers__list')
  refs.addNewLayerButton = refs.layersContainer.querySelector('.editor-layers__add-new')
  refs.layerListElement = refs.layersContainer.querySelector('.editor-layers__layer')
  refs.visibilityLayerButton = refs.paramsContainer.querySelector('.editor-layers__params-visibility')
  refs.editLayerNameButton = refs.paramsContainer.querySelector('.editor-layers__params-name')
  refs.duplicateLayerButton = refs.paramsContainer.querySelector('.editor-layers__params-duplicate')
  refs.mergeDownLayerButton = refs.paramsContainer.querySelector('.editor-layers__params-merge-down')
  refs.flipVerticalButton = refs.paramsContainer.querySelector('.editor-layers__params-flip-vertical')
  refs.flipHorizontalButton = refs.paramsContainer.querySelector('.editor-layers__params-flip-horizontal')
  refs.deleteLayerButton = refs.paramsContainer.querySelector('.editor-layers__params-delete')
  refs.opacitySlider = refs.paramsContainer.querySelector('.editor-layers__opacity-slider')
  refs.opacityCursor = refs.opacitySlider.querySelector('div')
  refs.opacityLabel = refs.opacitySlider.querySelector('span')
  refs.resizeButton.classList.toggle('selected', state.resizeMode)

  refs.layerListElement.remove()
  refs.paramsContainer.addEventListener(Params.eventStart, preventDefault)
  refs.layersContainer.addEventListener(Params.eventStart, onContainerTouchStart)
  refs.addNewLayerButton.addEventListener(Params.eventStart, addNewLayer)
  refs.flipVerticalButton.addEventListener(Params.eventStart, flipVertically)
  refs.flipHorizontalButton.addEventListener(Params.eventStart, flipHorizontally)
  refs.visibilityLayerButton.addEventListener(Params.eventStart, toggleEnableLayer)
  refs.editLayerNameButton.addEventListener(Params.eventStart, renameLayer)
  refs.duplicateLayerButton.addEventListener(Params.eventStart, duplicateSelectedLayer)
  refs.mergeDownLayerButton.addEventListener(Params.eventStart, mergeDownSelectedLayer)
  refs.deleteLayerButton.addEventListener(Params.eventStart, deleteLayer)
  addListScrollClickAndPressHandlers(refs.layersList, onListClick, onListLongPress)
  addVerticalDragSliderHandler(refs.opacityCursor, refs.opacitySlider, updateLayerOpacity, 100, 0, false, 0)

  if (withCoworking) {
    refs.resizeButton.remove()
    refs.gcoButton.remove()
  } else {
    Toolbar.addOptionButtonsGroup([refs.resizeButton, refs.gcoButton])
    refs.gcoButton.addEventListener(Params.eventStart, gcoModeTouchStart)
    refs.resizeButton.addEventListener(Params.eventStart, resizeButtonTouchStart)
  }

  refs.canvas = document.createElement('canvas')
  refs.canvas.width = canvasWidth
  refs.canvas.height = canvasHeight
  refs.context = getNewContextForCanvas(refs.canvas)

  Editor.setLayerContext(refs.context)
  Editor.appendLayer(refs.canvas)

  dom = undefined
}

export const init = async(moduleContainer, initialLayers = [], canvasWidth, canvasHeight, withCoworking = false) => {
  config.maxLayersNumber = config.maxLayersNumberHightPerf
  if (Params.isTablet && Params.ios) {
    const screenMaxSize = getRealScreenMaxSize()
    if (screenMaxSize < 2200) {
      config.maxLayersNumber = config.maxLayersNumberMediumPerf
    }
  }
  state = deepCopy(initialState)

  await initDom(moduleContainer, canvasWidth, canvasHeight, withCoworking)

  refs.layersList.scrollTop = 1
  if (withCoworking) {
    refs.layersContainer.classList.add('displayNone')
    refs.paramsContainer.classList.add('displayNone')
  } else {
    refs.layersContainer.classList.remove('displayNone')
    refs.paramsContainer.classList.remove('displayNone')
  }
  await initLayers(initialLayers, canvasWidth, canvasHeight)
  state.maxLayerCount = Object.keys(state.layers).length
}

export const remove = () => {
  Object.values(state.layers).forEach(layer => {
    layer.img.remove()
    layer.history.clear()
    layer.img = layer.history = layer.localPathBig = undefined
  })
  LayersHistory.clear()
  cleanRefs(refs)
  state = {}
}

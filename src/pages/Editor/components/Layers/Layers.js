const tplLayers = require('./layers.tpl')
import './layers.css'

import { v4 as uuidv4 } from 'uuid'
import { getRealScreenMaxSize } from 'main/main'
import Params from 'main/Params'
import History from 'modules/History'
import * as Editor from 'pages/Editor'
import * as Toolbar from 'pages/Editor/components/Toolbar'
import * as Tools from 'pages/Editor/components/Tools'
import * as Coworking from 'modules/Coworking'
import * as ColorPicker from 'pages/Editor/components/ColorPicker'
import * as Messages from 'modules/Messages'
import { preventDefault, loadTemplate, createDom } from 'utils/domUtils'
import { cleanRefs } from 'utils/moduleUtils'
import { addInElement, removeOutElement, fadeOutElements, fadeInElements } from 'utils/animationsUtils'
import { round, convertAngleDegToRad } from 'utils/mathUtils'
import { getImgBase64OffThread, cropImageWithMargin, resizeImage, flipImage, findImageContentCoords, mergeImages, duplicateCanvas, getCanvasFromBase64 } from 'utils/imageUtils'
import { getNewContextForCanvas, fillCanvasWithImage } from 'utils/canvasUtils'
import { addListScrollClickAndPressHandlers, addVerticalDragSliderHandler, handleElementsListDragAndDrop } from 'utils/uiUtils'
import { getMagnetismCoordXForLayer, getMagnetismCoordYForLayer, getMagnetismCoordLeftForLayer, getMagnetismCoordTopForLayer, getMagnetismCoordRightForLayer, getMagnetismCoordBottomForLayer } from './layersUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { deepCopy, delay, parallelize } from 'utils/jsUtils'
import { timing } from 'main/Theme'

import { HISTORY_STEP_LAYER_CONTENT, HISTORY_STEP_LAYER_OPACITY, HISTORY_STEP_LAYER_SHOW, HISTORY_STEP_LAYER_HIDE, HISTORY_STEP_LAYER_ORDER, HISTORY_STEP_LAYER_DUPLICATE, HISTORY_STEP_LAYER_NEW, HISTORY_STEP_LAYER_DELETE, HISTORY_STEP_LAYERS_MERGE } from './constants'
const MAX_LAYER_NAME_LENGTH = 12
const PREVIEW_SIZE = 300
const EMPTY_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='


const config = {
  maxConcurrentThreads: 8,
  stepHistoryMaxLength: 20 + 1,
  maxLayersNumber: 30,
  maxLayersNumberLowPerf: 20,
  maxLayersNumberMediumPerf: 30,
  maxLayersNumberHighPerf: 40,
  paramsCloseDelay: 7_000,
  coordsImgScale: 1, // findImageContentCoords pxPrecision. 1 = check every px, 2 = check every 2px, etc...
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

export const getCurrentSelectedLayerId = () => state.currentSelectedLayerId
export const getLayerContext = (layerId = state.currentSelectedLayerId) => state.layers[layerId].canvas.context

const cleanLayersHistoryOldActionIfNeeded = (action) => {
  if (action.type === HISTORY_STEP_LAYER_CONTENT) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteFarest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_DELETE) {
    hardDeleteLayer(action.layerId)
  } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
    hardDeleteLayer(action.layerOneId)
    hardDeleteLayer(action.layerTwoId)
  }
}

const cleanLayersHistoryOverwrittenActionIfNeeded = (action) => {
  if (action.type === HISTORY_STEP_LAYER_CONTENT) {
    const layer = state.layers[action.layerId] || state.deletedLayers[action.layerId]
    if (layer) {
      layer.history.deleteNewest()
    }
  } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE) {
    hardDeleteLayer(action.newLayerId)
  } else if (action.type === HISTORY_STEP_LAYER_NEW) {
    hardDeleteLayer(action.layerId)
  } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
    hardDeleteLayer(action.newLayerId)
  }
}

const addGlobalLayersHistoryAction = (action) => {
  // Adding a new action may result in deleting some others actions from the history
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
  Editor.setDrawingModified()
}

const getLayerCurrentData = async(layerId = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId]
  return {
    bitmap: await createImageBitmap(layer.canvas),
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
  if (step.bitmap?.width) {
    fillCanvasWithImage(layer.canvas.context, step.bitmap)
  } else {
    layer.canvas.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
  }
  if (layerId === state.currentSelectedLayerId) {
    const canBeResized = layerCanBeResized(layerId)
    updateLayerPreview(layerId)
    updateResizeMode(state.resizeMode && canBeResized, canBeResized)
    updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
  } else {
    selectLayer(layerId, false)
  }
}

// funzione chiamata da editor ad ogni fine tratto, o su fine resize / flip
export const addLayerHistoryContentChangedStep = async() => {
  await updateLayerRealCoords(state.currentSelectedLayerId)
  const layer = state.layers[state.currentSelectedLayerId]
  const canBeResized = layerCanBeResized(state.currentSelectedLayerId)
  layer.updateTimestamp = Date.now()
  layer.modified = true
  const step = await getLayerCurrentData()
  addGlobalLayersHistoryAction({
    layerId: state.currentSelectedLayerId,
    type: HISTORY_STEP_LAYER_CONTENT,
  })
  layer.history.add(step)
  updateLayerPreview(state.currentSelectedLayerId)
  updateResizeMode(state.resizeMode && canBeResized, canBeResized)
  updateGcoMode(state.gcoMode && canBeResized, !state.resizeMode && canBeResized)
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

const updateLayerRealCoords = async(layerId = state.currentSelectedLayerId) => {
  state.layers[layerId] = {
    ...state.layers[layerId],
    ...(await findImageContentCoords(state.layers[layerId].canvas, config.coordsImgScale)),
  }
}

export const setLayerCoordsAfterDragResize = (minX, minY, maxX, maxY) => {
  state.layers[state.currentSelectedLayerId] = {
    ...state.layers[state.currentSelectedLayerId],
    minX, minY, maxX, maxY,
  }
}

const updateLayerPreview = (layerId = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId]

  if (Number.isFinite(layer.minX)) {  // layer isn't empty
    let [preview] = cropImageWithMargin(layer.canvas, layer.minX, layer.minY, layer.maxX, layer.maxY)
    preview = resizeImage(preview, PREVIEW_SIZE)
    layer.previewRef.width = preview.width
    layer.previewRef.height = preview.height
    layer.previewRef.context.drawImage(preview, 0, 0)
  } else {
    layer.previewRef.context.clearRect(0, 0, layer.previewRef.width, layer.previewRef.height)
  }
}

export const undoLayers = async() => {
  if (state.resizeMode) {
    // if I'm in resize mode, I just 'cancel' the changes made during this resize mode
    const step = state.layers[state.currentSelectedLayerId].history.getCurrent()
    if (step) {
      await restoreLayerContentStep(state.currentSelectedLayerId, step)
      startResizeMode()
      Tools.toggleButton('undo', false)
      state.resizeModeMadeChanges = false
    }
  } else if (!Coworking.isOpen()) {
    if (LayersHistory.canGoBack) {
      const action = LayersHistory.getCurrent()
      LayersHistory.back()
      updateUndoRedoButtons()

      if (action.layerId || action.newLayerId) {
        let selectedLayerId = action.layerId
        if (action.type === HISTORY_STEP_LAYER_CONTENT) {
          const step = state.layers[action.layerId].history.back()
          await restoreLayerContentStep(action.layerId, step)
        } else if (action.type === HISTORY_STEP_LAYER_OPACITY) {
          _updateLayerOpacity(action.layerId, action.oldValue)
        } else if (action.type === HISTORY_STEP_LAYER_SHOW) {
          disableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_HIDE) {
          enableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_ORDER) {
          onListDragChange(refs.layersList.querySelector(`div[data-id="${action.layerId}"]`), Object.values(state.layers).length - 1 - action.oldValue)
        } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE) {
          await _deleteLayer(action.newLayerId, action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_NEW) {
          await _deleteLayer(action.layerId, action.prevSelectedId)
          selectedLayerId = action.prevSelectedId
        } else if (action.type === HISTORY_STEP_LAYER_DELETE) {
          await restoreDeletedLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
          await Promise.all([
            restoreDeletedLayer(action.layerOneId),
            restoreDeletedLayer(action.layerTwoId),
          ])
          await _deleteLayer(action.newLayerId, action.layerOneId)
          selectedLayerId = action.layerOneId
        }
        await selectLayer(selectedLayerId, false)
      }
    }
  }
}

export const redoLayers = async() => {
  if (!Coworking.isOpen()) {
    if (LayersHistory.canGoForward && !state.resizeMode) {
      const action = LayersHistory.forward()
      updateUndoRedoButtons()

      if (action.layerId || action.newLayerId) {
        let selectedLayerId = action.layerId
        if (action.type === HISTORY_STEP_LAYER_CONTENT) {
          const step = state.layers[action.layerId].history.forward()
          await restoreLayerContentStep(action.layerId, step)
        } else if (action.type === HISTORY_STEP_LAYER_OPACITY) {
          _updateLayerOpacity(action.layerId, action.newValue)
        } else if (action.type === HISTORY_STEP_LAYER_SHOW) {
          enableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_HIDE) {
          disableLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_ORDER) {
          onListDragChange(refs.layersList.querySelector(`div[data-id="${action.layerId}"]`), Object.values(state.layers).length - 1 - action.newValue)
        } else if (action.type === HISTORY_STEP_LAYER_DUPLICATE) {
          await restoreDeletedLayer(action.newLayerId)
          selectedLayerId = action.newLayerId
        } else if (action.type === HISTORY_STEP_LAYER_NEW) {
          await restoreDeletedLayer(action.layerId)
        } else if (action.type === HISTORY_STEP_LAYER_DELETE) {
          await _deleteLayer(action.layerId, action.nextSelectedId)
          selectedLayerId = action.nextSelectedId
        } else if (action.type === HISTORY_STEP_LAYERS_MERGE) {
          await Promise.all([
            restoreDeletedLayer(action.newLayerId),
            _deleteLayer(action.layerOneId),
            _deleteLayer(action.layerTwoId),
          ])
          selectedLayerId = action.newLayerId
        }
        await selectLayer(selectedLayerId, false)
      }
    }
  }
}

const layerDeepCopy = (layer, {
  exportBitmap = false,
  deepCopyCanvas = true,
  usingOffscreen = false,
} = {}) => {
  const copy = {
    id: layer.id,
    minX: layer.minX,
    minY: layer.minY,
    maxX: layer.maxX,
    maxY: layer.maxY,
    name: layer.name,
    order: layer.order,
    active: layer.active,
    opacity: layer.opacity,
    modified: layer.modified,
    selected: layer.selected,
    createTimestamp: layer.createTimestamp,
    updateTimestamp: layer.updateTimestamp,
    owner: layer.owner,
  }
  if (deepCopyCanvas) {
    copy.canvas = duplicateCanvas(layer.canvas, usingOffscreen)
  }
  if (exportBitmap) {
    copy.bitmap = layer.history.getCurrent()?.bitmap
  }
  return copy
}

const prepareLayerDataToExport = async(layer) => {
  if (layer.bitmap) {
    layer.base64 = await getImgBase64OffThread(layer.bitmap)
  } else if (layer.canvas) {
    let bitmap = await createImageBitmap(layer.canvas)
    layer.base64 = await getImgBase64OffThread(bitmap)
    bitmap.close()
    bitmap = undefined
  }
  delete layer.owner
  delete layer.resizeMode
  delete layer.modified
  delete layer.canvas
  delete layer.bitmap
  delete layer.gco
  return layer
}

export const mergeUnchangedLayers = (exportedLayers, previousLayers) => {
  return exportedLayers.map(layer => {
    if (!layer.base64) {
      layer.base64 = previousLayers.find(pl => pl.id === layer.id).base64
    }
    return layer
  })
}

export const exportLayers = async({
  exportJustModifiedLayers = true,
  cleanMemoryAfterwards = false,
} = {}) => {
  let layerData = []
  let currentLayers = Object.values(state.layers)
  let layers = currentLayers
    .filter(layer => !currentLayerIsEmpty(layer.id))
    .sort((l1, l2) => l1.order > l2.order ? 1 : -1)
    .map(l => layerDeepCopy(l, {
      exportBitmap: !exportJustModifiedLayers || l.modified,
      deepCopyCanvas: false,
    }))

  for (const layer of currentLayers) {
    layer.modified = false
  }

  layerData = await parallelize(layers, prepareLayerDataToExport, config.maxConcurrentThreads)

  if (cleanMemoryAfterwards) {
    currentLayers.forEach(layer => {
      layer.history.clear()
      layer.history = undefined
    })
  }
  currentLayers = undefined

  return layerData
}

// chiamata da editor quando si salva il disegno, e pipette init.
export const exportWholeCanvasData = async(returnCanvasContext = false) => {
  let tempCanvas = new OffscreenCanvas(state.canvases.width, state.canvases.height)
  let tempContext = tempCanvas.getContext('2d', { willReadFrequently: true })
  const data = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    width: 0,
    height: 0,
    canvasWidth: state.canvases.width,
    canvasHeight: state.canvases.height,
    base64: EMPTY_BASE64,
  }

  const layers = Object.values(state.layers).sort((l1, l2) => l1.order > l2.order ? 1 : -1)
  for (const layer of layers) {
    if (layer.active) {
      tempContext.globalAlpha = layer.opacity
      tempContext.drawImage(layer.canvas, 0, 0)
      data.minX = Math.min(data.minX, layer.minX)
      data.minY = Math.min(data.minY, layer.minY)
      data.maxX = Math.max(data.maxX, layer.maxX)
      data.maxY = Math.max(data.maxY, layer.maxY)
    }
  }
  data.width = round(data.maxX - data.minX, 0)
  data.height = round(data.maxY - data.minY, 0)

  let bitmap
  if (returnCanvasContext) {
    if (Number.isFinite(data.minX)) {
      bitmap = await createImageBitmap(tempCanvas)
      data.base64 = await getImgBase64OffThread(bitmap)
    }
    data.context = tempContext
  } else {
    if (Number.isFinite(data.minX)) {
      [bitmap] = cropImageWithMargin(tempCanvas, data.minX, data.minY, data.maxX, data.maxY)
      bitmap = await createImageBitmap(bitmap)
      data.base64 = await getImgBase64OffThread(bitmap)
    }
    tempCanvas.width = tempCanvas.height = 0
    tempCanvas = tempContext = null
  }

  if (bitmap) {
    bitmap.close()
    bitmap = null
  }

  return data
}

// ritorna l'immagine totale mergiata insieme, + coordinate e dimensioni, + layers
export const exportDrawing = async({
  returnCanvasContext = false,
  returnLayers = false,
  processLayersInParallel = false,
} = {}) => {
  const currentDrawingData = await exportWholeCanvasData(returnCanvasContext)

  if (returnLayers) {
    currentDrawingData.layers = await exportLayers(processLayersInParallel)
  }

  return currentDrawingData
}

export const currentLayerIsEmpty = (layerId = state.currentSelectedLayerId) => {
  return Number.isFinite(state.layers[layerId].maxX) === false ||
  state.layers[layerId].minX === null ||
  state.layers[layerId].maxX === null ||
  state.layers[layerId].minY === null ||
  state.layers[layerId].maxY === null
}

export const clearCurrentLayer = async () => {
  const layer = state.layers[state.currentSelectedLayerId]
  closeParams()
  updateGcoMode(false, false)
  if (Number.isFinite(layer.maxX)) {
    layer.canvas.context.clearRect(0, 0, state.canvases.width, state.canvases.height)
    layer.minX = Infinity
    layer.minY = Infinity
    layer.maxY = -Infinity
    layer.maxX = -Infinity
    return true
  } else {
    return false
  }
}

const createNewLayerData = (owner = false) => ({
  id: uuidv4(),
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
  name: `Layer ${Object.keys(state.layers).length + 1}`,
  order: getMaxOrder() + 1,
  active: true,
  canvas: null,
  opacity: 1,
  history: new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap),
  selected: false,
  modified: false,
  previewRef: null,
  createTimestamp: Date.now(),
  updateTimestamp: Date.now(),
  owner: owner || Coworking.getUserId(),
})

const getMaxOrder = () => {
  const max = Math.max(...Object.values(state.layers).map(l => l.order))
  return isFinite(max) ? max : 0
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
  layer.canvas.style.zIndex = layer.order * 10
  layer.canvas.style.opacity = layer.opacity

  if (state.layers[layerId].active) {
    enableLayer(layerId)
  } else {
    disableLayer(layerId)
  }

  await updateLayerPreview(layerId)
  Editor.appendLayer(layer.canvas)
}

const createNewLayerListElementDom = (layerId, withAnimation = true) => {
  const layerListDom = refs.layerListElement.cloneNode(true)
  layerListDom.setAttribute('data-id', layerId)
  state.layers[layerId].previewRef = layerListDom.querySelector('.editor-layers__layer-preview')
  state.layers[layerId].previewRef.context = state.layers[layerId].previewRef.getContext('2d')
  layerListDom.classList.toggle('editor-layers__layer-selected', state.layers[layerId].selected)
  layerListDom.classList.toggle('editor-layers__layer-yours', layerIsYours(layerId))
  layerListDom.classList.toggle('editor-layers__layer-coworker', !layerIsYours(layerId))
  layerListDom.querySelector('input').value = state.layers[layerId].name
  layerListDom.querySelector('.editor-layers__layer-options-button').classList.toggle('svg-icon-visible', !layerIsYours(layerId))

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

  layer.canvas.style.zIndex = layer.order * 10
  layer.canvas.style.opacity = layer.opacity

  if (state.layers[layerId].active) {
    enableLayer(layerId)
  } else {
    disableLayer(layerId)
  }

  updateLayerPreview(layerId)

  layer.history.add({
    bitmap: await createImageBitmap(layer.canvas),
    minX: layer.minX,
    minY: layer.minY,
    maxX: layer.maxX,
    maxY: layer.maxY,
  })
  Editor.appendLayer(layer.canvas)
}

const createNewLayerCanvas = () => {
  const canvas = document.createElement('canvas')
  canvas.width = state.canvases.width
  canvas.height = state.canvases.height
  canvas.context = getNewContextForCanvas(canvas)
  return canvas
}

export const addNewLayerFromCoworker = async(layer) => {
  // to intercept the first layer from coworker when just started
  if (Object.values(state.layers).length === 1 && layer.order === state.layers[state.currentSelectedLayerId].order) {
    if (Coworking.isHostingCoworking()) {
      // if you are the host, your layer goes on top
      state.layers[state.currentSelectedLayerId].order = state.layers[state.currentSelectedLayerId].order + 1
      state.layers[state.currentSelectedLayerId].name = state.layers[state.currentSelectedLayerId].name.replace('1', '2')
      const layerOptionNameInput = refs.layersList.querySelector(`div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-name input`)
      layerOptionNameInput.value = state.layers[state.currentSelectedLayerId].name
    } else {
      // if you are the coworker, the received layer goes on top
      layer.order = layer.order + 1
      layer.name = layer.name.replace('1', '2')
    }
  }

  layer.canvas = createNewLayerCanvas()
  layer.history = new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap),
  state.layers[layer.id] = layer
  createNewLayerDom(layer.id, true)
  reorderLayersList()
  Object.values(state.layers).forEach(l => {
    if (!layerIsYours(l.id)) {
      l.selected = (l.id === layer.id)
      refs.layersList.querySelector(`div[data-id="${l.id}"]`).classList.toggle('editor-layers__layer-selected', l.selected)
    }
  })

  // addLayerHistoryNewStep(layer.id, state.currentSelectedLayerId) // TODO forse con l'id del coworker
}

const addNewLayer = (e) => {
  preventDefault(e)
  if (Object.keys(state.layers).length >= config.maxLayersNumber) {
    return
  }

  const newLayerData = createNewLayerData()
  newLayerData.canvas = createNewLayerCanvas()

  state.layers[newLayerData.id] = newLayerData
  createNewLayerDom(newLayerData.id, true)
  reorderLayersList()
  addLayerHistoryNewStep(newLayerData.id, state.currentSelectedLayerId)
  selectLayer(newLayerData.id, false)
  refs.layersList.scrollTop = 0

  if (Coworking.isOpen()) {
    Coworking.sendNewLayer(newLayerData)
  }
}

const updateEditorCanvas = () => {
  if (state.currentSelectedLayerId) {
    Editor.updateEditorLayer(
      parseInt(state.layers[state.currentSelectedLayerId].canvas.style.zIndex),
      state.layers[state.currentSelectedLayerId].opacity,
      state.gcoMode ? 'source-atop' : 'source-over',
      state.layers[state.currentSelectedLayerId].active
    )
  }
}

const selectLayer = async(layerId, showParams = true) => {
  if (layerIsYours(layerId) && layerId !== state.currentSelectedLayerId) {
    const wasInResizeMode = state.resizeMode

    if (state.currentSelectedLayerId) {
      if (state.resizeMode) {
        await saveResizeModeIfNeeded()
        const layerOptionButton = refs.layersList.querySelector(`div[data-id="${state.currentSelectedLayerId}"] .editor-layers__layer-options-button`)
        layerOptionButton.classList.remove('disabled')
      }
    }

    Object.values(filterYoursLayers()).forEach(l => {
      l.selected = (l.id === layerId)
      refs.layersList.querySelector(`div[data-id="${l.id}"]`).classList.toggle('editor-layers__layer-selected', l.selected)
    })
    state.currentSelectedLayerId = layerId

    updateParamsByLayer(layerId)
    if (showParams) {
      openParams()
    }

    updateLayerPreview(layerId)
    updateEditorCanvas()
    Editor.setLayerContext(state.layers[layerId].canvas.context)
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
    layer.canvas.style.zIndex = i * 10
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
    .filter(l => !!state.layers[l.getAttribute('data-id')])
    .sort((l1, l2) => state.layers[l1.getAttribute('data-id')].order < state.layers[l2.getAttribute('data-id')].order ? 1 : -1)
    .forEach(node => refs.layersList.appendChild(node))
  updateEditorCanvas()
}

const layerIsYours = (layerId) => {
  return state.layers[layerId].owner === Coworking.getUserId()
}

const filterYoursLayers = () => {
  return Object.values(state.layers).filter(l => l.owner === Coworking.getUserId())
}

const _deleteLayer = async(layerId, nextSelectedId = 0, withAnimation = true) => {
  refs.imageForResize = null
  if (nextSelectedId) {
    await selectLayer(nextSelectedId, false)
  } else if (layerId === state.currentSelectedLayerId) {
    state.currentSelectedLayerId = false
  }
  closeParams()
  if (withAnimation) {
    fadeOutElements(state.layers[layerId].canvas)
    await removeOutElement(refs.layersList.querySelector(`div[data-id="${layerId}"]`))
  } else {
    state.layers[layerId].canvas.classList.add('displayNone')
    refs.layersList.querySelector(`div[data-id="${layerId}"]`).remove()
  }
  state.layers[layerId].previewRef = null
  state.layers[layerId].canvas.remove()
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
  let yoursLayers = filterYoursLayers()
  if (!layerIsYours(layerId) || yoursLayers.length <= 1) {
    return
  }

  yoursLayers = yoursLayers.filter(l => l.id !== layerId)
  const maxOrder = Math.max(...yoursLayers.map(l => l.order))
  const nextSelectedId = yoursLayers.filter(l => l.order === maxOrder)[0].id
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

  await saveResizeModeIfNeeded()
  const newId = uuidv4()
  const newLayer = layerDeepCopy(state.layers[state.currentSelectedLayerId])
  newLayer.canvas.context = getNewContextForCanvas(newLayer.canvas)
  const now = Date.now()
  newLayer.id = newId
  newLayer.selected = false
  newLayer.modified = true
  newLayer.createTimestamp = now
  newLayer.updateTimestamp = now
  newLayer.name = `Layer ${Object.keys(state.layers).length + 1}`
  newLayer.history = new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap)
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
    // create a new layer
    const newLayerData = createNewLayerData()
    newLayerData.order = lowerLayer.order
    newLayerData.modified = true
    newLayerData.canvas = mergeImages([ // merge the two source layers
      [lowerLayer.canvas, lowerLayer.opacity],
      [selectedLayer.canvas, selectedLayer.opacity],
    ])
    newLayerData.canvas.context = getNewContextForCanvas(newLayerData.canvas)
    state.layers[newLayerData.id] = newLayerData

    closeParams()
    await Promise.all([ // animate in and out new and old list dom
      fadeOutElements([state.layers[selectedLayer.id].canvas, state.layers[lowerLayer.id].canvas]),
      removeOutElement(refs.layersList.querySelector(`div[data-id="${selectedLayer.id}"]`)),
      removeOutElement(refs.layersList.querySelector(`div[data-id="${lowerLayer.id}"]`)),
    ])
    await createNewLayerDom(newLayerData.id, true)
    await updateLayerRealCoords(newLayerData.id)

    // delete the two source layers
    state.layers[selectedLayer.id].previewRef = null
    state.layers[lowerLayer.id].previewRef = null
    state.layers[selectedLayer.id].canvas.remove()
    state.layers[lowerLayer.id].canvas.remove()
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

const enableLayer = (layerId = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId]
  layer.active = true
  refs.layersList.querySelector(`div[data-id="${layerId}"]`).classList.add('editor-layers__layer-active')
  const layerOptionButton = refs.layersList.querySelector(`div[data-id="${layerId}"] .editor-layers__layer-options-button`)
  layerOptionButton.classList.add('svg-icon-visible')
  layerOptionButton.classList.remove('svg-icon-hidden')

  fadeInElements(layer.canvas, { maxFadeIn: layer.opacity })
  if (layerId === state.currentSelectedLayerId) {
    const canBeResized = layerCanBeResized(layerId)
    updateEditorCanvas()
    updateResizeMode(false, canBeResized)
    updateGcoMode(false, canBeResized)
    refs.visibilityLayerButton.classList.toggle('svg-icon-visible', layer.active)
    refs.visibilityLayerButton.classList.toggle('svg-icon-hidden', !layer.active)
  }
}

const disableLayer = (layerId = state.currentSelectedLayerId) => {
  const layer = state.layers[layerId]
  layer.active = false
  refs.layersList.querySelector(`div[data-id="${layerId}"]`).classList.remove('editor-layers__layer-active')
  const layerOptionButton = refs.layersList.querySelector(`div[data-id="${layerId}"] .editor-layers__layer-options-button`)
  layerOptionButton.classList.add('svg-icon-hidden')
  layerOptionButton.classList.remove('svg-icon-visible')

  fadeOutElements(layer.canvas, { maxFadeIn: layer.opacity })
  if (layerId === state.currentSelectedLayerId) {
    updateEditorCanvas()
    updateResizeMode(false, false)
    updateGcoMode(state.gcoMode, false)
    refs.visibilityLayerButton.classList.toggle('svg-icon-visible', layer.active)
    refs.visibilityLayerButton.classList.toggle('svg-icon-hidden', !layer.active)
  }
}

const toggleEnableLayer = (e, layerId = state.currentSelectedLayerId, clickedByList = false) => {
  preventDefault(e)
  if (!layerIsYours(layerId)) {
    return
  }
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

export const updateCanvasContent = (madeChanges, minX, minY, w, h, rotation) => {
  fillCanvasWithImage(state.layers[state.currentSelectedLayerId].canvas.context, refs.imageForResize, minX, minY, w, h, convertAngleDegToRad(rotation))
  if (madeChanges) {
    Tools.toggleButton('undo', true)
    state.resizeModeMadeChanges = true
  }
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

const startResizeMode = () => {
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
  const [image, minX, minY, width, height] = cropImageWithMargin(layer.canvas, layer.minX, layer.minY, layer.maxX, layer.maxY, 0)
  refs.imageForResize = image
  updateMagnetismCoords(state.currentSelectedLayerId)
  Editor.showDragBox(round(minX + width / 2, 1), round(minY + height / 2, 1), width, height, true)
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
  updateUndoRedoButtons()
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
  if (state.paramsTimeout === false) { // params are closed
    return
  }
  openParams()
  const layer = state.layers[layerId]
  if (Number.isFinite(layer.maxX)) {
    if (state.resizeMode) {
      refs.imageForResize = flipImage(refs.imageForResize, horizontally)
      const { minX, minY, maxX, maxY } = await findImageContentCoords(layer.canvas, config.coordsImgScale)
      const [content, x, y] = cropImageWithMargin(layer.canvas, minX, minY, maxX, maxY)
      fillCanvasWithImage(layer.canvas.context, flipImage(content, horizontally), x, y)
    } else {
      const [content, x, y] = cropImageWithMargin(layer.canvas, layer.minX, layer.minY, layer.maxX, layer.maxY)
      fillCanvasWithImage(layer.canvas.context, flipImage(content, horizontally), x, y)
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
      startResizeMode()
    }
  }
}
const gcoModeTouchStart = (e) => {
  preventDefault(e)
  closeParams()
  if (layerCanBeResized(state.currentSelectedLayerId) && !state.resizeMode) {
    updateGcoMode(!state.gcoMode, true)
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

const _updateLayerOpacity = (layerId, opacity, inProgress) => {
  refs.opacityCursor.style.bottom = `${opacity}%`
  refs.opacityLabel.innerHTML = `${opacity}`
  refs.opacitySlider.style.background = `linear-gradient(0deg, var(--palette-green-1) ${opacity}%, var(--palette-white) ${opacity}%)`
  opacity = round(opacity / 100, 2)
  state.layers[layerId].opacity = opacity
  state.layers[layerId].canvas.style.opacity = opacity

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
  if (layerId && layerIsYours(layerId)) {
    const layer = state.layers[layerId]
    const layerIsEmpty = !Number.isFinite(layer.minX)
    const canBeResized = layerCanBeResized(layerId)
    const opacity = round(layer.opacity * 100, 0)
    refs.opacityLabel.innerHTML = opacity
    refs.opacityCursor.style.bottom = `${opacity}%`
    refs.opacitySlider.style.background = `linear-gradient(0deg, var(--palette-green-1) ${opacity}%, var(--palette-white) ${opacity}%)`
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
  if (layerIsYours(layerId)) {
    if (layerId === state.currentSelectedLayerId) {
      updateParamsByLayer(layerId)
      toggleParams()
    } else {
      selectLayer(layerId)
    }
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

const prepareLayerFromDb = async(l) => {
  const layer = layerDeepCopy(l, { deepCopyCanvas: false })
  layer.modified = false
  layer.owner = Coworking.getUserId()
  layer.canvas = await getCanvasFromBase64(l.base64)
  layer.canvas.context = getNewContextForCanvas(layer.canvas)
  layer.history = new History(config.stepHistoryMaxLength, clearLayerHistoryStepBitmap)
  return layer
}

const initLayers = async(initialLayers, canvasWidth, canvasHeight, withCoworking, isHostingCoworking) => {
  state.canvases.width = canvasWidth
  state.canvases.height = canvasHeight
  closeParams()

  // if we are opening a drawing --> just its layers
  if (initialLayers.length) {
    initialLayers = await parallelize(initialLayers, prepareLayerFromDb, config.maxConcurrentThreads)
    state.layers = Object.fromEntries(initialLayers.map((l, i) => ([l.id, l])))
    const layersIds = Object.keys(state.layers)
    await Promise.all(layersIds.map(createNewLayerDom))
    await selectLayer(layersIds.find(layerId => state.layers[layerId].selected) || layersIds[0])
    reorderLayersList()
  } else {
    addNewLayer()
  }

  LayersHistory.add({
    type: 'init',
  })
}

const initDom = async(moduleContainer) => {
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
  refs.gcoButton.addEventListener(Params.eventStart, gcoModeTouchStart)
  refs.resizeButton.addEventListener(Params.eventStart, resizeButtonTouchStart)
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
  Toolbar.addOptionButtonsGroup([refs.resizeButton, refs.gcoButton])

  dom = undefined
}

export const init = async(moduleContainer, initialLayers, canvasWidth, canvasHeight, withCoworking = false, isHostingCoworking = false) => {
  config.maxLayersNumber = config.maxLayersNumberHighPerf
  if (Params.isTablet && Params.ios) {
    const screenMaxSize = getRealScreenMaxSize()
    if (screenMaxSize < 2200) {
      config.maxLayersNumber = config.maxLayersNumberMediumPerf
    }
  }
  state = deepCopy(initialState)
  await initDom(moduleContainer)
  refs.layersList.scrollTop = 1
  await initLayers(initialLayers, canvasWidth, canvasHeight, withCoworking, isHostingCoworking)

  setTimeout(() => {
    refs.layersList.scrollTop = refs.layersList.querySelector('.editor-layers__layer-selected')?.offsetTop || 0
  }, 200)
}

// chiamata da history.onDelete
const clearLayerHistoryStepBitmap = (step) => {
  if (step.bitmap) {
    step.bitmap.close()
    delete step.bitmap
  }
}

// chiamata su chiusura editor, e pulizia deletedLayers
const hardDeleteLayer = (layerId, clearHistory = true) => {
  const layer = state.layers[layerId] || state.deletedLayers[layerId]
  if (clearHistory) {
    layer.history.clear()
    layer.history = undefined
  }
  layer.canvas.remove()
  layer.canvas.width = layer.canvas.height = 0
  layer.canvas = undefined

  delete state.layers[layerId]
  delete state.deletedLayers[layerId]
}

export const remove = (isSavingLayers = false) => {
  Object.values(state.layers).forEach(layer => hardDeleteLayer(layer.id, !isSavingLayers))
  Object.values(state.deletedLayers).forEach(layer => hardDeleteLayer(layer.id, true))
  LayersHistory.clear()
  cleanRefs(refs)
  state = {}
}

const editorTemplate = require('./editor.tpl')
import './editor.css'

import { debounce } from 'debounce'
import Params from 'main/Params'
import * as Coworking from 'modules/Coworking'
import * as Debug from 'modules/Debug'
import * as Messages from 'modules/Messages'
import * as Header from 'components/Header'
import * as ColorPicker from './components/ColorPicker'
import * as Toolbar from './components/Toolbar'
import * as Layers from './components/Layers'
import * as Tools from './components/Tools'
import * as Ruler from './components/Ruler'
import { setSpinner, getEventCoordX, getEventCoordY, loadTemplate, preventDefault, getDomRect } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'
import { addGlobalStatus, removeGlobalStatus } from 'utils/moduleUtils'
import { round, getNumberInBetween, getOriginalCoordsFromScaleRotation, getAverage, roundAngleForSteps } from 'utils/mathUtils'
import { rgbToHex } from 'utils/colorsUtils'
import { getCanvasBase64Async } from 'utils/imageUtils'
import { saveDrawToDB, getOneDrawing, saveDrawingPaletteColors } from 'utils/localDbUtils'
import { addRotationHandler, removeRotationHandler, cleanRefs } from 'utils/moduleUtils'
import { handlePointerEvents } from 'utils/pointerEventsUtils'
import { delay, deepCopy } from 'utils/jsUtils'
import { addResizeBulletsHandlers } from 'utils/uiUtils'
import { init as initCanvasUtils, remove as removeCanvasUtils, fillWithBucket, setImageShapeIfNeeded, drawCurvedFunctionLine, drawMultipleCoworkingSteps, cleanBucketHistory, toolShapesDrawFns, getCanvasColorAtPx, fillCompletely, getNewContextForCanvas } from 'utils/canvasUtils'
import { updateCurrentTouchData, getStepData, updateEditorZoomGlobalState, shouldThisStepMoveAdaptLine, initState, initCanvasOffset, findValueWithMagnetism, applyRationResizeMagnetism, getAltitudeFactorFromAngle } from './editorUtils'
import { toolDefaultProps } from './config'
import { goToPage } from 'modules/Router'
import { TOUCH_TYPE_STYLUS, TOUCH_TYPE_FINGER } from 'main/constants'
import { spacing } from 'main/Theme'


/*
  ----- OFFSCREEN CANVAS -----
  FATTO:
  - Ottimizzata la preview del layer con un piccolo canvas.
  - Provare a rimpiazzare i layer.img con un layer.canvas come in origine, e riempirli con le img bitmap.
  - Bitmap salvata in indexDB e rimpiazzate tutte le locahPathSmall
  - Folder con piccoli canvas
  - Add bitmap.close() quando cancello uno step, e su tutta la history di un layer quando lo cancello definitivamente

  BUGS:
  - Merge layers è rotto

  DA FARE:
  - salvataggio disegno asyncrono -> apro subito il folder con uno spinner sul disegno -> per non bloccare l'ipad traduco in base64 un layer alla volta, e chiudo tutti i suoi history bitmap.
  - pulizia codice folder con base64
  - pulizia codice editor pipette
  - to test performances on iPad con taaaanti layer belli peni


  - New branch con offscreenCanvas per ogni layer --> offscreenCanvas.transferToImageBitmap()
  - Test performance e memoria e massimo numero di canvas con IMG vs CANVAS vs OFFSCREEN CANVAS
  - Ad ogni apertura di un nuovo canvas / layer, inizializzare un worker sperifico per quel canvas / layer.
    - const offscreenCanvas = canvas2.transferControlToOffscreen()
    - const worker = new Worker(
    -   new URL('worker.js', import.meta.url),
    -   { type: 'module' }
    - )
    - worker.postMessage({ id, canvas: offscreenCanvas }, [offscreenCanvas])
    - await waitWorkerMessage(worker, id)
    Da dentro al worker posso accedere alle stesse funzioni che oggi uso dal CanvasUtils,
    ed il codice principale deve solo occuparsi di inviare un messaggio al worker con i dati dello step/tool da disegnare.

  IN FUTURO:
    In teoria quando sto disegnando molti step in un colpo solo per il corowking,
    potremmo anche spezzettare il lavoro su più worker, uno per ogni step, e poi disegnarli sul canvas finale in ordine.
*/


export const config = {
  draftTimeInterval: 30_000,
  draftStepsInterval: 50,
  stepsRequiredToMakeACopy: 10,
  maxSpeedFactorLength: 150,
  defaultForceTouch: 0.1,
  defaultAltitudeAngle: Math.PI / 3,
  initialForceTouchBugValue: 0.07999999999999999,
  maxSupportedStylusAltitudeFactor: 0.844,
  // minSupportedStylusAngle: 0.17451031605270906,
  defaultToolParams: { ...toolDefaultProps },
  maxScale: 5.0,
  minScale: 0.3,
  maxCanvasSize: 4096,
  canvasScaleWithGoodPerformance: 1,
  minAltitudeFactorToHandleRotation: 0.3,
  resizeRotationStep: 2.5,
  resizeRotationInterval: 45,
  draftInfoDuration: 3_000,
}
// let state
let state = {}
const initialState = {
  pageOpened: false,
  modified: false,
  withCoworking: false,
  currentTouch: {
    type: '',
    x: 0,
    y: 0,
    midX: 0,
    midY: 0,
    eventX: 0,
    eventY: 0,
    startDragX: 0,
    startDragY: 0,
    dragX: 0,
    dragY: 0,
    force: 0,
    drewSomething: false,
    isNearRuler: false,
    isDown: false,
    isZooming: false,
    zoomDragChanged: false,
    altitudeAngle: config.defaultAltitudeAngle,// PI / 2 ==> vertical stylus, 0 ==> horizontal stylus
    altitudeFactor: getAltitudeFactorFromAngle(config.defaultAltitudeAngle, config.maxSupportedStylusAltitudeFactor),
    azimuthAngle: 0, // 2PI => X=1 Y=0, 3/2PI => X=0 Y=1, PI => X=-1 Y=0, 1/2PI => X=0 Y=-1
    rotation: 0,
    pathRotation: 0,
    stepLength: 0,
    speedFactor: 0,
    canHandleStylusRotation: true,
  },
  lastStep: {
    x: -1,
    y: -1,
    midX: -1,
    midY: -1,
    alpha: 0,
    size: 0,
    rotation: 0,
  },
  lastAdaptedStep: {},
  lastLineAdaptationTimestamp: 0,
  stepsSinceLastLineAdaptation: 0,
  pxDistanceSinceLastLineAdaptation: 0,
  fullscreenActive: false,
  canvas: {
    width: 0,
    height: 0,
    scale: 1,
    initialScale: 1,
    rotation: 0,
    dragStartX: 0,
    dragStartY: 0,
    translateX: 0,
    translateY: 0,
    transformOriginX: 0,
    transformOriginY: 0,
    originCoordX: 0,
    originCoordY: 0,
    centerCoordX: 0,
    centerCoordY: 0,
    offset: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    },
  },
  resizeMode: {
    active: false,
    useMagnetism: true,
    isResizing: false,
    x: -1, // box centerX coord
    y: -1, // box centerY coord
    w: -1,
    h: -1,
    r: 0,
    startDragX: -1,
    startDragY: -1,
  },
  pipette: {
    bg: 'none',
    isVisible: false,
    currentColor: false,
    isOnCanvas: false,
    context: null,
  },
  currentLayerGCO: 'source-over',
  currentToolGCO: 'source-over',
  currentLayerIsActive: true,
  currentDeviceHasStylus: false,
  changedSinceDraft: false,
  drawnStepsSinceDraft: 0,
  draftInterval: false,
  canMakeACopy: false,
  currentSavingDraw: false,
  stepsSinceLastCoworkingUpdate: 0,
  localDbDrawId: false,
  currentToolProps: {
    ...config.defaultToolParams,
    color: '',
    randomColor: true,
  },
}
const refs = {
  container: null,
  canvasContainer: null,
  canvasForLine: null,
  canvasOrigin: null,
  canvasCenter: null,
  layerContext: null,
  contextForLine: null,
  toolCursor: null,
  touchLayer: null,
  pipetteCursor: null,
  pipetteBackground: null,
  dragBox: null,
  magnetisedLineX: null,
  magnetisedLineY: null,
  magnetisedLineR: null,
  dragBulletOriginTL: null,
  dragBulletOriginTR: null,
  dragBulletOriginBL: null,
  dragBulletOriginBR: null,
  dragBulletOriginRT: null,
  dragBulletTL: null,
  dragBulletT: null,
  dragBulletTR: null,
  dragBulletL: null,
  dragBulletR: null,
  dragBulletBL: null,
  dragBulletB: null,
  dragBulletBR: null,
  dragBulletRT: null,
}
const labels = {
  draftSaved: 'Draft saved',
  draftError: 'An error occurred during draft saving',
  copySaved: 'New copy saved',
  copyError: 'An error occurred during saving',
  savingError: 'An error occurred during saving',
  areYouSureToCloseCoworking: 'Are you sure to close the drawing session?',
  youHaveDifferentScreenSizes: 'You and your friend have different screen sizes',
}

export let coworking
export const getCurrentOpenedDrawingLocalId = () => state.localDbDrawId


const stepDataKeys = ['type', 'x', 'y', 'midX', 'midY', 'size', 'alpha', 'rotation', 'oldSize', 'oldAlpha', 'oldRotation', 'oldMidX', 'oldMidY', 'oldX', 'oldY', 'stepLength']
const addTouchStepDataKeys = (stepDataArray) => Object.fromEntries(stepDataArray.map((v, i) => [stepDataKeys[i], v]))
const removeTouchStepDataKeys = (stepData) => Object.values(stepData).filter(e => typeof e !== 'undefined').map(e => round(e, 4) || e)
const globalCompositeOperationValues = ['source-over', 'destination-out', 'source-atop']
const addToolDataKeys = (toolDataArray) => ({
  name: toolDataArray[0],
  version: toolDataArray[1],
  color: toolDataArray[2],
  globalCompositeOperation: globalCompositeOperationValues[toolDataArray[3]],
  frameImageName: toolDataArray[4],
  customProps: toolDataArray[5],
})
const removeToolDataKeys = (toolData) => [toolData.name, toolData.version, toolData.color, globalCompositeOperationValues.indexOf(toolData.globalCompositeOperation), toolData.frameImageName, toolData.customProps]
export const drawCoworkingMultipleStepsData = (data) => {
  if (state?.pageOpened) {
    requestAnimationFrame(() => {
      drawMultipleCoworkingSteps(refs.layerContext, data.steps.map(addTouchStepDataKeys), addToolDataKeys(data.tool), {
        start: drawStepStart,
        move: drawStepMove,
        end: drawStepEnd,
        bucket: useBucket,
      })
      if (data.steps.find(step => step[0] === 'end')) {
        debounceSaveStep()
      }
    })
  }
}

const getResizeState = () => deepCopy(state.resizeMode)
const saveStepHistory = () => {
  Layers.addLayerHistoryContentChangedStep()
}
const debounceSaveStep = debounce(saveStepHistory, 50)

export const setDrawingModified = () => {
  state.modified = true
  state.changedSinceDraft = true
  state.drawnStepsSinceDraft += 1
  if (state.drawnStepsSinceDraft >= config.draftStepsInterval) {
    saveDraftIfNeeded()
  }
  if (!state.canMakeACopy) {
    state.canMakeACopy = true
    Toolbar.enableSaveCopy()
  }
}

export const clear = async () => {
  if (await Layers.clearCurrentLayer()) {
    saveStepHistory()
  }
  console.clear()
}

const useBucket = async (context, x, y, color, canvasWidth, canvasHeight, sendForCoworking = true) => {
  if (coordsAreInsideLayer(x, y)) {
    if (Layers.currentLayerIsEmpty()) {
      // this layer is empty, we can fill it all
      // TODO or entirely colored with just one color
      fillCompletely(context, color, canvasWidth, canvasHeight)
      saveStepHistory()
    } else { // this layer has already been used, so bucket must be fully processed
      const res = fillWithBucket(context, x, y, color, canvasWidth, canvasHeight)
      // qui ho diviso fillWithBucket in due comportamenti diversi.
      // Ho bisogno di sapere subito (senza await) se il bucket è andato a buon fine per poterlo inviare immediatamente al coworking,
      // ma devo anche poter salvare lo step solo dopo che il bucket ha finito.
      // quindi ritorna false | Promise
      if (res) {
        // nel caso del bucket lo step lo salvo sempre qui, perché il bucket è asynchrono e
        // currentTouch.drewSomething è sempre false
        res.then(saveStepHistory)
        // stesso ragionamento per il coworking che va fatto qui
      }
    }
    if (Coworking.isOpen() && sendForCoworking) {
      sendCoworkingStep({ type: 'start', x, y }, true)
    }
  }
}

const coordsAreInsideLayer = (x, y) => (x > 0 && y > 0 && x <= state.canvas.width && y <= state.canvas.height)

const updatePipette = (canvasX, canvasY, domX, domY) => {
  refs.pipetteCursor.style.left = `${domX}`
  refs.pipetteCursor.style.top = `${domY}`

  if (coordsAreInsideLayer(canvasX, canvasY)) {
    if (state.pipette.isOnCanvas === false) {
      refs.pipetteBackground.style.backgroundImage = `url(${state.pipette.bg})`
    }
    state.pipette.isOnCanvas = true
    const bgX = canvasX * 2 * state.canvas.scale
    const bgY = canvasY * 2 * state.canvas.scale
    refs.pipetteBackground.style.backgroundPosition = `calc(-${bgX}px + (14rem * 0.4)) calc(-${bgY}px + (14rem * 0.4))`
    refs.pipetteBackground.style.backgroundSize = `${state.canvas.width * 2 * state.canvas.scale}px ${state.canvas.height * 2 * state.canvas.scale}px`
    refs.pipetteBackground.style.transform = `translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${state.canvas.rotation}deg)`
    let color = getCanvasColorAtPx(state.pipette.context, canvasX, canvasY, state.canvas.width, state.canvas.height)
    if (color.a || color.r || color.g || color.b) {
      color = rgbToHex(color.r, color.g, color.b, round(color.a / 255, 4))
      state.pipette.currentColor = color
      refs.pipetteCursor.style.backgroundColor = color
    } else {
      state.pipette.currentColor = false
      refs.pipetteCursor.style.backgroundColor = 'var(--palette-white)'
    }
  } else {
    state.pipette.isOnCanvas = false
    refs.pipetteBackground.style.backgroundImage = 'none'
    state.pipette.currentColor = false
    refs.pipetteCursor.style.backgroundColor = 'var(--palette-white)'
  }
}

const initPipetteCursor = async () => {
  Layers.getCurrentGlobalImageData(true).then(currentImageData => {
    state.pipette.bg = currentImageData.base64
    refs.pipetteBackground.style.backgroundImage = `url(${currentImageData.base64})`
    state.pipette.context = currentImageData.tempContext

    updatePipette(
      initialX,
      initialY,
      `calc(${(state.canvas.width / 2 / Params.pxScale * state.canvas.initialScale) + state.canvas.offset.left}px)`,
      `calc(${(state.canvas.height / 2 / Params.pxScale * state.canvas.initialScale) + state.canvas.offset.top}px)`
    )
  })

  state.pipette.isOnCanvas = true
  state.pipette.bg = 'none'
  state.pipette.currentColor = false
  refs.pipetteCursor.style.backgroundColor = 'var(--palette-white)'
  refs.pipetteBackground.style.backgroundImage = 'none'
  state.pipette.context = null

  // const currentImageData = await Layers.getCurrentGlobalImageData(true)
  // state.pipette.bg = currentImageData.base64
  // refs.pipetteBackground.style.backgroundImage = `url(${currentImageData.base64})`
  // getCanvasBase64Async(currentImageData.tempCanvas).then(base64 => {
  //   state.pipette.bg = base64
  //   refs.pipetteBackground.style.backgroundImage = `url(${base64})`
  // })
  // state.pipette.context = currentImageData.tempContext

  refs.pipetteCursor.style.left = `calc(${(state.canvas.width / 2 / Params.pxScale * state.canvas.initialScale) + state.canvas.offset.left}px)`
  refs.pipetteCursor.style.top = `calc(${(state.canvas.height / 2 / Params.pxScale * state.canvas.initialScale) + state.canvas.offset.top}px)`

  fadeInElements(refs.pipetteCursor)
  state.pipette.isVisible = true
  let initialX = state.canvas.width / 2 * state.canvas.initialScale
  let initialY = state.canvas.height / 2 * state.canvas.initialScale
  if (currentCanvasHasZoom()) {
    [initialX, initialY] = getOriginalCoordsFromScaleRotation(initialX, initialY, state.canvas.originCoordX, state.canvas.originCoordY, state.canvas.scale, state.canvas.rotation)
  }
}

export const hidePipetteCursor = async () => {
  state.pipette.currentColor = false
  await fadeOutElements(refs.pipetteCursor)
  state.pipette.isVisible = false
  state.pipette.bg = 'none'
  state.pipette.context.canvas.width = state.pipette.context.canvas.height = 0
  state.pipette.context = null
}

const closePipetteCursor = async () => {
  if (state.pipette.currentColor) {
    ColorPicker.addPaletteColor(state.pipette.currentColor, false)
    ColorPicker.confirmLastAddedColorIfNeeded()
  }
  ColorPicker.deselectPipette(true, true, !state.pipette.currentColor)
}

const saveDraftIfNeeded = async () => {
  if (!state.currentTouch.isDown && state.changedSinceDraft) {
    state.changedSinceDraft = false
    state.drawnStepsSinceDraft = 0
    if (state.modified) {
      const currentDraw = await getCurrentDrawInfo()
      if (currentDraw.maxX >= 0) {
        const savedId = await saveDrawToDB(currentDraw, true, false, state.withCoworking)
        if (savedId) {
          if (state.localDbDrawId === false) { // se è la prima bozza che salvo per questo nuovo disegno (mai salvato prima)
            Messages.info(labels.draftSaved, config.draftInfoDuration)
            state.localDbDrawId = savedId
          }
        } else {
          state.localDbDrawId = false
          Messages.error(labels.draftError)
        }
      }
    }
  }
}

export const saveAndGoToFolder = async () => {
  if (!Coworking.isOpen() || await Messages.confirm(labels.areYouSureToCloseCoworking)) {
    setSpinner(true)
    await delay(20)
    Coworking.stop()
    setDraftInterval(false)
    if (state.modified) {
      const currentDraw = await getCurrentDrawInfo()
      if (currentDraw.maxX >= 0) {
        await saveDrawToDB(currentDraw, false, Coworking.isOpen(), state.withCoworking)
      }
    }
    goToPage('folder/open/true')
  }
}

export const saveDrawingsPalette = (colors = []) => {
  if (state.localDbDrawId && colors.length) {
    saveDrawingPaletteColors(state.localDbDrawId, colors)
  }
}

export const saveCopy = async () => {
  if (state.canMakeACopy) {
    state.canMakeACopy = false
    const currentDraw = await getCurrentDrawInfo()
    delete currentDraw.localDbId

    if (currentDraw.maxX >= 0) {
      const savedId = await saveDrawToDB(currentDraw, false, Coworking.isOpen(), false)
      if (savedId) {
        Messages.info(labels.copySaved, config.draftInfoDuration)
        Toolbar.disableSaveCopy()
      } else {
        Messages.error(labels.draftError)
        state.canMakeACopy = true
        Toolbar.enableSaveCopy()
      }
    }
  }
}

const setDraftInterval = (start) => {
  if (start) {
    if (state.draftInterval === false) {
      state.draftInterval = setInterval(saveDraftIfNeeded, config.draftTimeInterval)
    }
  } else {
    clearInterval(state.draftInterval)
    state.draftInterval = false
  }
}

export const changePaper = (paper) => {
  refs.canvasContainer.classList.remove([...refs.canvasContainer.classList].find(e => e.indexOf('paper') >= 0))
  refs.canvasContainer.classList.add(`paper-${paper}`)
}

export const appendLayer = (layerCanvas) => {
  layerCanvas.classList.add('editor__layer-canvas')
  refs.canvasContainer.appendChild(layerCanvas)
}

export const setLayerContext = (layerContext) => {
  refs.layerContext = layerContext
}

export const updateEditorLayer = (layerZIndex, opacity, globalCompositeOperation, active) => {
  refs.canvasForLine.style.zIndex = layerZIndex + 1
  refs.canvasForLine.style.opacity = opacity
  state.currentLayerGCO = globalCompositeOperation
  state.currentToolProps.globalCompositeOperation = state.currentToolGCO || globalCompositeOperation
  state.currentLayerIsActive = active
  refs.canvasForLine.classList.toggle('displayNone', !active)
}

export const showDragBox = (x, y, w, h, useMagnetism) => {
  state.resizeMode.active = true
  state.resizeMode.useMagnetism = useMagnetism
  fadeInElements([
    refs.dragBox,
    refs.dragBulletTL, refs.dragBulletTR, refs.dragBulletBL, refs.dragBulletBR,
    refs.dragBulletT, refs.dragBulletL, refs.dragBulletR, refs.dragBulletB,
    refs.dragBulletRT,
  ])
  updateDragBox(false, x, y, w, h)
}

const updateLayerContentCoordsAfterDragResize = () => {
  Layers.setLayerCoordsAfterDragResize(
    Math.max(0, round(state.resizeMode.x - state.resizeMode.w / 2)),
    Math.max(0, round(state.resizeMode.y - state.resizeMode.h / 2)),
    Math.min(state.canvas.width, round(state.resizeMode.x + state.resizeMode.w / 2)),
    Math.min(state.canvas.height, round(state.resizeMode.y + state.resizeMode.h / 2))
  )
}

const updateDragBox = (madeChanges, x, y, w, h, r = 0) => {
  refs.dragBox.style.cssText = `
    left: ${round(x / Params.pxScale, 1)}px;
    top: ${round(y / Params.pxScale, 1)}px;
    width: ${round(w / Params.pxScale, 1)}px;
    height: ${round(h / Params.pxScale, 1)}px;
    transform: translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${r}deg);
  `
  state.resizeMode = {
    ...state.resizeMode,
    x, y, w, h, r,
  }
  updateDragBoxHandlersPosition()
  Layers.updateCanvasContent(madeChanges, round(x - w / 2, 1), round(y - h / 2, 1), w, h, r)
}

const updateDragBoxHandlersPosition = () => {
  const tlRect = refs.dragBulletOriginTL.getBoundingClientRect()
  const trRect = refs.dragBulletOriginTR.getBoundingClientRect()
  const blRect = refs.dragBulletOriginBL.getBoundingClientRect()
  const brRect = refs.dragBulletOriginBR.getBoundingClientRect()
  const rtRect = refs.dragBulletOriginRT.getBoundingClientRect()

  refs.dragBulletTL.style = `left: ${round(tlRect.left, 0)}px; top: ${round(tlRect.top, 0)}px`
  refs.dragBulletTR.style = `left: ${round(trRect.left, 0)}px; top: ${round(trRect.top, 0)}px`
  refs.dragBulletBL.style = `left: ${round(blRect.left, 0)}px; top: ${round(blRect.top, 0)}px`
  refs.dragBulletBR.style = `left: ${round(brRect.left, 0)}px; top: ${round(brRect.top, 0)}px`
  refs.dragBulletRT.style = `left: ${round(rtRect.left, 0)}px; top: ${round(rtRect.top, 0)}px`
  refs.dragBulletT.style = `left: ${getAverage([tlRect.left, trRect.left])}px; top: ${getAverage([tlRect.top, trRect.top])}px`
  refs.dragBulletR.style = `left: ${getAverage([brRect.left, trRect.left])}px; top: ${getAverage([brRect.top, trRect.top])}px`
  refs.dragBulletB.style = `left: ${getAverage([blRect.left, brRect.left])}px; top: ${getAverage([blRect.top, brRect.top])}px`
  refs.dragBulletL.style = `left: ${getAverage([tlRect.left, blRect.left])}px; top: ${getAverage([tlRect.top, blRect.top])}px`
}

const animateDragBoxHandlersPositionToOrigin = async (duration = 250) => {
  const frameDuration = 1000 / 30 // 30 fps
  let totTime = 0
  updateDragBoxHandlersPosition()
  while (totTime < duration) {
    totTime += frameDuration
    await delay(frameDuration)
    updateDragBoxHandlersPosition()
  }
}

export const hideDragBox = () => {
  state.resizeMode.active = false
  state.resizeMode.w = state.resizeMode.h = state.resizeMode.x = state.resizeMode.y = state.resizeMode.r = -1
  fadeOutElements([
    refs.dragBox,
    refs.dragBulletTL, refs.dragBulletTR, refs.dragBulletBL, refs.dragBulletBR,
    refs.dragBulletT, refs.dragBulletL, refs.dragBulletR, refs.dragBulletB,
    refs.dragBulletRT,
  ])
}

const getCurrentDrawInfo = async () => {
  const currentDraw = await Layers.getGlobalDrawingFullInfo()
  currentDraw.localDbId = state.localDbDrawId // db id or false
  currentDraw.colors = ColorPicker.getCurrentColorsPalette()
  currentDraw.selectedColorId = ColorPicker.getCurrentSelectedColorId()
  currentDraw.toolsCustomProps = Tools.getToolsCustomProps()
  currentDraw.selectedTool = Tools.getCurrentSelectedTool()
  return currentDraw
}

export const toggleFullscreen = () => {
  if (state.fullscreenActive) {
    exitFullscreen()
  } else {
    goFullscreen()
  }
}

export const goFullscreen = (e) => {
  e && preventDefault(e)
  if (state.fullscreenActive) {
    return
  }
  state.fullscreenActive = true
  addGlobalStatus('drawith__EDITOR-FULLSCREEN')
  // if (!currentCanvasHasZoom()) {
  //   state.canvas.scale *= 1.1
  //   state.canvas.transformOriginX = state.canvas.width / 2
  //   state.canvas.transformOriginY = state.canvas.height / 2
  //   updateZoomCss()
  // }
  ColorPicker.closeParams()
  Tools.closeVersions()
  Layers.closeParams()
}

const exitFullscreen = (e) => {
  e && preventDefault(e)
  if (!state.fullscreenActive) {
    return
  }
  state.fullscreenActive = false
  removeGlobalStatus('drawith__EDITOR-FULLSCREEN')
}

const initCanvasCenter = () => {
  const centerRect = refs.canvasCenter.getBoundingClientRect()
  state.canvas.centerCoordX = round(centerRect.left)
  state.canvas.centerCoordY = round(centerRect.top)
}

export const setTool = (tool) => {
  if (tool.name === 'pipette') {
    initPipetteCursor()
  }

  state.currentToolGCO = tool.globalCompositeOperation
  state.currentToolProps = {
    ...state.currentToolProps,
    ...tool,
    globalCompositeOperation: tool.globalCompositeOperation || state.currentLayerGCO,
  }

  if (state.currentToolProps.frameImageName) {
    setImageShapeIfNeeded(refs.layerContext, state.currentToolProps.frameImageFile, state.currentToolProps.frameImageName, state.currentToolProps.color)
    setImageShapeIfNeeded(refs.contextForLine, state.currentToolProps.frameImageFile, state.currentToolProps.frameImageName, state.currentToolProps.color)
  }

  Toolbar.setTool(state.currentToolProps)
}

export const setToolColor = (color, randomColor) => {
  state.currentToolProps.color = color
  state.currentToolProps.randomColor = randomColor

  if (state.currentToolProps.frameImageName && state.currentToolProps.color) {
    setImageShapeIfNeeded(refs.layerContext, state.currentToolProps.frameImageFile, state.currentToolProps.frameImageName, color)
    setImageShapeIfNeeded(refs.contextForLine, state.currentToolProps.frameImageFile, state.currentToolProps.frameImageName, color)
  }

  if (state.currentToolProps.globalCompositeOperation === 'destination-out') {
    Tools.selectLastUsedTool()
  }

  Toolbar.setTool(state.currentToolProps)
}

export const currentCanvasHasZoom = () => (
  state.canvas.scale !== initialState.canvas.scale ||
  state.canvas.rotation !== initialState.canvas.rotation ||
  state.canvas.translateX !== initialState.canvas.translateX ||
  state.canvas.translateY !== initialState.canvas.translateY
)

const updateCursorPosition = (size, x, y) => {
  if (state.currentToolProps.cursor) {
    refs.toolCursor.style.cssText = `
      width: ${size / Params.pxScale}px;
      height: ${size / Params.pxScale}px;
      left: ${x / Params.pxScale}px;
      top: ${y / Params.pxScale}px;
    `
    refs.toolCursor.classList.remove('displayNone')
  }
}

const makeTouchStartNearRuler = (touchEvent, x, y) => {
  if (state.currentTouch.isDown === false) {
    state.currentTouch.isNearRuler = true
    updateCurrentTouchData(state, touchEvent, Params.eventStart, x, y)
    handleTouchStartStep(refs.layerContext)
  }
}

const makeTouchMoveNearRuler = (touchEvent, x, y) => {
  if (state.currentTouch.isDown) {
    updateCurrentTouchData(state, touchEvent, Params.eventMove, x, y)
    handleTouchMoveStep(refs.layerContext, true)
  }
}

const makeTouchEndNearRuler = (x, y) => {
  if (x) {
    if (state.canvas.scale !== 1 || state.canvas.rotation !== 0) {
      [x, y] = getOriginalCoordsFromScaleRotation(x, y, state.canvas.originCoordX, state.canvas.originCoordY, state.canvas.scale, state.canvas.rotation)
    }
    state.currentTouch.x = x // TODO WHY without offsets??
    state.currentTouch.y = y
  }
  handleTouchEndStep(refs.layerContext)
}

const sendCoworkingStep = (stepData, saveStep = false) => {
  if (saveStep) {
    const toolData = removeToolDataKeys({
      name: state.currentToolProps.name,
      version: state.currentToolProps.version,
      color: state.currentToolProps.color,
      globalCompositeOperation: state.currentToolProps.globalCompositeOperation,
      frameImageName: state.currentToolProps.frameImageName,
      customProps: Tools.getCurrentToolCustomProps(),
    })
    if (stepData) {
      Coworking.addStep(removeTouchStepDataKeys(stepData))
    }
    Coworking.sendSteps(toolData)
    state.stepsSinceLastCoworkingUpdate = 0
  } else {
    Coworking.addStep(removeTouchStepDataKeys(stepData))
    state.stepsSinceLastCoworkingUpdate += 1
  }
}

const drawStepStart = (context, stepData, tool) => {
  let doneSomething = false
  state.changedSinceDraft = true
  context.globalCompositeOperation = tool.globalCompositeOperation

  if (tool.frameType) {
    toolShapesDrawFns[tool.frameType](context, stepData.x, stepData.y, stepData.alpha, stepData.size, stepData.rotation, tool.color)
    doneSomething = true
  }

  return doneSomething
}

const drawStepMove = (context, stepData, tool) => {
  let doneSomething = false
  context.globalCompositeOperation = tool.globalCompositeOperation

  if (tool.frameType) {
    doneSomething = drawCurvedFunctionLine(context, stepData, tool)
  }

  return doneSomething
}

const drawStepEnd = (context, stepData, tool) => {
  let doneSomething = false
  context.globalCompositeOperation = tool.globalCompositeOperation

  if (tool.frameType) {
    doneSomething = drawCurvedFunctionLine(context, stepData, tool)
  }

  return doneSomething
}

const updateLastStepData = (stepData) => {
  state.lastStep.x = stepData.x
  state.lastStep.y = stepData.y
  state.lastStep.midX = stepData.midX
  state.lastStep.midY = stepData.midY
  state.lastStep.size = stepData.size
  state.lastStep.alpha = stepData.alpha
  state.lastStep.rotation = stepData.rotation
}

const handleTouchStartStep = (context = refs.layerContext) => {
  state.currentTouch.drewSomething = false
  const stepData = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)

  if (
    state.currentToolGCO !== 'destination-out' &&
    (state.currentToolProps.randomColor || !state.currentToolProps.color)
  ) {
    setToolColor(ColorPicker.getRandomColor(), true)
  }
  updateCursorPosition(stepData.size, state.currentTouch.x, state.currentTouch.y)
  Tools.closeVersions()
  Layers.closeParams()
  Toolbar.closeParams()
  ColorPicker.closeParams()
  ColorPicker.confirmLastAddedColorIfNeeded()

  if (state.currentToolProps.name === 'bucket') {
    useBucket(context, stepData.x, stepData.y, state.currentToolProps.color, state.canvas.width, state.canvas.height)
  } else {
    state.currentTouch.isDown = true
    const thisStepHasDoneSomething = drawStepStart(context, stepData, state.currentToolProps)
    state.currentTouch.drewSomething = state.currentTouch.drewSomething || (thisStepHasDoneSomething && coordsAreInsideLayer(stepData.x, stepData.y))
    if (thisStepHasDoneSomething && Coworking.isOpen()) {
      sendCoworkingStep(stepData)
    }
    updateLastStepData(stepData)
  }
}

const handleTouchMoveStep = (context = refs.layerContext, sendDataForCoworking) => {
  if (state.currentTouch.isDown === false) {
    return
  }
  const stepData = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)
  updateCursorPosition(stepData.size, state.currentTouch.x, state.currentTouch.y)

  const thisStepHasDoneSomething = drawStepMove(context, stepData, state.currentToolProps)
  state.currentTouch.drewSomething = state.currentTouch.drewSomething || (thisStepHasDoneSomething && coordsAreInsideLayer(stepData.x, stepData.y))
  if (sendDataForCoworking && thisStepHasDoneSomething && Coworking.isOpen()) {
    // se son passati abbastanza steps dall'ultima break nel coworking, aggiungo un breaks
    sendCoworkingStep(stepData, state.currentTouch.drewSomething && state.stepsSinceLastCoworkingUpdate >= state.currentToolProps.stepsToUpdateCoworking - 1)
  }
  updateLastStepData(stepData)

  Debug.logFps()
}

const handleTouchEndStep = (context = refs.layerContext) => {
  if (state.currentTouch.isDown === false) {
    return
  }
  state.currentTouch.isDown = state.currentTouch.isNearRuler = false
  refs.toolCursor.classList.add('displayNone')

  if (
    state.currentToolProps.size < state.currentToolProps.maxSizeThatNeedsToAdaptLine ||
    (state.currentTouch.x !== state.lastStep.x && state.currentTouch.y !== state.lastStep.y)
  ) {
    const stepData = getStepData(state.currentToolProps, state.currentTouch, state.lastStep)
    const thisStepHasDoneSomething = drawStepEnd(context, stepData, state.currentToolProps)
    state.currentTouch.drewSomething = state.currentTouch.drewSomething || (thisStepHasDoneSomething && coordsAreInsideLayer(stepData.x, stepData.y))
    if (thisStepHasDoneSomething && Coworking.isOpen()) {
      sendCoworkingStep(stepData)
    }
  }

  if (Coworking.isOpen()) {
    if (state.currentTouch.drewSomething) {
      sendCoworkingStep(false, true)
    } else {
      Coworking.clearSteps()
      state.stepsSinceLastCoworkingUpdate = 0
    }
  }

  if (state.currentTouch.drewSomething) {
    requestAnimationFrame(saveStepHistory)
  }
}

const updateCurrentTouchType = (touchEvent) => {
  state.currentTouch.type = (touchEvent.touchType === TOUCH_TYPE_STYLUS) ? TOUCH_TYPE_STYLUS : TOUCH_TYPE_FINGER
  if (!state.currentDeviceHasStylus && state.currentTouch.type === TOUCH_TYPE_STYLUS) { // first touch event with pencil
    state.currentDeviceHasStylus = true
  }
}

const onResizeLayerContentTouchStart = (e) => {
  state.resizeMode.isResizing = true
}

const onDragLayerContentTouchStart = (touchEvent) => {
  updateCurrentTouchData(state, touchEvent, Params.eventStart)
  state.resizeMode.startDragX = state.resizeMode.x
  state.resizeMode.startDragY = state.resizeMode.y
}

const onStepTouchStart = (touchEvent) => {
  state.currentTouch = { ...initialState.currentTouch }
  state.lastStep = state.lastAdaptedStep = {}
  updateCurrentTouchType(touchEvent)

  // init the adapted line if needed
  state.lastLineAdaptationTimestamp = Date.now()
  state.stepsSinceLastLineAdaptation = 0
  // does the touchStart job
  if (state.currentTouch.isNearRuler) {
    Ruler.lock()
  }

  updateCurrentTouchData(state, touchEvent, Params.eventStart)

  if (state.currentToolProps.size < state.currentToolProps.maxSizeThatNeedsToAdaptLine) {
    handleTouchStartStep(refs.contextForLine)
    state.lastAdaptedStep = { ...state.lastStep }
    state.pxDistanceSinceLastLineAdaptation = 0
    refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
  } else {
    handleTouchStartStep(refs.layerContext)
  }
}

const onDragZoomTouchStart = (touchEvent) => {
  if (currentCanvasHasZoom()) {
    // drag zoom with one finger, because I know he's using apple pencil
    onGestureStart(getEventCoordX(touchEvent, state.canvas.offset.left), getEventCoordY(touchEvent, state.canvas.offset.top))
  }
}

const onPipetteTouchStart = (touchEvent) => {
  Ruler.hide()
  updateCurrentTouchData(state, touchEvent, Params.eventStart)
  updatePipette(state.currentTouch.x, state.currentTouch.y, `${state.currentTouch.eventX}px`, `${state.currentTouch.eventY}px`)
}

const onTouchStart = (e, touchEvent) => {
  if (!state.resizeMode.isResizing) {
    if (state.resizeMode.active) {
      onDragLayerContentTouchStart(touchEvent)
    } else if (state?.userPreferences?.dragEditorZoomWithOneFinger && state.currentDeviceHasStylus && touchEvent.touchType !== TOUCH_TYPE_STYLUS) {
      onDragZoomTouchStart(touchEvent)
    } else if (state.currentToolProps.name === 'pipette') {
      onPipetteTouchStart(touchEvent)
    } else if (state.currentLayerIsActive) {
      onStepTouchStart(touchEvent)
    }
  }
}

const onResizeLayerContentTouchMove = (newResizeState, left, top, right, bottom, rotation) => {
  Debug.logFps()
  if (state.resizeMode.useMagnetism) {
    if (rotation) { // se sto ruotando, sicuro non sto facendo anche un resize,
      const newR = roundAngleForSteps(newResizeState.r, config.resizeRotationStep, config.resizeRotationInterval) // visualizzo la linea sui valori multipli di 45 deg
      if (Math.abs(newR) % config.resizeRotationInterval === 0) {
        refs.magnetisedLineR.classList.remove('displayNone')
        refs.magnetisedLineR.style.cssText = `
          left: ${(newResizeState.x || 0) / Params.pxScale}px;
          top: ${(newResizeState.y || 0) / Params.pxScale}px;
          transform: translate3d(-50%, -50%, 0px) rotate3d(0, 0, 1, ${newR}deg);
        `
      } else {
        refs.magnetisedLineR.classList.add('displayNone')
      }
      newResizeState.r = newR
    } else {
      const magnetismCoords = Layers.getMagnetismCoords()
      let lineXCoord = 0, lineYCoord = 0;
      [newResizeState, lineXCoord, lineYCoord] = applyRationResizeMagnetism(newResizeState, magnetismCoords, left, top, right, bottom)

      refs.magnetisedLineY.style.top = `${(lineYCoord / Params.pxScale)}px`
      refs.magnetisedLineX.style.left = `${(lineXCoord / Params.pxScale)}px`
      refs.magnetisedLineY.classList.toggle('displayNone', !lineYCoord)
      refs.magnetisedLineX.classList.toggle('displayNone', !lineXCoord)
    }
  }

  updateDragBox(true, newResizeState.x, newResizeState.y, newResizeState.w, newResizeState.h, newResizeState.r)
}

const onDragLayerContentTouchMove = (touchEvent) => {
  Debug.logFps()
  updateCurrentTouchData(state, touchEvent, Params.eventMove)
  let newX = state.resizeMode.startDragX + state.currentTouch.dragX, magnetismLineX
  let newY = state.resizeMode.startDragY + state.currentTouch.dragY, magnetismLineY

  if (state.resizeMode.useMagnetism) {
    const magnetismCoords = Layers.getMagnetismCoords();
    [newX, magnetismLineX] = findValueWithMagnetism(newX, magnetismCoords.x);
    [newY, magnetismLineY] = findValueWithMagnetism(newY, magnetismCoords.y)
  }

  refs.magnetisedLineX.style.left = `${((magnetismLineX || 0) / Params.pxScale)}px`
  refs.magnetisedLineY.style.top = `${((magnetismLineY || 0) / Params.pxScale)}px`
  refs.magnetisedLineX.classList.toggle('displayNone', !magnetismLineX)
  refs.magnetisedLineY.classList.toggle('displayNone', !magnetismLineY)

  updateDragBox(true, round(newX, 1), round(newY, 1), state.resizeMode.w, state.resizeMode.h, state.resizeMode.r)
}

const onStepTouchMove = (touchEvent) => {
  // continues the adapted line if needed
  updateCurrentTouchData(state, touchEvent, Params.eventMove)

  if (state.currentToolProps.size < state.currentToolProps.maxSizeThatNeedsToAdaptLine) {
    let adaptedStepLine = shouldThisStepMoveAdaptLine(state)
    if (adaptedStepLine) {
      state.lastStep = { ...state.lastAdaptedStep }
      updateCurrentTouchData(state, touchEvent, Params.eventMove)
    }

    // does the touchMove job
    handleTouchMoveStep(adaptedStepLine ? refs.layerContext : refs.contextForLine, adaptedStepLine)

    if (adaptedStepLine) {
      state.lastAdaptedStep = { ...state.lastStep }
      refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
    }
  } else {
    handleTouchMoveStep(refs.layerContext, true)
  }
}

const onDragZoomTouchMove = (touchEvent) => {
  if (
    state.currentDeviceHasStylus &&
    touchEvent.touchType !== TOUCH_TYPE_STYLUS &&
    state.currentTouch.isZooming
  ) {
    updateCurrentTouchType(touchEvent)
    // drag zoom with one finger, because I know he's using apple pencil
    onGestureChange(getEventCoordX(touchEvent, state.canvas.offset.left), getEventCoordY(touchEvent, state.canvas.offset.top), 1, 0)
  }
}

const onPipetteTouchMove = (touchEvent) => {
  updateCurrentTouchData(state, touchEvent, Params.eventMove)
  updatePipette(state.currentTouch.x, state.currentTouch.y, `${state.currentTouch.eventX}px`, `${state.currentTouch.eventY}px`)
}

const onTouchMove = (e, touchEvent) => {
  if (!state.resizeMode.isResizing) {
    if (state.resizeMode.active) {
      onDragLayerContentTouchMove(touchEvent)
    } else if (state?.userPreferences?.dragEditorZoomWithOneFinger && state.currentDeviceHasStylus && touchEvent.touchType !== TOUCH_TYPE_STYLUS) {
      onDragZoomTouchMove(touchEvent)
    } else if (state.currentToolProps.name === 'pipette') {
      onPipetteTouchMove(touchEvent)
    } else if (state.currentLayerIsActive) {
      onStepTouchMove(touchEvent)
    }
  }
}

const onDragLayerContentTouchEnd = (e) => {
  updateCurrentTouchData(state, e, Params.eventEnd)
  refs.magnetisedLineX.classList.add('displayNone')
  refs.magnetisedLineY.classList.add('displayNone')
  updateLayerContentCoordsAfterDragResize()
}

const onStepTouchEnd = (e) => {
  // ends the adapted line if needed
  if (state.currentToolProps.size < state.currentToolProps.maxSizeThatNeedsToAdaptLine) {
    state.lastStep = { ...state.lastAdaptedStep }
    refs.contextForLine.clearRect(0, 0, refs.canvasForLine.width, refs.canvasForLine.height)
  }

  // does the touchEnd job
  if (state.currentTouch.isNearRuler) {
    Ruler.unlock()
  }
  updateCurrentTouchData(state, e, Params.eventEnd)
  handleTouchEndStep()
}

const onResizeLayerContentTouchEnd = () => {
  refs.magnetisedLineR.classList.add('displayNone')
  refs.magnetisedLineY.classList.add('displayNone')
  refs.magnetisedLineX.classList.add('displayNone')
  updateLayerContentCoordsAfterDragResize()
  Layers.updateMagnetismCoords(undefined, !!state.resizeMode.r)
  state.resizeMode.isResizing = false
}

const onDragZoomTouchEnd = (e) => {
  onGestureEnd(0, 0, 1, 0)
}

const onPipetteTouchEnd = (e) => {
  closePipetteCursor()
}

const onTouchEnd = (e) => {
  if (!state.resizeMode.isResizing) {
    if (state.resizeMode.active) {
      onDragLayerContentTouchEnd(e)
    } else if (state?.userPreferences?.dragEditorZoomWithOneFinger && state.currentDeviceHasStylus && state.currentTouch.isZooming) {
      onDragZoomTouchEnd(e)
    } else if (state.currentToolProps.name === 'pipette') {
      onPipetteTouchEnd(e)
    } else if (state.currentLayerIsActive) {
      onStepTouchEnd(e)
    }
  }
}

const onGestureStart = (x, y, scale, rotation) => {
  // this handles both two fingers gesture start and one finger zoom drag
  ColorPicker.closeParams()
  Tools.closeVersions()
  Layers.closeParams()
  x = round(x - state.canvas.offset.left, 1)
  y = round(y - state.canvas.offset.top, 1)
  state.currentTouch.isZooming = true
  const [X, Y] = getOriginalCoordsFromScaleRotation(x, y, state.canvas.originCoordX, state.canvas.originCoordY, state.canvas.scale, state.canvas.rotation)
  refs.canvasContainer.style.transition = 'none'
  state.canvas.translateX = round((x - X), 1)
  state.canvas.translateY = round((y - Y), 1)
  state.canvas.translateStartX = state.canvas.translateX
  state.canvas.translateStartY = state.canvas.translateY
  state.canvas.dragStartX = x
  state.canvas.dragStartY = y
  if (state.pipette.isVisible) {
    ColorPicker.deselectPipette(true, true, true)
  }
}

const onGestureChange = (x, y, scale, rotation) => {
  // this handles both two fingers gesture change and one finger zoom drag
  scale = getNumberInBetween(round(state.canvas.scale * scale, 4), config.maxScale, config.minScale)
  rotation = round(state.canvas.rotation + rotation, 4)
  x = round(x - state.canvas.offset.left, 1)
  y = round(y - state.canvas.offset.top, 1)
  state.currentTouch.zoomDragChanged = true

  const dx = x - state.canvas.dragStartX
  const dy = y - state.canvas.dragStartY

  state.canvas.translateX = round(state.canvas.translateStartX + dx, 1)
  state.canvas.translateY = round(state.canvas.translateStartY + dy, 1)
  state.canvas.transformOriginX = x
  state.canvas.transformOriginY = y

  updateZoomCss(scale, rotation)
}

const onGestureEnd = (x, y, scale, rotation) => {
  // this handles both two fingers gesture end and one finger zoom drag
  if (!state.currentTouch.zoomDragChanged) {
    return
  }
  state.currentTouch.zoomDragChanged = false
  scale = getNumberInBetween(round(state.canvas.scale * scale, 4), config.maxScale, config.minScale)
  rotation = round((state.canvas.rotation + rotation) % 360, 4)
  state.currentTouch.isZooming = false

  const centerRect = refs.canvasCenter.getBoundingClientRect()
  const centerShiftX = round(Math.abs(state.canvas.centerCoordX - centerRect.left))
  const centerShiftY = round(Math.abs(state.canvas.centerCoordY - centerRect.top))

  if (
    Math.abs(round(scale - state.canvas.initialScale, 2)) < 0.1 &&
    (Math.abs(rotation) <= 5 || Math.abs(Math.abs(rotation) - 360) <= 5) &&
    centerShiftX < 150 &&
    centerShiftY < 150
  ) {
    // the current zoom/position at the end of the gesture is near the inizial zoom/position
    // so I can reset canvas zoom/position
    // TODO in the future why not do the same for 180degrees position
    refs.canvasContainer.style.transition = 'transform 0.25s, transform-origin 0.25s'
    scale = state.canvas.initialScale
    rotation = 0
    state.canvas = {
      ...initialState.canvas,
      scale,
      rotation,
      offset: state.canvas.offset,
      width: state.canvas.width,
      height: state.canvas.height,
      centerCoordX: state.canvas.centerCoordX,
      centerCoordY: state.canvas.centerCoordY,
    }
    if (state.resizeMode.active) {
      animateDragBoxHandlersPositionToOrigin(250)
    }
  } else {
    const originRect = refs.canvasOrigin.getBoundingClientRect()
    state.canvas = {
      ...state.canvas,
      scale,
      rotation,
      dragStartX: 0,
      dragStartY: 0,
      originCoordX: round(originRect.left - state.canvas.offset.left, 1),
      originCoordY: round(originRect.top - state.canvas.offset.top, 1),
    }
  }
  updateZoomCss()
  updateEditorZoomGlobalState(scale)
}

const updateZoomCss = (scale = state.canvas.scale, rotation = state.canvas.rotation) => {
  Messages.update(`${round(scale * 100, 0)}%`)
  refs.canvasContainer.style.transformOrigin = `${state.canvas.transformOriginX}px ${state.canvas.transformOriginY}px`
  refs.canvasContainer.style.transform = `
    scale3d(${scale}, ${scale}, 1)
    rotate3d(0, 0, 1, ${rotation}deg)
    translate3d(${state.canvas.translateX}px, ${state.canvas.translateY}px, 0px)
  `
  document.documentElement.style.setProperty('--canvas-scale', scale)
  updateEditorZoomGlobalState(scale)
  if (state.resizeMode.active) {
    updateDragBoxHandlersPosition()
  }
}

export const getCanvasPxSizes = (withCoworking) => {
  if (withCoworking) {
    let [width, height] = getCanvasContainerPxSizes()
    width = width + spacing.EDITOR_TOOLS_WIDTH // fix temporaneo perché in coworking non ci sono i layers
    return [width, height]
  } else if (Params.deviceHasGoodPerformance) {
    const [containerWidth, containerHeight] = getCanvasContainerPxSizes()
    const maxSide = round(Math.min(config.maxCanvasSize, Math.max(containerWidth, containerHeight) * config.canvasScaleWithGoodPerformance), 0)
    if (containerWidth > containerHeight) {
      return [maxSide, round(maxSide * (containerHeight / containerWidth), 0)]
    } else {
      return [round(maxSide * (containerWidth / containerHeight), 0), maxSide]
    }
  } else {
    return getCanvasContainerPxSizes()
  }
}

const getCanvasContainerPxSizes = (screenWidth = Params.width, screenHeight = Params.height) => {
  initCanvasOffset(state)
  return [
    round((screenWidth - state.canvas.offset.left - state.canvas.offset.right) * Params.pxScale, 0),
    round((screenHeight - state.canvas.offset.top - state.canvas.offset.bottom) * Params.pxScale, 0),
  ]
}

const initCanvasDimension = (canvasWidth, canvasHeight, withCoworking = false) => {
  if (!canvasWidth || !canvasHeight) {
    [canvasWidth, canvasHeight] = getCanvasPxSizes(withCoworking)
  }
  refs.canvasForLine.width = state.canvas.width = canvasWidth
  refs.canvasForLine.height = state.canvas.height = canvasHeight

  initCanvasUtils(canvasWidth, canvasHeight)

  if (withCoworking) {
    const [normalCanvasWidth, normalCanvasHeight] = getCanvasPxSizes(true)
    if (canvasWidth !== normalCanvasWidth || canvasHeight !== normalCanvasHeight) {
      Messages.info(labels.youHaveDifferentScreenSizes)
    }
  }

  const [containerWidth, containerHeight] = getCanvasContainerPxSizes()
  state.canvas.initialScale = state.canvas.scale = getNumberInBetween(config.maxScale, config.minScale, round(Math.min(containerWidth / canvasWidth, containerHeight / canvasHeight), 4), 4)

  refs.canvasContainer.style.cssText = `
    top: ${state.canvas.offset.top}px;
    left: ${state.canvas.offset.left}px;
    width: ${canvasWidth / Params.pxScale}px;
    height: ${canvasHeight / Params.pxScale}px;
  `
  updateZoomCss()
}

const onRotate = (e) => {
  config.maxSpeedFactorLength /= Params.viewportScale
}

const getMouseCoords = (e) => {
  let x = getEventCoordX(e, state.canvas.offset.left)
  let y = getEventCoordY(e, state.canvas.offset.top)
  if (currentCanvasHasZoom()) {
    [x, y] = getOriginalCoordsFromScaleRotation(x, y, state.canvas.originCoordX, state.canvas.originCoordY, state.canvas.scale, state.canvas.rotation)
  }
  return [
    round(x * Params.pxScale, 1),
    round(y * Params.pxScale, 1),
  ]
}

const getEditorChildCenterCoords = (el) => {
  let { centerX, centerY } = getDomRect(el, state.canvas.offset.left, state.canvas.offset.top)
  if (currentCanvasHasZoom()) {
    [centerX, centerY] = getOriginalCoordsFromScaleRotation(centerX, centerY, state.canvas.originCoordX, state.canvas.originCoordY, state.canvas.scale, state.canvas.rotation)
  }
  return [
    round(centerX * Params.pxScale, 1),
    round(centerY * Params.pxScale, 1),
  ]
}

const initDom = async () => {
  refs.container = await loadTemplate(editorTemplate, {}, Params.pagesContainer)
  refs.canvasContainer = refs.container.querySelector('.editor__canvas-container')
  refs.canvasOrigin = refs.container.querySelector('.editor__canvas-origin')
  refs.canvasCenter = refs.container.querySelector('.editor__canvas-center')
  refs.canvasForLine = refs.container.querySelector('.editor__canvas-for-line')
  refs.contextForLine = getNewContextForCanvas(refs.canvasForLine)
  refs.touchLayer = refs.container.querySelector('.editor__touch-layer')
  refs.toolCursor = refs.container.querySelector('.editor__tool-cursor')
  refs.pipetteCursor = refs.container.querySelector('.editor__pipette-cursor')
  refs.pipetteBackground = refs.container.querySelector('.editor__pipette-cursor-image')
  refs.dragBox = refs.container.querySelector('.editor__drag-box')
  refs.magnetisedLineX = refs.container.querySelector('.editor__magnetised-line-x')
  refs.magnetisedLineY = refs.container.querySelector('.editor__magnetised-line-y')
  refs.magnetisedLineR = refs.container.querySelector('.editor__magnetised-line-r')
  refs.dragBulletOriginTL = refs.container.querySelector('.dragBulletOriginTL')
  refs.dragBulletOriginTR = refs.container.querySelector('.dragBulletOriginTR')
  refs.dragBulletOriginBL = refs.container.querySelector('.dragBulletOriginBL')
  refs.dragBulletOriginBR = refs.container.querySelector('.dragBulletOriginBR')
  refs.dragBulletOriginRT = refs.container.querySelector('.dragBulletOriginRT')
  refs.dragBulletTL = refs.container.querySelector('.dragBulletTL')
  refs.dragBulletT = refs.container.querySelector('.dragBulletT')
  refs.dragBulletTR = refs.container.querySelector('.dragBulletTR')
  refs.dragBulletL = refs.container.querySelector('.dragBulletL')
  refs.dragBulletR = refs.container.querySelector('.dragBulletR')
  refs.dragBulletBL = refs.container.querySelector('.dragBulletBL')
  refs.dragBulletB = refs.container.querySelector('.dragBulletB')
  refs.dragBulletBR = refs.container.querySelector('.dragBulletBR')
  refs.dragBulletRT = refs.container.querySelector('.dragBulletRT')

  addResizeBulletsHandlers(
    refs.dragBulletTL, refs.dragBulletTR, refs.dragBulletBR, refs.dragBulletBL,
    refs.dragBulletT, refs.dragBulletR, refs.dragBulletB, refs.dragBulletL,
    refs.dragBulletRT,
    getResizeState, getEditorChildCenterCoords, getMouseCoords,
    onResizeLayerContentTouchStart, onResizeLayerContentTouchMove, onResizeLayerContentTouchEnd
  )
  handlePointerEvents(refs.touchLayer, {
    onSingleTouchStart: onTouchStart,
    onSingleTouchMove: onTouchMove,
    onSingleTouchEnd: onTouchEnd,
    onGestureStart,
    onGestureChange,
    onGestureEnd,
    onTwoFingersSingleTap: Layers.undoLayers,
    onThreeFingersSingleTap: Layers.redoLayers,
    onFourFingersSingleTap: toggleFullscreen,
  })
}

const initSubModules = async (preloadedDrawing = {}, withCoworking = false) => {
  await Toolbar.init(refs.container)
  await Layers.init(
    refs.container,
    preloadedDrawing.layers || [],
    state.canvas.width,
    state.canvas.height,
    withCoworking
  )
  await Promise.all([
    Tools.init(
      refs.container,
      preloadedDrawing.toolsCustomProps || [],
      preloadedDrawing.selectedTool || false,
      withCoworking
    ),
    ColorPicker.init(
      refs.container,
      preloadedDrawing.colors || [],
      preloadedDrawing.selectedColorId || -1
    ),
    Ruler.init(refs.container, {
      touchStart: makeTouchStartNearRuler,
      touchMove: makeTouchMoveNearRuler,
      touchEnd: makeTouchEndNearRuler,
    }),
  ])
}

export const open = async (preloadedDrawindId, withCoworking = false, coworkingCanvasWidth, coworkingCanvasHeight) => {
  console.log('editor show', preloadedDrawindId, withCoworking, coworkingCanvasWidth, coworkingCanvasHeight)
  coworking = Coworking.requestSession // just to have an alias for app.drawith.me?editor/coworking
  state = initState(initialState)
  state.withCoworking = withCoworking
  await initDom()
  addGlobalStatus('drawith__EDITOR-OPEN')
  Debug.startFpsLog()
  Header.hide()
  addRotationHandler(onRotate)

  if (withCoworking) {
    addGlobalStatus('drawith__EDITOR-COWORKING')
  }

  let preloadedDrawing = {}
  if (preloadedDrawindId) {
    preloadedDrawing = await getOneDrawing(preloadedDrawindId)
    if (preloadedDrawing) {
      initCanvasDimension(preloadedDrawing.canvasWidth, preloadedDrawing.canvasHeight)
      state.localDbDrawId = preloadedDrawindId
    }
  } else {
    if (state.withCoworking) {
      initCanvasDimension(coworkingCanvasWidth, coworkingCanvasHeight, true)
    } else {
      initCanvasDimension()
    }
  }

  setDraftInterval(true)
  await initSubModules(preloadedDrawing, withCoworking)
  await fadeInElements([refs.container])
  initCanvasCenter()
  state.pageOpened = true
  state.modified = false
  setSpinner(false)
}

export const close = async () => {
  removeGlobalStatus('drawith__EDITOR-OPEN')
  removeGlobalStatus('drawith__EDITOR-COWORKING')
  setDraftInterval(false)
  cleanBucketHistory()
  refs.pipetteCursor.style.left = '50%'
  refs.pipetteCursor.style.top = '50%'
  Header.show()
  Debug.stopFpsLog()
  removeRotationHandler(onRotate)
  await fadeOutElements([refs.container])
  Tools.remove()
  Layers.remove()
  ColorPicker.remove()
  Toolbar.remove()
  Ruler.remove()
  removeCanvasUtils()
  state = {}
  coworking = undefined
  cleanRefs(refs)
}

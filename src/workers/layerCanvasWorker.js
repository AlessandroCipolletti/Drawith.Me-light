// import { getNewContextForCanvas, fillCanvasWithImage } from '../utils/canvasUtils'
import { getNewContextForCanvas, fillCanvasWithImage } from '../utils/testUtils'
import { CANVAS_ACTION_INIT } from '../pages/Editor/components/Layers/constants.js'


let canvas, context

self.addEventListener('message', async(event) => {
  const { action } = event.data

  if (action === CANVAS_ACTION_INIT) {
    initAction(event.data.canvas)
  }

  // self.postMessage({ })
})

const initAction = (offscreenCanvas) => {
  canvas = offscreenCanvas
  context = getNewContextForCanvas(canvas)
}

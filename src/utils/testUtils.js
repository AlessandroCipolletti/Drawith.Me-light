export const fillCanvasWithImage = (destinationContext, image, x = 0, y = 0, w, h, rotation) => {
  destinationContext.clearRect(0, 0, destinationContext.canvas.width, destinationContext.canvas.height)
  destinationContext.globalAlpha = 1
  destinationContext.globalCompositeOperation = 'source-over'

  if (rotation) {
    destinationContext.translate(x + w / 2, y + h / 2)
    destinationContext.rotate(rotation)
    destinationContext.drawImage(image, -w/2, -h/2, w, h)
    destinationContext.rotate(-rotation)
    destinationContext.translate(-x - w / 2, -y - h / 2)
  } else {
    if (w && h) {
      destinationContext.drawImage(image, x, y, w, h)
    } else {
      destinationContext.drawImage(image, x, y)
    }
  }
}

export const getNewContextForCanvas = (canvas) => {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.lastDrawCoordX = -1
  context.lastDrawCoordY = -1
  const shapeImageCanvas = new OffscreenCanvas(canvas.width, canvas.height)
  const shapeImageContext = shapeImageCanvas.getContext('2d', { willReadFrequently: true })
  context.toolImageShape = {
    frameImageName: '',
    color: '',
    canvas: shapeImageCanvas,
    context: shapeImageContext,
  }
  return context
}

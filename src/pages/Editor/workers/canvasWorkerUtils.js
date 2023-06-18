import { round } from 'utils/mathUtils'
import {
  TOOL_FRAME_CIRCLE,
  TOOL_FRAME_PARTICLES_RECT,
  TOOL_FRAME_PARTICLES_CIRCLE,
  TOOL_FRAME_SPRAY_CIRCLE,
  TOOL_FRAME_IMAGE,
} from 'pages/Editor/constants'


export const toolShapesDrawFns = {
  [TOOL_FRAME_CIRCLE]: drawCircle,
  [TOOL_FRAME_PARTICLES_RECT]: drawParticlesRect,
  [TOOL_FRAME_PARTICLES_CIRCLE]: drawParticlesCircle,
  [TOOL_FRAME_SPRAY_CIRCLE]: drawParticlesSprayCircle,
  [TOOL_FRAME_IMAGE]: drawCanvasImage,
}

const drawCircle = (destinationContext, x, y, alpha, size, rotation, color, blur = 0) => {
  destinationContext.beginPath()
  destinationContext.fillStyle = color
  destinationContext.globalAlpha = alpha
  destinationContext.lineJoin = 'round'
  destinationContext.lineCap = 'round'
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y

  if (blur) {
    destinationContext.shadowColor = color
    destinationContext.shadowBlur = blur
  } else {
    destinationContext.shadowColor = ''
    destinationContext.shadowBlur = 0
  }

  destinationContext.arc(x, y, size / 2, 0, 2 * PI, true)
  destinationContext.fill()
}

const drawParticlesRect = (destinationContext, x, y, alpha, size, rotation, color) => {
  destinationContext.lastDrawCoordX = x
  destinationContext.lastDrawCoordY = y
  size = round(size)
  destinationContext.globalAlpha = alpha
  destinationContext.fillStyle = color
  const s2 = size / 2
  for (let i = 0, l = size * (size + 1); i < l; i++) {
    destinationContext.fillRect(
      round(x + getRandomNumber(size) - s2, 1),
      round(y + getRandomNumber(size) - s2, 1),
      1,
      1
    )
  }
}


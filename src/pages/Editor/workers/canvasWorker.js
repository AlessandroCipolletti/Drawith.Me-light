import { getRandomNumber } from 'utils/mathUtils'
import { delay } from 'utils/jsUtils'
// import { drawCircle } from 'utils/canvasUtils'


self.addEventListener('message', async (event) => {
  const { id, workerActionId } = event.data

  await delay(getRandomNumber(10000))

  self.postMessage({ id, workerActionId })
})

import { v4 as uuidv4 } from 'uuid'
import { noop } from 'utils/jsUtils'

const DEFAULT_MAX_PARALLEL_WORKERS = 4


/**
 * @class WorkersBufferManager
 * @example
 * const callback = async (result) => {
 *   console.log(`Callback for: ${result.id}`)
 *   await delay(1000)
 * }
 * const openNewWorker = () => {
 *   return new Worker(
 *     new URL('./workers/testWorker.js', import.meta.url),
 *     { type: 'module' }
 *   )
 * }
 * const workersManager = new WorkersBufferManager(openNewWorker, callback)
 * workersManager.pushAction({ id: 1 }, { id: 2}, { id: 3 })
 * workersManager.pushAction({ id: 4 })
 * workersManager.pushAction({ id: 5 }, { id: 6 }, { id: 7 })
 *   --> logs in order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7
 */
class WorkersBufferManager {
  #buffer = []
  #workers = []
  #openNewWorker
  #callback = noop
  #isLoopingResults = false
  #maxParallelWorkers = DEFAULT_MAX_PARALLEL_WORKERS

  constructor(openNewWorker, callback = noop, maxParallelWorkers = DEFAULT_MAX_PARALLEL_WORKERS) {
    if (!openNewWorker) {
      throw new Error('WorkersBufferManager: openNewWorker is required')
    }

    this.#openNewWorker = openNewWorker
    this.#callback = callback
    this.#maxParallelWorkers = maxParallelWorkers
    this.#addOneMoreWorker()
  }

  pushAction(...actions) {
    for (const action of actions) {
      action.workerActionId = uuidv4()
      this.#buffer.push(action)

      let firstFreeWorker = this.#workers.find((worker) => !worker.isOccupied)
      if (!firstFreeWorker && this.canOpenNewWorker) {
        firstFreeWorker = this.#addOneMoreWorker()
      }
      if (firstFreeWorker) {
        this.#launchWorkerAction(firstFreeWorker, action)
      }
    }
  }

  terminate() {
    for (const worker of this.#workers) {
      worker.terminate()
    }
  }

  get canOpenNewWorker() {
    return this.#workers.length < this.#maxParallelWorkers
  }

  #addOneMoreWorker() {
    const worker = this.#openNewWorker()
    worker.isOccupied = false
    worker.addEventListener('message', this.#onWorkerMessage.bind(this))
    this.#workers.push(worker)
    return worker
  }

  #launchWorkerAction(worker, action) {
    worker.isOccupied = true
    action.processing = true
    worker.postMessage(action)
  }

  #onWorkerMessage({
    data: result,
    target: worker,
  }) {
    worker.isOccupied = false

    // save result into buffer
    const index = this.#buffer.findIndex((item) => item.workerActionId === result.workerActionId)
    if (index !== -1) {
      this.#buffer[index] = { result }
    } else {
      console.error('WorkersBufferManager: Lost worker')
    }

    // if some actions are waiting, this worker can now process one more
    // const firstWaitingAction = this.#buffer.find((item) => !!item.workerActionId)
    const firstWaitingAction = this.#buffer.find((item) => !item.processing && !item.result)
    if (firstWaitingAction) {
      this.#launchWorkerAction(worker, firstWaitingAction)
    }
    // console.log(`Ended: ${result.id}. next: ${firstWaitingAction?.id || 'NO'}. OCCUPIED:`, this.#workers.filter(w => w.isOccupied).length)

    if (!this.#isLoopingResults) {
      this.#returnEndedResults()
    }
  }

  async #returnEndedResults() {
    // if (this.#buffer[0] && !this.#buffer[0].workerActionId) {
    if (this.#buffer[0]?.result) {
      this.#isLoopingResults = true
      const { result } = this.#buffer.shift()
      await this.#callback(result)
      this.#returnEndedResults()
    } else {
      this.#isLoopingResults = false
    }
  }
}

export default WorkersBufferManager

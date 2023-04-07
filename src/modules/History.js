const DEFAULT_MAX_HISTORY_LENGHT = 10

class History {
  data = []
  pointer = -1

  constructor(maxLength = DEFAULT_MAX_HISTORY_LENGHT) {
    this.maxLength = maxLength
  }

  add(value) {
    // const newValue = JSON.stringify(value)
    let deletedItems = []
    if (this.data.length === 0 || value !== this.data[this.pointer]) {
      deletedItems.push(...this.data.splice(this.pointer + 1, this.data.length))
      this.data.push(value)
      deletedItems.push(...this.data.splice(0, this.data.length - this.maxLength))
      this.pointer = this.data.length - 1
    }
    return deletedItems
  }

  getCurrent() {
    return this.data[this.pointer]
    // return JSON.parse(this.data[this.pointer])
  }

  back() {
    if (this.canGoBack) {
      this.pointer = Math.max(0, this.pointer - 1)
      return this.getCurrent()
    }
  }

  forward() {
    if (this.canGoForward) {
      this.pointer = Math.min(this.data.length - 1, this.pointer + 1)
      return this.getCurrent()
    }
  }

  deleteFarest() {
    if (this.data.length >= 1) {
      this.pointer = Math.max(0, this.pointer - 1)
      return this.data.splice(0, 1)[0]
    }
    return false
  }

  deleteNewest() {
    if (this.data.length >= 1) {
      this.pointer = Math.min(this.pointer, this.data.length - 2)
      return this.data.pop()
    }
    return false
  }

  filter(filterFn) {
    if (typeof filterFn === 'function') {
      const nextData = this.data.filter(filterFn)
      while (this.pointer > 0 && !nextData.includes(this.getCurrent())) {
        this.pointer--
      }
      this.pointer = nextData.indexOf(this.getCurrent())
      this.data = nextData
    }
  }

  clear() {
    this.data = []
    this.pointer = -1
  }

  getAllData() {
    return this.data
  }

  log() {
    console.log('History - pointer: ', this.pointer, 'data: ', this.data.length)
  }

  get canGoBack() {
    return this.pointer > 0
  }

  get canGoForward() {
    return this.pointer < (this.data.length - 1)
  }

  get currentSize() {
    return this.data.length
  }

  get currentIndex() {
    return this.pointer + 1
  }

  get maxSize() {
    return this.maxLength
  }

  get isFull() {
    return (this.data.length >= this.maxLength)
  }
}

export default History

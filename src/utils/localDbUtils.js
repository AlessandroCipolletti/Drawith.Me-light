import Dexie from 'dexie'

import Params from 'main/Params'
import { securizeAsyncFn } from 'utils/jsUtils'

export const DEFAULT_LOCAL_DB_ERROR_MSG = 'Db Error: refresh the page.'
export const DRAWING_STATE_DRAFT_SAVED_LOCALLY = 1
export const DRAWING_STATE_SAVED_LOCALLY = 2

/*
  DB VERSION HISTORY:
  -------------------
*/


let LocalDatabase
export const initLocalDb = securizeAsyncFn(async() => {
  // indexedDB.deleteDatabase(Params.localDbName); return
  LocalDatabase = new Dexie(Params.localDbName)

  LocalDatabase.version(1).stores({
    Drawings: '++localDbId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, base64, bitmap, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, selectedColorId, colors, layers, appVersions, toolsCustomProps',
  })

  return true
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'initLocalDb')

export const emptyDatabase = securizeAsyncFn(async() => {
  await LocalDatabase.Drawings.clear()
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'emptyDatabase')

export const getDeviceLocalData = securizeAsyncFn(async() => ((await LocalDatabase.AppData.toArray())[0]), DEFAULT_LOCAL_DB_ERROR_MSG)

export const addCoworkerWaitingId = securizeAsyncFn(async(coworkerWaitingId) => await LocalDatabase.AppData.where('id').notEqual(0).modify({ coworkerWaitingId }), DEFAULT_LOCAL_DB_ERROR_MSG, 'addCoworkerWaitingId')

export const getCoworkerWaitingId = securizeAsyncFn(async() => ((await LocalDatabase.AppData.toArray())[0]).coworkerWaitingId || false, DEFAULT_LOCAL_DB_ERROR_MSG, 'getCoworkerWaitingId')

export const cleanCoworkerWaitingId = securizeAsyncFn(async() => await LocalDatabase.AppData.where('id').notEqual(0).modify({ coworkerWaitingId: undefined }), DEFAULT_LOCAL_DB_ERROR_MSG, 'cleanCoworkerWaitingId')

export const emptyDrawingsData = securizeAsyncFn(async() => await LocalDatabase.Drawings.clear(), DEFAULT_LOCAL_DB_ERROR_MSG, 'emptyDrawingsData')

export const deleteLocalDrawings = securizeAsyncFn(async(ids = []) => await LocalDatabase.Drawings.where('localDbId').anyOf(ids).delete(), DEFAULT_LOCAL_DB_ERROR_MSG, 'deleteLocalDrawings')

export const getAllLocalDrawings = securizeAsyncFn(async() => (await LocalDatabase.Drawings.orderBy('updateTimestamp').reverse().toArray()), DEFAULT_LOCAL_DB_ERROR_MSG, 'getAllLocalDrawings')

export const getDrawingsCount = securizeAsyncFn(async() => await LocalDatabase.Drawings.count(), DEFAULT_LOCAL_DB_ERROR_MSG, 'getDrawingsCount')

export const getOneDrawing = securizeAsyncFn(async(localDbId) => ((await LocalDatabase.Drawings.where('localDbId').equals(localDbId).toArray())[0]), DEFAULT_LOCAL_DB_ERROR_MSG, 'getOneDrawing')

export const getSomeDrawings = securizeAsyncFn(async(ids = []) => await Promise.all(ids.map(id => getOneDrawing(id))), DEFAULT_LOCAL_DB_ERROR_MSG, 'getSomeDrawings')

export const updateLocalDrawing = securizeAsyncFn(async(localDbId, drawing) => await LocalDatabase.Drawings.where('localDbId').equals(localDbId).modify(drawing), DEFAULT_LOCAL_DB_ERROR_MSG, 'updateLocalDrawing')

const addLocalDrawing = securizeAsyncFn(async(drawing) => await LocalDatabase.Drawings.add(drawing), DEFAULT_LOCAL_DB_ERROR_MSG, 'addLocalDrawing')

const updateDrawing = securizeAsyncFn(async(drawing, wasSavedAsDraft, madeByCorowking) => {
  const oldDrawing = await getOneDrawing(drawing.localDbId)
  const appVersions = oldDrawing.appVersions
  if (!appVersions.includes(Params.appVersion)) {
    appVersions.push(Params.appVersion)
  }
  drawing.createTimestamp = oldDrawing.createTimestamp
  drawing.appVersions = appVersions
  drawing.state = (wasSavedAsDraft ? DRAWING_STATE_DRAFT_SAVED_LOCALLY : DRAWING_STATE_SAVED_LOCALLY)
  drawing.wasSavedAsDraft = wasSavedAsDraft
  drawing.updateTimestamp = Date.now()
  drawing.madeByCorowking = madeByCorowking

  if (wasSavedAsDraft) {
    console.log('Updated drawing draft')
  } else {
    console.log('Updated drawing')
  }

  await updateLocalDrawing(drawing.localDbId, drawing)
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'updateDrawing')

const addDrawing = securizeAsyncFn(async(drawing, wasSavedAsDraft, madeByCorowking) => {
  const now = Date.now()
  drawing.state = (wasSavedAsDraft ? DRAWING_STATE_DRAFT_SAVED_LOCALLY : DRAWING_STATE_SAVED_LOCALLY)
  drawing.createTimestamp = now
  drawing.updateTimestamp = now
  drawing.wasSavedAsDraft = wasSavedAsDraft
  drawing.appVersions = [Params.appVersion]
  drawing.madeByCorowking = madeByCorowking

  drawing.localDbId = await addLocalDrawing(drawing)

  if (wasSavedAsDraft) {
    console.log('Saved new drawing draft')
  } else {
    console.log('Saved new drawing')
  }
  return drawing.localDbId
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'addDrawing')

export const saveDrawToDB = securizeAsyncFn(async(drawing, isDraft, madeByCorowking) => {
  let id = drawing.localDbId
  if (id && await getOneDrawing(id)) {
    await updateDrawing(drawing, isDraft, madeByCorowking)
  } else {
    delete drawing.localDbId
    id = await addDrawing(drawing, isDraft, madeByCorowking)
  }
  return id
}, DEFAULT_LOCAL_DB_ERROR_MSG)

export const saveDrawingPaletteColors = securizeAsyncFn(async(localDbId, colors = []) => {
  await updateLocalDrawing(localDbId, {
    colors,
  })
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'saveDrawToDB')


export default LocalDatabase

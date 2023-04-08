import Dexie from 'dexie'
import { v4 as uuidv4 } from 'uuid'

import Params from 'main/Params'
import { securizeAsyncFn } from 'utils/jsUtils'

export const DEFAULT_LOCAL_DB_ERROR_MSG = 'Db Error: refresh the page.'
export const DRAWING_STATE_DRAFT_SAVED_LOCALLY = 1
export const DRAWING_STATE_SAVED_LOCALLY = 2
export const DRAWING_STATE_ERROR_WHILE_SAVING_TO_SERVER = 3
export const DRAWING_STATE_SAVING_TO_SERVER = 4
export const DRAWING_STATE_SAVED_REMOTELY = 5
export const DRAWING_STATE_DELETED = 6

export const drawingIsLoading = (d) => (d.state === DRAWING_STATE_SAVING_TO_SERVER)
export const drawingHasError = (d) => (d.state === DRAWING_STATE_ERROR_WHILE_SAVING_TO_SERVER)
export const drawingIsDeleted = (d) => (d.state === DRAWING_STATE_DELETED)

/*
  DB VERSION HISTORY:
  -------------------
*/

const state = {
  syncInProgress: false,
}

let LocalDatabase
export const initLocalDb = securizeAsyncFn(async() => {
  // indexedDB.deleteDatabase(Params.localDbName); return;
  indexedDB.deleteDatabase('db')

  LocalDatabase = new Dexie(Params.localDbName)

  LocalDatabase.version(1).stores({
    Drawings: '++localDbId, globalId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, selectedColorId, colors, layers, appVersions, toolsCustomProps',
    AppData: '++id, deviceId, acceptedNecessaryCookie, acceptedAnalyticsCookie, acceptedTargetingCookie',
  }).upgrade(transition => {
    return transition.Drawings.toCollection().modify(drawing => {
      if (drawing.deleted) {
        drawing.state = DRAWING_STATE_DELETED
      }
      delete drawing.deleted
    })
  })

  let appData = (await LocalDatabase.AppData.toArray())[0] || {}
  appData = {
    id: appData.id || false,
    deviceId: appData.deviceId || uuidv4(),
    acceptedNecessaryCookie: appData.acceptedNecessaryCookie || false,
    acceptedAnalyticsCookie: appData.acceptedAnalyticsCookie || false,
    acceptedTargetingCookie: appData.acceptedTargetingCookie || false,
    coworkerWaitingId: appData.coworkerWaitingId || false,
  }

  if (appData.id) {
    await LocalDatabase.AppData.where('id').equals(appData.id).modify(appData)
  } else {
    delete appData.id
    await LocalDatabase.AppData.add(appData)
  }

  return true
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'initLocalDb')

export const emptyDatabase = securizeAsyncFn(async() => {
  await LocalDatabase.Drawings.clear()
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'emptyDatabase')

export const getDeviceLocalData = securizeAsyncFn(async() => ((await LocalDatabase.AppData.toArray())[0]), DEFAULT_LOCAL_DB_ERROR_MSG)

export const updateDeviceCookiePreferences = securizeAsyncFn(async(
  acceptedNecessaryCookie,
  acceptedAnalyticsCookie,
  acceptedTargetingCookie
) => await LocalDatabase.AppData.toCollection().modify({
  acceptedNecessaryCookie,
  acceptedAnalyticsCookie,
  acceptedTargetingCookie,
}), DEFAULT_LOCAL_DB_ERROR_MSG, 'updateDeviceCookiePreferences')

export const addCoworkerWaitingId = securizeAsyncFn(async(coworkerWaitingId) => await LocalDatabase.AppData.where('id').notEqual(0).modify({ coworkerWaitingId }), DEFAULT_LOCAL_DB_ERROR_MSG, 'updateDeviceCookiePreferences')

export const getCoworkerWaitingId = securizeAsyncFn(async() => ((await LocalDatabase.AppData.toArray())[0]).coworkerWaitingId || false, DEFAULT_LOCAL_DB_ERROR_MSG, 'getCoworkerWaitingId')

export const cleanCoworkerWaitingId = securizeAsyncFn(async() => await LocalDatabase.AppData.where('id').notEqual(0).modify({ coworkerWaitingId: undefined }), DEFAULT_LOCAL_DB_ERROR_MSG, 'cleanCoworkerWaitingId')

export const emptyDrawingsData = securizeAsyncFn(async() => await LocalDatabase.Drawings.clear(), DEFAULT_LOCAL_DB_ERROR_MSG, 'emptyDrawingsData')

export const deleteLocalDrawings = securizeAsyncFn(async(ids = []) => await LocalDatabase.Drawings.where('localDbId').anyOf(ids).delete(), DEFAULT_LOCAL_DB_ERROR_MSG, 'deleteLocalDrawings')
export const deleteLocalDrawingsByGlobalIds = securizeAsyncFn(async(ids = []) => await LocalDatabase.Drawings.where('globalId').anyOf(ids).delete(), DEFAULT_LOCAL_DB_ERROR_MSG, 'deleteLocalDrawingsByGlobalIds')

export const deleteDrawingDraft = securizeAsyncFn(async(id) => await LocalDatabase.Drawings.where('localDbId').equals(id).filter(d => d.wasSavedAsDraft).delete(), DEFAULT_LOCAL_DB_ERROR_MSG, 'deleteDrawingDraft')

export const getAllLocalDrawings = securizeAsyncFn(async() => (await LocalDatabase.Drawings.orderBy('updateTimestamp').reverse().toArray()).filter(d => !drawingIsDeleted(d)), DEFAULT_LOCAL_DB_ERROR_MSG, 'getAllLocalDrawings')

export const getDrawingsCount = securizeAsyncFn(async() => await LocalDatabase.Drawings.count(), DEFAULT_LOCAL_DB_ERROR_MSG, 'getDrawingsCount')

export const getOneDrawing = securizeAsyncFn(async(localDbId) => ((await LocalDatabase.Drawings.where('localDbId').equals(localDbId).toArray())[0]), DEFAULT_LOCAL_DB_ERROR_MSG, 'getOneDrawing')

export const getSomeDrawings = securizeAsyncFn(async(ids = []) => await Promise.all(ids.map(id => getOneDrawing(id))), DEFAULT_LOCAL_DB_ERROR_MSG, 'getSomeDrawings')

export const setDrawingsDeleted = securizeAsyncFn(async(ids = []) => await LocalDatabase.Drawings.where('localDbId').anyOf(ids).modify({ deleted: true }), DEFAULT_LOCAL_DB_ERROR_MSG, 'setDrawingsDeleted')

export const updateLocalDrawing = securizeAsyncFn(async(localDbId, drawing) => await LocalDatabase.Drawings.where('localDbId').equals(localDbId).modify(drawing), DEFAULT_LOCAL_DB_ERROR_MSG, 'updateLocalDrawing')

const addLocalDrawing = securizeAsyncFn(async(drawing) => await LocalDatabase.Drawings.add(drawing), DEFAULT_LOCAL_DB_ERROR_MSG, 'addLocalDrawing')

const updateDrawing = securizeAsyncFn(async(drawing, wasSavedAsDraft, saveToServer, madeByCorowking) => {
  const oldDrawing = await getOneDrawing(drawing.localDbId)
  const appVersions = oldDrawing.appVersions
  if (!appVersions.includes(Params.appVersion)) {
    appVersions.push(Params.appVersion)
  }
  drawing.globalId = oldDrawing.globalId
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

const addDrawing = securizeAsyncFn(async(drawing, wasSavedAsDraft, saveToServer, madeByCorowking) => {
  const now = Date.now()
  drawing.state = (wasSavedAsDraft ? DRAWING_STATE_DRAFT_SAVED_LOCALLY : DRAWING_STATE_SAVED_LOCALLY)
  drawing.createTimestamp = now
  drawing.updateTimestamp = now
  drawing.wasSavedAsDraft = wasSavedAsDraft
  drawing.appVersions = [Params.appVersion]
  drawing.madeByCorowking = madeByCorowking

  drawing.localDbId = await addLocalDrawing(drawing)

  if (saveToServer && navigator.onLine) {
    callServerSideDrawingSave(drawing)
  }

  if (wasSavedAsDraft) {
    console.log('Saved new drawing draft')
  } else {
    console.log('Saved new drawing')
  }
  return drawing.localDbId
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'addDrawing')

export const saveDrawToDB = securizeAsyncFn(async(drawing, isDraft, saveToServer, madeByCorowking) => {
  let id = drawing.localDbId
  if (id && await getOneDrawing(id)) {
    await updateDrawing(drawing, isDraft, saveToServer, madeByCorowking)
  } else {
    delete drawing.localDbId
    id = await addDrawing(drawing, isDraft, saveToServer, madeByCorowking)
  }
  return id
}, DEFAULT_LOCAL_DB_ERROR_MSG)

export const saveDrawingPaletteColors = securizeAsyncFn(async(localDbId, colors = []) => {
  await updateLocalDrawing(localDbId, {
    colors,
  })
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'saveDrawToDB')


export default LocalDatabase

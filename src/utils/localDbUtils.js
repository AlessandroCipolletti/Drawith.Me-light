import Dexie from 'dexie'
import { v4 as uuidv4 } from 'uuid'

import Params from 'main/Params'
import Apis from 'modules/Apis/Apis'
import * as Tracking from 'modules/Tracking'
import * as Folder from 'pages/Folder'
import * as Router from 'modules/Router'
import { getCurrentOpenedDrawingLocalId } from 'pages/Editor'
import { securizeAsyncFn } from 'utils/jsUtils'
import { callServerSideDrawingSave, downloadUserDrawings, callServerSideDrawingsDelete, donwloadOneFullDrawing } from 'utils/serverDbUtils'
import { addGlobalStatus, removeGlobalStatus } from 'src/utils/moduleUtils'

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
  1: Drawings: '++localDbId, globalId, artistId, folderId, artistName, title, state, draft, gpsCoordinates, createTimestamp, updateTimestamp, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardX, dashboardY'
  2: Drawings: From 'draft' to 'wasSavedAsDraft'
  3: Drawings: Removed artistName, dashboardCoordinates = [dashboardX, dashboardY], Removed dashboardX and dashboardY, Added createdAt, updatedAt, Added selectedTool
  4: Drawings: Added colors[{ id: 123, initialHex: '#abcdef', brightness, 50, finalHex: '#abcdef' }, {}, ...]
  5: Drawings: Added layers[{ id: 123, minX, minY, maxX, maxY, active: true, opacity: 1, name: '', localPathSmall: '', localPathBig: '' }, {}, ...]
  6: Drawings: Added appVersion['1.2.3B']
  7: UserData: create table: 'email, emailVerified, firstName, lastName, locale, nickName, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences'
  8: UserData: Added dbId, isNewUser, newsletter, browserLang
  9: UserData: Added createdAtDate, createdAtTimestamp, updatedAtDate, updatedAtTimestamp
  10: UserData: Renamed nickName --> nickname
  11: Drawings: Renamed artistId --> userId, added isLoading, added deleted. Layers with createTimestamp , updateTimestamp
      UserData: Added sessionId
      AppData: Created table for deviceId, acceptedNecessaryCookie, acceptedAnalyticsCookie, acceptedTargetingCookie
  12: AppData: Added coworkerWaitingId
  13: Drawings: Added toolsCustomProps, selectedColorId
  14: Drawings: Removed isLoading, and Migration drawing.state
  15: Drawings: Removed deleted
*/

const state = {
  syncInProgress: false,
}
const emptyUser = {
  isNewUser: true,
  firstName: '',
  lastName: '',
  nickName: '',
  locale: 'en',
  profileImgUrl: '',
  newsletter: false,
  userPreferences: {},
}

let LocalDatabase
export const initLocalDb = securizeAsyncFn(async() => {
  // indexedDB.deleteDatabase(Params.localDbName); return;
  indexedDB.deleteDatabase('db')

  LocalDatabase = new Dexie(Params.localDbName)

  LocalDatabase.version(1).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, artistName, title, state, draft, gpsCoordinates, createTimestamp, updateTimestamp, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardX, dashboardY',
  })

  LocalDatabase.version(2).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, artistName, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardX, dashboardY',
  }).upgrade(transition => {
    return transition.Drawings.toCollection().modify(drawing => {
      drawing.wasSavedAsDraft = drawing.draft
      delete drawing.draft
    })
  })

  LocalDatabase.version(3).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool',
  }).upgrade(transition => {
    return transition.Drawings.toCollection().modify(drawing => {
      delete drawing.artistName
      drawing.dashboardCoordinates = [drawing.dashboardX, drawing.dashboardY]
      delete drawing.dashboardX
      delete drawing.dashboardY
      drawing.createdAt = new Date(drawing.createTimestamp)
      drawing.updatedAt = new Date(drawing.updateTimestamp)
      drawing.selectedTool = {
        name: 'marker',
        version: false,
        props: {},
      }
    })
  })

  LocalDatabase.version(4).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, colors',
  }).upgrade(transition => {
    return transition.Drawings.toCollection().modify(drawing => {
      drawing.colors = []
    })
  })

  LocalDatabase.version(5).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, colors, layers',
  }).upgrade(transition => {
    return transition.Drawings.toCollection().modify(drawing => {
      drawing.layers = [{
        id: uuidv4(),
        minX: drawing.minX,
        minY: drawing.minY,
        maxX: drawing.maxX,
        maxY: drawing.maxY,
        localPathSmall: drawing.localPathSmall,
        localPathBig: drawing.localPathBig,
        active: true,
        name: 'layer 1',
        opacity: 1,
        selected: true,
      }]
    })
  })

  LocalDatabase.version(6).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, colors, layers, appVersions',
  }).upgrade(transition => {
    return transition.Drawings.toCollection().modify(drawing => {
      drawing.appVersions = [Params.appVersion]
    })
  })

  LocalDatabase.version(7).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, colors, layers, appVersions',
    UserData: 'email, emailVerified, firstName, lastName, locale, nickName, mobilePhone, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences',
  })

  LocalDatabase.version(8).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, colors, layers, appVersions',
    UserData: 'email, dbId, isNewUser, newsletter, emailVerified, firstName, lastName, locale, browserLang, nickName, mobilePhone, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences',
  })

  LocalDatabase.version(9).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, colors, layers, appVersions',
    UserData: 'email, dbId, isNewUser, newsletter, emailVerified, firstName, lastName, locale, browserLang, nickName, mobilePhone, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences, createdAtDate, createdAtTimestamp, updatedAtDate, updatedAtTimestamp',
  })

  LocalDatabase.version(10).stores({
    Drawings: '++localDbId, globalId, artistId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, colors, layers, appVersions',
    UserData: 'email, dbId, isNewUser, newsletter, emailVerified, firstName, lastName, locale, browserLang, nickname, mobilePhone, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences, createdAtDate, createdAtTimestamp, updatedAtDate, updatedAtTimestamp',
  }).upgrade(transition => {
    return transition.UserData.toCollection().modify(user => {
      user.nickname = user.nickName
      user.nickName = ''
      delete user.nickName
    })
  })

  LocalDatabase.version(11).stores({
    Drawings: '++localDbId, globalId, userId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, colors, layers, appVersions, isLoading, deleted',
    UserData: 'email, dbId, isNewUser, newsletter, emailVerified, firstName, lastName, locale, browserLang, nickname, mobilePhone, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences, createdAtDate, createdAtTimestamp, updatedAtDate, updatedAtTimestamp, sessionId',
    AppData: '++id, deviceId, acceptedNecessaryCookie, acceptedAnalyticsCookie, acceptedTargetingCookie',
  }).upgrade(transition => {
    return transition.Drawings.toCollection().modify(drawing => {
      const now = Date.now()
      drawing.userId = drawing.artistId
      drawing.deleted = false
      drawing.isLoading = false
      drawing.layers = drawing.layers.map(l => {
        l.createTimestamp = now
        l.updateTimestamp = now
        return l
      })
      delete drawing.artistId
    })
  })

  LocalDatabase.version(12).stores({
    Drawings: '++localDbId, globalId, userId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, colors, layers, appVersions, isLoading, deleted',
    UserData: 'email, dbId, isNewUser, newsletter, emailVerified, firstName, lastName, locale, browserLang, nickname, mobilePhone, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences, createdAtDate, createdAtTimestamp, updatedAtDate, updatedAtTimestamp, sessionId',
    AppData: '++id, deviceId, acceptedNecessaryCookie, acceptedAnalyticsCookie, acceptedTargetingCookie, coworkerWaitingId',
  })

  LocalDatabase.version(13).stores({
    Drawings: '++localDbId, globalId, userId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, selectedColorId, colors, layers, appVersions, isLoading, deleted, toolsCustomProps',
    UserData: 'email, dbId, isNewUser, newsletter, emailVerified, firstName, lastName, locale, browserLang, nickname, mobilePhone, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences, createdAtDate, createdAtTimestamp, updatedAtDate, updatedAtTimestamp, sessionId',
    AppData: '++id, deviceId, acceptedNecessaryCookie, acceptedAnalyticsCookie, acceptedTargetingCookie',
  }).upgrade(transition => {
    return transition.Drawings.toCollection().modify(drawing => {
      drawing.toolsCustomProps = []
      drawing.selectedColorId = -1
      drawing.selectedTool = drawing.selectedTool || {}
      delete drawing.selectedTool.props
      if (drawing.selectedTool.name === 'pen' || !drawing.selectedTool.name) {
        drawing.selectedTool.name = 'marker'
        drawing.selectedTool.version = false
      }
    })
  })

  LocalDatabase.version(14).stores({
    Drawings: '++localDbId, globalId, userId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, selectedColorId, colors, layers, appVersions, deleted, toolsCustomProps',
    UserData: 'email, dbId, isNewUser, newsletter, emailVerified, firstName, lastName, locale, browserLang, nickname, mobilePhone, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences, createdAtDate, createdAtTimestamp, updatedAtDate, updatedAtTimestamp, sessionId',
    AppData: '++id, deviceId, acceptedNecessaryCookie, acceptedAnalyticsCookie, acceptedTargetingCookie',
  }).upgrade(transition => {
    return transition.Drawings.toCollection().modify(drawing => {
      if (drawing.isLoading && drawingHasError(drawing)) {
        drawing.state = DRAWING_STATE_SAVING_TO_SERVER
      }
      delete drawing.isLoading
    })
  })

  LocalDatabase.version(15).stores({
    Drawings: '++localDbId, globalId, userId, folderId, title, state, wasSavedAsDraft, gpsCoordinates, createTimestamp, updateTimestamp, createdAt, updatedAt, localPathSmall, localPathBig, minX, minY, maxX, maxY, width, height, canvasWidth, canvasHeight, mainColor, dashboardCoordinates, selectedTool, selectedColorId, colors, layers, appVersions, toolsCustomProps',
    UserData: 'email, dbId, isNewUser, newsletter, emailVerified, firstName, lastName, locale, browserLang, nickname, mobilePhone, profileImgUrl, auth0Id, role, provider, addressLine1, addressLine2, addressCity, addressNumber, addressCountry, userPreferences, createdAtDate, createdAtTimestamp, updatedAtDate, updatedAtTimestamp, sessionId',
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
  await LocalDatabase.UserData.clear()
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'emptyDatabase')

export const updateUserData = securizeAsyncFn(async(userData) => {
  const currentUser = (await getUserData())
  if (currentUser) {
    const newUser = {
      ...emptyUser,
      ...currentUser,
      ...userData,
    }
    const email = newUser.email
    delete newUser.email
    await LocalDatabase.UserData.where('email').equals(email).modify(newUser)
  } else {
    const newUser = {
      ...emptyUser,
      ...userData,
    }
    await LocalDatabase.UserData.add(newUser)
  }
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'updateUserData')

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

export const getUserData = securizeAsyncFn(async() => ((await LocalDatabase.UserData.toArray())[0]), DEFAULT_LOCAL_DB_ERROR_MSG, 'getUserData')

export const emptyUserData = securizeAsyncFn(async() => await LocalDatabase.UserData.clear(), DEFAULT_LOCAL_DB_ERROR_MSG, 'emptyUserData')

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

  if (saveToServer && navigator.onLine) {
    drawing.state = DRAWING_STATE_SAVING_TO_SERVER
    callServerSideDrawingSave(drawing, oldDrawing)
  }

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


export const syncUserDrawings = securizeAsyncFn(async() => {
  if (state.syncInProgress) {
    return
  }
  state.syncInProgress = true
  addGlobalStatus('drawith__DRAWING_SYNC')
  let somethingChanged = false
  let somethingWentWrong = false
  let somethingNewWasUploaded = false
  let localDrawings = await LocalDatabase.Drawings.toArray()
  let remoteDrawings = await downloadUserDrawings()

  // 0) local drawings blocked in "saving to server" state, should be treated as "error"
  //    and they will be treated at point 2
  localDrawings.filter(drawingIsLoading).forEach(localDrawing => {
    localDrawing.state = DRAWING_STATE_ERROR_WHILE_SAVING_TO_SERVER
    console.log('sync 0 - drawing blocked at saving')
  })


  // 1) local drawings without globalId must be saved on server too, if they hasn't been deleted locally before
  await Promise.all(
    localDrawings.filter(localDrawing => !localDrawing.globalId && !drawingIsDeleted(localDrawing)).map(
      localDrawing => new Promise(async(resolve) => { // eslint-disable-line
        localDrawing.id = await callServerSideDrawingSave(localDrawing, false, false)
        if (localDrawing.id) {
          remoteDrawings.push(localDrawing)
          somethingChanged = true
          somethingNewWasUploaded = true
          console.log('sync 1 - drawing uploaded')
        } else {
          console.log('sync error 1 - drawing not uploaded')
          somethingWentWrong = true
        }
        resolve()
      })
    )
  )

  // 2) retry to save to db drawings that got an error at the last save, if they hasn't been deleted locally before
  await Promise.all(
    localDrawings.filter(localDrawing => drawingHasError(localDrawing) && !drawingIsDeleted(localDrawing)).map(
      localDrawing => new Promise(async(resolve) => { // eslint-disable-line
        const remoteDrawing = remoteDrawings.find(rd => rd.id === localDrawing.globalId)
        if (!remoteDrawing || localDrawing.updateTimestamp >= remoteDrawing.updateTimestamp) {
          localDrawing.id = await callServerSideDrawingSave(localDrawing, remoteDrawing, false)
          if (localDrawing.id) {
            remoteDrawings.push(localDrawing)
            somethingChanged = true
            somethingNewWasUploaded = true
            console.log('sync 2 - drawing uploaded')
          } else {
            console.log('sync error 2 - drawing not uploaded')
            somethingWentWrong = true
          }
        } else if (remoteDrawing.state === DRAWING_STATE_SAVED_REMOTELY) {
          // this local drawing is in error state, but the same drawing is in OK state on the server.
          // this should mean that it has been updated remotely
          // so I can delete it locally (the one with error), and the new good version will be downloaded at step 6
          await deleteLocalDrawings([localDrawing.localDbId])
          localDrawings = localDrawings.filter(d => d.localDbId !== localDrawing.localDbId)
        }
        resolve()
      })
    )
  )


  // 3) drawings deleted while offline, must be deleted on server too. And finally locally too
  const toDeleteDrawings = localDrawings.filter(d => !!d.globalId && drawingIsDeleted(d))
  if (toDeleteDrawings.length) {
    const deleteResult = await callServerSideDrawingsDelete(toDeleteDrawings.map(d => d.globalId), true, false)
    await deleteLocalDrawings(toDeleteDrawings.map(d => d.localDbId))
    if (deleteResult) {
      somethingChanged = true
      console.log(`sync 3 - ${toDeleteDrawings.length} drawings removed from server`)
    } else {
      somethingWentWrong = true
      console.log(`sync error 3 - ${toDeleteDrawings.length} drawings not removed from server`)
    }
  }
  // and delete local deleted drawings never arrived on server
  await deleteLocalDrawings(localDrawings.filter(d => !d.globalId && drawingIsDeleted(d)).map(d => d.localDbId))
  localDrawings = localDrawings.filter(d => !drawingIsDeleted(d))


  // 4) delete local drawings who have been deleted remotely
  let toDeleteIds = remoteDrawings.filter(drawingIsDeleted).map(d => d.id) // soft deleted remotely
  toDeleteIds.push(...(localDrawings.filter(d => !!d.globalId && !remoteDrawings.find(rd => rd.id === d.globalId)).map(d => d.globalId))) // hard delete remotely
  /* if (getCurrentPage() === 'editor') { // if it's currently opened, no need to delete it
    const currentOpenedDrawingLocalId = getCurrentOpenedDrawingLocalId()
    if (currentOpenedDrawingLocalId) {
      const currentOpenedDrawingGlobalId = (await getOneDrawing(currentOpenedDrawingLocalId)).globalId
      toDeleteIds = toDeleteIds.filter(globalId => globalId !== currentOpenedDrawingGlobalId)
    }
  } */
  if (toDeleteIds.length) {
    const before = (await LocalDatabase.Drawings.toArray()).length
    await deleteLocalDrawingsByGlobalIds(toDeleteIds)
    remoteDrawings = remoteDrawings.filter(d => !drawingIsDeleted(d))
    const after = (await LocalDatabase.Drawings.toArray()).length
    if (before > after) {
      somethingChanged = true
      console.log(`sync 4 - removed locally ${before - after} drawings`)
    }
  }


  // 5) upload changed local drawings (already saved on server before)
  await Promise.all(
    localDrawings.filter(d => d.globalId).map(
      localDrawing => new Promise(async(resolve) => { // eslint-disable-line
        const remoteDrawing = remoteDrawings.find(rd => rd.id === localDrawing.globalId)
        if (remoteDrawing) {
          if (localDrawing.updateTimestamp > remoteDrawing.updateTimestamp) {
            const saveResult = await callServerSideDrawingSave(localDrawing, remoteDrawing, false)
            if (saveResult) {
              somethingChanged = true
              somethingNewWasUploaded = true
              console.log('sync 5 - drawing updated on server')
            } else {
              somethingWentWrong = true
              console.log('sync error 5 - drawing not updated on server')
            }
          }
        }
        resolve()
      })
    )
  )

  // 6) download new drawings from server, and update (download and replace) updated drawings
  await Promise.all(
    remoteDrawings.filter(rd => rd.state === DRAWING_STATE_SAVED_REMOTELY).map(
      remoteDrawing => new Promise(async(resolve) => { // eslint-disable-line
        const localDrawing = localDrawings.find(ld => ld.globalId === remoteDrawing.id)
        if (!localDrawing) { // this is a new one
          const newD = await donwloadOneFullDrawing(remoteDrawing)
          if (newD) {
            await addLocalDrawing(newD)
            somethingChanged = true
            console.log('sync 6.1 - donwloaded new drawing')
          } else {
            somethingWentWrong = true
            console.log('sync error 6.1 - error donwloading new drawing')
          }
        } else if (remoteDrawing.updateTimestamp > localDrawing.updateTimestamp) { // this one has been updated remotely
          if (Router.getCurrentPage() !== 'editor' || getCurrentOpenedDrawingLocalId() !== localDrawing.localDbId) { // if it's currently opened, no need to download it
            localDrawing.state = DRAWING_STATE_SAVING_TO_SERVER
            localDrawing.updateTimestamp = remoteDrawing.updateTimestamp
            await updateLocalDrawing(localDrawing.localDbId, localDrawing)
            const newD = await donwloadOneFullDrawing(remoteDrawing, localDrawing)
            if (newD) {
              await deleteLocalDrawings([localDrawing.localDbId])
              await addLocalDrawing(newD)
              somethingChanged = true
              console.log('sync 6.2 - locally updated new drawing from server')
            } else {
              somethingWentWrong = true
              console.log('sync error 6.2 - error updating locally new drawing from server')
            }
          }
        }
        resolve()
      })
    )
  )

  removeGlobalStatus('drawith__DRAWING_SYNC')
  if (somethingWentWrong) {
    Tracking.trackAction(Tracking.actions.ERROR_SYNC_DRAWINGS)
  }
  if (somethingNewWasUploaded) {
    await Apis.pushSyncDrawings()
  }
  if (somethingChanged && Router.getCurrentPage() === 'folder') {
    await Folder.refreshContent()
  }
  state.syncInProgress = false
}, DEFAULT_LOCAL_DB_ERROR_MSG, 'syncUserDrawings', false)


export default LocalDatabase

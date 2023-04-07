import Apis from 'modules/Apis/Apis'
import Params from 'main/Params'
import { securizeAsyncFn } from 'utils/jsUtils'
import * as LocalDB from 'utils/localDbUtils'
import { uploadS3TextFile, getS3TextFile } from 'utils/s3Utils'

const DEFAULT_SERVER_DB_ERROR_MSG = 'Saving Error: try again later.'


const replaceFilesWithStringIfNeeded = async(newDrawing, currentDrawing) => { // on LOAD
  let result = true
  newDrawing.localPathBig = await getS3TextFile(`${newDrawing.globalId}__big.txt`, Params.s3UserDrawingsBucket)
  newDrawing.localPathSmall = await getS3TextFile(`${newDrawing.globalId}__small.txt`, Params.s3UserDrawingsBucket)
  result = result && !!newDrawing.localPathBig && !!newDrawing.localPathSmall

  for (const newLayer of newDrawing.layers) {
    let currentLayer = false
    if (currentDrawing) {
      currentLayer = currentDrawing.layers.find(l => l.id === newLayer.id)
    }
    if (!currentLayer || newLayer.updateTimestamp > currentLayer.updateTimestamp) {
      newLayer.localPathBig = await getS3TextFile(`${newDrawing.globalId}---${newLayer.id}.txt`, Params.s3UserDrawingsBucket)
    } else {
      newLayer.localPathBig = currentLayer.localPathBig
    }
    result = result && !!newLayer.localPathBig
    newLayer.localPathSmall = ''
  }

  return result
}


const createS3FilesForLongStringsIfNeeded = async(newDrawing, currentDrawing) => { // on SAVE
  let result = false
  const promises = []
  promises.push(uploadS3TextFile(`${newDrawing.globalId}__big.txt`, Params.s3UserDrawingsBucket, newDrawing.localPathBig))
  promises.push(uploadS3TextFile(`${newDrawing.globalId}__small.txt`, Params.s3UserDrawingsBucket, newDrawing.localPathSmall))

  for (const layer of newDrawing.layers) {
    if (
      !currentDrawing ||
      !currentDrawing.globalId ||
      layer.updateTimestamp > (currentDrawing.layers.find(l => l.id === layer.id)?.updateTimestamp || 0)
    ) {
      promises.push(uploadS3TextFile(`${newDrawing.globalId}---${layer.id}.txt`, Params.s3UserDrawingsBucket, layer.localPathBig))
    }
  }

  if (promises.length) {
    result = (await Promise.all(promises)).reduce((t, v) => t && v, true)
  }

  return result
}


export const callServerSideDrawingSave = securizeAsyncFn(async(newDrawing, currentDrawing = false, pushToSync = true) => {
  let result = false
  const drawingForBackend = JSON.parse(JSON.stringify(newDrawing))
  delete drawingForBackend.localPathBig
  delete drawingForBackend.localPathSmall
  for (const layer of drawingForBackend.layers) {
    delete layer.localPathBig
    delete layer.localPathSmall
  }

  newDrawing.state = LocalDB.DRAWING_STATE_SAVING_TO_SERVER
  await LocalDB.updateLocalDrawing(newDrawing.localDbId, newDrawing)

  const body = { drawing: drawingForBackend }
  const [{ result: saveResult, id: serverSideId }] = await Apis.saveDrawing({ body })

  if (saveResult && serverSideId) {
    newDrawing.globalId = serverSideId
    // if the page is refreshed between Apis.saveDrawing and this LocalDB.updateLocalDrawing
    // there will be a useless drawing into db
    await LocalDB.updateLocalDrawing(newDrawing.localDbId, newDrawing)
    const uploadResult = await createS3FilesForLongStringsIfNeeded(newDrawing, currentDrawing)
    if (uploadResult) {
      const body = { drawingId: serverSideId }
      const [{ result: setStateResult }] = await Apis.setDrawingStateSaved({ body })
      if (setStateResult) {
        result = serverSideId
        if (pushToSync) {
          const [{ result: syncResult }] = await Apis.pushSyncDrawings()
          if (!syncResult) {
            console.log('Error: pushSyncDrawings')
          }
        }
      } else {
        console.log('Error: setting drawing state = saved')
      }
    } else {
      console.log(`Error: uploading drawing: ${serverSideId}`)
    }
  } else {
    console.log('Error: saving a drawing on the server')
  }

  newDrawing.state = result ? LocalDB.DRAWING_STATE_SAVED_REMOTELY : LocalDB.DRAWING_STATE_ERROR_WHILE_SAVING_TO_SERVER
  await LocalDB.updateLocalDrawing(newDrawing.localDbId, newDrawing)

  return result
}, DEFAULT_SERVER_DB_ERROR_MSG, 'callServerSideDrawingSave')


export const callServerSideDrawingsDelete = securizeAsyncFn(async(drawingIds, soft = true, pushSync = true) => {
  const body = {
    drawingIds,
    soft,
  }
  const [{ result: deleteResult }] = await Apis.deleteDrawings({ body })

  if (pushSync) {
    const [{ result: syncResult }] = await Apis.pushSyncDrawings()
    if (!syncResult) {
      console.log('Error: pushSyncDrawings')
    }
  }

  return !!deleteResult // && !!syncResult
}, DEFAULT_SERVER_DB_ERROR_MSG, 'callServerSideDrawingsDelete')


export const downloadUserDrawings = securizeAsyncFn(async() => {
  const [{ result, drawings }] = await Apis.getUserDrawings()
  if (result) {
    return drawings
  } else {
    return [] // no need to throw an error to the user...
  }
}, DEFAULT_SERVER_DB_ERROR_MSG, 'downloadUserDrawings')


export const donwloadOneFullDrawing = securizeAsyncFn(async(newDrawing, currentDrawing = false) => {
  newDrawing.globalId = newDrawing.id || newDrawing._id
  delete newDrawing.id
  delete newDrawing._id
  const downLoadResult = await replaceFilesWithStringIfNeeded(newDrawing, currentDrawing)
  if (!downLoadResult) {
    console.log(`Error: downloading full drawing: ${newDrawing.globalId}`)
    return false
  }
  return newDrawing
}, DEFAULT_SERVER_DB_ERROR_MSG, 'donwloadOneFullDrawing')

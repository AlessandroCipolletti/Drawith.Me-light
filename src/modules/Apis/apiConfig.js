
const GET = 'GET'
const POST = 'POST'
// const PUT = 'PUT'
// const DELETE = 'DELETE'
// const PATCH = 'PATCH'

const api = (url, method = GET, isPrivate = true, asFormData = false) => ({
  url,
  method,
  isPrivate,
  asFormData,
})


const ApisConfig = {
  // Drawings apis
  // sendDrawings: api('drawings/sendDrawings', POST),
  saveDrawing: api('drawings/saveDrawing', POST),
  deleteDrawings: api('drawings/deleteDrawings', POST),
  getUserDrawings: api('drawings/getUserDrawings', POST),
  getOneDrawing: api('drawings/getOneDrawing', POST),
  pushSyncDrawings: api('drawings/pushToSync', POST),
  setDrawingStateSaved: api('drawings/setDrawingStateSaved', POST),

  // User apis
  afterLogin: api('users/afterLogin', POST),
  beforeLogout: api('users/beforeLogout', POST),
  getCurrentUserInfo: api('users/getCurrentUserInfo', POST),
  deleteUser: api('users/delete', POST),
  requestPasswordChange: api('users/requestPasswordChange', POST),
  nicknameIsAvailable: api('users/nicknameIsAvailable', POST),
  requestConfirmationMail: api('users/requestConfirmationMail', POST),
  updateUser: api('users/updateUser/${userId}', POST),
  saveUserCookiePreferences: api('users/saveUserCookiePreferences', POST),

  // App
  pageHide: api('app/pageHide', POST),
  pageShow: api('app/pageShow', POST),
}

export default ApisConfig

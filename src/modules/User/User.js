import { browserName, fullBrowserVersion, osVersion, mobileModel } from 'mobile-device-detect'

import loginIcon from 'static/icons/svg/login.svg'
import * as Coworking from 'modules/Coworking'
import Apis from 'modules/Apis/Apis'
import Params from 'main/Params'
import { getRealScreenWidth, getRealScreenHeight } from 'main/main'
import * as Header from 'components/Header'
import * as LocalDB from 'utils/localDbUtils'
import * as Tracking from 'modules/Tracking'
import * as Router from 'modules/Router'
import * as Messages from 'modules/Messages'
import createAuth0Client from '@auth0/auth0-spa-js'
import { createDom, setSpinner, preventDefault } from 'utils/domUtils'
import { getRandomNumber } from 'utils/mathUtils'
import { deepCopy } from 'utils/jsUtils'
import { checkImageUrlValidity } from 'utils/imageUtils'
import { init as initCookiePopup, deleteCookie } from 'components/CookiePopup'
import { addGlobalStatus, removeGlobalStatus, registerEventForNextRefresh, hasEventForNextRefresh } from 'utils/moduleUtils'
import { USER_DELETED, USER_LOGIN, USER_LOGOUT, USER_ERROR, USER_DELETED_BY_SERVER } from './constants'


// const config = {}
let state = {}
const initialState = {
  isLogged: false,
  pageEventsInitialized: false,
  lastDisplayedUserIconUrl: '',
  userInfo: {
    // email: '',
    // isNewUser: false,
    // emailVerified: true,
    // firstName: '',
    // lastName: '',
    // nickname: '',
    // locale: '',
    // browserLang: '',
    // profileImgUrl: '',
    // newsletter: false,
    // role: 20,
    // sessionId: '',
    // deviceId: '',
    // acceptedNecessaryCookie: false,
    // acceptedAnalyticsCookie: false,
    // acceptedTargetingCookie: false,
  },
  userPreferences: {
    dragEditorZoomWithOneFinger: false,
  },
  auth0Client: undefined,
}
const refs = {
  userButton: null,
  mainMenuUserPicture: null,
  mainMenuUserName: null,
}
const labels = {
  offline: 'No intenert connection',
  logoutConfirm: 'Are you sure ?',
  changePwdSuccess: 'We\'ve just sent you an email to reset your password',
  changePwdError: 'Something went wrong, please try again later',
  deleteConfirm: 'Are you sure? All your data will be lost forever',
  deleteSuccess: 'Account successfully deleted',
  logoutSuccess: 'Logout succeeded',
  deleteError: 'Something went wrong, please contact us at info@drawith.me',
  userError: 'User error, please login again',
  deletedByServer: 'User was deleted',
  youAreOffline: 'You are offline',
  thisMayTakeAMoment: 'This may take a moment',
}


export const isLogged = () => state.isLogged
export const getUserPreferences = () => deepCopy(state.userPreferences)
export const getUserInfo = () => deepCopy(state.userInfo)
export const getUserSessionId = () => state.userInfo?.sessionId
export const getDeviceId = () => state.userInfo?.deviceId


export const trackUserConnection = () => {
  const screenWidth = getRealScreenWidth()
  const screenHeight = getRealScreenHeight()
  Tracking.trackAction(Tracking.actions.USER_CONNECT, {
    codeVersion: Params.appVersion,
    isInstalledWebapp: Params.isInstalledWebapp,
    pixelRatio: Params.pixelRatio,
    viewportScale: Params.viewportScale,
    pxScale: Params.pxScale,
    orientation: screenWidth > screenHeight ? 'landscape' : 'portrait',
    screenMaxSide: Math.max(screenWidth, screenHeight),
    screenMinSide: Math.min(screenWidth, screenHeight),
    isDesktop: Params.isDesktop,
    isMobile: Params.isMobile,
    isPhone: Params.isPhone,
    isTablet: Params.isTablet,
    emailVerified: state.userInfo.emailVerified || false,
    isIos: Params.ios,
    isAndroid: Params.android,
    socketId: Coworking.getSocketId(),
    browserName,
    fullBrowserVersion,
    osName: Params.osName,
    osVersion,
    mobileModel,
  })
  Tracking.incrementProp('visits')
}

const getUserNameLabel = () => {
  if (state.userInfo.nickname) {
    return state.userInfo.nickname
  } else if (state.userInfo.firstName || state.userInfo.lastName) {
    return `${state.userInfo.firstName} ${state.userInfo.lastName}`
  } else {
    return state.userInfo.email
  }
}

const refreshUserIconIfNeeded = async() => {
  if (state.userInfo?.profileImgUrl && state.userInfo.profileImgUrl !== state.lastDisplayedUserIconUrl) {
    state.lastDisplayedUserIconUrl = state.userInfo.profileImgUrl
    const url = `${state.userInfo.profileImgUrl}?t=${getRandomNumber(10_000)}`
    if (await checkImageUrlValidity(state.userInfo.profileImgUrl)) {
      refs.userButton.style.backgroundImage = `url("${url}")`
      refs.mainMenuUserPicture.style.backgroundImage = `url("${url}")`
    } else {
      refs.userButton.style.backgroundImage = `url("${loginIcon}")`
      refs.mainMenuUserPicture.style.backgroundImage = `url("${loginIcon}")`
    }
    refs.mainMenuUserName.innerHTML = getUserNameLabel()
  }
}

const updateUserEnvironment = () => {
  if (state.userInfo.isNewUser) {
    addGlobalStatus('drawith__NEW_USER')
  } else {
    removeGlobalStatus('drawith__NEW_USER')
  }
}

const handleRedirectAfterLogin = async() => {
  try {
    await state.auth0Client.handleRedirectCallback()
  } catch (e) {
    console.log(e)
  }
}

export const startUserSessionOnSocketConnect = async() => {
  const manualLogin = hasEventForNextRefresh(USER_LOGIN)

  if (manualLogin) {
    setSpinner(true)
  }

  const body = {
    codeVersion: Params.appVersion,
    deviceType: Params.deviceType.toLowerCase(),
    osName: Params.osName,
    browserName,
    fullBrowserVersion,
  }
  const [{ result: afterLoginResult, data: dbUser }, response] = await Apis.afterLogin({ body })
  console.log({ afterLoginResult }, dbUser, response?.status)

  if (afterLoginResult) {
    // TODO indentify and super properties only if dbUser.isNewSession
    // ma stare attenti al caso di nuova registrazione utente
    Tracking.identifyUser(dbUser.dbId)
    Tracking.addSuperProperties({
      socketId: Coworking.getSocketId(),
      sessionId: dbUser.sessionId || null,
      deviceId: state.userInfo.deviceId,
    })
    if (dbUser.hasUserSession) {
      Coworking.updateClientEnvironment()
      if (dbUser.isNewSession) {
        trackUserConnection()
      }
    }
    addGlobalStatus('drawith__USER-CONNECTED')
    await updateUserFromDbUser(dbUser)

    await Router.redirectNewUserIfNeeded()
    if (dbUser.emailVerified && !dbUser.isNewUser && !Router.userIsTryingCoworking()) {
      LocalDB.syncUserDrawings()
    }
    if (manualLogin) {
      Tracking.incrementProp('logins')
      setSpinner(false)
    }

    if (Params.isMobile && !state.pageEventsInitialized) {
      state.pageEventsInitialized = true
      document.addEventListener(Params.eventPageVisibilityChange, () => {
        // console.log(`VISIBILITY: ${!document.hidden} - CONNECTED: ${Coworking.isConnected()}`)
        if (document.hidden) {
          pauseUserSession()
        } else {
          unpauseUserSession()
        }
      })
    }
  } else if (!afterLoginResult) { // && response?.status === 200) {
    // error on server side api
    LocalDB.emptyUserData()
    state.isLogged = false
    state.userInfo = initialState.userInfo
    state.userPreferences = initialState.userPreferences
    refreshUserIconIfNeeded()
    setSpinner(false)
    registerEventForNextRefresh(USER_ERROR)
    const [{ result: logoutUserResult }] = await Apis.beforeLogout()
    console.log({ logoutUserResult })
    await state.auth0Client.logout({
      returnTo: Router.getLoginRedirectUrl(),
    })
    await login()
  } else {
    // other api generic error, maybe internet connection
    // state.isLogged = false
    // state.userInfo = initialState.userInfo
    // state.userPreferences = initialState.userPreferences
    // refreshUserIconIfNeeded()
    // setSpinner(false)
  }
}

const initUserSession = async() => {
  if (navigator.onLine) {
    if (await initAuth0Client()) {
      showNotificationIfNeeded()
      console.log('initUserSession', state.isLogged, state.auth0Client)

      if (state.isLogged) { // questo isLogged è from auth0, quindi potrebbe non essere vero per la nostra AfterLogin
        if (!state.userInfo.emailVerified) {
          // se la mail non è ancora verificata nella sessione locale, chiamo un'api specifica per verificare l'utente nel db
          // senza chiamare afterLogin, cosi da non aprire una sessione utente finché non è completamente loggato
          const [{ result: currentUserResult, data: dbUser }] = await Apis.getCurrentUserInfo()
          if (currentUserResult) {
            await updateUserFromDbUser(dbUser)
          } else {
            Router.openPageVerifyEmail()
          }
        }

        if (state.userInfo.emailVerified) {
          await Coworking.connect() // this will start a new user session, and (if there is connection) awaits also ultil startUserSessionOnSocketConnect is done

          if (state.isLogged) {
            // questo isLogged è definitivo, qui tutti e tre i passaggi (sessione locale, api auth0, notra api AfterLogin) hanno confermato che l'utente è collegato
            // se l'api AfterLogin ha risposto picche, ha già fatto un redirect al login
            if (state.userInfo.emailVerified && !state.userInfo.acceptedNecessaryCookie) {
              initCookiePopup()
            }

            const waitingCoworkerId = await LocalDB.getCoworkerWaitingId()
            if (waitingCoworkerId && state.userInfo.emailVerified && !state.userInfo.isNewUser) {
              await LocalDB.cleanCoworkerWaitingId()
              Router.goToPage(`/coworking/requestSession/${waitingCoworkerId}`)
            } else {
              if (Router.getCurrentPage() !== 'editor') {
                Router.openCurrentUrlPage()
              }
            }
          }
        } else {
          Router.openPageVerifyEmail()
        }

        setSpinner(false)
      } else {
        LocalDB.emptyUserData()
        state.userInfo = initialState.userInfo
        state.userPreferences = initialState.userPreferences
        refreshUserIconIfNeeded()
        await login()
      }
    }
  } else {
    if (!state.isLogged) {
      Router.openPageNotConnected()
    }
  }
}

const initAuth0Client = async() => {
  state.auth0Client = state.auth0Client || await createAuth0Client({
    domain: Params.auth0Domain,
    client_id: Params.auth0ClientId,
    audience: Params.auth0Audience,
    useRefreshTokens: true,
    cacheLocation: 'localstorage',
  })

  if (document.location.search) {
    const params = new URLSearchParams(document.location.search)
    if (params.get('code') && params.get('state')) { // se la pagina viene aperta dalla redirect del login appena fatto
      await handleRedirectAfterLogin()
    } else if (params.get('supportSignUp')) { // se è il redirect del click nella mail di conferma
      // niente da fare in realtà qui, basta il cambiamento a document.location.href per il refresh
    }
    document.location.href = document.location.origin
    return false
  }

  state.isLogged = await state.auth0Client.isAuthenticated()

  return true
}

const showNotificationIfNeeded = () => {
  if (hasEventForNextRefresh(USER_DELETED)) {
    Messages.success(labels.deleteSuccess)
  }

  if (hasEventForNextRefresh(USER_LOGOUT)) {
    Messages.success(labels.logoutSuccess)
  }

  if (hasEventForNextRefresh(USER_DELETED_BY_SERVER)) {
    Messages.success(labels.deletedByServer)
  }

  if (hasEventForNextRefresh(USER_ERROR)) {
    // Messages.error(labels.userError)
  }
}

const updateUserFromDbUser = async(dbUser) => {
  dbUser.userPreferences = {
    ...initialState.userPreferences,
    ...(dbUser.userPreferences || {}),
  }
  delete dbUser.isNewSession
  delete dbUser.hasUserSession
  await LocalDB.updateUserData({
    ...dbUser,
    deviceId: state.userInfo.deviceId,
  })
  state.userInfo = await LocalDB.getUserData()
  state.isLogged = true
  state.userPreferences = state.userInfo.userPreferences
  delete state.userInfo.userPreferences
  refreshUserIconIfNeeded()
  updateUserEnvironment()
}

export const updateUserFromLocalSession = async() => {
  const localUser = await LocalDB.getUserData()
  const deviceLocalData = await LocalDB.getDeviceLocalData()
  delete deviceLocalData.id
  if (localUser) {
    state.userPreferences = localUser.userPreferences || {}
    delete localUser.userPreferences
    state.userInfo = localUser
    state.isLogged = true
  } else {
    state.isLogged = false
    state.userInfo = initialState.userInfo
    state.userPreferences = initialState.userPreferences
  }
  state.userInfo = {
    ...state.userInfo,
    ...deviceLocalData,
  }
  updateUserEnvironment()
  refreshUserIconIfNeeded()
}

export const login = async() => {
  if (navigator.onLine && !state.isLogged) {
    // await state.auth0Client.loginWithPopup()
    setSpinner(true, 3000)
    registerEventForNextRefresh(USER_LOGIN)
    await state.auth0Client.loginWithRedirect({
      redirect_uri: Router.getLoginRedirectUrl(),
    })
  }
}

export const logout = async(force = false) => {
  if (state.isLogged) {
    if (force || await Messages.confirm(labels.logoutConfirm)) {
      if (navigator.onLine) {
        setSpinner(true)
        await LocalDB.emptyUserData()
        await LocalDB.emptyDrawingsData()
        await LocalDB.updateDeviceCookiePreferences(false, false, false)
        deleteCookie()
        const [{ result: logoutUserResult }] = await Apis.beforeLogout()
        console.log({ logoutUserResult })
        state.userInfo = initialState.userInfo
        state.userPreferences = initialState.userPreferences
        state.isLogged = false
        registerEventForNextRefresh(USER_LOGOUT)
        setSpinner(false)
        state.auth0Client.logout({
          returnTo: Router.getLoginRedirectUrl(),
        })
      } else {
        Messages.error(labels.offline)
      }
    }
  }
}

export const onUserDeletedByServer = async() => {
  if (state.isLogged) {
    setSpinner(true)
    await LocalDB.emptyUserData()
    await LocalDB.emptyDrawingsData()
    await LocalDB.updateDeviceCookiePreferences(false, false, false)
    deleteCookie()
    state.userInfo = initialState.userInfo
    state.userPreferences = initialState.userPreferences
    state.isLogged = false
    registerEventForNextRefresh(USER_DELETED_BY_SERVER)
    setSpinner(false)
    state.auth0Client.logout({
      returnTo: Router.getLoginRedirectUrl(),
    })
  }
}

export const deleteUser = async() => {
  if (state.isLogged && await Messages.confirm(labels.deleteConfirm)) {
    if (navigator.onLine) {
      try {
        setSpinner(true)
        Messages.info(labels.thisMayTakeAMoment)
        const [{ result: deleteUserResult }] = await Apis.deleteUser()
        console.log({ deleteUserResult })
        if (deleteUserResult) {
          await LocalDB.emptyUserData()
          await LocalDB.emptyDrawingsData()
          await LocalDB.updateDeviceCookiePreferences(false, false, false)
          deleteCookie()
          state.userInfo = initialState.userInfo
          state.userPreferences = initialState.userPreferences
          state.isLogged = false
          registerEventForNextRefresh(USER_DELETED)
          setSpinner(false)
          state.auth0Client.logout({
            returnTo: Router.getLoginRedirectUrl(),
          })
        }
      } catch (e) {
        setSpinner(false)
        Messages.error(labels.deleteError)
      }
    } else {
      Messages.error(labels.offline)
    }
  }
}

export const changePassword = async() => {
  if (state.isLogged) {
    if (navigator.onLine) {
      setSpinner(true)
      const [{ result }] = await Apis.requestPasswordChange()
      setSpinner(false)
      if (result) {
        Messages.success(labels.changePwdSuccess)
        return true
      } else {
        Messages.error(labels.changePwdError)
        return false
      }
    } else {
      Messages.error(labels.offline)
      return false
    }
  }
}

export const getAuthToken = async() => {
  if (state.auth0Client.isAuthenticated()) {
    return await state.auth0Client.getTokenSilently()
  }
}

const userButtonClick = async(e) => {
  preventDefault(e)
  if (state.isLogged) {
    Router.openPageUserProfile()
  } else {
    if (navigator.onLine) {
      login()
    } else {
      Messages.error(labels.offline)
    }
  }
}

const pauseUserSession = async() => {
  Tracking.trackAction(Tracking.actions.PAGE_CLOSED)
  await Apis.pageHide()
  Coworking.disconnect()
}

const unpauseUserSession = () => {
  Tracking.trackAction(Tracking.actions.PAGE_OPENED)
  Apis.pageShow()
  Coworking.connect()
}

const initDom = () => {
  refs.userButton = createDom('user-login-button')
  refs.userButton.addEventListener(Params.eventStart, userButtonClick)
  refs.mainMenuUserPicture = document.querySelector('.drawith__menu-user-picture')
  refs.mainMenuUserName = document.querySelector('.drawith__menu-user-label')
  Header.addHeaderButton(refs.userButton, 'right')
}

export const init = async() => {
  state = deepCopy(initialState)
  initDom()
  await updateUserFromLocalSession()

  if (state.isLogged !== true || state.userInfo.emailVerified !== true || state.userInfo.isNewUser) {
    setSpinner(true)
  }

  if (Router.userIsTryingCoworking()) {
    if (navigator.onLine) {
      setSpinner(true)
      await LocalDB.addCoworkerWaitingId(Router.getCoworkerIdUrlParam())
    } else {
      Messages.error(labels.youAreOffline)
    }
  } else {
    Router.openCurrentUrlPage()
  }

  // questo isLogged è from local session, quindi potrebbe non essere più vero per auth0 o per la nostra AfterLogin
  if (state.isLogged || navigator.onLine) {
    await initUserSession()
  } else {
    setSpinner(false)
    Router.openPageNotConnected()
  }
}

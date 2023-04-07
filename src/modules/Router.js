import { osVersion, isAndroid, isWearable, isSmartTV, fullBrowserVersion, browserVersion, isIOS, isIE, isChrome, isConsole, isWinPhone, isOpera, isTablet, browserName, mobileModel } from 'mobile-device-detect'

import Params from 'main/Params'
import { config as supportedVersions } from 'pages/NotSupported/config'
import { getUserInfo, isLogged } from 'modules/User'
import * as Folder from 'pages/Folder'
// import * as Dashboard from 'pages/Dashboard'
import * as Editor from 'pages/Editor'
import * as UserProfile from 'pages/UserProfile'
import * as VerifyEmail from 'pages/VerifyEmail'
import * as Info from 'pages/Info'
import * as NotSupported from 'pages/NotSupported'
import * as NotConnected from 'pages/NotConnected'
import * as Coworking from 'modules/Coworking'
import * as Tracking from 'modules/Tracking'
import { testDeviceSupported } from 'utils/jsUtils'

const ROUTES = {
  'editor': Editor,
  'folder': Folder,
  // 'dashboard': Dashboard,
  'coworking': Coworking,
  'notsupported': NotSupported,
  'your': UserProfile,
  'verifyemail': VerifyEmail,
  'info': Info,
  'offline': NotConnected,
}

const config = {
  defaultPage: 'folder',
  urlRedirectIfNewUser: 'your/data',
  urlRedirectToVerifyEmail: 'verifyemail',
  urlOffline: 'offline',
  publicPagesForNewUser: ['info', 'your', 'verifyemail'],
}
const state = {
  currentPage: '',
  currentPath: '',
}

export const getLoginRedirectUrl = () => `${document.location.origin}/${config.defaultPage}`


export const redirectNewUserIfNeeded = async(currentPage = state.currentPage) => {
  if (isLogged()) {
    const userInfo = getUserInfo()
    if (currentPage === config.urlOffline) {
      await goToPage(config.defaultPage)
      return true
    } else if (userInfo.emailVerified && currentPage === config.urlRedirectToVerifyEmail) {
      await goToPage(config.defaultPage)
      return true
    } else if (!userInfo.emailVerified && currentPage !== config.urlRedirectToVerifyEmail) {
      await goToPage(config.urlRedirectToVerifyEmail)
      return true
    } else if (userInfo.isNewUser && !config.publicPagesForNewUser.includes(currentPage)) {
      await goToPage(config.urlRedirectIfNewUser)
      return true
    }
  } else {
    if (!navigator.onLine && currentPage !== config.urlOffline) {
      await goToPage(config.urlOffline)
    }
    return true
  }
  return false
}

export const getCurrentPage = () => state.currentPage

export const openPageNotSupported = () => {
  goToPage('/notsupported', false)
  Tracking.trackAction(Tracking.actions.NOT_SUPPORTED_DEVICE, {
    isIos: isIOS,
    isAndroid,
    isIE,
    isSmartTV,
    isWearable,
    isConsole,
    isChrome,
    isWinPhone,
    isOpera,
    isTablet,
    browserName,
    fullBrowserVersion,
    browserVersion,
    osName: Params.osName,
    osVersion,
    mobileModel,
  }, true)
}

export const openPageEditor = (track = true) => {
  goToPage('/editor', track)
}

export const openPageFolder = (track = true) => {
  goToPage('/folder', track)
}

export const openPageNotConnected = () => {
  goToPage(`/${config.urlOffline}`, false)
}

export const openPageUserProfile = (track = true) => {
  goToPage('/your/data', track)
}

export const openPageVerifyEmail = (track = true) => {
  goToPage(`/${config.urlRedirectToVerifyEmail}`)
}

export const openPageAboutUs = (track = true) => {
  goToPage('/info/aboutUs', track)
}

export const openPageTermsOfService = (track = true) => {
  if (track) {
    Tracking.trackAction(Tracking.actions.OPEN_PAGE_INFO_TERMS)
  }
  window.open(Params.termsOfServiceUrl, '_blank')
}

export const openPagePrivacyPolicy = (track = true) => {
  if (track) {
    Tracking.trackAction(Tracking.actions.OPEN_PAGE_INFO_POLICY)
  }
  window.open(Params.privacyPolicyUrl, '_blank')
}

export const openPageCookiePolicy = (track = true) => {
  if (track) {
    Tracking.trackAction(Tracking.actions.OPEN_PAGE_INFO_COOKIE)
  }
  window.open(Params.cookiePolicyUrl, '_blank')
}

export const openPageUserPreferences = (track = true) => {
  goToPage('/your/preferences', track)
}

const decryptInitialPathUrl = (path) => {
  let url = path

  // some urls can be shortened for better sharing.
  // example: app.drawith.me/E/abc123  ==>  Editor Coworking with room id 'abc123'

  // Editor Coworking
  url = url.replace('/E/', '/coworking/requestSession/')

  // Editor to folder
  if (url.endsWith('/editor') || url.endsWith('/editor/')) {
    url = url.replace('/editor', '/folder')
  }

  if (url.includes('/notSupported') || url.includes('/notsupported')) {
    url = '/folder'
  }

  return url
}

export const isSupportedOs = async() => {
  return (
    (!isIOS || (isIOS && browserVersion > supportedVersions.ios.minVersion)) &&
    (!isAndroid || (isAndroid && browserName.toLowerCase().includes('chrome') && parseInt(osVersion) >= supportedVersions.android.minVersion && parseInt(browserVersion) >= supportedVersions.android.minBrowserVersion)) &&
    (!isIE) &&
    (!isSmartTV) &&
    (!isWearable) &&
    (!isConsole) &&
    (!isWinPhone) &&
    (!isOpera) &&
    await testDeviceSupported()
  )
}

export const goToPage = async(path, track = true, force = false) => {
  let [page, method, ...params] = path.split('/').filter(e => e !== '')
  page = page || config.defaultPage
  page = page.toLowerCase()
  let module = ROUTES[page]
  if (!module) {
    // default page
    page = config.defaultPage
    module = ROUTES[config.defaultPage]
    method = false
    params = []
  }

  if (await redirectNewUserIfNeeded(page)) {
    return
  }

  params = params.map(p => {
    try {
      return JSON.parse(p)
    } catch (e) {
      return p
    }
  })

  let pageChanged = false

  if (state.currentPage !== page || force) {
    // 1. if there is a page change, and we had already a page opened, we close it
    pageChanged = true
    if (state.currentPage && ROUTES[state.currentPage].close) {
      await ROUTES[state.currentPage].close()
    }

    // 2. then we open the new one
    if (method === 'open') {
      await module.open(...params)
    } else if (module.open) {
      await module.open()
    }
  }

  let methodPath = ''
  let action = `OPEN_PAGE_${page.toUpperCase()}`
  // 3. if there is a method in the url, now we can call it
  if (method && method !== 'open' && module[method]) {
    module[method](...params)
    methodPath = `/${method}`
    action = `${action}_${method.toUpperCase()}`
  }

  // 4. track page visit
  if (track && (pageChanged || method)) {
    if (state.currentPath !== path) {
      console.log('goToPage: ', { page, method, params, path })
      Tracking.trackAction(Tracking.actions[action])
    }
  }

  history.pushState({}, '', `/${page}${methodPath}${document.location.search}`)

  state.currentPage = page
  state.currentPath = path
}

export const openCurrentUrlPage = () => {
  if (userIsTryingCoworking()) {
    openPageFolder()
  } else {
    const nextPage = decryptInitialPathUrl(document.location.pathname)
    goToPage(nextPage, nextPage !== `/${config.defaultPage}`)
  }
}

export const userIsTryingCoworking = () => {
  return `${document.location.pathname}`.includes('/E/')
}

export const getCoworkerIdUrlParam = () => {
  if (userIsTryingCoworking()) {
    let coworkerId = `${document.location.pathname}`.split('/E/')[1]
    coworkerId = coworkerId.split('/')[0]
    return coworkerId
  } else {
    return false
  }
}

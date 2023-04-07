import { isAndroid, osName, isMobileOnly, isMobile, isTablet, isBrowser, isIOS, isMacOs, isIPad13, browserName } from 'mobile-device-detect'
import { getRealScreenWidth, getRealScreenHeight } from 'main/main'

const Params = {}

Params.init = (appState) => {
  Params.appName = appState.NAME
  Params.appVersion = appState.VERSION
  Params.isInstalledWebapp = !!window.navigator.standalone
  Params.isLocal = (document.location.hostname === 'localhost' || document.location.hostname.includes('192.168'))
  Params.isDevEnv = document.location.hostname.includes('dev.drawith.me')
  Params.isProdEnv = document.location.hostname.includes('app.drawith.me')
  Params.isDebug = Params.isLocal && appState.DEBUG
  Params.supportTouch = ('ontouchstart' in window)
  Params.showAdsOnPhones = false
  // Params.supportGesture = ('ongesturechange' in window)

  if (Params.supportTouch) {
    Params.eventStart = 'touchstart'
    Params.eventMove = 'touchmove'
    Params.eventEnd = 'touchend'
    Params.eventOut = ''
    Params.eventCanceled = 'touchcancel'
  } else {
    Params.eventStart = 'pointerdown'
    Params.eventMove = 'pointermove'
    Params.eventEnd = 'pointerup'
    Params.eventOut = 'pointerout'
    Params.eventCanceled = 'pointercancel'
  }
  Params.eventScroll = 'wheel'
  Params.eventPageVisibilityChange = 'visibilitychange'

  const userAgent = navigator.userAgent.toLowerCase()
  Params.android = isAndroid
  Params.isMacOs = isMacOs
  Params.osName = osName
  Params.ipad = isMacOs && isTablet
  Params.iphone = /iphone/.test(userAgent)
  Params.ios = isIOS
  Params.isTablet = isTablet
  Params.isPhone = isMobileOnly
  Params.isMobile = isMobile
  Params.isDesktop = !isTablet && !isMobile && isBrowser
  Params.isAppOnline = (document.location.host.toLowerCase() === Params.appName)

  if (Params.ipad) {
    Params.osName = 'ipad os'
  }

  if (Params.isPhone) {
    Params.deviceType = 'PHONE'
  } else if (Params.isDesktop) {
    Params.deviceType = 'DESKTOP'
  } else {
    Params.deviceType = 'TABLET'
  }

  const pixelRatio = (Math.round(window.devicePixelRatio * 100) / 100)
  // Params.pixelRatio = (Params.isMobile ? (Params.ios ? 1 : pixelRatio) : pixelRatio)
  Params.pixelRatio = (Params.isPhone ? 1 : pixelRatio)

  Params.isHighPerformanceTablet = isIPad13 && Math.max(getRealScreenWidth(), getRealScreenHeight()) > 2300
  Params.isHighPerformanceDesktop = Params.isDesktop && (Params.isLocal || (browserName === 'Chrome' && navigator.hardwareConcurrency >= 8))
  Params.deviceHasGoodPerformance = Params.isHighPerformanceTablet || Params.isHighPerformanceDesktop

  Params.instagramUrl = 'https://www.instagram.com/drawith.me_/'
  Params.tiktokUrl = 'https://www.tiktok.com/@drawith.me_'
  Params.privacyPolicyUrl = 'https://drawith.me/privacy.html'
  Params.cookiePolicyUrl = 'https://drawith.me/cookie.html'
  Params.termsOfServiceUrl = 'https://drawith.me/terms.html'


  // Aws server config
  if (Params.isLocal) {
    // ~ /Workspace  ./ngrok http https://localhost:3000
    Params.socketUrl = 'https://dc41-109-136-172-74.ngrok.io'
    Params.apisUrl = 'https://dc41-109-136-172-74.ngrok.io'
    // const origin = document.location.origin.substr(0, document.location.origin.lastIndexOf(':'))
    // Params.socketUrl = `${origin}:3000`
    // Params.apisUrl = `${origin}:3000`
  } else if (Params.isDevEnv) { // env dev online
    // 'http://drawithmebackenddev-env.eba-as3f3kba.eu-central-1.elasticbeanstalk.com'
    Params.socketUrl = 'https://server-dev.drawith.me'
    Params.apisUrl = 'https://server-dev.drawith.me'
  } else { // prod
    // 'http://drawithmebackend-env.eba-aimnimvj.eu-central-1.elasticbeanstalk.com'
    Params.socketUrl = 'https://server.drawith.me'
    Params.apisUrl = 'https://server.drawith.me'
  }
  // Params.socketUrl = (Params.isDebug ? 'http://46.252.150.61:5000' : 'http://46.252.150.61:4000')


  // Auth0 config
  Params.auth0Domain = 'login.drawith.me'
  Params.auth0ClientId = 'gCTxEaux17txGQmibtzRJaiCTkQuf8mH'
  Params.auth0Audience = 'https://backend.drawith.me'

  // MixPanel config
  // Params.mixPanelId = '3d3c669a1c1e059140cc97aafdcc36ea' // OLD
  Params.mixPanelId = 'f03c016be6a570b42f8c06479f671a33'
  Params.mixPanelApiHost = 'https://api-eu.mixpanel.com'

  // Local db name
  Params.localDbName = 'drawith.me_new_db'

  // S3 config
  Params.s3Region = 'eu-central-1'
  Params.s3IdentityPoolId = 'eu-central-1:794246ed-9f61-4e5d-ad23-f0313bed5b75'
  Params.s3UserDrawingsBucket = 'user-drawings'

  // Google Analytics
  Params.GAid = 'G-PRCENHWLBJ'

  // adSterra ads id
  Params.adSterraId = '03e951704401cf9956e671597f849f33'
}

Params.set = (key, value) => {
  if (key !== 'set') {
    Params[key] = value
  }
}

export default Params

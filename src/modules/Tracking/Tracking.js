import Params from 'main/Params'
import * as actionsConstants from './constants'
const mixpanel = require('mixpanel-browser')


const state = {
  initialised: false,
  identified: false,
}


export const identifyUser = (userId) => {
  // console.log('MIX: identifyUser', userId)
  // chiamato due volte, su inizializzazione da localDb e dopo afterLogin
  if (Params.isProdEnv && userId) {
    state.identified = true
    mixpanel.identify(userId)
  }
}

export const incrementProp = (propName, amount = 1) => {
  // console.log('MIX: increment', propName)
  if (state.initialised && state.identified && propName) {
    mixpanel.people.increment(propName, amount)
  }
}

export const setNewUser = (email, auth0Id) => {
  // console.log('MIX: setNewUser', email, auth0Id)
  // chiamata una volta sola su creazione del nuovo utente
  if (state.initialised && state.identified && email) {
    mixpanel.people.set({
      '$email': email,
      '$created': (new Date()).toISOString(),
      auth0Id,
      visits: 1,
      logins: 1,
      logouts: 1,
      createdDrawings: 0,
      deletedDrawings: 0,
      coworkingSessions: 0,
    })
  }
}

export const optInUser = () => {
  if (state.initialised && state.identified) {
    mixpanel.opt_in_tracking()
  }
}

export const optOutUser = () => {
  if (state.initialised && state.identified) {
    mixpanel.opt_out_tracking()
  }
}

export const addSuperProperties = (data = {}) => {
  if (state.initialised && state.identified) {
    mixpanel.register(data)
  }
}

export const setUserData = (data = {}) => {
  // console.log('MIX: setUserData')
  // chiamato su ogni update user (anche il primo, la creazione utente)
  if (state.initialised && state.identified) {
    mixpanel.people.set(data)
  }
}

export const trackAction = (action, data = {}, force = false) => {
  if (action) {
    if (!Params.isProdEnv) {
      console.log('MIX: trackAction', action)
    }
    if (state.initialised && (state.identified || force)) {
      mixpanel.track(action, data)
    } else {
      // console.log('MixPanel:', action, data)
    }
  }
}

export const init = () => {
  // console.log('MIX: init')
  if (Params.isProdEnv) {
    state.initialised = true
    mixpanel.init(Params.mixPanelId, {
      'api_host': Params.mixPanelApiHost,
    }, '')
    mixpanel.register({
      appVersion: Params.appVersion,
    })
  }
}

export const actions = { ...actionsConstants }

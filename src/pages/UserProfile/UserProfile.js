const tplPage = require('./userProfile.tpl')
import './userProfile.css'
import { debounce } from 'debounce'

import Params from 'main/Params'
import Apis from 'modules/Apis/Apis'
import * as User from 'modules/User'
import * as Tracking from 'modules/Tracking'
import * as Messages from 'modules/Messages'
import * as Router from 'modules/Router'
import * as LocalDB from 'utils/localDbUtils'
import { loadTemplate, preventDefault, setSpinner } from 'utils/domUtils'
import { cleanRefs, addGlobalStatus } from 'utils/moduleUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'

import { deselectAllTabs, selectOneTab, animateCheckbox } from 'utils/uiUtils'
import { getImageFromUrl, resizeImageAndGetBase64 } from 'utils/imageUtils'
import { deepCopy } from 'utils/jsUtils'


const config = {
  allowedCharsNickname: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.çÇ',
  minNicknameLength: 4,
  maxNicknameLength: 30,
}
let state = {}
const initialState = {
  askedForPasswordChange: false,
  pictureChanged: false,
  currentUserInfo: {},
  currentUserPreferences: {},
  currentNicknameIsValid: true,
  currentNicknameIsAvailable: true,
  currentTab: '',
}
const refs = {
  container: null,
  nickname: null,
  nicknameIcon: null,
  firstName: null,
  lastName: null,
  changePwdButton: null,
  photoInput: null,
  checkEmailsLabel: null,
  dataSaveButton: null,
  preferencesSaveButton: null,
  errorMsgs: null,
  termsCheckbox: null,
  newsletterCheckbox: null,
  userPictureWrapper: null,
  userPicture: null,
}
const labels = {
  logout: 'Logout',
  yourData: 'Your informations',
  preferences: 'App preferences',
  save: 'Save',
  email: 'Email',
  firstName: 'First name',
  lastName: 'Last name',
  nickname: 'Nickname',
  provider: 'Login provider',
  deleteAccount: 'Delete account',
  changePassword: 'Change password',
  cantChangePwd: '(Password menaged by the provider)',
  checkYourEmails: 'Check your emails',
  errorNicknameValid: `Nickname must be between ${config.minNicknameLength} and ${config.maxNicknameLength} characters ( a-z A-Z . _ ) without spaces`,
  errorNicknameAvailability: 'This nickname is not available',
  mustCheckTerms: 'You must read and accept terms and conditions',
  changePicture: 'Change photo',
  removePicture: 'Remove photo',
  acceptTerms: 'I read and accepted ',
  sendMeNewsletter: 'I want to stay updated on Drawith.me',
  termsAndConditions: 'Terms and conditions',
  dragEditorZoomWithOneFinger: 'Drag with one finger while zooming <br> (if you have Apple Pencil)',
  saveError: 'Something went wrong, please try again later',
  editor: 'Editor',
  accountCreated: 'Account created',
  changedSaved: 'Changes saved',
  and: 'and',
  privacyPolicy: 'Privacy Policy',
}

const spinnerImgUrl = require('static/img/spinner.svg')

const askPasswordChange = async(e) => {
  preventDefault(e)
  if (await User.changePassword()) {
    state.askedForPasswordChange = true
    refs.checkEmailsLabel.classList.remove('displayNone')
    refs.changePwdButton.classList.add('displayNone')
  }
}

const dataIsChanged = () => {
  return (
    state.currentUserInfo.nickname !== refs.nickname.value ||
    state.currentUserInfo.firstName !== refs.firstName.value.trim() ||
    state.currentUserInfo.lastName !== refs.lastName.value.trim() ||
    state.currentUserInfo.newsletter !== refs.newsletterCheckbox.checked ||
    state.pictureChanged ||
    Object.values(state.currentUserPreferences).some(p => p.value !== refs.container.querySelector(`.drawith__user-preferences-container input[data-preferences="${p.name}"]`).checked)
  )
}

const saveUserData = async() => {
  const [dataIsValid, errorMessage] = validateData()
  const isNewUser = state.currentUserInfo.isNewUser
  showErrorMessage(errorMessage)
  if (dataIsValid && (isNewUser || dataIsChanged())) {
    setSpinner(true)
    state.currentUserInfo.nickname = refs.nickname.value
    state.currentUserInfo.firstName = refs.firstName.value.trim()
    state.currentUserInfo.lastName = refs.lastName.value.trim()
    state.currentUserInfo.newsletter = refs.newsletterCheckbox.checked
    state.currentUserInfo.isNewUser = false;
    [...refs.container.querySelectorAll('.drawith__user-preferences-container input[type="checkbox"]')].forEach(input => {
      state.currentUserPreferences[input.getAttribute('data-preferences')].value = input.checked
    })

    const params = { userId: state.currentUserInfo.dbId }
    const body = {
      userData: {
        ...state.currentUserInfo,
        userPreferences: Object.fromEntries(Object.values(state.currentUserPreferences).map(e => ([e.name, e.value]))),
      },
    }
    if (state.currentUserInfo.PICTURE) {
      body.userData.PICTURE = resizeImageAndGetBase64(await getImageFromUrl(body.userData.profileImgUrl, true), 300)
    }

    const [{ result: updateUserResult, userData }] = await Apis.updateUser({ body, params })

    if (updateUserResult) {
      await LocalDB.updateUserData(userData)
      await User.updateUserFromLocalSession()
      refreshPageData()
      if (isNewUser) {
        addGlobalStatus('drawith__USER-CONNECTED')
        Messages.success(labels.accountCreated)
        Tracking.setNewUser(userData.email, userData.auth0Id)
        User.trackUserConnection()
        LocalDB.syncUserDrawings()

        const waitingCoworkerId = await LocalDB.getCoworkerWaitingId()
        console.log({ waitingCoworkerId })
        if (waitingCoworkerId) {
          await LocalDB.cleanCoworkerWaitingId()
          Router.goToPage(`/coworking/requestSession/${waitingCoworkerId}`)
        } else {
          Router.openPageFolder()
        }
      } else {
        Messages.success(labels.changedSaved)
      }
      Tracking.setUserData({
        $first_name: userData.firstName,
        $last_name: userData.lastName,
        sendMeNewsletter: userData.newsletter,
        nickname: userData.nickname,
        browserLang: userData.browserLang,
      })
    } else {
      Messages.error(labels.saveError)
    }
    setSpinner(false)
  }
}

const toggleTerms = () => {
  refs.termsCheckbox.checked = !refs.termsCheckbox.checked
  refs.termsCheckbox.dispatchEvent(new Event('change'))
}

const toggleNewsletter = () => {
  refs.newsletterCheckbox.checked = !refs.newsletterCheckbox.checked
  refs.newsletterCheckbox.dispatchEvent(new Event('change'))
}

const validateData = () => {
  if (!validateNickname()) {
    return [false, labels.errorNicknameValid]
  } else if (!state.currentNicknameIsAvailable) {
    return [false, labels.errorNicknameAvailability]
  } else if (!validateTerms()) {
    return [false, labels.mustCheckTerms]
  } else {
    return [true, '']
  }
}

const validateTerms = () => {
  const isValid = (state.currentUserInfo.isNewUser === false || refs.termsCheckbox.checked)
  refs.termsCheckbox.parentNode.classList.toggle('error', !isValid)
  showErrorMessage()
  return isValid
}

const showErrorMessage = (msg = '') => {
  refs.errorMsgs.forEach(dom => dom.innerHTML = msg)
}

const checkNicknameAvailability = debounce(async() => {
  const body = {
    nickname: refs.nickname.value,
  }
  const [{ isAvailable }] = await Apis.nicknameIsAvailable({ body })
  state.currentNicknameIsAvailable = isAvailable
  refs.nicknameIcon.classList.remove('success', 'error', 'loading')
  if (state.currentNicknameIsAvailable && state.currentNicknameIsValid) {
    refs.nicknameIcon.classList.add('success')
    refs.nickname.classList.remove('error')
  } else {
    refs.nicknameIcon.classList.add('error')
    refs.nickname.classList.add('error')
  }
}, 300)

const validateNickname = () => {
  const chars = (refs.nickname.value || '').split('')
  state.currentNicknameIsValid = !(
    chars.length < config.minNicknameLength || // too short
    chars.length > config.maxNicknameLength || // too long
    chars.some(c => !config.allowedCharsNickname.includes(c)) // contains invalid chars
  )
  return state.currentNicknameIsValid
}

const onNicknameChange = (e) => {
  validateNickname()
  const isValid = validateNickname()
  refs.nickname.classList.toggle('error', !isValid)
  refs.nicknameIcon.classList.remove('success', 'error', 'loading')
  if (isValid) {
    showErrorMessage()
    checkNicknameAvailability()
    refs.nicknameIcon.classList.add('loading')
  } else {
    refs.nicknameIcon.classList.add('error')
  }
}

const onPictureInputChange = (e) => {
  const file = e.target.files[0]
  if (file) {
    refs.userPictureWrapper.classList.add('drawith__user-picture-full')
    state.currentUserInfo.profileImgUrl = URL.createObjectURL(file)
    state.currentUserInfo.PICTURE = file
    state.pictureChanged = true
    refs.userPicture.style.backgroundImage = `url(${state.currentUserInfo.profileImgUrl})`
  }
}

const removeUserPicture = () => {
  delete state.currentUserInfo.PICTURE
  refs.userPictureWrapper.classList.remove('drawith__user-picture-full')
  state.currentUserInfo.profileImgUrl = ''
  state.pictureChanged = true
  refs.photoInput.value = null
  refs.userPicture.style.backgroundImage = 'none'
}

const onPhotoTouchStart = (e) => {
  preventDefault(e)
  Messages.multipleChoice([{
    label: labels.removePicture,
    action: removeUserPicture,
  }])
}

const refreshPageData = () => {
  state.pictureChanged = false
  state.currentUserInfo = User.getUserInfo()
  state.currentUserInfo.browserLang = (navigator.language || navigator.userLanguage).toLowerCase().split('-')[0]
  state.currentUserPreferences = User.getUserPreferences()
  Object.keys(state.currentUserPreferences).forEach(p => {
    state.currentUserPreferences[p] = {
      name: p,
      label: labels[p],
      isBoolean: state.currentUserPreferences[p] === true || state.currentUserPreferences[p] === false,
      value: state.currentUserPreferences[p],
    }
  })
}

const initFormFromData = () => {
  refs.nickname.value = state.currentUserInfo.nickname || ''
  refs.firstName.value = state.currentUserInfo.firstName || ''
  refs.lastName.value = state.currentUserInfo.lastName || ''
  if (state.currentUserInfo.newsletter) {
    toggleNewsletter()
  }

  Object.keys(state.currentUserPreferences).forEach(key => {
    if (state.currentUserPreferences[key].value === true) {
      document.querySelector(`input[data-preferences="${key}"]`).checked = true
    }
  })

  if (state.currentUserInfo.profileImgUrl) {
    refs.userPicture.style.backgroundImage = `url(${state.currentUserInfo.profileImgUrl})`
    refs.userPictureWrapper.classList.add('drawith__user-picture-full')
  }
}

const initDom = async() => {
  refs.container = await loadTemplate(tplPage, {
    labels,
    email: state.currentUserInfo.email,
    isNewUser: state.currentUserInfo.isNewUser,
    loginProvider: (state.currentUserInfo.provider === 'auth0' ? 'Drawith.me' : state.currentUserInfo.provider),
    termsUrl: Params.termsOfServiceUrl,
    privacyUrl: Params.privacyPolicyUrl,
    preferences: Object.values(state.currentUserPreferences),
    spinnerImgUrl,
  }, Params.pagesContainer)
  refs.nickname = refs.container.querySelector('.drawith__user-nickname')
  refs.nicknameIcon = refs.container.querySelector('.drawith__user-nickname-icon-container')
  refs.firstName = refs.container.querySelector('.drawith__user-firstName')
  refs.lastName = refs.container.querySelector('.drawith__user-lastName')
  refs.changePwdButton = refs.container.querySelector('.drawith__user-change-pwd')
  refs.checkEmailsLabel = refs.container.querySelector('.drawith__user-check-emails')
  refs.dataSaveButton = refs.container.querySelector('.tab-content[data-tab-id="user-data"] .drawith__user-save')
  refs.preferencesSaveButton = refs.container.querySelector('.tab-content[data-tab-id="user-preferences"] .drawith__user-save')
  refs.errorMsgs = [...refs.container.querySelectorAll('.drawith__user-error-msg')]
  refs.termsCheckbox = refs.container.querySelector('.drawith__user-terms-checkbox input')
  refs.newsletterCheckbox = refs.container.querySelector('.drawith__user-newsletter-checkbox input')
  refs.userPictureWrapper = refs.container.querySelector('.drawith__user-picture')
  refs.photoInput = refs.container.querySelector('.drawith__user-picture-input')
  refs.userPicture = refs.container.querySelector('.drawith__user-picture-photo')

  animateCheckbox(refs.termsCheckbox)
  animateCheckbox(refs.newsletterCheckbox)
  refs.photoInput.addEventListener('change', onPictureInputChange)
  refs.termsCheckbox.addEventListener('change', validateTerms)
  refs.container.addEventListener('gesturestart', preventDefault)
  refs.userPicture.addEventListener(Params.eventStart, onPhotoTouchStart)

  refs.container.querySelector('.drawith__user-terms-checkbox + .drawith__user-checkbox-msg').addEventListener(Params.eventStart, toggleTerms)
  refs.container.querySelector('.drawith__user-newsletter-checkbox + .drawith__user-checkbox-msg').addEventListener(Params.eventStart, toggleNewsletter)
  refs.container.querySelector('.tabs-header div[data-tab-id="user-data"]').addEventListener(Params.eventStart, Router.openPageUserProfile)
  refs.container.querySelector('.tabs-header div[data-tab-id="user-preferences"]').addEventListener(Params.eventStart, Router.openPageUserPreferences)
  refs.changePwdButton.addEventListener(Params.eventStart, askPasswordChange)
  refs.dataSaveButton.addEventListener(Params.eventStart, saveUserData)
  refs.preferencesSaveButton.addEventListener(Params.eventStart, saveUserData)
  refs.nickname.addEventListener('keyup', onNicknameChange)
  refs.container.querySelector('.drawith__user-delete').addEventListener(Params.eventStart, User.deleteUser)
  refs.container.querySelector('.drawith__user-logout').addEventListener(Params.eventStart, () => User.logout(false))

  initFormFromData()

  if (state.currentUserInfo.provider === 'auth0') {
    refs.container.querySelector('.drawith__user-cant-change-pwd').classList.add('displayNone')
  } else {
    refs.changePwdButton.classList.add('displayNone')
  }
}

export const data = () => {
  if (state.currentTab !== 'data') {
    state.currentTab = 'data'
    refs.container && deselectAllTabs(refs.container)
    showErrorMessage()
    selectOneTab(refs.container, 'user-data')
  }
}

export const preferences = () => {
  if (state.currentTab !== 'preferences') {
    state.currentTab = 'preferences'
    refs.container && deselectAllTabs(refs.container)
    showErrorMessage()
    selectOneTab(refs.container, 'user-preferences')
  }
}

export const open = async() => {
  state = deepCopy(initialState)
  if (User.isLogged()) {
    refreshPageData()
    await initDom()
    fadeInElements(refs.container)
  } else {
    Router.openPageFolder()
  }
}

export const close = async() => {
  // state = {}
  await fadeOutElements(refs.container)
  cleanRefs(refs)
}

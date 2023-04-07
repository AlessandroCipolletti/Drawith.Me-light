const tplPage = require('./verifyEmail.tpl')
import './verifyEmail.css'
import imageUrlPng from 'static/img/verifyEmail.png'

import Apis from 'modules/Apis/Apis'
import Params from 'main/Params'
import * as User from 'modules/User'
import * as Messages from 'modules/Messages'
import { getUserInfo } from 'modules/User'
import { loadTemplate, setSpinner } from 'utils/domUtils'
import { cleanRefs } from 'utils/moduleUtils'
// import { fadeOutElements } from 'utils/animationsUtils'


const refs = {
  container: null,
  resendButton: null,
  resendMsg: null,
  loginButton: null,
}
const labels = {
  title: 'Verify your email',
  weSent: 'We sent an email to ',
  toVerify: 'to verify your email address and activate your account.',
  clickHere: 'Click here',
  toResend: 'to resend the confirmation email',
  done: 'Done! Check your email',
  errorResend: 'Something went wrong, please try again later',
  checkSpam: 'don\'t forget to check the',
  spam: 'spam',
  or: 'or',
  login: 'Login',
  anotherAccount: 'with another account',
}


const resentConfirmation = async() => {
  setSpinner(true)
  const [{ result }] = await Apis.requestConfirmationMail()
  setSpinner(false)

  if (result) {
    refs.resendButton.removeEventListener(Params.eventStart, resentConfirmation)
    refs.resendButton = null
    refs.resendMsg.innerHTML = labels.done
  } else {
    Messages.error(labels.errorResend)
  }
}

const reLogin = () => {
  User.logout(true)
}

export const open = async() => {
  const userInfo = getUserInfo()
  refs.container = await loadTemplate(tplPage, {
    imageUrlPng,
    labels,
    userEmail: userInfo.email,
  }, Params.pagesContainer)

  refs.resendButton = refs.container.querySelector('.verifyEmail__resend-msg a')
  refs.resendMsg = refs.container.querySelector('.verifyEmail__resend-msg')
  refs.loginButton = refs.container.querySelector('.verifyEmail__login-msg a')
  refs.resendButton.addEventListener(Params.eventStart, resentConfirmation)
  refs.loginButton.addEventListener(Params.eventStart, reLogin)
}

export const close = async() => {
  // await fadeOutElements(refs.container)
  cleanRefs(refs)
}

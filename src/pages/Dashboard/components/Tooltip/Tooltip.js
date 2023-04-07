const tplTooltip = require('./tooltip.tpl')
import './tooltip.css'

import Params from 'main/Params'
import { mergeObject /*, addRotationHandler */ } from 'utils/moduleUtils'
import { addGlobalStatus } from 'utils/moduleUtils'
import { loadTemplate } from 'utils/domUtils'
import { fadeInElements, fadeOutElements } from 'utils/animationsUtils'

const config = {
  tooltipSide: 'right',
}
const state = {
  selectedId: 0,
}
const refs = {
  overlay: null,
  tooltip: null,
  previewImage: null,
  likeButton: null,
  likeText: null,
  commentText: null,
  userImage: null,
  userName: null,
  drawPosition: null,
}
const labels = {
  share: 'Share',
}


const onLikeClick = () => {
  console.log('like')
}

const onCommentClick = () => {
  console.log('comment')
}

const onShareClick = () => {
  console.log('share')
}

const onUserClick = () => {
  console.log('user')
}

const onFollowClick = () => {
  console.log('follow')
}

const onPositionClick = () => {
  console.log('position')
}

const onBoutiqueClick = () => {
  console.log('boutique')
}

export const show = (draw) => {
  if (draw) {
    // const userInfo = getUserInfo()
    const userInfo = {}
    state.selectedId = draw.id
    refs.previewImage.src = draw.data.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
    //refs.userImage.style.backgroundImage = `url('https://graph.facebook.com/${draw.user.fb.id}/picture?type=large')`
    refs.userImage.style.backgroundImage = `url('https://graph.facebook.com/${userInfo.fb.id}/picture?type=large')`
    //refs.userName.innerHTML = draw.user.name
    refs.userName.innerHTML = userInfo.name
    refs.likeText.innerHTML = '123 Likes'
    refs.likeButton.src = 'img/icons/png/likeOn.png'
    refs.commentText.innerHTML = '<p>23 Comments</p>'
    refs.drawPosition.innerHTML = '<p>30 rue Monge, Paris</p>'
    // refs.title.innerHTML = "Titolo Disegno"
    // refs.location.innerHTML = "Paris, France"
    fadeInElements(refs.overlay)
    refs.tooltip.classList.add('dashboard-tooltip__panel-visible')
  }
}

export const hide = () => {
  state.selectedId = 0
  fadeOutElements(refs.overlay)
  refs.tooltip.classList.remove('dashboard-tooltip__panel-visible')
}

// const onRotate = (e) => {
//   // do some stuff
// }

const initDom = async(moduleContainer) => {
  if (config.tooltipSide === 'right') {
    addGlobalStatus('drawith__DASHBOARD-TOOLTIP-RIGHT')
  } else {
    addGlobalStatus('drawith__DASHBOARD-TOOLTIP-LEFT')
  }

  let dom = await loadTemplate(tplTooltip, { labels }, moduleContainer)
  refs.overlay = dom[0]
  refs.tooltip = dom[1]
  refs.previewImage = refs.tooltip.querySelector('.dashboard-tooltip__preview')
  refs.likeButton = refs.tooltip.querySelector('.dashboard-tooltip__info-like-button')
  refs.likeText = refs.tooltip.querySelector('.dashboard-tooltip__info-like-text')
  refs.commentText = refs.tooltip.querySelector('.dashboard-tooltip__info-comment-text')
  refs.userImage = refs.tooltip.querySelector('.dashboard-tooltip__info-user-image')
  // refs.userName = refs.tooltip.querySelector('.sdashboard-tooltip__info-user-name')
  refs.drawPosition = refs.tooltip.querySelector('.dashboard-tooltip__info-position')
  refs.tooltip.querySelector('.dashboard-tooltip__info-boutique').addEventListener(Params.eventStart, onBoutiqueClick)
  refs.tooltip.querySelector('.dashboard-tooltip__info-comment').addEventListener(Params.eventStart, onCommentClick)
  refs.tooltip.querySelector('.dashboard-tooltip__info-share').addEventListener(Params.eventStart, onShareClick)
  refs.tooltip.querySelector('.dashboard-tooltip__info-user-follow').addEventListener(Params.eventStart, onFollowClick)
  refs.overlay.addEventListener(Params.eventStart, hide)
  refs.likeButton.addEventListener(Params.eventStart, onLikeClick)
  refs.drawPosition.addEventListener(Params.eventStart, onPositionClick)
  refs.userImage.addEventListener(Params.eventStart, onUserClick)
  dom = undefined
  // refs.userName.addEventListener(Params.eventStart, onUserClick)
}

export const init = (props, moduleContainer) => {
  mergeObject(config, props)
  // addRotationHandler(onRotate)
  initDom(moduleContainer)
}

const tplPage = require('./notConnected.tpl')
import './notConnected.css'
// import imageUrl from 'static/img/notConnected.png'
import imageUrl from 'static/img/sadness.png'

import { addGlobalStatus } from 'src/utils/moduleUtils'
import Params from 'main/Params'
import { loadTemplate } from 'utils/domUtils'


const labels = {
  title: 'You\'re offline',
  subTitle: 'Come back later',
}

export const open = async() => {
  await loadTemplate(tplPage, {
    title: labels.title,
    subTitle: labels.subTitle,
    imageUrl,
  }, Params.pagesContainer)
  addGlobalStatus('drawith__NOT_CONNECTED')
}

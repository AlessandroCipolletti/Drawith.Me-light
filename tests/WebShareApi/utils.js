import { getOneDrawing } from 'utils/localDbUtils'
import { base64ImageToBlob } from 'utils/imageUtils'


export const downloadDrawingById = async(id) => {
  const d = await getOneDrawing(id)
  // console.log(d.localPathBig)

  const [blob, url, img] = await base64ImageToBlob(d.localPathBig)


  const file = new File([blob], "drawing.png", { type: 'image/png' })
  console.log(url)
  fetch(url)
  // window.open(url, '_blank')
  // document.location.href = url

  // if (navigator.share) {
  //   const toShare = {
  //     title: 'Drawith.Me 6',
  //     // text: 'Save me please ciao ciao ',
  //     url,
  //     // files: [file],
  //   }
  //   if (navigator.canShare(toShare)) {
  //     try {
  //       const result = await navigator.share(toShare)
  //       console.log({result})
  //     } catch(e) {
  //       console.log(e)
  //     }
  //   } else {
  //     console.log('cannnnot sharrre!')
  //   }
  // } else {
  //   console.error('not supported')
  // }
}

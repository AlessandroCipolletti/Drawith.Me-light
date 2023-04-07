const base64ImageToBlob = (b64Data, contentType = '', sliceSize = 512) => {
  const byteCharacters = atob(b64Data)
  const byteArrays = []
  for (var offset = 0, l1 = byteCharacters.length; offset < l1; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize)
    const byteNumbers = new Array(slice.length)
    for (let i = 0, l2 = slice.length; i < l2; i++) {
      byteNumbers[i] = slice.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    byteArrays.push(byteArray)
  }
  return new Blob(byteArrays, { type: contentType })
}



self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('blob')) {
    event.respondWith(new Promise(async(resolve) => {
      const formdata = await event.request.formData()
      const base64 = formdata.get('base64')
      const block = base64.split(";")
      const contentType = block[0].split(":")[1]
      const realData = block[1].split(",")[1]
      const blob = base64ImageToBlob(realData, contentType)

      const filename = 'ciaoone.png'
      const response = new Response(blob)
      console.log('ciao3')
      response.headers.append('Content-Disposition', `attachment; filename="${filename}"`)
      response.headers.append('Content-Type', 'image/png')
      // response.headers.append('Content-Type', 'text/plain')
      resolve(response)
    }))
  }
})


// self.addEventListener('fetch', (event) => {
//   if (event.request.url.includes('blob')) {
//     event.respondWith(
//       // event.request.blob().then((blob) => {
//       event.request.formData()
//       .then((formdata) => {
//         return new Promise((resolve, reject) => {
//           const base64 = formdata.get('base64')
//           resolve(base64)
//         })
//       })
//       .then(base64ImageToBlob)
//       .then(result => {
//         const filename = 'ciao.txt'
//         const response = new Response('result[0]')
//         response.headers.append('Content-Disposition', `attachment; filename="${filename}"`)
//         return response
//         // resolve(response)
//       })
//     )
//   }
// })

// self.addEventListener('fetch', (event) => {
//   if (event.request.url.includes('blob')) {
//     event.respondWith(
//       // event.request.blob().then((blob) => {
//       event.request.formData().then((formdata) => {
//         return new Promise((resolve, reject) => {
//           const filename = 'ciao.txt'
//           const base64 = formdata.get('base64')
//
//           // const [blob] = await base64ImageToBlob(base64)
//
//
//           const response = new Response(base64)
//           response.headers.append('Content-Disposition', `attachment; filename="${filename}"`)
//           // return response
//           resolve(response)
//         })
//
//       })
//       // .then((res) => {
//       //
//       //   return response
//       // })
//     )
//   }
// })

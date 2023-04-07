self.addEventListener('fetch', (event) => {
  // if (event.request.url.includes('blob')) {
    event.respondWith(
      event.request.formData().then((formdata) => {
        const filename = 'ciao'
        const body = 'contenuto'
        const response = new Response(body)
        response.headers.append('Content-Disposition', `attachment filename="${filename}"`)
        return response
      })
    )
  // }
})

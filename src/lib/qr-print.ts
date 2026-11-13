/** Build the existing print view without interpreting profile text as HTML. */
export function populateQrPrintDocument(doc: Document, dataUrl: string, title: string) {
  doc.title = title
  doc.body.style.cssText = "margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;"

  const image = doc.createElement("img")
  image.src = dataUrl
  image.style.cssText = "width:320px;height:320px;"

  const caption = doc.createElement("p")
  caption.style.cssText = "margin-top:16px;font-size:14px;color:#334155;"
  caption.textContent = title
  doc.body.replaceChildren(image, caption)
}

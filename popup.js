// ----------
// Constants
// ----------
const tableRef = 'recordings'
// const tableRef = 'staging_recordings'

// ----------
// Helpers
// ----------
function chunkString(str, length) {
  return str.match(new RegExp('.{1,' + length + '}', 'g'))
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

function setSizes() {
  chrome.storage.local.get('recordedRequests', function (items) {
    const size = JSON.stringify(items.recordedRequests || '').length
    const keysSize = Object.keys(items.recordedRequests || {}).length

    if (keysSize >= 500 || size <= 2) {
      document.getElementById('save').disabled = true
    } else {
      document.getElementById('save').disabled = false
    }

    document.getElementById('size').innerHTML = `${formatBytes(size)} in-cache`
    chrome.browserAction.setBadgeText({
      text: `${keysSize > 0 ? keysSize : ''}`,
    })
  })
}

function setRecordings(recordings) {
  const recordingsList = document.getElementById('recordings')
  recordingsList.innerHTML = ''

  if (recordings.length > 0) {
    recordings = recordings.sort((a, b) => {
      return b.date.seconds - a.date.seconds
    })

    const disabledOption = document.createElement('option')
    disabledOption.innerHTML = 'Select a recording'
    disabledOption.disabled = true
    disabledOption.selected = true
    disabledOption.value = ''
    recordingsList.appendChild(disabledOption)

    recordings.forEach((recording) => {
      if (!recording.url || !recording.url.includes('.com')) return

      const option = document.createElement('option')
      const view = recording.url.split('.com/')[1].split('/')[0].split('?')[0]
      const store =
        recording.url.split('shop-id=')[1]?.split('&')[0].replace('.myshopify.com', '') ?? ''

      const generatedTitle = `${
        recording.name?.length > 0 ? `${recording.name} - ` : store.length > 0 ? `${store} - ` : ''
      }${recording.name?.length > 0 ? '' : `${view} - `}${recording.date
        .toDate()
        .toLocaleString('en-US')}`

      option.innerHTML = generatedTitle
      option.value = JSON.stringify(recording)
      recordingsList.appendChild(option)
    })
  }
}

function setProgress(progress) {
  const progressEl = document.getElementById('progress')
  progressEl.value = progress
  progressEl.innerHTML = `${progress}%`

  const percentageEl = document.getElementById('percentage')
  percentageEl.innerHTML = `${progress}%`
}

function sanitizeRequests(requests) {
  let req = requests
  let keys = [
    // 'name' is a common key
    // we have special name checks below
    'name',
    // title is also common, but used in products so we need to keep it
    'title',
    'firstName',
    'lastName',
    'email',
    'createdBy',
    'updatedBy',
    'first_name',
    'last_name',
    'address1',
    'address2',
    'campaignName',
    'adsetName',
  ]

  let allowedNameString = [
    // cdp
    'segment-members',
    // store data
    'get-customers',
    // customer data
    'get-orders',
  ]

  Object.keys(req).forEach((key) => {
    keys.forEach((k) => {
      try {
        if (req[key].includes(k)) {
          const re = new RegExp(`"${k}":\s*"[^"]+?([^\/"]+)"`, 'g')

          if (k === 'name' || k === 'productName') {
            // if name, only allow strings provided above
            if (allowedNameString.filter((string) => key.includes(string)).length <= 0) {
              return
            }
          }

          req[key] = req[key].replaceAll(re, `"${k}":"[REDACTED]"`)

          // conditional to sift escaped quotes
          // only if they are "pre-esacped"
          if (req[key].includes('/"')) {
            const re2 = new RegExp(`\"${k}\":\s*\"[^"]+?([^\/"]+)\"`, 'g')
            req[key] = req[key].replaceAll(re2, `\"${k}\":\"[REDACTED]\"`)
          }
        }
      } catch {}
    })
  })

  return req
}

function getRecordings(db) {
  try {
    db.collection(tableRef)
      .get()
      .then(async (snapshot) => {
        let data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), requests: {} }))

        // fetch all requests for each recording
        // and add the id to the data
        let requests = await Promise.allSettled(
          data.map(async (rec) => {
            return await db
              .collection(tableRef)
              .doc(rec.id)
              .collection('requests')
              .get()
              .then(async (snapshot) => {
                return await snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
              })
          }),
        )

        // reconstruct the requests object
        await requests.map(async (snapshot, i) => {
          const reqSnap = snapshot.value
          reqSnap.map((request) => {
            try {
              if (!!request.chunk) {
                const formattedData = reqSnap
                  .filter((rec) => rec.key === request.key)
                  .sort((a, b) => a.chunkIndex - b.chunkIndex)
                  .map((rec) => rec.data)
                  .join('')

                data[i].requests[request.key] = formattedData
              } else {
                data[i].requests[request.key] = request.data
              }
            } catch (e) {
              console.error(e)
            }
          })
        })

        console.log('firebase data', data)
        setRecordings(data)
      })
      .catch((error) => {
        console.error(error)
        document.getElementById('firebase-interactions').style.display = 'none'
      })
  } catch {
    document.getElementById('firebase-interactions').style.display = 'none'
  }
}

function toggleLoading(show = false) {
  document.getElementById('error').style.display = 'none'
  document.getElementById('success').style.display = 'none'
  document.getElementById('loading').style.display = show ? 'inline' : 'none'
}

function showSuccess() {
  toggleLoading(false)

  const success = document.getElementById('success')
  success.style.display = 'inline'
  setTimeout(() => {
    document.getElementById('name').value = ''
    success.style.display = 'none'
  }, 3000)
}

function showError() {
  toggleLoading(false)

  const error = document.getElementById('error')
  error.style.display = 'inline'
  setTimeout(() => {
    error.style.display = 'none'
  }, 3000)
}

function closePopupWindows() {
  chrome.storage.local.get({ popupWindows: [] }, function (result) {
    const w = (result && result.popupWindows) || []
    w.forEach(({ id }) => {
      try {
        chrome.windows.remove(id)
      } catch {}
    })
  })
}

// ----------
// Chrome Storage
// ----------
let openInNewPopup = false
chrome.storage.local.get('openInNewPopup', function (val) {
  openInNewPopup = !!val || false
  document.getElementById('popup').checked = openInNewPopup
})

chrome.storage.onChanged.addListener(setSizes)
chrome.storage.local.get('recordedRequests', setSizes)
chrome.storage.local.get('mode', (items) => {
  const mode = items.mode

  if (mode === 'record') {
    document.getElementById('record').classList.add('active')
    document.getElementById('sanitize').style.display = 'none'
  } else if (mode === 'playback') {
    document.getElementById('playback').classList.add('active')
    document.getElementById('sanitize').style.display = 'inline'
  }
})

// ----------
// Firebase
// ----------
let app = false
let db = false

// ----------
// DCL - Needed for Firebase
// ----------
document.addEventListener('DOMContentLoaded', function () {
  try {
    const firebaseConfig = {
      apiKey: 'AIzaSyDxtA6hzw-mrGVfSJUNBf1WgoSLjT8rFwc',
      authDomain: 'chrome-extension-6451e.firebaseapp.com',
      projectId: 'chrome-extension-6451e',
      storageBucket: 'chrome-extension-6451e.appspot.com',
      messagingSenderId: '928974935892',
      appId: '1:928974935892:web:6bbd46c6812aacf9831ac1',
      measurementId: 'G-0FMB1NC9D1',
    }
    app = firebase.initializeApp(firebaseConfig)
    db = app.firestore()
    getRecordings(db)
  } catch {
    document.getElementById('firebase-interactions').style.display = 'none'
  }

  // ----------
  // Event Listeners
  // ----------
  document.getElementById('record').addEventListener('click', function () {
    chrome.storage.local.set({ mode: 'record' })
    document.getElementById('record').classList.add('active')
    document.getElementById('playback').classList.remove('active')
    document.getElementById('sanitize').style.display = 'none'
    setSizes()
  })

  document.getElementById('playback').addEventListener('click', function () {
    chrome.storage.local.set({ mode: 'playback' })
    document.getElementById('playback').classList.add('active')
    document.getElementById('record').classList.remove('active')
    document.getElementById('sanitize').style.display = 'inline'
    setSizes()
  })

  document.getElementById('sanitize').addEventListener('click', function () {
    chrome.storage.local.get('recordedRequests', function (items) {
      const sanitizedRequests = sanitizeRequests(items.recordedRequests)
      chrome.storage.local.set({ recordedRequests: sanitizedRequests })

      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.reload(tabs[0].id)
        chrome.runtime.reload()
      })
    })
  })

  document.getElementById('reset').addEventListener('click', function () {
    closePopupWindows()
    chrome.storage.local.clear()
    document.getElementById('playback').classList.remove('active')
    document.getElementById('record').classList.remove('active')
    document.getElementById('sanitize').style.display = 'none'
    document.getElementById('save').value = ''
    setSizes()
  })

  document.getElementById('save').addEventListener('click', function (e) {
    e.target.disabled = true
    setProgress(0)
    toggleLoading(true)

    let name = document.getElementById('name').value

    chrome.storage.local.get('recordedRequests', function (items) {
      const sanitizedRequests = sanitizeRequests(items.recordedRequests)
      chrome.storage.local.set({ recordedRequests: sanitizedRequests })
      chrome.tabs.getSelected(null, async function (tab) {
        if (db && items.recordedRequests) {
          // create a new document in the recordings collection
          await db
            .collection(tableRef)
            .add({
              date: new Date(),
              title: tab.title,
              url: tab.url,
              name: name,
            })
            .then(async function (docRef) {
              console.log('Document written with ID: ', docRef.id)
              console.log('adding requests...')
              const requestsCollection = await db
                .collection(tableRef)
                .doc(docRef.id)
                .collection('requests')
              const requests = Object.keys(sanitizedRequests)
              const fraction = 100 / requests.length
              let progress = 0

              // add each request to the requests subcollection
              // and wait for all to finish
              // ---
              // This circumvents the 1mb document limit on the parent
              // now each of these has a 1mb limit
              await Promise.allSettled(
                requests.map(async (request, i) => {
                  // determine whether the data is too large
                  // if so, split it into chunks
                  // then each chunk has 1mb limit
                  const size = JSON.stringify(sanitizedRequests[request]).length
                  const limit = 1000000
                  const chunks = chunkString(JSON.stringify(sanitizedRequests[request]), limit)
                  const batch = db.batch()

                  if (size >= limit && chunks.length > 1) {
                    await chunks.map(async (chunk, j) => {
                      var newDocRef = requestsCollection.doc()

                      await batch.set(
                        newDocRef,
                        { chunk: true, chunkIndex: j, key: request, data: chunk },
                        { merge: true },
                      )

                      console.log('added chunk to batch', request, j)
                    })

                    try {
                      await batch.commit()
                      console.log('batch committed', request)
                    } catch {
                      console.error('Error committing batch', request)
                    }
                  } else {
                    await requestsCollection
                      .doc()
                      .set({ key: request, data: sanitizedRequests[request] }, { merge: true })
                      .then(() => {
                        console.log('added request', request)
                      })
                      .catch(function (error) {
                        console.error('Error adding request', request, error)
                      })
                  }

                  // update progress bar
                  progress += fraction
                  setProgress(parseInt(progress))

                  // add a little delay to prevent throttling
                  await new Promise((resolve) => setTimeout(resolve, i * 100))
                }),
              )

              showSuccess()
              getRecordings(db)
              e.target.disabled = false
              console.log('done adding requests')
            })
            .catch(function (error) {
              showError()
              console.error('Error adding document: ', error)
              e.target.disabled = false
            })
        } else {
          e.target.disabled = false
        }
      })
    })
  })

  document.getElementById('recordings').addEventListener('change', function (e) {
    document.getElementById('load').disabled = false
  })

  document.getElementById('load').addEventListener('click', function (e) {
    e.target.disabled = true
    const recording = document.getElementById('recordings').value
    const data = JSON.parse(recording)

    if (data && data.requests) {
      chrome.storage.local.set({ recordedRequests: data.requests })
      document.getElementById('playback').click()
    }

    if (openInNewPopup) {
      chrome.windows.create(
        {
          url: data.url,
          type: 'popup',
        },
        (window) => {
          chrome.storage.local.get({ popupWindows: [] }, function (result) {
            const w = (result && result.popupWindows) || []
            chrome.storage.local.set({ popupWindows: [...w, window] })
          })
        },
      )
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.update(tabs[0].id, { url: data.url }, function () {
          chrome.runtime.reload()
          window.close()
        })
      })
    }
  })

  document.getElementById('popup').addEventListener('change', function (e) {
    console.log(e, e.target.checked)
    chrome.storage.local.set({ openInNewPopup: e.target.checked })
    openInNewPopup = e.target.checked
  })
})

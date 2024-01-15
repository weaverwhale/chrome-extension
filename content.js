// ----------
// Constants
// ----------
let shopName = ''
let fallbackShopName = ''

// ----------
// Helpers
// ----------
function contains(selector, text) {
  var elements = document.querySelectorAll(selector)
  // lord forgive me
  return [].filter.call(elements, function (element) {
    return RegExp(text).test(
      Array.from(element.childNodes)
        .map(function (e) {
          return e.nodeType === 3 && e.textContent.trim().includes(text) ? e.textContent.trim() : ''
        })
        .join(''),
    )
  })
}

function wrapRedacted() {
  const shopImage = document.querySelector('img[alt="shop logo"]')

  // try to find shop name
  try {
    if (shopImage && shopName === '') {
      shopName = shopImage.src.split('shop-icon/')[1].split('.myshopify')[0]
    }
  } catch {}

  // more sleazy way, but more reliable actually
  try {
    const shopImage = document.querySelector('img[alt="shop logo"]')
    if (shopImage && fallbackShopName === '') {
      fallbackShopName =
        // YIKES!!
        shopImage.parentElement.parentElement.parentElement.parentElement.querySelector(
          '.text-white',
        ).innerHTML
    }
  } catch {}

  try {
    // post purchase text
    const ppt = contains('i', 'What are you using')
    if (ppt.length > 0)
      ppt.forEach((el) => {
        if (!el.innerHTML.includes('[REDACTED]'))
          el.innerHTML = 'What are you using <span>[REDACTED]</span> products for primarily?'
      })
  } catch {}

  // backend and "default" redaction
  ;['[REDACTED]', '[REDACTED] [REDACTED]', shopName, fallbackShopName].forEach(function (text) {
    const redactedText = contains(
      'h1, h2, h3, h4, h5, h6, p, div, span, button, a, text',
      text,
      text.replace(/-/g, ''),
    )
    redactedText.forEach(function (element) {
      if (
        (element.getAttribute('data-id') || '').includes('redacted') ||
        text === '' ||
        !element.innerText.includes(text)
      )
        return

      element.setAttribute('data-id', 'redacted')
    })
  })
}

// ----------
// Listeners
// ----------
document.addEventListener('DOMContentLoaded', function () {
  var styleSheet = document.createElement('style')
  // css blurring
  // and "last resort" css redaction
  styleSheet.innerText = `
    [data-id="redacted"],
    #tw-playback .orders-table #tr-pixel-order-widget-customer-name,
    #tw-playback img[alt="shop logo"] .text-white,
    #tw-playback .creative-thumbnail,
    #tw-playback .CreativeCard img,
    #tw-playback .timeline-item-content img,
    #tw-playback .timeline-item-content .Polaris-Caption:first-of-type,
    #tw-playback .Polaris-ResourceItem__Content h3,
    #tw-playback .pixel-campaign-list:last-of-type .Polaris-TextStyle--variationStrong,
    #tw-playback .attribution-collapsible img,
    #tw-playback .timeline-item-link a,
    #tw-playback .attribution-orders-table td .Polaris-Link,
    #tw-playback .mantine-AppShell-section:first-of-type .mantine-Text-root
    {
      filter: blur(5px);
    }

    #tw-playback .tw-image,
    #tw-playback .mantine-Group-root
    {
      overflow: hidden;
    }

    #tw-playback .tw-image:after
    {
      content: '';
      width: 100%;
      height: 100%;
      position: absolute;
      overflow: hidden;
      top: 0;
      left: 0;
      background-image: url(https://app.triplewhale.com/triplewhale_sticker-1.png) !important;
      background-position: center;
      background-size: 150%;
      background-repeat: no-repeat;
    }
  `
  document.head.appendChild(styleSheet)
})

const config = { attributes: false, childList: true, subtree: true }
const observerCallback = (mutationList, observer) => {
  for (const mutation of mutationList) {
    if (mutation.type === 'childList') {
      wrapRedacted()
      break
    } else if (mutation.type === 'attributes') {
      // wrapRedacted()
    }
  }
}

let observer = false
let interval = 0
function resetObserver() {
  if (observer) observer.disconnect()
  observer = new MutationObserver(observerCallback)
  observer.observe(document.body, config)

  // garbage collection
  clearInterval(interval)
  interval = setInterval(() => {
    wrapRedacted()
    resetObserver()
  }, 1000 * 5)
}

function makeObserver(items) {
  if (observer) observer.disconnect()

  if (items.mode === 'playback') {
    resetObserver()
  }
}

// repentance required
document.addEventListener('DOMContentLoaded', function () {
  chrome.storage.local.get('mode', function (items) {
    if (items.mode === 'playback') {
      document.body.setAttribute('id', 'tw-playback')
      makeObserver(items)
    } else if (observer) {
      observer.disconnect()
    }
  })
})

chrome.storage.onChanged.addListener(function (changes) {
  for (let key in changes) {
    if (key === 'mode' && changes[key] === 'playback') {
      makeObserver(changes)
    } else if (observer) {
      observer.disconnect()
    }
  }
})

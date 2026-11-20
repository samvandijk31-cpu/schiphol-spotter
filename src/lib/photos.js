// Photos live in IndexedDB as base64 data URLs, indexed by normalised registration.
const STORE = 'photos'
let dbPromise

function db() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('schiphol-spotter', 1)
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true }).createIndex('reg', 'reg')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

// Resolves when the transaction commits, so a quota error (abort) is never reported as success.
async function run(mode, fn) {
  const tx = (await db()).transaction(STORE, mode)
  const req = fn(tx.objectStore(STORE))
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req?.result)
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}

export const getPhotos = (reg) => run('readonly', (s) => s.index('reg').getAll(reg))
export const addPhoto = (photo) => run('readwrite', (s) => s.add(photo))
export const deletePhoto = (id) => run('readwrite', (s) => s.delete(id))

export async function photoRegs() {
  const regs = new Set()
  await run('readonly', (s) => {
    s.index('reg').openKeyCursor(null, 'nextunique').onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor) {
        regs.add(cursor.key)
        cursor.continue()
      }
    }
  })
  return regs
}

// Phone photos are 5-15 MB; downscale to keep IndexedDB well within quota.
export async function toDataUrl(file, max = 1600) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' }) // respect EXIF rotation of phone photos
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

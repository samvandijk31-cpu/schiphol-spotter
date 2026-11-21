// Photos live in IndexedDB as base64 data URLs, indexed by regKey() so "CNMAY" typed in search
// matches "CN-MAY" from ADS-B later on.
import { regKey } from './adsb.js'

const STORE = 'photos'
let dbPromise

function db() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('schiphol-spotter', 2)
    req.onupgradeneeded = (e) => {
      const store = e.oldVersion < 1
        ? req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        : req.transaction.objectStore(STORE)
      if (e.oldVersion < 1) store.createIndex('reg', 'reg')
      store.createIndex('key', 'key')
      // v1 stored only the ADS-B spelling; give existing photos their key so nothing disappears.
      store.openCursor().onsuccess = (ev) => {
        const cursor = ev.target.result
        if (!cursor) return
        cursor.update({ ...cursor.value, key: regKey(cursor.value.reg) })
        cursor.continue()
      }
    }
    // An open tab with the old version blocks the upgrade; say so instead of hanging silently.
    req.onblocked = () => reject(new Error('sluit andere tabbladen van Schiphol Spotter en herlaad'))
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close() // let a future upgrade in another tab proceed
      resolve(req.result)
    }
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

export const getPhotos = (reg) => run('readonly', (s) => s.index('key').getAll(regKey(reg)))
export const addPhoto = (photo) => run('readwrite', (s) => s.add({ ...photo, key: regKey(photo.reg) }))
export const deletePhoto = (id) => run('readwrite', (s) => s.delete(id))

// Map of regKey -> registration as first stored (for display/suggestions).
export async function photoRegs() {
  const regs = new Map()
  await run('readonly', (s) => {
    s.index('key').openCursor(null, 'nextunique').onsuccess = (e) => {
      const cursor = e.target.result
      if (cursor) {
        regs.set(cursor.key, cursor.value.reg)
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

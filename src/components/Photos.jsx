import { useEffect, useState } from 'react'
import { addPhoto, deletePhoto, getPhotos, toDataUrl } from '../lib/photos.js'

// Rendered with key={reg}, so state never leaks between registrations.
export default function Photos({ reg, onChange }) {
  const [photos, setPhotos] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    getPhotos(reg).then(setPhotos, (e) => setError(`Foto's laden mislukt: ${e.message}`))
  }, [reg])

  async function upload(files) {
    setBusy(true)
    setError(null)
    try {
      navigator.storage?.persist?.() // ask the browser not to evict our photos under storage pressure
      for (const file of files) await addPhoto({ reg, dataUrl: await toDataUrl(file), name: file.name, added: Date.now() })
    } catch (e) {
      setError(e?.name === 'QuotaExceededError' ? 'Opslag is vol: verwijder oude foto\'s.' : `Upload mislukt: ${e?.message ?? e}`)
    }
    setPhotos(await getPhotos(reg))
    setBusy(false)
    onChange()
  }

  async function remove(photo) {
    if (!confirm(`Foto van ${reg} verwijderen?`)) return
    await deletePhoto(photo.id)
    setOpen(null)
    setPhotos(await getPhotos(reg))
    onChange()
  }

  return (
    <div className="space-y-3">
      <label className={`flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-600 px-4 py-3 text-sm hover:border-amber-400 focus-within:border-amber-400 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        {busy ? 'Bezig met opslaan…' : `+ Foto's toevoegen voor ${reg}`}
        <input type="file" accept="image/*" multiple className="sr-only" disabled={busy}
          onChange={(e) => { upload([...e.target.files]); e.target.value = '' }} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}

      {photos.length === 0 ? (
        <p className="text-sm text-zinc-500">Nog geen eigen foto's van dit toestel.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setOpen(p)} className="block w-full overflow-hidden rounded-md">
                <img src={p.dataUrl} alt={`${reg}, ${new Date(p.added).toLocaleDateString('nl-NL')}`} className="aspect-[4/3] w-full object-cover" />
              </button>
              <p className="mt-0.5 text-xs text-zinc-500">{new Date(p.added).toLocaleDateString('nl-NL')}</p>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div role="dialog" aria-label={`Foto van ${reg}`} className="fixed inset-0 z-[2000] flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
          onClick={() => setOpen(null)} onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}>
          <img src={open.dataUrl} alt={reg} className="max-h-[80dvh] max-w-full rounded" />
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="rounded bg-zinc-800 px-3 py-1.5 text-sm" onClick={() => setOpen(null)} autoFocus>Sluiten</button>
            <button type="button" className="rounded bg-rose-600 px-3 py-1.5 text-sm" onClick={() => remove(open)}>Verwijderen</button>
          </div>
        </div>
      )}
    </div>
  )
}

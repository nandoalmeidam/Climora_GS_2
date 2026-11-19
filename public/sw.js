const cacheName = 'climora-shell-v12'

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    const response = await fetch('/', { cache: 'reload' })
    if (!response.ok) throw new Error('Shell indisponível.')
    const html = await response.clone().text()
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1])
    await cache.addAll(['/manifest.webmanifest', '/climora.svg', '/icon-192.png', '/icon-512.png', ...assets])
    await cache.put('/', response)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(key => key.startsWith('climora-shell-') && key !== cacheName).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')))
  } else if (url.pathname.startsWith('/assets/') || ['/climora.svg', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'].includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname, { ignoreVary: true }).then(cached => cached || fetch(event.request)))
  }
})












import { preview } from 'vite'

export default async function startPreview() {
  const { httpServer } = await preview({
    preview: { host: '127.0.0.1', port: 4192, strictPort: true },
  })

  return async () => {
    httpServer.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      httpServer.close(error => error ? reject(error) : resolve())
    })
  }
}

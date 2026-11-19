import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { initialCoordinates, knownDistrictPoint, type Coordinates } from './climate'
import type { Incident } from './firebase'

export function IncidentMap({ point, incidents }: {
  point: Coordinates | null; incidents: Incident[]
}) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  useEffect(() => {
    const instance = L.map(element.current!, { scrollWheelZoom: false }).setView([-14.2, -51.9], 4)
    map.current = instance
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(instance)
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(element.current!)
    return () => { observer.disconnect(); instance.remove(); map.current = null }
  }, [])
  useEffect(() => {
    if (point) map.current?.setView([point.latitude, point.longitude], 12)
    else map.current?.setView([-14.2, -51.9], 4)
  }, [point])
  useEffect(() => {
    if (!map.current) return
    const layer = L.layerGroup().addTo(map.current)
    for (const incident of incidents) {
      const popup = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = incident.kind
      const description = document.createElement('p')
      description.textContent = incident.description
      popup.append(title, description)
      const location = incident.latitude === initialCoordinates.latitude && incident.longitude === initialCoordinates.longitude
        ? knownDistrictPoint(incident) ?? incident
        : incident
      L.circleMarker([location.latitude, location.longitude], {
        radius: 9, color: '#fff', weight: 3, fillColor: '#c45022', fillOpacity: 1,
      }).bindPopup(popup).addTo(layer)
    }
    return () => { layer.remove() }
  }, [incidents])
  return <div ref={element} className="map" aria-label="Mapa de ocorrências" />
}


import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useExhibitions, isClosingSoon } from '../hooks/useExhibitions'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet default icon path issue with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const BLUE_ICON = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
})

const RED_ICON = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
})

export default function MapView() {
  const { data } = useExhibitions()
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      center: [40.7300, -73.9800],
      zoom: 12,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    mapInstanceRef.current = map
    return () => { map.remove(); mapInstanceRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !data) return

    data.museums.forEach(museum => {
      const hasSoon = museum.exhibitions.some(e => isClosingSoon(e.endDate))
      const icon = hasSoon ? RED_ICON : BLUE_ICON

      const activeExhibitions = museum.exhibitions.filter(e => !e.ongoing || e.endDate)
      const count = museum.exhibitions.length

      const popupHtml = `
        <div class="popup-name">${museum.name}</div>
        <div class="popup-hours">${museum.hours || ''}</div>
        <div class="popup-count">${count} exhibition${count !== 1 ? 's' : ''}</div>
        ${hasSoon ? '<div style="color:#e85050;font-size:12px;font-weight:600;margin-bottom:6px;">🔴 Closing soon!</div>' : ''}
        <a class="popup-link" href="#/list" data-museum="${museum.name}">View exhibitions →</a>
      `

      L.marker([museum.lat, museum.lng], { icon })
        .addTo(map)
        .bindPopup(popupHtml)
    })
  }, [data])

  return (
    <div>
      <div ref={mapRef} className="map-container" />
    </div>
  )
}

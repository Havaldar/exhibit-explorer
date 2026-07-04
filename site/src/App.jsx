import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import MapView from './views/MapView'
import CalendarView from './views/CalendarView'
import ListView from './views/ListView'

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<MapView />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/list" element={<ListView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Nav />
    </div>
  )
}

import { NavLink } from 'react-router-dom'

export default function Nav() {
  return (
    <nav className="nav">
      <NavLink to="/" end>
        <span className="nav-icon">🗺️</span>
        Map
      </NavLink>
      <NavLink to="/calendar">
        <span className="nav-icon">📅</span>
        Calendar
      </NavLink>
      <NavLink to="/list">
        <span className="nav-icon">📋</span>
        List
      </NavLink>
    </nav>
  )
}

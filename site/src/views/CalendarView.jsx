import { useState, useMemo } from 'react'
import { useExhibitions, isClosingSoon, formatEndDate } from '../hooks/useExhibitions'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

function buildGrid(year, month) {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const cells = []
  for (let i = 0; i < first.getDay(); i++) {
    const d = new Date(year, month, 1 - (first.getDay() - i))
    cells.push({ date: d, current: false })
  }
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push({ date: new Date(year, month, d), current: true })
  }
  const remaining = 42 - cells.length
  for (let i = 1; i <= remaining; i++) {
    cells.push({ date: new Date(year, month + 1, i), current: false })
  }
  return cells
}

export default function CalendarView() {
  const { data } = useExhibitions()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState(null)

  const grid = useMemo(() => buildGrid(year, month), [year, month])

  const exhibitionsByDate = useMemo(() => {
    if (!data) return {}
    const map = {}
    data.museums.forEach(museum => {
      museum.exhibitions.forEach(ex => {
        if (!ex.endDate || ex.ongoing) return
        map[ex.endDate] = map[ex.endDate] || []
        map[ex.endDate].push({ ...ex, museumName: museum.name })
      })
    })
    return map
  }, [data])

  function toKey(date) {
    return date.toISOString().slice(0, 10)
  }

  function isToday(date) {
    return toKey(date) === toKey(today)
  }

  function prev() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelected(null)
  }

  function next() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelected(null)
  }

  const selectedExhibitions = selected ? (exhibitionsByDate[selected] || []) : []

  return (
    <div className="page">
      <div className="page-header">
        <h1>Calendar</h1>
        <div className="subtitle">Tap a day to see what's closing</div>
      </div>

      <div className="cal-header">
        <button className="cal-nav-btn" onClick={prev}>‹</button>
        <h2>{MONTHS[month]} {year}</h2>
        <button className="cal-nav-btn" onClick={next}>›</button>
      </div>

      <div className="cal-grid">
        {DAYS.map(d => <div key={d} className="cal-day-name">{d}</div>)}
        {grid.map((cell, i) => {
          const key = toKey(cell.date)
          const exs = exhibitionsByDate[key] || []
          return (
            <div
              key={i}
              className={`cal-day${!cell.current ? ' other-month' : ''}${isToday(cell.date) ? ' today' : ''}`}
              onClick={() => setSelected(cell.current ? key : null)}
            >
              <div className="cal-day-num">{cell.date.getDate()}</div>
              {exs.slice(0, 3).map((ex, j) => (
                <div key={j} className={`cal-chip ${isClosingSoon(ex.endDate) ? 'soon' : 'normal'}`}>
                  {ex.title}
                </div>
              ))}
              {exs.length > 3 && (
                <div className="cal-chip normal">+{exs.length - 3} more</div>
              )}
            </div>
          )
        })}
      </div>

      {selected && (
        <>
          <div className="day-panel-overlay" onClick={() => setSelected(null)} />
          <div className="day-panel">
            <h3>
              {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric'
              })}
              {' '}— {selectedExhibitions.length} closing
            </h3>
            {selectedExhibitions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No exhibitions closing this day.</p>
            ) : selectedExhibitions.map((ex, i) => (
              <div key={i} className="panel-item">
                {ex.imageUrl && (
                  <img src={ex.imageUrl} alt={ex.title}
                    onError={e => { e.target.style.display = 'none' }} />
                )}
                <div className="panel-item-info">
                  <div className="panel-item-title">{ex.title}</div>
                  <div className="panel-item-museum">{ex.museumName}</div>
                  {isClosingSoon(ex.endDate) && (
                    <span className="badge badge-soon" style={{ marginTop: 4 }}>Closing soon</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

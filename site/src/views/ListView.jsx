import { useState, useMemo } from 'react'
import { useExhibitions, isClosingSoon } from '../hooks/useExhibitions'
import ExhibitionCard from '../components/ExhibitionCard'

const BOROUGH_MAP = {
  'MoMA': 'Manhattan',
  'Whitney Museum': 'Manhattan',
  'The Met': 'Manhattan',
  'Guggenheim': 'Manhattan',
  'Frick Collection': 'Manhattan',
  'New Museum': 'Manhattan',
  'Morgan Library': 'Manhattan',
  'Neue Galerie': 'Manhattan',
  'Jewish Museum': 'Manhattan',
  'Cooper Hewitt': 'Manhattan',
  'ICP': 'Manhattan',
  'Drawing Center': 'Manhattan',
  'Fotografiska': 'Manhattan',
  'Poster House': 'Manhattan',
  'Brooklyn Museum': 'Brooklyn',
  'Bronx Museum': 'Bronx',
  'Queens Museum': 'Queens',
  'MoMA PS1': 'Queens',
  'Noguchi Museum': 'Queens',
}

function getBorough(name) {
  return BOROUGH_MAP[name] || 'Manhattan'
}

export default function ListView() {
  const { data } = useExhibitions()
  const [sort, setSort] = useState('endDate')
  const [filterSoon, setFilterSoon] = useState(false)
  const [filterMonth, setFilterMonth] = useState(false)
  const [hideOngoing, setHideOngoing] = useState(false)
  const [borough, setBorough] = useState('All')

  const allExhibitions = useMemo(() => {
    if (!data) return []
    const items = []
    data.museums.forEach(museum => {
      museum.exhibitions.forEach(ex => {
        items.push({
          ...ex,
          museumName: museum.name,
          borough: getBorough(museum.name),
          stale: museum.scrapeStatus !== 'ok',
        })
      })
    })
    return items
  }, [data])

  const boroughs = useMemo(() => {
    const set = new Set(allExhibitions.map(e => e.borough))
    return ['All', ...Array.from(set).sort()]
  }, [allExhibitions])

  const now = new Date()
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const filtered = useMemo(() => {
    let items = allExhibitions

    if (hideOngoing) items = items.filter(e => !e.ongoing)
    if (filterSoon) items = items.filter(e => isClosingSoon(e.endDate))
    if (filterMonth) items = items.filter(e => {
      if (!e.endDate) return false
      const d = new Date(e.endDate)
      return d >= now && d <= monthEnd
    })
    if (borough !== 'All') items = items.filter(e => e.borough === borough)

    return [...items].sort((a, b) => {
      if (sort === 'endDate') {
        if (!a.endDate && !b.endDate) return 0
        if (!a.endDate) return 1
        if (!b.endDate) return -1
        return new Date(a.endDate) - new Date(b.endDate)
      }
      if (sort === 'museum') return a.museumName.localeCompare(b.museumName)
      return 0
    })
  }, [allExhibitions, sort, filterSoon, filterMonth, hideOngoing, borough])

  const staleMuseums = data?.museums.filter(m => m.scrapeStatus !== 'ok').map(m => m.name)

  return (
    <div className="page">
      <div className="page-header">
        <h1>Exhibitions</h1>
        <div className="subtitle">
          {data
            ? `Updated ${new Date(data.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : 'Loading...'}
        </div>
      </div>

      {staleMuseums?.length > 0 && (
        <div className="stale-banner">
          Stale data for: {staleMuseums.join(', ')}
        </div>
      )}

      <div className="filter-bar">
        <button
          className={`filter-chip ${sort === 'endDate' ? 'active' : ''}`}
          onClick={() => setSort('endDate')}
        >Closing soonest</button>
        <button
          className={`filter-chip ${sort === 'museum' ? 'active' : ''}`}
          onClick={() => setSort('museum')}
        >By museum</button>
        <button
          className={`filter-chip ${filterSoon ? 'active' : ''}`}
          onClick={() => setFilterSoon(f => !f)}
        >Closing soon</button>
        <button
          className={`filter-chip ${filterMonth ? 'active' : ''}`}
          onClick={() => setFilterMonth(f => !f)}
        >This month</button>
        <button
          className={`filter-chip ${hideOngoing ? 'active' : ''}`}
          onClick={() => setHideOngoing(f => !f)}
        >Hide ongoing</button>
        {boroughs.slice(1).map(b => (
          <button
            key={b}
            className={`filter-chip ${borough === b ? 'active' : ''}`}
            onClick={() => setBorough(prev => prev === b ? 'All' : b)}
          >{b}</button>
        ))}
      </div>

      <div className="list-count">{filtered.length} exhibition{filtered.length !== 1 ? 's' : ''}</div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">🔍</div>
          <p>No exhibitions match these filters.</p>
        </div>
      ) : (
        <div className="list-grid">
          {filtered.map((ex, i) => (
            <ExhibitionCard
              key={i}
              exhibition={ex}
              museumName={ex.museumName}
              stale={ex.stale}
            />
          ))}
        </div>
      )}
    </div>
  )
}

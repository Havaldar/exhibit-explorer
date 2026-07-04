import { isClosingSoon, formatEndDate, daysUntil } from '../hooks/useExhibitions'

export default function ExhibitionCard({ exhibition, museumName, stale }) {
  const soon = isClosingSoon(exhibition.endDate)
  const days = daysUntil(exhibition.endDate)

  return (
    <div className="card">
      {exhibition.imageUrl && (
        <img
          className="card-img"
          src={exhibition.imageUrl}
          alt={exhibition.title}
          loading="lazy"
          onError={e => { e.target.style.display = 'none' }}
        />
      )}
      <div className="card-body">
        <div className="card-museum">{museumName}</div>
        <div className="card-title">{exhibition.title}</div>
        {exhibition.description && (
          <div className="card-desc">{exhibition.description}</div>
        )}
        <div className="card-footer">
          {exhibition.ongoing ? (
            <span className="badge badge-ongoing">Ongoing</span>
          ) : exhibition.endDate ? (
            <>
              <span className="badge badge-date">
                Closes {formatEndDate(exhibition.endDate)}
              </span>
              {soon && (
                <span className="badge badge-soon">
                  {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow!' : `${days}d left`}
                </span>
              )}
            </>
          ) : null}
          {stale && <span className="badge badge-stale">Data may be stale</span>}
        </div>
      </div>
    </div>
  )
}

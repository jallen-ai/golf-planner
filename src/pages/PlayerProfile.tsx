import { useNav } from '../store/nav'
import { usePlayer } from '../store/player'
import { CLUB_LABELS, CLUB_ORDER, type ClubId, type MissBias } from '../types'

const MISS_OPTIONS: MissBias[] = ['straight', 'fade', 'draw', 'push', 'pull', 'slice', 'hook']

export default function PlayerProfilePage() {
  const go = useNav((s) => s.go)
  const profile = usePlayer((s) => s.profile)
  const setHandicap = usePlayer((s) => s.setHandicap)
  const setDominantMiss = usePlayer((s) => s.setDominantMiss)
  const updateClub = usePlayer((s) => s.updateClub)

  if (!profile) return <div className="muted">Loading…</div>

  return (
    <>
      <header className="topbar">
        <button className="nav-back" onClick={() => go({ kind: 'home' })}>← Back</button>
        <h1>My Bag</h1>
        <span></span>
      </header>

      <div className="card">
        <div className="title">Player</div>
        <div className="field-group">
          <div>
            <label htmlFor="hcp">Handicap</label>
            <input
              id="hcp"
              type="number"
              min={0}
              max={36}
              value={profile.handicap}
              onChange={(e) => setHandicap(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="miss">Dominant miss</label>
            <select
              id="miss"
              value={profile.dominantMiss}
              onChange={(e) => setDominantMiss(e.target.value as MissBias)}
            >
              {MISS_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          Strokes-gained baseline interpolates between Broadie's 0/10/20 amateur tables based on your handicap.
        </p>
      </div>

      <div className="card">
        <div className="title">Bag</div>
        <p className="subtitle">Carry distance, rollout, and dispersion (1σ in yards) for each club.</p>
        <div className="club-row header">
          <div>Club</div>
          <div>In bag</div>
          <div>Carry</div>
          <div>Roll</div>
          <div>±L/R</div>
          <div>±S/L</div>
          <div></div>
        </div>
        {CLUB_ORDER.map((id: ClubId) => {
          const c = profile.bag[id]
          return (
            <div key={id} className="club-row">
              <div>{CLUB_LABELS[id]}</div>
              <div>
                <input
                  type="checkbox"
                  checked={c.inBag}
                  onChange={(e) => updateClub(id, { inBag: e.target.checked })}
                  style={{ width: 'auto' }}
                />
              </div>
              <div>
                <input
                  type="number"
                  min={0}
                  max={350}
                  value={c.carry}
                  onChange={(e) => updateClub(id, { carry: Number(e.target.value) })}
                />
              </div>
              <div>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={c.rollout}
                  onChange={(e) => updateClub(id, { rollout: Number(e.target.value) })}
                />
              </div>
              <div>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={Math.round(((c.sigmaLeft + c.sigmaRight) / 2) * 10) / 10}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    updateClub(id, { sigmaLeft: v, sigmaRight: v })
                  }}
                />
              </div>
              <div>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={Math.round(((c.sigmaShort + c.sigmaLong) / 2) * 10) / 10}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    updateClub(id, { sigmaShort: v, sigmaLong: v })
                  }}
                />
              </div>
              <div></div>
            </div>
          )
        })}
      </div>
    </>
  )
}

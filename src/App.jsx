import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { ACHIEVEMENTS, PRIZES } from './achievements.js'
import { createRoom, joinRoom, saveMove, watchRoom } from './gameService.js'
import { firebaseReady } from './firebase.js'

const pieces = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
}

const puzzle = {
  fen: '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1',
  title: 'Mat in één zet',
  hint: 'De dame kan veilig naast de zwarte koning komen.',
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem('shreya-progress')) || { moves: 0, unlocked: [], prizes: [] }
  } catch {
    return { moves: 0, unlocked: [], prizes: [] }
  }
}

function App() {
  const [page, setPage] = useState('home')
  const [fen, setFen] = useState(new Chess().fen())
  const [selected, setSelected] = useState(null)
  const [message, setMessage] = useState('Kies een wit schaakstuk om te beginnen.')
  const [mode, setMode] = useState('local')
  const [progress, setProgress] = useState(loadProgress)
  const [room, setRoom] = useState(null)
  const [roomCode, setRoomCode] = useState('')
  const [onlineError, setOnlineError] = useState('')
  const [showHint, setShowHint] = useState(false)
  const [playerName, setPlayerName] = useState('Shreya')

  const game = useMemo(() => new Chess(fen), [fen])
  const coins = ACHIEVEMENTS
    .filter((item) => progress.unlocked.includes(item.id))
    .reduce((total, item) => total + item.coins, 0)
  const spent = PRIZES
    .filter((item) => progress.prizes.includes(item.id))
    .reduce((total, item) => total + item.cost, 0)
  const balance = coins - spent

  useEffect(() => {
    localStorage.setItem('shreya-progress', JSON.stringify(progress))
  }, [progress])

  useEffect(() => {
    if (!room?.code) return undefined
    return watchRoom(room.code, (data) => {
      if (data.fen && data.fen !== fen) setFen(data.fen)
      if (data.status === 'playing') setMessage(`De kamer is klaar. ${data.hostName} speelt wit.`)
    }, () => setOnlineError('De verbinding met de speelkamer is verbroken.'))
  }, [room?.code, fen])

  function unlock(id) {
    setProgress((old) => old.unlocked.includes(id)
      ? old
      : { ...old, unlocked: [...old.unlocked, id] })
  }

  function registerMove(nextGame) {
    setProgress((old) => {
      const moves = old.moves + 1
      const unlocked = [...old.unlocked]
      if (!unlocked.includes('first_move')) unlocked.push('first_move')
      if (moves >= 5 && !unlocked.includes('five_moves')) unlocked.push('five_moves')
      if (nextGame.isGameOver() && !unlocked.includes('first_game')) unlocked.push('first_game')
      return { ...old, moves, unlocked }
    })
  }

  async function chooseSquare(square) {
    if (game.isGameOver()) return
    if (mode === 'online' && room?.color && game.turn() !== room.color) {
      setMessage('Even wachten: de andere speler is aan de beurt.')
      return
    }

    const piece = game.get(square)
    if (!selected) {
      if (piece && piece.color === game.turn()) {
        setSelected(square)
        setMessage('Mooi! Kies nu waar dit stuk naartoe mag.')
      }
      return
    }

    const nextGame = new Chess(fen)
    try {
      nextGame.move({ from: selected, to: square, promotion: 'q' })
      setFen(nextGame.fen())
      setSelected(null)
      registerMove(nextGame)

      if (mode === 'puzzle' && nextGame.isCheckmate()) {
        unlock('puzzle_star')
        setMessage('Fantastisch, Shreya! Schaakmat en een nieuwe achievement! ⭐')
      } else if (nextGame.isCheckmate()) {
        setMessage('Schaakmat! Wat een knappe partij! 👑')
      } else if (nextGame.inCheck()) {
        setMessage('Schaak! De koning wordt aangevallen.')
      } else {
        setMessage(`${nextGame.turn() === 'w' ? 'Wit' : 'Zwart'} is nu aan de beurt.`)
      }

      if (mode === 'online' && room?.code) await saveMove(room.code, nextGame.fen())
    } catch {
      if (piece && piece.color === game.turn()) {
        setSelected(square)
        setMessage('Je hebt een ander stuk gekozen.')
      } else {
        setMessage('Dat stuk mag daar niet naartoe. Probeer een lichtend vakje.')
      }
    }
  }

  function startGame(nextMode = 'local') {
    const nextFen = nextMode === 'puzzle' ? puzzle.fen : new Chess().fen()
    setFen(nextFen)
    setMode(nextMode)
    setSelected(null)
    setShowHint(false)
    setMessage(nextMode === 'puzzle' ? 'Kun jij de zwarte koning in één zet schaakmat zetten?' : 'Wit mag beginnen. Veel plezier!')
    setPage('play')
  }

  async function makeOnlineRoom() {
    setOnlineError('')
    try {
      const created = await createRoom(new Chess().fen(), playerName.trim() || 'Speler 1')
      setRoom(created)
      setMode('online')
      setFen(new Chess().fen())
      setMessage('De kamer is gemaakt. Deel alleen de code met je familie.')
      unlock('online_friend')
      setPage('play')
    } catch (error) {
      setOnlineError(error.message)
    }
  }

  async function enterOnlineRoom() {
    setOnlineError('')
    try {
      const joined = await joinRoom(roomCode.trim().toUpperCase(), playerName.trim() || 'Speler 2')
      setRoom(joined)
      setMode('online')
      setFen(joined.fen)
      setMessage('Je bent binnen! Je speelt met zwart.')
      unlock('online_friend')
      setPage('play')
    } catch (error) {
      setOnlineError(error.message)
    }
  }

  function claimPrize(prize) {
    if (progress.prizes.includes(prize.id) || balance < prize.cost) return
    if (prize.id === 'story') {
      setMessage('Vraag een ouder om deze echte beloning samen af te spreken.')
      return
    }
    setProgress((old) => ({ ...old, prizes: [...old.prizes, prize.id] }))
  }

  const legalTargets = selected
    ? game.moves({ square: selected, verbose: true }).map((move) => move.to)
    : []

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage('home')} aria-label="Naar de startpagina">
          <span className="brand-mark">♕</span>
          <span><strong>Shreya's</strong><small>Schaakavontuur</small></span>
        </button>
        <nav aria-label="Hoofdnavigatie">
          <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}>Thuis</button>
          <button className={page === 'achievements' ? 'active' : ''} onClick={() => setPage('achievements')}>Prijzen</button>
          <span className="coin-pill">⭐ {balance}</span>
        </nav>
      </header>

      <main>
        {page === 'home' && (
          <section className="home-page">
            <div className="hero">
              <div className="hero-copy">
                <span className="eyebrow">JOUW MAGISCHE SCHAAKWERELD</span>
                <h1>Hoi Shreya! Klaar voor een nieuw avontuur?</h1>
                <p>Leer slimme zetten, verzamel sterren en speel veilig samen met je familie.</p>
                <div className="hero-actions">
                  <button className="primary" onClick={() => startGame('puzzle')}>⭐ Start een oefening</button>
                  <button className="secondary" onClick={() => startGame('local')}>♟ Speel op één scherm</button>
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <span className="spark one">✦</span><span className="spark two">★</span>
                <div className="castle">♜</div><div className="mascot">♘</div>
              </div>
            </div>

            <div className="section-heading">
              <div><span className="eyebrow">KIES JE MISSIE</span><h2>Wat wil je vandaag doen?</h2></div>
              <span className="level">Level 1 · Jonge pion</span>
            </div>
            <div className="mission-grid">
              <article className="mission purple"><span>🧩</span><h3>Puzzel van de dag</h3><p>Vind schaakmat in één zet.</p><button onClick={() => startGame('puzzle')}>Start puzzel →</button></article>
              <article className="mission yellow"><span>👨‍👧</span><h3>Samen spelen</h3><p>Speel om de beurt op hetzelfde apparaat.</p><button onClick={() => startGame('local')}>Start partij →</button></article>
              <article className="mission mint"><span>🌍</span><h3>Privékamer</h3><p>Speel online met een veilige familiecode.</p><button onClick={() => setPage('online')}>Maak kamer →</button></article>
            </div>

            <div className="progress-card">
              <div><span className="trophy">🏆</span><div><strong>{progress.unlocked.length} van {ACHIEVEMENTS.length} achievements</strong><p>Elke slimme zet brengt je dichter bij een prijs.</p></div></div>
              <button className="text-button" onClick={() => setPage('achievements')}>Bekijk prijzen</button>
            </div>
          </section>
        )}

        {page === 'play' && (
          <section className="play-page">
            <div className="play-heading">
              <button className="back" onClick={() => setPage('home')}>← Terug</button>
              <div><span className="eyebrow">{mode === 'puzzle' ? 'OEFENMISSIE' : mode === 'online' ? 'ONLINE FAMILIEPARTIJ' : 'SAMEN SPELEN'}</span><h1>{mode === 'puzzle' ? puzzle.title : 'Het magische schaakbord'}</h1></div>
            </div>
            {room?.code && <div className="room-banner">Privécode: <strong>{room.code}</strong> · Jij speelt {room.color === 'w' ? 'wit' : 'zwart'}</div>}
            <div className="game-layout">
              <ChessBoard game={game} selected={selected} legalTargets={legalTargets} onSquareClick={chooseSquare} flipped={mode === 'online' && room?.color === 'b'} />
              <aside className="coach-card">
                <div className="coach-avatar">🦉</div>
                <span className="eyebrow">COACH NOVA ZEGT</span>
                <h2>{message}</h2>
                {mode === 'puzzle' && <button className="hint-button" onClick={() => setShowHint(true)}>💡 Geef mij een hint</button>}
                {showHint && <p className="hint">{puzzle.hint}</p>}
                <div className="turn-box"><span>Beurt</span><strong>{game.turn() === 'w' ? '⚪ Wit' : '⚫ Zwart'}</strong></div>
                <button className="secondary wide" onClick={() => startGame(mode === 'puzzle' ? 'puzzle' : 'local')}>Opnieuw beginnen</button>
              </aside>
            </div>
          </section>
        )}

        {page === 'online' && (
          <section className="simple-page">
            <button className="back" onClick={() => setPage('home')}>← Terug</button>
            <span className="eyebrow">VEILIG SAMEN SPELEN</span>
            <h1>Familiekamer</h1>
            <p>Geen openbare spelers en geen chat. Deel de code alleen met iemand die je kent.</p>
            {!firebaseReady && <div className="notice">🔥 Firebase moet nog worden ingesteld. Volg hiervoor de stappen in README.md.</div>}
            <label>Jouw naam<input value={playerName} maxLength="20" onChange={(event) => setPlayerName(event.target.value)} /></label>
            <div className="online-grid">
              <article><span>🏰</span><h2>Nieuwe kamer</h2><p>Maak een geheime code voor jullie partij.</p><button className="primary" disabled={!firebaseReady} onClick={makeOnlineRoom}>Maak kamer</button></article>
              <article><span>🔑</span><h2>Meedoen</h2><p>Vul de familiecode in.</p><input className="code-input" value={roomCode} maxLength="6" placeholder="ABC123" onChange={(event) => setRoomCode(event.target.value.toUpperCase())} /><button className="secondary" disabled={!firebaseReady || roomCode.length !== 6} onClick={enterOnlineRoom}>Doe mee</button></article>
            </div>
            {onlineError && <p className="error">{onlineError}</p>}
          </section>
        )}

        {page === 'achievements' && (
          <section className="simple-page">
            <button className="back" onClick={() => setPage('home')}>← Terug</button>
            <span className="eyebrow">SHREYA'S SCHATKAMER</span>
            <h1>Achievements & prijzen</h1>
            <p>Verdien sterren door te oefenen en spelen. Echte beloningen worden altijd samen met een ouder afgesproken.</p>
            <h2>Mijn achievements</h2>
            <div className="achievement-grid">
              {ACHIEVEMENTS.map((item) => {
                const won = progress.unlocked.includes(item.id)
                return <article className={won ? 'achievement won' : 'achievement locked'} key={item.id}><span>{won ? item.icon : '🔒'}</span><div><h3>{item.title}</h3><p>{item.description}</p><strong>+{item.coins} sterren</strong></div></article>
              })}
            </div>
            <div className="prize-title"><h2>Prijzenwinkel</h2><span className="coin-pill">⭐ {balance} beschikbaar</span></div>
            <div className="prize-grid">
              {PRIZES.map((prize) => {
                const owned = progress.prizes.includes(prize.id)
                const realReward = prize.id === 'story'
                return <article key={prize.id}><span>{prize.icon}</span><h3>{prize.title}</h3><p>{prize.note}</p><button disabled={owned || balance < prize.cost} onClick={() => claimPrize(prize)}>{owned ? 'Gewonnen ✓' : realReward ? `Vraag ouder · ${prize.cost} ⭐` : `Win voor ${prize.cost} ⭐`}</button></article>
              })}
            </div>
          </section>
        )}
      </main>
      <footer>Gemaakt met ♥ voor Shreya · Veilig spelen, slim groeien</footer>
    </div>
  )
}

function ChessBoard({ game, selected, legalTargets, onSquareClick, flipped }) {
  const files = flipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]

  return (
    <div className="board-wrap">
      <div className="chessboard" role="grid" aria-label="Schaakbord">
        {ranks.flatMap((rank, rankIndex) => files.map((file, fileIndex) => {
          const square = `${file}${rank}`
          const piece = game.get(square)
          const dark = (file.charCodeAt(0) + rank) % 2 === 1
          return (
            <button
              role="gridcell"
              aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'wit' : 'zwart'} schaakstuk` : ''}`}
              className={`square ${dark ? 'dark' : 'light'} ${selected === square ? 'selected' : ''} ${legalTargets.includes(square) ? 'target' : ''}`}
              key={square}
              onClick={() => onSquareClick(square)}
            >
              {fileIndex === 0 && <small className="rank-label">{rank}</small>}
              {rankIndex === 7 && <small className="file-label">{file}</small>}
              {piece && <span className={`piece ${piece.color}`}>{pieces[`${piece.color}${piece.type}`]}</span>}
            </button>
          )
        }))}
      </div>
    </div>
  )
}

export default App

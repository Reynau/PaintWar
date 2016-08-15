const { Turn } = require('../src/Turn.js')
const C = require('../src/constants.js')

class Game {
  constructor ({ size = 20, interval = 200 } = {}) {
    const board = Array(size).fill().map(() => Array(size).fill(C.EMPTY_CELL))
    this.turn = new Turn(board, [], [])
    this.turns = [this.turn]
    this.players = {}
    this.sockets = []
    this.interval = interval
    this.tickAndSchedule = this.tickAndSchedule.bind(this)
    this.teams = [[], [], [], []]
  }

  startInterval () {
    this.lastTurn = Date.now()
    setTimeout(this.tickAndSchedule, this.interval)
  }

  tickAndSchedule () {
    let now = Date.now()

    while (now - this.lastTurn >= this.interval) {
      this.lastTurn += this.interval
      this.tick()
      now = Date.now()
    }

    setTimeout(this.tickAndSchedule,
      this.lastTurn + this.interval - now)
  }

  gameHasStarted () {
    return this.turns.length > 1
  }

  gameCanStart () {
    let playersConnected = 0
    this.turn.painters.forEach((painter) => painter && ++playersConnected)
    return playersConnected > 1
  }

  gameShouldRestart () {
    if (this.turns.length >= C.TURNS_TO_RESTART) return true
    // Add to restart when board is full
  }

  getNewPlayerId () {
    let playerId = 0
    while (this.sockets[playerId] != null) ++playerId
    return playerId
  }

  searchTeam (playerId) {
    let minTeam = 9
    let minPlayers = 9
    for (let playerTeam = 0; playerTeam < 4; ++playerTeam) {
      let nPlayers = 0
      this.teams[playerTeam].forEach((playerId) => playerId != null && ++nPlayers)
      if (nPlayers < minPlayers) {
        minPlayers = nPlayers
        minTeam = playerTeam
      }
    }
    if (minTeam >= 4) return null
    this.teams[minTeam].push(playerId)
    return minTeam
  }

  onPlayerJoin (socket) {
    let playerId = this.getNewPlayerId()
    let playerTeam = this.searchTeam(playerId)
    let playerName = 'Player ' + playerId

    this.sockets[playerId] = socket
    if (!this.gameHasStarted() && playerTeam != null) {
      this.players[socket.id] = playerId
      this.turn.addPlayer(playerId, playerTeam + 1, playerName)
      this.sendState()
    }
  }

  onPlayerLeave (socket) {
    // Socket = null, delete player from players, update turn.removePlayer

    // Trying to get the playerId => only if player is on the game
    let playerId = this.players[socket.id]

    if (playerId != null) {
      let team = this.turn.painters[playerId].team - 1
      let teamArray = this.teams[team]

      this.sockets[playerId] = null
      delete this.players[socket.id]
      this.turn.removePlayer(playerId)
      // Updating team array
      for (let i = 0; i < teamArray.length; ++i) {
        if (teamArray[i] === playerId) {
          delete teamArray[i]
          break
        }
      }
    } else {
      this.sockets.forEach((psocket) => {
        if (psocket != null && psocket.id === socket.id) {
          psocket = null
        }
      })
    }
  }

  onChangeDir (socket, dir, turnIndex) {
    const playerId = this.players[socket.id]
    if (playerId == null) return

    const emitterId = socket.id
    if (turnIndex == null) turnIndex = this.turns.length - 1

    const turn = this.turns[turnIndex]

    if (!turn) return
    turn.setPlayerInput(playerId, dir)

    let currTurn = turn
    for (let i = turnIndex + 1; i < this.turns.length; ++i) {
      let nextTurn = this.turns[i]
      const nextInputs = nextTurn.inputs
      nextTurn = currTurn.evolve()
      nextTurn.inputs = nextInputs
      this.turns[i] = nextTurn
      currTurn = nextTurn
    }
    this.turn = currTurn
  }

  tick () {
    if (this.gameCanStart() || this.gameHasStarted()) {
      if (this.gameShouldRestart()) this.restart()
      else {
        let nextTurn = this.turn.evolve()
        this.turns.push(nextTurn)
        this.turn = nextTurn
        let turns = this.turns.length
        //if (this.imServer() && turns % C.TURNS_TO_REFRESH === 0) this.sendState()
      }
    }
  }

  restart () {
    this.teams = [[], [], [], []]
    let firstTurn = new Turn()
    firstTurn.board = this.turn.board.map(row => row.map(cell => C.EMPTY_CELL))
    this.sockets.forEach((socket, playerId) => {
      let team = this.searchTeam(playerId)
      if (socket && team != null) {
        this.players[socket.id] = playerId
        let playerName = 'Player ' + playerId
        firstTurn.addPlayer(playerId, team + 1, playerName)
      }
    })
    this.turns = [firstTurn]
    this.turn = firstTurn
    this.sendState()
  }

  sendState () {
    const turnIndex = this.turns.length - 1

    const state = {
      turn: this.turn,
      players: this.players,
      teams: this.teams,
      interval: this.interval,
      timestamp: Date.now()
    }

    this.sockets.forEach((socket) => {
      if (socket) socket.emit('game:state', state, turnIndex)
    })
  }

  imServer () {
    return (typeof window === 'undefined')
  }
}
exports.Game = Game

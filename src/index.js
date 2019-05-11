#!/usr/bin/env node
var WebSocketServer = require('websocket').server;
var http = require('http');

var server = http.createServer(function (request, response) {
    console.log('Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});

server.listen(8080, function () {
    console.log('Server is listening on port 8080');
});

wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: true,
});

/**
 * Represents a Player for Game.
 * @class
 */
class Player {

    /**
     * @param {WebSocketConnection} connection - An active connection to the client
     * @constructor
     */
    constructor(connection) {
        this.connection = connection;
        this.role = null;
    }

    /**
     * Getter for connection.
     * @returns {WebSocketConnection}
     */
    getConnection() {
        return this.connection;
    }

    /**
     * Setter for game role.
     * @param {string} role - Should be either 'X' or 'O'. 
     */
    setRole(role) {
        this.role = role;
    }

    /**
     * Getter for game role.
     * @returns {string}
     */
    getRole() {
        return this.role;
    }

}

/**
 * @class Represents a Game with two players.
 */
class Game {

    /**
     * @constructor
     */
    constructor() {
        this.player1 = null;
        this.player2 = null;

        this.history = [{
            squares: Array(9).fill(null)
        }]

        this.stepNumber = 0;
        this.xIsNext = true;

        console.debug('Game constructed');
    }

    /**
     * Gives true if two player are setup and Game is ready to start.
     * @returns {boolean}
     */
    isReady() {
        return this.getPlayer1()
            && this.getPlayer1().getConnection().connected
            && this.getPlayer2()
            && this.getPlayer2().getConnection().connected;
    }

    /**
     * Adds a player to the game in case there is a free slot and returns true otherwise false.
     * @param {WebSocketConnection} connection 
     */
    addPlayer(connection) {

        console.debug('Trying to add this player');

        if (this.isReady()) {
            console.debug('All slots used. Couldn\'t add this player');
            return false;
        }

        if (!this.player1) {
            this.setPlayer1(new Player(connection));
            this.getPlayer1().setRole('X');
        } else {
            this.setPlayer2(new Player(connection));
            this.getPlayer2().setRole('O');
        }

        this.notifyAllPlayers();

        console.debug('Player successfully added');

        return true;
    }

    /**
     * 
     * @param {Player} player - Helper function to notify an player. 
     * @param {string} role - A role. Default = 'X'. 
     * Sends JSON game data to player.
     */
    notifyPlayer(player) {

        if (!player) {
            return;
        }

        let data = {
            role: player.getRole(),
            xIsNext: this.xIsNext,
            squares: this.getCurrentSquares(),
            allPlayersReady: this.isReady(),
        };

        player.connection.sendUTF(JSON.stringify(data));

        console.debug('Player notified');
    }

    /**
     * Sets the next game step in case everything is valid.
     * @param {number} squareIndex - Selected index.
     * @param {WebSocketConnection} connection - Player's connection to check his permission to vote.
     * @returns {boolean}
     */
    nextStep(squareIndex, connection) {

        console.debug('Attempting do go to next step');

        if (squareIndex < 0 && squareIndex > 9) {
            console.debug('Index out of range');
            return false;
        }

        const currentPlayer = this.xIsNext ? this.getPlayer1() : this.getPlayer2();
        console.debug('Voting player is: ' + currentPlayer.getRole());

        if (connection === currentPlayer.getConnection()) {
            console.debug('Player is allowed to do this');
            const current = this.getCurrentSquares();
            const squares = current.slice();
            squares[squareIndex] = this.xIsNext ? 'X' : 'O';
            this.addHistory(squares);
            this.xIsNext = !this.xIsNext;
            this.notifyAllPlayers();
            return true;
        }

        console.debug('Player is not whom he pretends to be');

        return false;

    }

    /**
     * Function to drop players connection in case the given connection is one of our players.
     * @param {WebSocketConnection} connection 
     */
    kickPlayer(connection) {

        if (this.getPlayer1() && this.getPlayer1().getConnection() === connection) {
            this.getPlayer1().getConnection().drop();
            this.setPlayer1(null);
            this.notifyAllPlayers();
        }

        if (this.getPlayer2() && this.getPlayer2().getConnection() === connection) {
            this.getPlayer2().getConnection().drop();
            this.setPlayer2(null);
            this.notifyAllPlayers();
        }
    }

    /**
     * Notifies all players. Keeping them up to date.
     */
    notifyAllPlayers() {
        this.notifyPlayer(this.player1);
        this.notifyPlayer(this.player2);
    }

    /**
     * Getter for player1.
     * @returns {Player}
     */
    getPlayer1() {
        return this.player1;
    }

    /**
     * Getter for player2.
     * @returns {Player}
     */
    getPlayer2() {
        return this.player2;
    }

    /**
     * Setter for player1.
     * @param {Player} player - Player.
     */
    setPlayer1(player) {
        this.player1 = player;
    }

    /**
     * Setter for player2.
     * @param {Player} player - Player.
     */
    setPlayer2(player) {
        this.player2 = player;
    }

    /**
     * Getter for the history.
     */
    getHistory() {
        return this.history;
    }

    /**
     * Adds one step to the game history.
     * @param {Array(9)} squares - Array of size 9.
     */
    addHistory(squares) {
        this.history.push({ squares: squares });
        this.stepNumber++;
    }

    /**
     * Returns current squares.
     */
    getCurrentSquares() {
        return this.getHistory()[this.stepNumber].squares;
    }

    info() {
        if (this.getPlayer1()) {
            let st = this.getPlayer1().getConnection().connected ? 'connected' : 'not connected';
            console.log('Player 1 is ' + st);
        } else {
            console.log('Player 1 is not set');
        }
        if (this.getPlayer2()) {
            let st = this.getPlayer2().getConnection().connected ? 'connected' : 'not connected';
            console.log('Player 2 is ' + st);
        } else {
            console.log('Player 2 is not set');
        }
        console.log('Game is at step number ' + this.stepNumber);
        console.log('History is: ');
        console.debug(this.getHistory());
    }
}

var game;

wsServer.on('connect', function (connection) {

    console.debug('New client connected');

    if (!game) {
        game = new Game();
    }

    if (game.addPlayer(connection)) {
        game.info();
    } else {
        connection.drop();
    }

    connection.on('close', function (reasonCode, description) {
        console.debug('Player disconnected');
        game.kickPlayer(connection);
        game.info();
    });

    connection.on('error', function (reasonCode, description) {
        console.debug('Connection error');
        game.kickPlayer(connection);
        game.info();
    });

    connection.on('message', function (message) {
        data = JSON.parse(message.utf8Data);
        switch (data.cmd) {
            case 'nextStep':
                game.nextStep(data.selectedSquare, connection);
                break;
            case 'newGame':
                player1 = game.getPlayer1();
                player2 = game.getPlayer2();
                game = new Game();
                game.addPlayer(player1.getConnection());
                game.addPlayer(player2.getConnection());
                break;
            default:
                return;
        }
        game.info();
    });

});
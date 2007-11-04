/*
	GnuGo Transfer Protocol Javascript Interface v1.1     
	Copyright (C) 2007 Julien Roubieu <j_roubieu@yahoo.fr>    This program is free software: you can redistribute it and/or modify    it under the terms of the GNU General Public License as published by    the Free Software Foundation, either version 3 of the License, or    (at your option) any later version.    This program is distributed in the hope that it will be useful,    but WITHOUT ANY WARRANTY; without even the implied warranty of    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the    GNU General Public License for more details.    You should have received a copy of the GNU General Public License    along with this program.  If not, see <http://www.gnu.org/licenses/>.

*/

var config;
var prefs;
var commandId = 1;
var command;
var responseBuffer;
var callbacks;
var callbacksArgs;
var noCallback = function() {};
var lastWasPass;
var captured; // 2-sized array<int>. captured["white"] and captured["black"].
var movesHistory = new Array();

/*
	A Configuration must be passed to the init method.
*/
var Configuration = function(gnuGoPath, boardSize) {
	// game config
	this.gnuGoPath = gnuGoPath;
	this.boardSize = boardSize;
	// callbacks
	this.gnuGoPlayedCallback = noCallback;
	this.moveCallback = noCallback;
	this.capturedStonesCallback = noCallback;
	this.finalScoreCallback = noCallback;
	this.undoneCallback = noCallback;
	this.handicapCallback = noCallback;
};
Configuration.prototype = {
	setGnuGoPlayedCallback : function(callback) { this.gnuGoPlayedCallback = callback; },
	setMoveCallback : function(callback) { this.moveCallback = callback; },
	setFinalScoreCallback : function(callback) { this.finalScoreCallback = callback; },
	setUndoneCallback : function(callback) { this.undoneCallback = callback; },
	setHandicapCallback : function(callback) { this.handicapCallback = callback; },
	setCapturedStonesCallback : function(callback) { this.capturedStonesCallback = callback; }
}

/*  
	Preferences might change for each new game.
*/
var Preferences = function() {
}
Preferences.prototype = {
	setPlayerColor : function(color) { 
		this.playerColor = color.toLowerCase(); 
		this.gnuColor = (this.playerColor == "w" || this.playerColor == "white") ? "b" : "w";
	},
	getPlayerColor : function() { return this.playerColor; },
	setKomi : function(komi) { this.komi = komi; },
	getKomi : function() { return this.komi; },
	setHandicap : function(handicap) { this.handicap = handicap; },
	getHandicap : function() { return this.handicap; },
	setLevel : function(level) { this.level = level; },
	getLevel : function() { return this.level; }
}



/*
	A Vertice is a position on the board. 
	Constructed with integers ('1,1' is lower left corner) or String ('A1').
*/
var Vertice = function (X, Y) {
	this.PASS = "pass";
	this.RESIGN = "resign";
	if (typeof X == 'string') {
		if (X.match(/[A-HJa-hj][1-9]/)) {
			var letters = "-ABCDEFGHJ";
			this.X = letters.indexOf(X.substring(0,1));
			this.Y = X.substring(1);
		}
		else if (X.toLowerCase() == PASS.toLowerCase()) {
			this.X = PASS;
		}
		else if (X.toLowerCase() == RESIGN.toLowerCase()) {
			this.X = RESIGN;
		}
	}
	else {
		this.X = X;
		this.Y = Y;
	}
}
Vertice.prototype = {
	getCoords : function() {
		if (this.isPass() || this.isResign()) return null;
		var letters = ['A','B','C','D','E','F','G','H','J'];
		return letters[this.X-1] + this.Y;
	},
	isPass : function() {
		return this.X == this.PASS;
	},
	isResign : function() {
		return this.X == this.RESIGN;
	}
}

/*
	A Move is a color, a Vertice, a success flag (true if move is valid), and optionally an array of captured stones Vertices. Obviously, the last two parameters are only used when the move has been made.
*/
var Move = function (color, vertice, success, capturedArray) {
	this.color = color;
	this.vertice = vertice;
	this.success = success;
	this.captured = capturedArray;
}
Move.prototype = {
	hasCaptured : function() {
		return this.captured != null && this.captured.length > 0;
	},
	isSuccess : function() {
		return this.success;
	},
	isPass : function() {
		return this.vertice.isPass();
	},
	isResign : function() {
		return this.vertice.isResign();
	}	
}

/*
	Represents the final state of a game, giving all necessary information to display the final state on a goban.
*/
var Score = function (scoreString, alive, dead, seki, whiteTerritory, blackTerritory, dame, capturedByWhite, capturedByBlack)
{
	this.scoreString = scoreString;
	this.alive = alive;
	this.dead = dead;
	this.seki = seki;
	this.white = whiteTerritory;
	this.black = blackTerritory;
	this.dame = dame;
	this.capturedByWhite = capturedByWhite;
	this.capturedByBlack = capturedByBlack;
}
Score.prototype = {
	// Returns true if this score has a status for each goban vertice
	isComplete : function() {
		var knownCount = this.alive.length + this.dead.length + this.seki.length + this.white.length + this.black.length + this.dame.length;
		var total = config.boardSize * config.boardSize;
		return knownCount >= total;
	}
}

var finalScore = new Score("", new Array(), new Array(), new Array(), new Array(), new Array(), new Array(), 0, 0);


/*
	Calls gnugo and sets the given configuration and 
	start a new game with the given preferences
	@param configuration GTP Interface Configuration
	@param preferences Preferences for the new game
*/
function initGnuGo(configuration:Configuration, preferences:Preferences)
{
	config = configuration;
	command = widget.system(config.gnuGoPath + " --mode gtp", endHandler);
	command.onreadoutput = outputHandler;
	startNewGame(preferences);
}

/*
	Closes the command connexion to GnuGo.
*/
function closeGnuGo()
{
	if (command) command.close();
}

/*
	Starts a new game with the given preferences. They cannot be changed later.
	@param preferences Preferences for the new game.
*/
function startNewGame(preferences:Preferences)
{
	prefs = preferences;
	responseBuffer = '';
	callbacks = new Array();
	callbacksArgs = new Array();
	lastWasPass = false;
	captured = new Array();
	captured["w"] = "0";
	captured["b"] = "0";
	finalScore = new Score("", new Array(), new Array(), new Array(), new Array(), new Array(), new Array(), 0, 0);
	exe("level " + prefs.level, noCallback);
	exe("boardsize " + config.boardSize, noCallback);
	exe("komi " + prefs.komi, noCallback);
	exe("clear_board", noCallback);
	
	if (prefs.handicap > 0) {
		exe("fixed_handicap " + prefs.handicap, handicapWasFixed);
	}
	else if (prefs.gnuColor == "b") {
		exe("genmove " + prefs.gnuColor, parseMove);
	}
}

// Callback
function handicapWasFixed(verticesString, ok)
{
	if (!ok) return;
	var vertices = new Array();
	var vsArray = $A(verticesString.split(/\s/));
	vsArray.each(function(vCoord) {
		vertices.push(new Vertice(vCoord));
	});
	config.handicapCallback(vertices);
	if (prefs.gnuColor == "white" || prefs.gnuColor == "w") 
		exe("genmove " + prefs.gnuColor, parseMove);
}

/*
	Calls the callback function, passing it an space-separated list of the vertices of the stones of the given color
*/
function getStonesPositions(color, callback)
{
	exe("list_stones "+color, callback);
}

/* 
	Input. Call this to play the given move.
	@param newMove a Move from the human player
*/
function move(newMove:Move)
{
	if (!newMove.isPass() && !newMove.isResign()) {
		lastWasPass = false;
		var callback = function(response, success) { moveResult(move, success); };
		exe("play "+ prefs.playerColor +" "+vertice.getCoords(), callback);
	}
	else if (newMove.isPass()) {
		if (lastWasPass) {
			computeFinalScore(null, null, 0);
		}
		else {
			lastWasPass = true;
			var callback = function(response, success) { moveResult("pass", success); };
			exe("play " + prefs.playerColor + " pass", callback);
		}
	}
	else {  // == newMove.isResign()
		throw new Exception("TODO");
	}
}


/* 
	Callback function, after gnugo has received the human move.
	@param move the Move that was made
	@param success success of the move
*/
function moveResult(move:Move, success:Boolean)
{
	move.success = success;
	if (success) {
		checkCaptured(prefs.playerColor, function(capturedVertices) {
			move.capturedVertices = capturedVertices;
			config.moveCallback(move);	
			exe("genmove " + prefs.gnuColor, parseMove);
		} );
	}
	else config.moveCallback(move);
}

/*
	Check if there are new captured stones.
	@param color : captured color
	@param callback : callback function (arrayOfCapturedVertices)
*/
function checkCaptured(color, callback)
{
	exe("captures "+color, function(response) { getCaptured(color, response, callback); });
}

/*
	Calls the callback method with the vertices of captured stones of the given color
	@param color the color of the captured stones
	@param nCaptured the number of captured stones before the last move
	@param callback callback function
*/
function getCaptured(color:String, nCaptured:int, callback:Function)
{
	if (captured[color] != nCaptured) {
		captured[color] = nCaptured;
		getStonesPositions(color, function(response) { callback(parseCaptured(color, response)); });
	}
	else {
		// no new capture
		callback(new Array());
	}
}
/*
	Goes through the move history and return all played vertices that are not contained in verticesList.
	@param color the color of the captured stone we want to find
	@param verticesList a String containing the actual vertices of the stones of this color on the goban
	@return captured stones of the given color
*/
function parseCaptured(color:String, verticesList:String)
{
	var captured = new Array();
	$A(movesHistory).each(function(move) {
		if (move.getColor() != color) continue;
		if (verticesList.indexOf(move.vertice.getCoords()) == -1) {
			captured.push(vertice);
		}
	});
	return captured;
}


/* 
	Callback function, after gnugo has played.
	Calls the config.gnuGoPlayedCallback with GnuGo's move.
	@param response vertice String from GnuGo.
*/
function parseMove(response:String)
{
	var vertice = new Vertice(response);
	
	if (vertice.isPass()) {
		if (lastWasPass) {
			computeFinalScore(null, null, 0);
			return;
		}
		lastWasPass = true;
	}
	checkCaptured(prefs.gnuColor, function(capturedVertices) {
		config.gnuGoPlayedCallback(new Move(prefs.gnuColor, vertice, true, capturedVertices));
	});
}


// Input, should be called after both player have passed
function computeFinalScore(response:String, success:Boolean, step:int)
{
	var callNextStep = function(r, s) { computeFinalScore(r, s, step+1); };
	switch (step) {
		case 0 :
			exe("final_score", callNextStep);
			break;
		case 1 :
			finalScore.scoreString = response;
			exe("captures black", callNextStep);
			break;
		case 2 :
			finalScore.capturedByBlack = response;
			exe("captures white", callNextStep);
			break;
		case 3 :
			finalScore.capturedByWhite = response;
			for (var i=1; i<=9; i++) {
				for (var j=1; j<=9; j++) {
					var v = new Vertice(i,j);
					var callback = function(response, success, vertice) {
						if (success) finalVerticeStatus(vertice, response);
						if (finalScore.isComplete()) config.finalScoreCallback(finalScore);
					};
					exe("final_status "+v.getCoords(), callback, v);
				}
			}
			break;
		default : break;
	}
}

// Callback, Receives the final state of a vertice
function finalVerticeStatus(vertice:Vertice, status:String)
{
	var arr = null;
	switch (status)
	{
		case "alive" : arr = finalScore.alive; break;
		case "dead" : arr = finalScore.dead; break;
		case "dame" : arr = finalScore.dame; break;
		case "white_territory" : arr = finalScore.white; break;
		case "black_territory" : arr = finalScore.black; break;
		case "seki" : arr = finalScore.seki; break;
		default : break;
	}
	if (arr != null)
		arr.push(vertice);
} 

/*
	Parse a list of vertices as String.
	@param verticeListString list of String vertices separated by spaces (ex: a2 b8 h3 k9)
	@return an iterable array of Vertices
*/
function parseVerticeList(verticeListString:String)
{
	var coords = $A(verticeListString.split(' '));
	var vertices = new Array();
	coords.each(function(coord) {
			vertices.push(new Vertice(coord));
		}
	);
	return $A(vertices);
}


function endHandler()
{
}

// Input
function undoLastMove()
{
	exe("undo", lastMoveUndone);
	exe("undo", lastMoveUndone);
}

var nUndone = 0;
var called = 0;
function lastMoveUndone(response, success)
{
	called++;
	if (success) nUndone ++;
	if (called == 2) {
		config.undoneCallback(nUndone);
		called = 0;
		nUndone = 0;
	}
}

function testCallback(response, success)
{
	var r = response;
	var s = success;
}

/*
	Util. Executes the given command. When response is received, the callback function is called with the given argument.
	@param gtpCommand a GTP command string
	@param callback a callback function
	@param args the third argument that will be passed to the callback method (after the response and a success flag).
	@return the id of the command. Used to identify the response.
*/
function exe(gtpCommand:String, callback, args)
{
	var id = commandId++;
	callbacks[id] = callback;
	if (args != null) callbacksArgs[id] = args;
	command.write(id + ' ' + gtpCommand + '\n');
	return id;
}


/*
	Callback function triggered when gnugo outputs something. Calls the callback function that was passed to the
	"exe" method with 3 arguments : the response output from GNUGo, a success flag, and the optionnal argument that 
	was also passed to the "exe" method.
	@param gtpOutput the output from GNUGo
*/
function outputHandler(gtpOutput:String)
{
	responseBuffer += gtpOutput;
	exp = new RegExp("([=\?])([0-9]+) (.*)\n\n");

	while (exp.test(responseBuffer)) {
		var matched = exp.exec(responseBuffer);
		var success = matched[1] == '=';
		var id = matched[2];
		var response = matched[3];
		if (callbacks[id]) callbacks[id](response, success, callbacksArgs[id]);
		responseBuffer = responseBuffer.substring(matched[0].length);
	}	
}

/*
	GnuGo Transfer Protocol Javascript Interface v1.0     
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
var captured;
var playerMoves = new Array();
var gnuMoves = new Array();

/*
	A Configuration must be passed to the init method.
*/
var Configuration = function(gnuGoPath, boardSize) {
	// game config
	this.gnuGoPath = gnuGoPath;
	this.boardSize = boardSize;
	// callbacks
	this.gnuGoPlayedCallback = noCallback;
	this.gnuGoPassedCallback = noCallback;
	this.gnuGoResignedCallback = noCallback;
	this.invalidMoveCallback = noCallback;
	this.moveCallback = noCallback;
	this.capturedStonesCallback = noCallback;
	this.finalScoreCallback = noCallback;
	this.undoneCallback = noCallback;
	this.handicapCallback = noCallback;
};
Configuration.prototype = {
	setGnuGoPlayedCallback : function(callback) { this.gnuGoPlayedCallback = callback; },
	setGnuGoPassedCallback : function(callback) { this.gnuGoPassedCallback = callback; },
	setGnuGoResignedCallback : function(callback) { this.gnuGoResignedCallback = callback; },
	setMoveCallback : function(callback) { this.moveCallback = callback; },
	setFinalScoreCallback : function(callback) { this.finalScoreCallback = callback; },
	setUndoneCallback : function(callback) { this.undoneCallback = callback; },
	setHandicapCallback : function(callback) { this.handicapCallback = callback; },
	setCapturedStonesCallback : function(callback) { this.capturedStonesCallback = callback; }
}

// Preferences might change for each new game
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
	if (typeof X == 'string' && X.match(/[A-IJa-ij][1-9]/)) {
		var letters = "-ABCDEFGHJ";
		this.X = letters.indexOf(X.substring(0,1));
		this.Y = X.substring(1);
	}
	else {
		this.X = X;
		this.Y = Y;
	}
}
Vertice.prototype = {
	getCoords : function() {
		var letters = ['A','B','C','D','E','F','G','H','J'];
		return letters[this.X-1] + this.Y;
	}
}

/*
	A Move is a color, a vertice (which can be 'pass' or 'resign'), a success flag (true if move is valid), and eventually an array of captured stones vertices
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
		return this.vertice == 'pass';
	},
	isResign : function() {
		return this.vertice == 'resign';
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
	Calls gnugo and sets the given configuration
*/
function initGnuGo(configuration, preferences)
{
	config = configuration;
	command = widget.system(config.gnuGoPath + " --mode gtp", endHandler);
	command.onreadoutput = outputHandler;
	startNewGame(preferences);
}

function closeGnuGo()
{
	if (command) command.close();
}

function startNewGame(preferences)
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

// Input
function move(vertice)
{
	lastWasPass = false;
	var callback = function(response, success) { moveResult(vertice, success); };
	exe("play "+ prefs.playerColor +" "+vertice.getCoords(), callback);
}

// Input
function pass()
{
	if (lastWasPass) {
		computeFinalScore(null, null, 0);
	}
	else {
		lastWasPass = true;
		var callback = function(response, success) { moveResult("pass", success); };
		exe("play " + prefs.playerColor + " pass", callback);
	}
}

// callback function, after human has played
function moveResult(vertice, success)
{
	if (success) {
		checkCaptured(prefs.playerColor, function(capturedVertices) {
			var move = new Move(prefs.playerColor, vertice, true, capturedVertices);
			config.moveCallback(move);	
			exe("genmove " + prefs.gnuColor, parseMove);
		} );
	}
	else config.invalidMoveCallback();
}

/*
	Check if there are new captured stones.
	@param color : captured color
	@param callback : callback function (arrayOfCapturedVertices)
*/
function checkCaptured(color, callback)
{
	exe("captures "+color, function(response) { countCaptured(color, response, callback); });
}
function countCaptured(color, nCaptured, callback)
{
	// calls capturedStonesCallback function if some new stones were captured
	if (captured[color] != nCaptured) {
		captured[color] = nCaptured;
		//config.capturedStonesCallback(color, nCaptured);
		getStonesPositions(color, function(response) { parseCaptured(color, response, callback); });
	}
	else {
		// no captures
		callback(new Array());
	}
}
function parseCaptured(color, verticesList, callback)
{
	var captured = new Array();
	var moves = (color == prefs.playerColor) ? playerMoves : gnuMoves;
	$A(moves).each(function(move) {
		if (verticesList.indexOf(move.vertice.getCoords()) == -1) {
			captured.push(vertice);
		}
	});
	callback(captured);
}


// callback function, after gnugo has played
function parseMove(response)
{
	verticeExpression = new RegExp("\s*[a-hjA-HJ][1-9]\s*");
	if (verticeExpression.test(response)) {
		lastWasPass = false;
		var letters = "-ABCDEFGHJ";
		var verticeString = verticeExpression.exec(response)[0]
		var x = letters.indexOf(verticeString.substring(0,1));
		var y = verticeString.substring(1);
		checkCaptured(prefs.gnuColor);
		config.gnuGoPlayedCallback(prefs.gnuColor, new Vertice(x, y));
	}
	else if (response.toLowerCase() == "pass") {
		if (lastWasPass) {
			computeFinalScore(null, null, 0);
		}
		else {
			config.gnuGoPassedCallback();
			lastWasPass = true;
		}
	}
	else if (response.toLowerCase() == "resign") {
		config.gnuGoResignedCallback();
	}
}

// Input, should be called after both player have passed
function computeFinalScore(response, success, step)
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

//Callback Receives the final state of a vertice
function finalVerticeStatus(vertice, status)
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

// Util, returns an iterable array of vertices
function parseVerticeList(verticeListString)
{
	var coords = $A(verticeListString.split(' '));
	var vertices = new Array();
	coords.each(function(coord) {
			vertices.push(new Vertice(coord));
		}
	);
	return $A(vertices);
}

// Triggered when gnugo outputs something
function outputHandler(gtpOutput)
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

// Util : executes the given command String. The callback function will be called with the response and success flag.
function exe(gtpCommand, callback, args)
{
	var id = commandId++;
	callbacks[id] = callback;
	if (args != null) callbacksArgs[id] = args;
	command.write(id + ' ' + gtpCommand + '\n');
	return id;
}

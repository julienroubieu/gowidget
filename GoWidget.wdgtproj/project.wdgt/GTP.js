/*
	GnuGo Transfer Protocol Javascript Interface v1.0
	June 2007
	(c) Julien Roubieu - j_roubieu@yahoo.fr
*/

var config;
var prefs;
var commandId = 1;
var command;
var responseBuffer;
var callbacks;
var noCallback = function() {};
var lastWasPass;
var captured;

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
	this.moveAcceptedCallback = noCallback;
	this.capturedStonesCallback = noCallback;
	this.finalScoreCallback = noCallback;
	this.undoneCallback = noCallback;
	this.handicapCallback = noCallback;
};
Configuration.prototype = {
	setGnuGoPlayedCallback : function(callback) { this.gnuGoPlayedCallback = callback; },
	setGnuGoPassedCallback : function(callback) { this.gnuGoPassedCallback = callback; },
	setGnuGoResignedCallback : function(callback) { this.gnuGoResignedCallback = callback; },
	setInvalidMoveCallback : function(callback) { this.invalidMoveCallback = callback; },
	setMoveAcceptedCallback : function(callback) { this.moveAcceptedCallback = callback; },
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
	lastWasPass = false;
	captured = new Array();
	captured["w"] = "0";
	captured["b"] = "0";
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

function checkCaptured(color)
{
	exe("captures "+color, function(response) { analyseCaptured(color, response); });
}
function analyseCaptured(color, nCaptured)
{
	// calls capturedStonesCallback function if some new stones were captured
	if (captured[color] != nCaptured) {
		captured[color] = nCaptured;
		config.capturedStonesCallback(color, nCaptured);
	}
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
		exe("final_score", showFinalScore);
	}
	else {
		lastWasPass = true;
		var callback = function(response, success) { moveResult("pass", success); };
		exe("play " + prefs.playerColor + " pass", callback);
	}
}

// callback function, after human has played
function moveResult(response, success)
{
	if (success) {
		config.moveAcceptedCallback(prefs.playerColor, response);
		checkCaptured(prefs.playerColor);
		exe("genmove " + prefs.gnuColor, parseMove);
	}
	else config.invalidMoveCallback();
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
			exe("final_score", showFinalScore);
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
		if (callbacks[id]) callbacks[id](response, success);
		responseBuffer = responseBuffer.substring(matched[0].length);
	}	
}

function endHandler()
{
}

// Callback function
function showFinalScore(score)
{
	config.finalScoreCallback(score);
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

// Util : executes the given command String. The callback function will be called with the response and success flag.
function exe(gtpCommand, callback)
{
	var id = commandId++;
	callbacks[id] = callback;
	command.write(id + ' ' + gtpCommand + '\n');
}

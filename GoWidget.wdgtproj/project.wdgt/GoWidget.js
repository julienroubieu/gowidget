/*
	"Go" widget for Apple Dashboard
	Copyright (C) 2007 Julien Roubieu <j_roubieu@yahoo.fr>    This program is free software: you can redistribute it and/or modify    it under the terms of the GNU General Public License as published by    the Free Software Foundation, either version 3 of the License, or    (at your option) any later version.    This program is distributed in the hope that it will be useful,    but WITHOUT ANY WARRANTY; without even the implied warranty of    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the    GNU General Public License for more details.    You should have received a copy of the GNU General Public License    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

var hSlider, lSlider;
var preferences;

function load()
{
	$('blackOption').innerText = getLocalizedString('black');
	$('whiteOption').innerText = getLocalizedString('white');
	setupParts();
	loadPreferences();
	hSlider = new StepsSlider('handicapSlider', ['0','2','3','4','5','6','7','8','9'], 'handicapValueLbl');
	lSlider = new StepsSlider('levelSlider', ['1','2','3','4','5','6','7','8','9','10'], 'levelValueLbl');
	var configuration = new Configuration("./gnugo", 9);
	configuration.setGnuGoPlayedCallback(gnuGoPlayed);
	configuration.setGnuGoPassedCallback(cpuPassed);
	configuration.setGnuGoResignedCallback(cpuResigned);
	configuration.setMoveAcceptedCallback(drawStone);
	configuration.setInvalidMoveCallback(invalidMove);
	configuration.setFinalScoreCallback(gameEnded);
	configuration.setCapturedStonesCallback(stonesWereCaptured);
	configuration.setUndoneCallback(undoOK);
	configuration.setHandicapCallback(drawHandicap);
	initGnuGo(configuration, preferences);
	think(false);
	clearCenterMessage();
}

function loadPreferences()
{
	preferences = new Preferences();
	preferences.setPlayerColor(widget.preferenceForKey("playerColor") || "Black");
	preferences.setKomi(widget.preferenceForKey("komi") || "5.5");
	preferences.setHandicap(widget.preferenceForKey("handicap") || "0");
	preferences.setLevel(widget.preferenceForKey("level") || "8");
}

function savePreferences()
{
	widget.setPreferenceForKey(preferences.getKomi(), "komi");
	widget.setPreferenceForKey(preferences.getPlayerColor(), "playerColor");
	widget.setPreferenceForKey(preferences.getHandicap(), "handicap");
	widget.setPreferenceForKey(preferences.getLevel(), "level");
}

function remove()
{
	closeGnuGo();
}

function hide()
{
	// your widget has just been hidden stop any timers to
	// prevent cpu usage
}

function show()
{
	// your widget has just been shown.  restart any timers
	// and adjust your interface as needed 
}

function showBack(event)
{
	// your widget needs to show the back

	var front = $("front");
	var back = $("back");

	if (window.widget)
		widget.prepareForTransition("ToBack");

	front.style.display="none";
	back.style.display="block";
	
	if (window.widget)
		setTimeout('widget.performTransition();', 0);
		
	$('handicapSlider').object.refresh();
	$('levelSlider').object.refresh();
	colorCombo.value = preferences.getPlayerColor();
	komiField.value = preferences.getKomi();
	hSlider.setLabel(preferences.getHandicap());
	lSlider.setLabel(preferences.getLevel());
}

function showFront(event)
{
	// your widget needs to show the front
	preferences.setPlayerColor(colorCombo.value);
	preferences.setKomi(komiField.value);
	preferences.setHandicap($('handicapValueLbl').innerText);
	preferences.setLevel($('levelValueLbl').innerText);
	savePreferences();

	var front = $("front");
	var back = $("back");

	if (window.widget)
		widget.prepareForTransition("ToFront");

	front.style.display="block";
	back.style.display="none";
	
	if (window.widget)
		setTimeout('widget.performTransition();', 0);
}

if (window.widget)
{
	widget.onremove = remove;
	widget.onhide = hide;
	widget.onshow = show;
}

var Board = function() { 
	this.size = 9;
	this.X0 = 36; // x origin in pixels, top left node (A9)
	this.Y0 = 39; // y origin in pixels, top left node (A9)
	this.stepX = 31.12; // px, between each node
	this.stepY = 31; // px, between each node
	this.tolerance = 14; // in pixels, around each node 
	this.stoneOffsetX = -15; // in pixels, about half the width of the stone image
	this.stoneOffsetY = -18; // in pixels, about half the height of the stone image 
}
Board.prototype = {
	getStoneX : function(vertice) {
				return this.X0 + this.stepX * (vertice.X -1) + this.stoneOffsetX;
			},
	getStoneY : function(vertice) {
				return this.Y0 + this.stepY * (this.size-vertice.Y) + this.stoneOffsetY;
			}
}

var board = new Board();
var lastPlayerMoves = new Array();
var lastPlayerCaptured = new Array();
var lastGnuMoves = new Array();
var lastGnuCaptured = new Array();
var userCanPlay = true;
var firstCall = true;
var passButtonEnabled = true;


// Event
function placeStone(event) 
{	
	if (!userCanPlay) {
		displayMessage(getLocalizedString("Please wait"));
		return;
	}
	clearMessage();
	var vertice = getVertice(event);
	if (vertice != null) {
		userCanPlay = false;
		think(true);
		lastPlayerMoves.push(vertice);
		move(vertice);
	}
}

// Callback
function drawHandicap(vertices)
{
	vertices.each(function(vertice) {
		drawStone("black", vertice);
	});
	if (preferences.gnuColor == "w") userCanPlay = false;
}

// Interface : Computes the coordinates of a mouse event to return a vertice.
function getVertice(event)
{
	var coordX = -1;
	var coordY = -1;
	for (i=1; i<=board.size; i++) {
		var pointX = board.X0+(i-1)*board.stepX;
		if (Math.abs(event.x - pointX) <= board.tolerance) {
			coordX = i;
			break;
		}
	}
	for (i=1; i<=board.size; i++) {
		var pointY = board.Y0+(i-1)*board.stepY;
		if (Math.abs(event.y - pointY) <= board.tolerance) {
			coordY = i;
			break;
		}
	}
	if (coordX == -1 || coordY == -1) {
		return null;
	}
	coordY = (board.size+1)-coordY;
	return new Vertice(coordX, coordY);
}

// Callback function
function gnuGoPlayed(color, vertice)
{
	lastGnuMoves.push(vertice);
	think(false);
	drawStone(color, vertice);
	clearMessage();
	userCanPlay = true;
}

// Callback function
function moveCallback(color, vertice, isValidMove, deadStonesArray)
{
	if (!isValidMove) {
		invalidMove();
		return;
	}
	drawStone(color, vertice);
}


function invalidMove()
{
	think(false);
	displayMessage(getLocalizedString("Invalid move"));
	userCanPlay = true;
}

/*
	Interface : Draws a stone of the given color at the given vertice
	color = 'b' | 'w' | 'black' | 'white'
*/
function drawStone(color, vertice)
{
	if (firstCall) {
		clearCenterMessage();
		firstCall = false;
	}
	if (vertice == "pass") return;
	
	if (color == "w" || color == "white") {
		drawElement("whiteStone", vertice);
	}
	else if (color == "b" || color == "black") {
		drawElement("blackStone", vertice);
	}
	else throw "Invalid Color";
	
	setSelectedStone(color, vertice);
	$('tock').Play();
}

/*
	Interface : Draws an element of the given class at the given vertice
*/
function drawElement(className, vertice)
{
	var element = document.createElement("div");
	element.id = vertice.getCoords();
	element.style.left = board.getStoneX(vertice) + 'px';
	element.style.top = board.getStoneY(vertice) + 'px';
	element.className = className;
	$('stones').appendChild(element);
}


// Interface : Sets the "last played" indicator
function setSelectedStone(color, vertice)
{
	$('selectedStone').style.left = board.getStoneX(vertice) + 'px';
	$('selectedStone').style.top = board.getStoneY(vertice) + 'px';
	$('selectedStone').className = getFullColor(color) + "SelectedStone";
}


// Interface : hides the "last played" indicator
function hideSelectedStone()
{
	$('selectedStone').className = "noSelectedStone";
}



// Event
function passClicked(event) 
{
	if (!passButtonEnabled) return;
	if (!userCanPlay) {
		displayMessage(getLocalizedString("Please wait"));
		return;
	}
	think(true);
	pass();
}


// Callback function
function stonesWereCaptured(color, totalCaptured)
{
	var className = getFullColor(getOtherColor(color)) + "Stone";
	var removeCapturedStones = function(presentStonesList) {
		var stones = $A(document.getElementsByClassName(className, 'stones'));
		stones.each(function(verticeDiv) {
			if (presentStonesList.indexOf(verticeDiv.id) == -1) {
				$('stones').removeChild(verticeDiv);
			}
		});
	}
	getStonesPositions(getOtherColor(color), removeCapturedStones);
}


// Interface : Shows an indicator that CPU is thinking
function think(thinking)
{
	if (thinking)
		$('thinking').style.display = 'block';
	else
		$('thinking').style.display = 'none';
}


// Undo is not activated in this version
function undoClicked(event) 
{
	if (!userCanPlay) {
		displayMessage(getLocalizedString("Please wait"));
		return;
	}
	undoLastMove();
}

// Callback function
function undoOK()
{
	if (lastPlayerMoves.length > 0) {
		$('stones').removeChild($(lastPlayerMoves.pop().getCoords()));
	}
	if (lastGnuMoves.length > 0) {
		$('stones').removeChild($(lastGnuMoves.pop().getCoords()));
	}
	setSelectedStone(config.gnuColor, lastGnuMoves[lastGnuMoves.length-1]);
}

// Callback function
function cpuPassed()
{
	userCanPlay = true;
	think(false);
	hideSelectedStone();
	displayMessage(getLocalizedString("Passed"));
}

// Callback function
function cpuResigned()
{
	displayMessage(getLocalizedString("Resigned"));
}

// Callback function
function gameEnded(score)
{
	think(false);
	passButtonEnabled = false;
	userCanPlay = false;
	hideSelectedStone();
	score.deadBlack = new Array();
	score.deadWhite = new Array();
	$A(score.dead).each(function(vertice) {
		var stoneClass = $(vertice.getCoords()).className;
		$(vertice.getCoords()).className = stoneClass + "Dead";
		if (stoneClass.indexOf("black") != -1) {
			score.deadBlack.push(vertice);
			drawElement("whiteTerritory", vertice);
		}
		if (stoneClass.indexOf("white") != -1) {
			score.deadWhite.push(vertice);
			drawElement("blackTerritory", vertice);
		}
		drawElement(stoneClass+"Dead", vertice);
	});
	$A(score.white).each(function(vertice) {
		drawElement("whiteTerritory", vertice);
	});
	$A(score.black).each(function(vertice) {
		drawElement("blackTerritory", vertice);
	});
	$A(score.dame).each(function(vertice) {
		drawElement("dame", vertice);
	});
	$A(score.seki).each(function(vertice) {
		drawElement("seki", vertice);
	});
	displayCenterMessage(getFormattedScore(score));
}

// Util : returns a localized string informing the final score
function getFormattedScore(score)
{
	var color = score.scoreString.substring(0,1);
	var gap = score.scoreString.substring(2, score.length);
	var sentence = capitalizeFirst(getLocalizedString(getFullColor(color))) + ' ' + getLocalizedString('winsBy') + ' ' + gap + ' ' + getLocalizedString('points');
	
	var blackScore = score.black.length + 2*score.deadWhite.length + parseInt(score.capturedByBlack);
	var whiteScore = score.white.length + 2*score.deadBlack.length + parseInt(score.capturedByWhite) + parseFloat(preferences.getKomi())
	
	var br = "<br/>";
	sentence += "<span class='small'>";
	sentence += br;
	sentence += br + getLocalizedString('whiteInitial') + " : "+(score.white.length + score.deadBlack.length) + " ";
	sentence += getLocalizedString('territoryInitial') + " + "+score.deadBlack.length + " ";
	sentence += getLocalizedString('surroundedInitial') + " + "+score.capturedByWhite + " ";
	sentence += getLocalizedString('capturedInitial') + " + "+preferences.getKomi() + " ";
	sentence += getLocalizedString('komiInitial') + " = "+whiteScore;
	
	sentence += br + getLocalizedString('blackInitial') + " : "+(score.black.length + score.deadWhite.length) + " ";
	sentence += getLocalizedString('territoryInitial') + " + "+score.deadWhite.length + " ";
	sentence += getLocalizedString('surroundedInitial') + " + "+score.capturedByBlack + " ";
	sentence += getLocalizedString('capturedInitial') + " = "+blackScore;
	
	sentence += "</span>";
	return sentence;
}

// Event
function newClicked(event) 
{
	think(false);
	passButtonEnabled = true;
	clearMessage();
	clearCenterMessage();
	hideSelectedStone();
	$('stones').innerHTML = "";
	userCanPlay = true;
	startNewGame(preferences);
}

// Interface : clears the status message
function clearMessage()
{
	displayMessage('');
}

// Interface : displays a status message
function displayMessage(msg)
{
	$('message').innerHTML = msg;
}

// Interface: displays an important message in the center of the widget
function displayCenterMessage(msg)
{
	if (centerMessage.style.display == '') {
		//init display
		centerMessage.style.display = 'none';
		centerMessageLbl.style.display = 'none';
		centerMessageBackground.style.display = 'none';
	}
	$('centerMessageLbl').innerHTML = msg;
	if (msg == '') {
		Element.hide('centerMessage');
		return;
	}
	clearMessage();
	centerMessageLbl.style.display = 'block';
	centerMessageBackground.style.display = 'block';
	//centerMessage.style.display = 'block';
	Effect.Appear(centerMessage);
}

// Event: Hides the center message when it is clicked
function centerMessageClicked() 
{
	clearCenterMessage();
}

function clearCenterMessage()
{
	if ($('centerMessage').display != 'none')
	{
		Effect.Fade('centerMessage');
	}
}

//Util
function capitalizeFirst(str)
{
	return str.substring(0,1).toUpperCase() + str.substring(1, str.length);
}

// Util : returns the opposite color (b or w)
function getOtherColor(color)
{
	var c = color.toLowerCase();
	return (c == "w" || c == "white") ? "b" : "w";
}

// Util : returns the full name of the color
function getFullColor(color)
{
	var c = color.toLowerCase();
	return (c == "w" || c == "white") ? "white" : "black";
}

// Opens my site
function contact() 
{
	widget.openURL('http://lesiteajulien.free.fr');
}

// Event
function handicapChanged(value) 
{
	if (hSlider) hSlider.onchange(value);
}

// Event
function levelChanged(value)
{
	if (lSlider) lSlider.onchange(value);
}

// Object that manages the sliders with fixed positions.
var StepsSlider = function(sliderId, labels, labelDivId)
{
	this.tolerance = 0.02;
	this.labels = labels;
	this.n = labels.length;
	this.interval = 1 / (this.n-1);
	this.sliderId = sliderId;
	this.labelDivId = labelDivId;
}
StepsSlider.prototype = {
	init : function()
	{
		this.slider = $(this.sliderId).object;
		this.labelDiv = $(this.labelDivId);
	},
	onchange : function(value) 
	{
		if (!this.slider) this.init();
		
		for (var i=0; i<this.n; i++) {
			if (Math.abs(value - (i*this.interval)) < this.tolerance) {
				this.labelDiv.innerText = this.labels[i];
				return;
			}
		}
		
		var attractionDistance = (this.interval / 2);
		for (var i=0; i<this.n; i++) {
			if (value < (i*this.interval + attractionDistance)) {
				this.slider.setValue(i*this.interval);
				this.slider.refresh();
				return;
			}
		}
		this.slider.setValue(1);
		this.slider.refresh();
	},
	setLabel : function(label)
	{
		if (!this.slider) this.init();
		for (var i=0; i<this.n; i++) {
			if (label == this.labels[i]) {
				this.slider.setValue(i*this.interval);
				this.slider.refresh();
				return;
			}
		}
		this.slider.setValue(1);
		this.slider.refresh();
	}
}

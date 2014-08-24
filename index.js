module.exports = uTP;

var inherits = require('inherits');
var stream = require('stream');
var dgram = require('dgram');
var process = require('process');

inherits(uTP, stream.Duplex);

// Type constants
var ST_DATA = 0;
var ST_FIN = 1;
var ST_STATE = 2;
var ST_RESET = 3;
var ST_SYN = 4;

var VERSION = 1;

function rand16() {
	return Math.floor(Math.random() * 65536);
}

function uTP () {
	stream.Duplex.call(this);

	this._currentWindow = 0;
	this._maxWindow = 0;
	this._windowSize = 0;
	this._replyMicroseconds = 0;
	this._sequenceNumber = 1;
	this._ackNumber = 0;


	var socket = this._socket = dgram.createSocket('udp4');
	socket.on('message', this._onMessage.bind(this));
}

uTP.prototype.listen = function (port, host, callback) {
	this._socket.bind(port, host, callback);
};

uTP.prototype.close = function () {
	this._socket.close();
};

uTP.prototype._onMessage = function (msg, rinfo) {
	console.log("received message \nmsg:\n%j\nrinfo:\n%j", msg, rinfo)
};

// Readable implementation
uTP.prototype._read = function (size) {

}

// Writable implementation
uTP.prototype._write = function (chunk, encoding, callback) {

};

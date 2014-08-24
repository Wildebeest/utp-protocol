module.exports = uTP;

var inherits = require('inherits');
var stream = require('stream');
var dgram = require('dgram');

inherits(uTP, stream.Duplex);

function uTP () {
	stream.Duplex.call(this);

}

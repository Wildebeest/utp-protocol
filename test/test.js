var uTP = require('../');
var test = require('tape');
var dgram = require('dgram');

test('constructor', function (t) {
	t.plan(1);

	var socket = dgram.createSocket('udp4');
	var stream = new uTP(socket);
	socket.bind(1337);

});
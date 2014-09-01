var uTP = require('../');
var test = require('tape');
var dgram = require('dgram');

test('constructor', function (t) {
	t.plan(1);

	var socket = dgram.createSocket('udp4');
	var stream = new uTP(socket);
	socket.bind(1337);

	stream.on('data', function(chunk) {
	  console.log('got %d bytes of data', chunk.length);
	  console.log(chunk.toString());
	});
	stream.on('end', function() {
	  console.log('there will be no more data.');
	  t.ok(true);
	});

});
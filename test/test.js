var uTP = require('../');
var test = require('tape');
var dgram = require('dgram');

test('constructor', function (t) {
	t.plan(1);

	var stream = new uTP();
	stream.listen(1337);

	var message = new Buffer("hello UDP");
	var socket = dgram.createSocket('udp4');
	socket.send(message, 0, message.length, 1337, "localhost");

	setTimeout(
		function (err, bytes) {
			t.ok(stream);
			socket.close();
			stream.close();
		}, 1000);
});
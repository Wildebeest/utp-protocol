var uTP = require('../');
var test = require('tape');
var dgram = require('dgram');
var merge = require('merge');

function writeHeader(buffer, options) {
	if(buffer) {
		var args = merge({
			type: 0,
			version: 1,
			connectionId: 0,
			timestamp: 0,
			timestampDiff: 0,
			windowSize: 0,
			sequenceNumber: 0,
			ackNumber: 0,
		}, options);

		buffer.writeUInt8((args.type << 4) + args.version, 0);
		buffer.writeUInt8(args.extension, 1); // extension
		buffer.writeUInt16BE(args.connectionId, 2);
		buffer.writeUInt32BE(args.timestamp, 4);
		buffer.writeUInt32BE(args.timestampDiff, 8);
		buffer.writeUInt32BE(args.windowSize, 12); // receive buffer size
		buffer.writeUInt16BE(args.sequenceNumber, 16);
		buffer.writeUInt16BE(args.ackNumber, 18);
	}
}

test("packet field parsing", function (t) {
	// Pick numbers like 1001 in binary to test 
	// that we're parsing the boundaries correctly.
	var test4 = 0x9;
	var test8 = 0x81;
	var test16 = 0x8001;
	var test32 = 0x80000001;

	// 20 bytes for the header, 2 null bytes for the "extension"
	var buffer = new Buffer(21);
	var headerOptions = {
		type: test4,
		version: test4,
		extension: test8, 
		connectionId: test16,
		timestamp: test32,
		timestampDiff: test32,
		windowSize: test32,
		sequenceNumber: test16,
		ackNumber: test16	
	};
	writeHeader(buffer, headerOptions);
	buffer[20] = 0;

	var packet = new uTP.Packet(buffer);
	console.log(packet);

	for(var field in headerOptions) {
		if(field === "extension") {
			t.equal(packet.hasExtensions, true, "hasExtension");
		} else {
			t.equal(packet[field], headerOptions[field], field);
		}
	}

	t.end();
});

test.skip('constructor', function (t) {
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
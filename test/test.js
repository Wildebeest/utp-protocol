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

// Pick numbers like 1001 in binary to test 
// that we're parsing the boundaries correctly.
var test4 = 0x9;
var test8 = 0x81;
var test16 = 0x8001;
var test32 = 0x80000001;

test("packet field parsing", function (t) {
	// 20 bytes for the header, 1 null byte for the "extension"
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
			t.ok(packet.extensions, "extensions should exist");
		} else {
			t.equal(packet[field], headerOptions[field], field);
		}
	}

	t.ok(packet.data, "data should exist");
	t.equal(packet.data.length, 0, "data should be empty");

	t.end();
});

test("packet extension parsing", function(t) {
	// 20 bytes for the header, 5 bytes for the "extension", 1 byte for termination
	var buffer = new Buffer(26);
	var headerOptions = {
		extension: 1
	};
	writeHeader(buffer, headerOptions);
	buffer[20] = 5; 	// extension type
	buffer[21] = 3; 	// length
	buffer[22] = 1;		
	buffer[23] = 0;
	buffer[24] = 1;
	buffer[25] = 0;		// null terminator

	var packet = new uTP.Packet(buffer);
	console.log(packet);

	t.ok(packet.extensions, "this packet has an extension map");

	var extensionBuffer = packet.extensions[5];
	t.ok(extensionBuffer, "the 5 extension should be defined");
	t.equal(extensionBuffer.length, 3, "the extension should be 3 bytes");
	t.equal(extensionBuffer[0], 1);
	t.equal(extensionBuffer[2], 1);
	t.equal(packet.data.length, 0, "data should be empty");

	t.end();
});

test("packet extension parsing with data", function(t) {
	// 20 bytes for the header, 5 bytes for the "extension", 1 byte for termination
	var buffer = new Buffer(26);
	var headerOptions = {
		extension: 1
	};
	writeHeader(buffer, headerOptions);
	buffer[20] = 5; 	// extension type
	buffer[21] = 1; 	// length
	buffer[22] = 1;		
	buffer[23] = 0;		// null terminator
	buffer[24] = 2;		
	buffer[25] = 3;		

	var packet = new uTP.Packet(buffer);
	console.log(packet);

	t.ok(packet.extensions, "this packet has an extension map");

	var extensionBuffer = packet.extensions[5];
	t.ok(extensionBuffer, "the 5 extension should be defined");
	t.equal(extensionBuffer.length, 1, "the extension should be 1 byte");
	t.equal(extensionBuffer[0], 1);
	t.equal(packet.data.length, 2, "data should be 2 bytes");
	t.equal(packet.data[0], 2);
	t.equal(packet.data[1], 3);

	t.end();
});

test("packet parsing with data and no extensions", function (t) {
	// 20 bytes for the header, 5 bytes for data
	var buffer = new Buffer(25);
	var headerOptions = {
		extension: 0
	};
	writeHeader(buffer, headerOptions);
	buffer[20] = 0;
	buffer[21] = 1;
	buffer[22] = 2;		
	buffer[23] = 3;	
	buffer[24] = 4;	

	var packet = new uTP.Packet(buffer);
	console.log(packet);

	t.notOk(packet.extensions, "this packet has no extension map");

	t.equal(packet.data.length, 5, "data should be 5 bytes");
	t.equal(packet.data[0], 0);
	t.equal(packet.data[1], 1);
	t.equal(packet.data[2], 2);
	t.equal(packet.data[3], 3);
	t.equal(packet.data[4], 4);

	t.end();
});

test("packet serialization with no data and no extensions", function (t) {
	var packet = new uTP.Packet();
	packet.type = test4;
	packet.version = test4 + 1;
	packet.connectionId = test16;
	packet.timestamp = test32;
	packet.timestampDiff = test32;
	packet.windowSize = test32;
	packet.sequenceNumber = test16;
	packet.ackNumber = test16;

	var buffer = packet.toBuffer();

	t.equal(buffer.length, 20, "buffer should only contain the header");
	t.equal(buffer[0] & 0xF, test4 + 1, "version");
	t.equal(buffer[0] >> 4, test4, "type");
	t.equal(buffer[1], 0, "extension");
	t.equal(buffer.readUInt16BE(2), test16, "connectionId");
	t.equal(buffer.readUInt32BE(4), test32, "timestamp");
	t.equal(buffer.readUInt32BE(8), test32, "timestampDiff");
	t.equal(buffer.readUInt32BE(12), test32, "windowSize");
	t.equal(buffer.readUInt16BE(16), test16, "sequenceNumber");
	t.equal(buffer.readUInt16BE(18), test16, "ackNumber");

	t.end();
});

test("packet serialization with some data and no extensions", function (t) {
	var packet = new uTP.Packet();
	var dataBuffer = new Buffer(10);
	dataBuffer.fill(1);
	packet.data = dataBuffer;

	var packetBuffer = packet.toBuffer();
	t.equal(packetBuffer.length, 30, "should be header and data");
	for(var i = 0; i < 10; i++) {
		t.equal(packetBuffer[20 + i], dataBuffer[i], "data should be equal");
	}

	t.end();
});

test("packet serialization with some data and some extensions", function (t) {
	var packet = new uTP.Packet();

	var dataBuffer = new Buffer(10);
	dataBuffer.fill(1);
	packet.data = dataBuffer;

	var extensionBuffer = new Buffer(10);
	extensionBuffer.fill(2);
	packet.extensions = {
		5: extensionBuffer
	};

	var packetBuffer = packet.toBuffer();
	t.equal(packetBuffer.length, 43, "should be long enough to hold header, data and extensions");

	t.equal(packetBuffer[20], 5, "extension is of type 5");
	t.equal(packetBuffer[21], 10, "the extension is of length 10");
	for(var i = 0; i < 10; i++) {
		t.equal(packetBuffer[22 + i], extensionBuffer[i], "extension should be equal");
	}
	t.equal(packetBuffer[32], 0, "the extension list should be null terminated");

	for(var i = 0; i < 10; i++) {
		t.equal(packetBuffer[33 + i], dataBuffer[i], "data should be equal");
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
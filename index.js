var inherits = require('inherits');
var stream = require('stream');
var dgram = require('dgram');
var net = require('net');

function rand16() {
	return Math.floor(Math.random() * 65535);
}

// Type constants
var PacketType = {
	Data: 0,
	Fin: 1,
	State: 2,
	Reset: 3,
	Syn: 4
};
var Version = 1;

function Packet(msg) {
	this.type = msg[0] >> 4;
	this.version = msg[0] & 0xF;
	this.hasExtensions = msg[1] !== 0;
	this.connectionId = msg.readUInt16BE(2);
	this.timestamp = msg.readUInt32BE(4);
	this.timestampDiff = msg.readUInt32BE(8);
	this.windowSize = msg.readUInt32BE(12);
	this.sequenceNumber = msg.readUInt16BE(16);
	this.ackNumber = msg.readUInt16BE(18);

	var dataIndex = 20;
	if(this.hasExtensions) {
		this.extensions = {};
		while (dataIndex < msg.length) {
			var extensionType = msg[dataIndex++];
			if(extensionType) {
				var extensionLength = msg[dataIndex++];
				this.extensions[extensionType] = msg.slice(dataIndex, dataIndex + extensionLength);
				dataIndex += extensionLength;
			} else {
				break;
			}
		}
	}

	this.data = msg.slice(dataIndex);
}
exports.Packet = Packet;

inherits(Connection, stream.Duplex);
function Connection (socket) {
	stream.Duplex.call(this);

	this._connectionId = rand16();
	this._currentWindow = 0;
	this._maxWindow = 0;
	this._windowSize = 0;
	this._replyMicroseconds = 0;
	this._sequenceNumber = 1;
	this._ackNumber = 0;

	this._socket = socket;
	socket.on('message', this._onMessage.bind(this));
}

Connection.prototype._writeMessage = function (type, dataBuffer, port, address, callback) {
	var messageBuffer = new Buffer(20 + ((dataBuffer && dataBuffer.length) || 0));

	messageBuffer.writeUInt8((type << 4) + Version, 0);
	messageBuffer.writeUInt8(0, 1); // extension
	messageBuffer.writeUInt16BE(this._connectionId, 2);
	messageBuffer.writeUInt32BE(this._replyMicroseconds, 8);
	messageBuffer.writeUInt32BE(16000, 12); // receive buffer size
	messageBuffer.writeUInt16BE(this._sequenceNumber, 16);
	messageBuffer.writeUInt16BE(this._ackNumber, 18);
	messageBuffer.writeUInt32BE(process.hrtime()[1], 4); // timestamp_microseconds, last to cut down on delay

	if(dataBuffer) {
		dataBuffer.copy(messageBuffer, 20);
	}

	console.log("sending packet");
	console.log(messageBuffer);

	this._socket.send(messageBuffer, 0, messageBuffer.length, port, address, callback);
};

Connection.prototype._onPacket = function (packet, rinfo) {
	if(packet.type === PacketType.Syn || (this._ackNumber + 1 === packet.sequenceNumber)) {
		switch(packet.type) {
			case PacketType.Syn:
				this._connectionId = packet.connectionId;
				break;
			case PacketType.Data:
				this.push(packet.data); 
				break;
			case PacketType.Fin:
				this.push(null);
				break;
		}

		this._ackNumber = packet.sequenceNumber;
		this._writeMessage(PacketType.State, null, rinfo.port, rinfo.address);
	}
			
};

// Readable implementation
Connection.prototype._read = function (size) {

}

// Writable implementation
Connection.prototype._write = function (chunk, encoding, callback) {

};
exports.Connection = Connection;

function Server (socket) {
	this._connections = { };
	this._socket = socket;
	socket.on('message', this._onMessage.bind(this));
}

Server.prototype.listen = function (port) {
	this.socket.bind(port);
};

Server.prototype._onMessage = function (msg, rinfo) {
	var packet = new Packet(msg);
	var connection = this._connections[packet.connectionId];

	if(connection) {
		connection._onPacket(packet, rinfo);
	} else {
		if(packet.type === PacketType.Syn) {
			// make new connection
		} else {
			// Send reset
		}
	}
};

exports.Server = Server;

exports.createServer = function () {
	var socket = dgram.createSocket("udp4");
	return new Server(socket);
};
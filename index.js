var inherits = require("inherits");
var stream = require("stream");
var dgram = require("dgram");
var net = require("net");
var EventEmitter = require("events").EventEmitter;

function rand16() {
	return Math.floor(Math.random() * 65535);
}

function next16(num) {
	return (num + 1) % 65536;
}

function getMicroseconds() {
	var hrTime = process.hrtime();
	return hrTime[1];
}

// Type constants
var PacketType = {
	Data: 0,
	Fin: 1,
	State: 2,
	Reset: 3,
	Syn: 4
};
exports.PacketType = PacketType;

function Packet(buffer) {
	if(buffer) {
		this.fromBuffer(buffer);
	}
}
Packet.prototype.type = PacketType.Data;
Packet.prototype.version = 1;
Packet.prototype.connectionId = 0;
Packet.prototype.timestamp = 0;
Packet.prototype.timestampDiff = 0;
Packet.prototype.windowSize = 0;
Packet.prototype.sequenceNumber = 0;
Packet.prototype.ackNumber = 0;
Packet.prototype.data = null;
Packet.prototype.timesSent = 0;

Packet.prototype.fromBuffer = function (msg) {
	this.type = msg[0] >> 4;
	this.version = msg[0] & 0xF;
	var hasExtensions = msg[1] !== 0;
	this.connectionId = msg.readUInt16BE(2);
	this.timestamp = msg.readUInt32BE(4);
	this.timestampDiff = msg.readUInt32BE(8);
	this.windowSize = msg.readUInt32BE(12);
	this.sequenceNumber = msg.readUInt16BE(16);
	this.ackNumber = msg.readUInt16BE(18);

	var dataIndex = 20;
	if(hasExtensions) {
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

	if(this.type === PacketType.Data) {
		this.data = msg.slice(dataIndex);
	}
};

Packet.prototype.toBuffer = function () {
	var self = this;

	var bufferLength = 20;
	if(self.extensions) {
		Object.keys(self.extensions).forEach(function (extensionType) {
			// Each extension has 2 bytes of header, and then the actual extension length.
			bufferLength += 2;
			bufferLength += self.extensions[extensionType].length;
		});

		// The extension list is null terminated, so we need to leave room for that.
		bufferLength++;
	}
	if(self.data) {
		bufferLength += self.data.length;
	}

	var buffer = new Buffer(bufferLength);

	buffer.writeUInt8((self.type << 4) + this.version, 0);
	buffer.writeUInt8(self.extensions ? 1 : 0, 1);
	buffer.writeUInt16BE(self.connectionId, 2);
	buffer.writeUInt32BE(self.timestamp, 4);
	buffer.writeUInt32BE(self.timestampDiff, 8);
	buffer.writeUInt32BE(self.windowSize, 12);
	buffer.writeUInt16BE(self.sequenceNumber, 16);
	buffer.writeUInt16BE(self.ackNumber, 18);

	var dataIndex = 20;
	if(self.extensions) {
		Object.keys(self.extensions).forEach(function (extensionType) {
			var extension = self.extensions[extensionType];
			buffer[dataIndex++] = extensionType;
			buffer[dataIndex++] = extension.length;
			extension.copy(buffer, dataIndex);
			dataIndex += extension.length;
		});
		// Null-terminate the extension list
		buffer[dataIndex++] = 0;
	}
	
	if(self.data) {
		self.data.copy(buffer, dataIndex);
	}

	return buffer;
};

exports.Packet = Packet;

var MaxPacketTimesSent = 5;

inherits(Connection, stream.Duplex);
function Connection (port, address, socket) {
	stream.Duplex.call(this);

	this._port = port;
	this._address = address;
	this._socket = socket;
	this._pendingPacket = null;
	this._retryTimeoutId = null;
}
Connection.prototype._connectionId = 0;
Connection.prototype._currentWindow = 0;
Connection.prototype._maxWindow = 0;
Connection.prototype._windowSize = 0;
Connection.prototype._replyMicroseconds = 0;
Connection.prototype._sequenceNumber = 1;
Connection.prototype._ackNumber = 0;
Connection.prototype._retryMs = 1000;

Connection.prototype._writeMessage = function (type, dataBuffer) {
	var packet = new Packet();
	
	packet.type = type;
	packet.connectionId = this._connectionId;
	packet.timestampDiff = this._replyMicroseconds;
	packet.windowSize = 16000;
	packet.sequenceNumber = this._sequenceNumber;
	packet.ackNumber = this._ackNumber;
	if(dataBuffer) {
		packet.data = dataBuffer;
	}
	packet.timestamp = getMicroseconds();

	if(type !== PacketType.State) {
		this._pendingPacket = packet;
	}

	this._sendPacket(packet);
};

Connection.prototype._sendPacket = function(packet) {
	if(packet.timesSent < MaxPacketTimesSent) {
		var packetBuffer = packet.toBuffer();
		this._socket.send(packetBuffer, 0, packetBuffer.length, this._port, this._address);
		if(!this._retryTimeoutId) {
			this._retryTimeoutId = setTimeout(this._retryMessage.bind(this), this._retryMs);
		}
		packet.timesSent++;
	} else {
		// Timeout the connection
	}
};

Connection.prototype._retryMessage = function () {
	if(this._pendingPacket) {
		this._sendPacket(this._pendingPacket);
	}
};

Connection.prototype._ackMessage = function (packet) {
	this._replyMicroseconds = Math.abs(getMicroseconds() - packet.timestamp);
	this._ackNumber = packet.sequenceNumber;
	this._writeMessage(PacketType.State);
};

Connection.prototype._onPacket = function (packet) {
	switch(packet.type) {
		case PacketType.Syn:
			this._connectionId = packet.connectionId;
			this._sequenceNumber = rand16();
			this._ackMessage(packet);
			break;
		case PacketType.State:
			if(this._pendingPacket && (packet.ackNumber === this._pendingPacket.sequenceNumber)) {
				clearTimeout(this._retryTimeoutId);
				this._retryTimeoutId = null;
				this._pendingPacket = null;
			}
			break;
		case PacketType.Data:
			if(next16(this._ackNumber) === packet.sequenceNumber) {
				this.push(packet.data);
				this._ackMessage(packet);
			}
			break;
		case PacketType.Fin:
			this.push(null);
			break;
	}		
};

Connection.prototype._connect = function () {
	this._writeMessage(PacketType.Syn);
};

// Readable implementation
Connection.prototype._read = function (size) {

};

// Writable implementation
Connection.prototype._write = function (chunk, encoding, callback) {

};
exports.Connection = Connection;

inherits(Server, EventEmitter);
function Server (socket) {
	EventEmitter.call(this);
	
	this._connections = { };
	this._socket = socket;
	socket.on("message", this._onMessage.bind(this));
}

Server.prototype.listen = function (port) {
	this.socket.bind(port);
};

Server.prototype._onMessage = function (msg, rinfo) {
	var packet = new Packet(msg);
	var connection = this._connections[packet.connectionId];

	if(!connection) {
		if(packet.type === PacketType.Syn) {
			var recvConnectionId = next16(packet.connectionId);
			if(!this._connections.hasOwnProperty(recvConnectionId)) {
				connection = new Connection(rinfo.port, rinfo.address, this._socket);
				this._connections[recvConnectionId] = connection;
				this.emit("connection", connection);
			}
		} else {
			// Send reset
		}
	}

	if(connection) {
		connection._onPacket(packet);
	}
};

Server.prototype._connect = function (port, address) {
	var connection = new Connection(port, address, this._socket);
	var connectionId = rand16();
	this._connections[connectionId] = connection;
	connection._connect(connectionId);
	return connection;
};

exports.Server = Server;

exports.createServer = function () {
	var socket = dgram.createSocket("udp4");
	return new Server(socket);
};

exports.createConnection = function (port, host, connectListener) {
	var server = exports.createServer();
	server.bind();
	return server._connect();
};
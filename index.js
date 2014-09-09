var inherits = require("inherits");
var stream = require("stream");
var dgram = require("dgram");
var net = require("net");

function rand16() {
	return Math.floor(Math.random() * 65535);
}

function getMicroseconds() {
	var hrTime = process.hrtime();
	return hrTime[0] * 1e9 + hrTime[1];
}

// Type constants
var PacketType = {
	Data: 0,
	Fin: 1,
	State: 2,
	Reset: 3,
	Syn: 4
};

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

	this.data = msg.slice(dataIndex);
};

Packet.prototype.toBuffer = function () {
	var _this = this;

	var bufferLength = 20;
	if(_this.extensions) {
		Object.keys(_this.extensions).forEach(function (extensionType) {
			// Each extension has 2 bytes of header, and then the actual extension length.
			bufferLength += 2;
			bufferLength += _this.extensions[extensionType].length;
		});

		// The extension list is null terminated, so we need to leave room for that.
		bufferLength++;
	}
	if(_this.data) {
		bufferLength += _this.data.length;
	}

	var buffer = new Buffer(bufferLength);

	buffer.writeUInt8((_this.type << 4) + this.version, 0);
	buffer.writeUInt8(_this.extensions ? 1 : 0, 1);
	buffer.writeUInt16BE(_this.connectionId, 2);
	buffer.writeUInt32BE(_this.timestamp, 4);
	buffer.writeUInt32BE(_this.timestampDiff, 8);
	buffer.writeUInt32BE(_this.windowSize, 12);
	buffer.writeUInt16BE(_this.sequenceNumber, 16);
	buffer.writeUInt16BE(_this.ackNumber, 18);

	var dataIndex = 20;
	if(_this.extensions) {
		Object.keys(_this.extensions).forEach(function (extensionType) {
			var extension = _this.extensions[extensionType];
			buffer[dataIndex++] = extensionType;
			buffer[dataIndex++] = extension.length;
			extension.copy(buffer, dataIndex);
			dataIndex += extension.length;
		});
		// Null-terminate the extension list
		buffer[dataIndex++] = 0;
	}
	
	if(_this.data) {
		_this.data.copy(buffer, dataIndex);
	}

	return buffer;
};

exports.Packet = Packet;

inherits(Connection, stream.Duplex);
function Connection (port, address, socket) {
	stream.Duplex.call(this);

	this._port = port;
	this._address = address;
	this._socket = socket;
}
Connection.prototype._connectionId = 0;
Connection.prototype._currentWindow = 0;
Connection.prototype._maxWindow = 0;
Connection.prototype._windowSize = 0;
Connection.prototype._replyMicroseconds = 0;
Connection.prototype._sequenceNumber = 1;
Connection.prototype._ackNumber = 0;

Connection.prototype._writeMessage = function (type, dataBuffer, callback) {
	var packet = new Packet();
	
	packet.type = type;
	packet.connectionId = this._connectionId;
	packet.timestampDiff = this._replyMicroseconds;
	packet.windowSize = 16000;
	packet.sequenceNumber = this._sequenceNumber;
	packet.ackNumber = this._ackNumber;
	packet.data = dataBuffer;
	packet.timestamp = getMicroseconds();

	var packetBuffer = packet.toBuffer();
	this._socket.send(packetBuffer, 0, packetBuffer.length, 
		this._port, this._address, callback);
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

		this._replyMicroseconds = Math.abs(getMicroseconds() - packet.timestamp);
		this._ackNumber = packet.sequenceNumber;
		this._writeMessage(PacketType.State);
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
			connection = new Connection(rinfo.port, rinfo.address, this._socket);
		} else {
			// Send reset
		}
	}

	if(connection) {
		connection._onPacket(packet, rinfo);
	}
};

exports.Server = Server;

exports.createServer = function () {
	var socket = dgram.createSocket("udp4");
	return new Server(socket);
};
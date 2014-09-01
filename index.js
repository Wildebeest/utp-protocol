module.exports = uTP;

var inherits = require('inherits');
var stream = require('stream');
var dgram = require('dgram');

inherits(uTP, stream.Duplex);

// Type constants
var PacketType = {
	Data: 0,
	Fin: 1,
	State: 2,
	Reset: 3,
	Syn: 4
};

var Version = 1;

function rand16() {
	return Math.floor(Math.random() * 65535);
}

function uTP (socket) {
	stream.Duplex.call(this);

	this._connectionId = rand16();
	this._currentWindow = 0;
	this._maxWindow = 0;
	this._windowSize = 0;
	this._replyMicroseconds = 0;
	this._sequenceNumber = 1;
	this._ackNumber = 0;

	this._incomingPackets = {};

	this._socket = socket;
	socket.on('message', this._onMessage.bind(this));
}

uTP.prototype._writeMessage = function (type, dataBuffer, port, address, callback) {
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

function Packet(msg) {
	this.packetType = msg[0] >> 4;
	this.hasExtensions = msg[1] !== 0;
	this.connectionId = msg.readUInt16BE(2);
	this.timestamp = msg.readUInt32BE(4);
	this.timestampDiff = msg.readUInt32BE(8);
	this.windowSize = msg.readUInt32BE(12);
	this.sequenceNumber = msg.readUInt16BE(16);
	this.ackNumber = msg.readUInt16BE(18);
}

uTP.prototype._onMessage = function (msg, rinfo) {
	var packet = new Packet(msg);

	console.log("packet: %j", packet);

	var dataIndex = 20;
	if(packet.hasExtensions) {
		while (dataIndex + 1 < buffer.length) {
			var extensionType = msg[dataIndex];
			var extensionLength = msg[dataIndex + 1];
			
			if(extensionType) {
				// TODO: handle the extension
				dataIndex += extensionLength;
			} else {
				break;
			}
		}
	}

	if(packet.packetType === PacketType.Syn || (this._ackNumber + 1 === packet.sequenceNumber)) {
		switch(packet.packetType) {
			case PacketType.Syn:
				this._connectionId = packet.connectionId;
				break;
			case PacketType.Data:
				this.push(msg.slice(dataIndex)); 
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
uTP.prototype._read = function (size) {

}

// Writable implementation
uTP.prototype._write = function (chunk, encoding, callback) {

};
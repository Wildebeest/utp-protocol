var uTP = require("./");
var connection = uTP.createConnection(1337, "127.0.0.1");
process.stdin.pipe(connection);
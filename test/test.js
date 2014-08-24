var uTP = require('../');
var test = require('tape');

test('constructor', function (t) {
	t.plan(1);

	var stream = new uTP();
	t.ok(stream);
});
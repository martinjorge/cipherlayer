var world = require('../support/world');
var assert = require('assert');

module.exports = function () {
	this.Then(/^the response status code is (\d+)$/, function (statusCode, callback) {
		assert.equal(world.getResponse().statusCode, statusCode);
		callback();
	});
};

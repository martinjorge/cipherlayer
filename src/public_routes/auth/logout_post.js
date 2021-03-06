'use strict';

var sessionRequest = require('./session');
var log = require('../../logger/service.js');

module.exports = function (req, res, next) {
	var tokenInfo = req.tokenInfo;
	var userId = tokenInfo.userId;
	var deviceId = tokenInfo.data.deviceId;
	var userAgent = String(req.headers['user-agent']);

	sessionRequest(deviceId, userId, 'DELETE', userAgent, function (err, result) {
		if (err) {
			log.error({err: err, result: result}, 'RemoveDeviceResponse');
			res.send(500, {err: 'internal_session_error', des: 'unable to close session'});
			return next(false);
		}
		res.send(204);
		return next();
	});
};

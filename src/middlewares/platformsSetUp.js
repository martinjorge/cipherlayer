var SFPlatform = require('../platforms/salesforce.js');

function platformsSetUp(req, res, next) {
	if (!req.user.platforms) {
		return next();
	} else {
		req.user.platforms.forEach(function (platform) {
			if (platform.platform === 'sf') {
				SFPlatform.renewSFAccessTokenIfNecessary(req.user, platform, function (err, accessToken) {
					if (err) {
						res.send(401, {
							err: 'Could not renew SF token',
							des: 'Unable to renew sales force access token, got error: ' + err
						});
						return next(false);
					}
					req.options.headers['x-sf-data'] = JSON.stringify({
						userId: platform.accessToken.params.id,
						accessToken: accessToken,
						instanceUrl: platform.accessToken.params.instance_url
					});
					return next();
				});
			}
			if (platform.platform === 'in') {
				req.options.headers['x-in-data'] = JSON.stringify({
					accessToken: platform.accessToken
				});
				return next();
			}
		});
	}
}

module.exports = platformsSetUp;

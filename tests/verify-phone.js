var assert = require('assert');
var async = require('async');
var request = require('request');
var nock = require('nock');
var clone = require('clone');
var fs = require('fs');
var config = JSON.parse(fs.readFileSync('config.json','utf8'));

var dao = require('../dao');
var cipherlayer = require('../cipherlayer');
var redisMng = require('../managers/redis');

var HEADERS_WITHOUT_AUTHORIZATION_BASIC = {
    'Content-Type': 'application/json; charset=utf-8'
};

describe('/api/profile (verify phone)', function(){

    var notifServiceURL = config.services.notifications;

    beforeEach(function(done){
        async.series([
            function(done){
                cipherlayer.start(config.public_port, config.private_port, done);
            },
            function(done){
                redisMng.deleteAllKeys(done);
            },
            function(done){
                dao.deleteAllUsers(done);
            },
        ], done);
    });

    afterEach(function(done){
        async.series([
            function(done){
                cipherlayer.stop(done);
            }
        ],done);
    });

    it('POST phone not verified', function(done){
        var user = {
            email : "valid@my-comms.com",
            password : "12345678",
            phone : "111111111"
        };

        var options = {
            url: 'http://localhost:' + config.public_port + config.passThroughEndpoint.path,
            headers: clone(HEADERS_WITHOUT_AUTHORIZATION_BASIC),
            method:'POST',
            body : JSON.stringify(user)
        };

        nock(notifServiceURL)
            .post('/notification/sms')
            .reply(204);

        request(options, function(err, res, body){
            assert.equal(err, null, body);
            assert.equal(res.statusCode, 403, body);
            body = JSON.parse(body);
            assert.deepEqual(body, {"err":"auth_proxy_error","des":"user phone not verified"}, body);
            done();
        });
    });

    it('POST incorrect PIN sended (1 attempt)', function(done){
        var user = {
            email : "valid@my-comms.com",
            password : "12345678",
            phone : "222222222"
        };

        var options = {
            url: 'http://localhost:' + config.public_port + config.passThroughEndpoint.path,
            headers: clone(HEADERS_WITHOUT_AUTHORIZATION_BASIC),
            method:'POST',
            body : JSON.stringify(user)
        };

        nock(notifServiceURL)
            .post('/notification/sms')
            .reply(204);

        //1st call must create the pin
        request(options, function(err, res, body){
            assert.equal(err, null, body);
            assert.equal(res.statusCode, 403, body);

            nock(notifServiceURL)
                .post('/notification/sms')
                .reply(204);

            options.headers['x-otp-pin'] = 'zzzz';

            //2nd call incorrect pin
            request(options, function(err, res, body) {
                assert.equal(err, null, body);
                assert.equal(res.statusCode, 401, body);
                body = JSON.parse(body);
                assert.deepEqual(body, {"err":"invalid_pin","des":"PIN used is not valid."}, body);
                done();
            });
        });
    });

    it('POST correct PIN sended', function(done){
        this.timeout(10000);

        var user = {
            email : "valid@my-comms.com",
            password : "12345678",
            phone : "333333333"
        };

        var options = {
            url: 'http://localhost:' + config.public_port + config.passThroughEndpoint.path,
            headers: clone(HEADERS_WITHOUT_AUTHORIZATION_BASIC),
            method:'POST',
            body : JSON.stringify(user)
        };

        nock(notifServiceURL)
            .post('/notification/sms')
            .reply(204);

        //1st call must create the pin
        request(options, function(err, res, body){
            assert.equal(err, null, body);
            assert.equal(res.statusCode, 403, body);

            var redisKey = config.redisKeys.user_phone_verify.key;
            redisKey = redisKey.replace('{username}',user.email).replace('{phone}',user.phone);

            redisMng.getKeyValue(redisKey + '.pin', function(err, redisPhonePin) {
                assert.equal(err, null);

                options.headers['x-otp-pin'] = redisPhonePin;

                nock(notifServiceURL)
                    .post('/notification/sms')
                    .reply(204);

                var expectedUserId = 'a1b2c3d4e5f6';

                nock('http://localhost:' + config.private_port)
                    .post(config.passThroughEndpoint.path)
                    .reply(201, {id: expectedUserId});

                //2nd call correct pin
                request(options, function(err, res, body) {
                    assert.equal(err, null, body);
                    assert.equal(res.statusCode, 201, body);
                    body = JSON.parse(body);
                    assert.notEqual(body.accessToken, null, body);
                    assert.notEqual(body.refreshToken, null, body);
                    assert.notEqual(body.expiresIn, null, body);
                    done();
                });

            });

        });
    });

    it('POST incorrect PIN sended (3 attempts)', function(done){
        var user = {
            email : "valid@my-comms.com",
            password : "12345678",
            phone : "444444444"
        };

        var options = {
            url: 'http://localhost:' + config.public_port + config.passThroughEndpoint.path,
            headers: clone(HEADERS_WITHOUT_AUTHORIZATION_BASIC),
            method:'POST',
            body : JSON.stringify(user)
        };

        nock(notifServiceURL)
            .post('/notification/sms')
            .reply(204);

        //1st call must create the pin
        request(options, function(err, res, body){
            assert.equal(err, null, body);
            assert.equal(res.statusCode, 403, body);

            nock(notifServiceURL)
                .post('/notification/sms')
                .reply(204);

            var redisKey = config.redisKeys.user_phone_verify.key;
            redisKey = redisKey.replace('{username}',user.email).replace('{phone}',user.phone);

            //Get the correct PIN
            redisMng.getKeyValue(redisKey + '.pin', function(err, redisPhonePin) {
                assert.equal(err, null);

                options.headers['x-otp-pin'] = 'zzzz';

                //1st call incorrect pin
                request(options, function (err, res, body) {
                    assert.equal(err, null, body);
                    assert.equal(res.statusCode, 401, body);
                    body = JSON.parse(body);
                    assert.deepEqual(body, {"err": "invalid_pin", "des": "PIN used is not valid."}, body);

                    //2nd call incorrect pin
                    request(options, function (err, res, body) {
                        assert.equal(err, null, body);
                        assert.equal(res.statusCode, 401, body);
                        body = JSON.parse(body);
                        assert.deepEqual(body, {"err": "invalid_pin", "des": "PIN used is not valid."}, body);

                        //3rd call incorrect pin
                        request(options, function (err, res, body) {
                            assert.equal(err, null, body);
                            assert.equal(res.statusCode, 401, body);
                            body = JSON.parse(body);
                            assert.deepEqual(body, {"err":"pin_expired","des":"PIN used has expired."}, body);

                            options.headers['x-otp-pin'] = redisPhonePin;

                            //4th call incorrect (expired pin)
                            request(options, function (err, res, body) {
                                assert.equal(err, null, body);
                                assert.equal(res.statusCode, 401, body);
                                body = JSON.parse(body);
                                assert.deepEqual(body, {"err": "invalid_pin", "des": "PIN used is not valid."}, body);

                                //Get the correct PIN
                                redisMng.getKeyValue(redisKey + '.pin', function (err, redisPhonePin) {
                                    assert.equal(err, null);

                                    options.headers['x-otp-pin'] = redisPhonePin;

                                    nock(notifServiceURL)
                                        .post('/notification/sms')
                                        .reply(204);

                                    var expectedUserId = 'a1b2c3d4e5f6';

                                    nock('http://localhost:' + config.private_port)
                                        .post(config.passThroughEndpoint.path)
                                        .reply(201, {id: expectedUserId});

                                    //5th call actualized correct pin
                                    request(options, function (err, res, body) {
                                        assert.equal(err, null, body);
                                        assert.equal(res.statusCode, 201, body);
                                        body = JSON.parse(body);
                                        assert.notEqual(body.accessToken, null, body);
                                        assert.notEqual(body.refreshToken, null, body);
                                        assert.notEqual(body.expiresIn, null, body);
                                        done();
                                    });

                                });
                            });
                        });
                    });
                });

            });
        });
    });

    it('POST user already exists', function(done){
        this.timeout(10000);

        var user = {
            email : "valid@my-comms.com",
            password : "12345678",
            phone : "555555555"
        };

        var options = {
            url: 'http://localhost:' + config.public_port + config.passThroughEndpoint.path,
            headers: clone(HEADERS_WITHOUT_AUTHORIZATION_BASIC),
            method:'POST',
            body : JSON.stringify(user)
        };

        nock(notifServiceURL)
            .post('/notification/sms')
            .reply(204);

        //1st call must create the pin
        request(options, function(err, res, body){
            assert.equal(err, null, body);
            assert.equal(res.statusCode, 403, body);

            var redisKey = config.redisKeys.user_phone_verify.key;
            redisKey = redisKey.replace('{username}',user.email).replace('{phone}',user.phone);

            redisMng.getKeyValue(redisKey + '.pin', function(err, redisPhonePin) {
                assert.equal(err, null);

                options.headers['x-otp-pin'] = redisPhonePin;

                nock(notifServiceURL)
                    .post('/notification/sms')
                    .reply(204);

                var expectedUserId = 'a1b2c3d4e5f6';

                nock('http://localhost:' + config.private_port)
                    .post(config.passThroughEndpoint.path)
                    .reply(201, {id: expectedUserId});

                //2nd call correct pin
                request(options, function(err, res, body) {
                    assert.equal(err, null, body);
                    assert.equal(res.statusCode, 201, body);
                    body = JSON.parse(body);
                    assert.notEqual(body.accessToken, null, body);
                    assert.notEqual(body.refreshToken, null, body);
                    assert.notEqual(body.expiresIn, null, body);

                    request(options, function (err, res, body) {
                        assert.equal(err, null, body);
                        assert.equal(res.statusCode, 403, body);
                        body = JSON.parse(body);
                        assert.deepEqual(body, {"err":"auth_proxy_error","des":"user already exists"}, body);
                        done();
                    });
                });

            });

        });
    });


});
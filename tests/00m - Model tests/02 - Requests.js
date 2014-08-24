var api = require('../../model');
var assert = require('chai').assert;

describe('Model events', function () {
	it('api.open', function (done) {
		api.setRequestFunction(function (params, callback) {
			assert.deepEqual(params.url, 'http://example.com/test');
			assert.deepEqual(params.method, 'GET');
			
			setTimeout(function () {
				callback(null, '{"foo":"bar"}');
			}, 10);
		});
		
		api.open('http://example.com/test', function (error, model) {
			assert.isNull(error);
			assert.isTrue(api.is(model));
			
			api.setRequestFunction(null);
			done();
		});
	});

	it('api.create with schema error', function (done) {
		api.setRequestFunction(function (params, callback) {
			assert.deepEqual(params.url, 'http://example.com/schemas/test');
			assert.deepEqual(params.method, 'GET');
			
			setTimeout(function () {
				callback(new Error('foo'));
			}, 10);
		});
		
		api.create({}, null, 'http://example.com/schemas/test', function (error, model) {
			assert.isNull(error);
			assert.isTrue(api.is(model));
			var errors = model.schemaErrors();
			
			api.setRequestFunction(null);
			done();
		});
	});
});
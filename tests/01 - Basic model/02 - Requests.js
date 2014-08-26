var api = require('../../');
var assert = require('chai').assert;

describe('Requests', function () {
	afterEach(function(){
		api.clean();
	});

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
			var errors = model.errors();
			assert.deepEqual(errors.length, 0);
			errors = model.errors(true);
			assert.deepEqual(errors.length, 1);
			assert.deepEqual(errors[0].code, api.ErrorCodes.SCHEMA_FETCH_ERROR);
			
			done();
		});
	});
});
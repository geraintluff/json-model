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
				callback(null, '{"foo":"bar"}', 200, {'X-Foo': 'Bar, Baz'});
			}, 10);
		});
		
		var openResult = api.open('http://example.com/test', function (error, model) {
			assert.isNull(error);
			assert.isTrue(api.is(model));
			assert.equal(model, openResult, 'immediate result is same model');

			assert.deepEqual(model.httpStatus(), 200);
			assert.deepEqual(model.httpHeaders(), {'x-foo': 'Bar, Baz'});
			assert.deepEqual(model.httpHeaders(true), {'x-foo': ['Bar', 'Baz']});
			assert.deepEqual(model.httpHeader('not-present'), null);
			assert.deepEqual(model.httpHeader('X-fOo'), 'Bar, Baz');
			assert.deepEqual(model.httpHeader('X-fOo', true), ['Bar', 'Baz']);
			
			var iterated1 = {};
			model.httpHeaders(function (key, value) {
				iterated1[key] = value;
			});
			assert.deepEqual(iterated1, model.httpHeaders());
			var iterated2 = {};
			model.httpHeaders(function (key, value) {
				iterated2[key] = value;
			}, true);
			assert.deepEqual(iterated2, model.httpHeaders(true));
			
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
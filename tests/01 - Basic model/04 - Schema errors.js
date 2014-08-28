var api = require('../../');
var assert = require('chai').assert;

describe('Schema errors', function () {
	afterEach(function(done){
		api.clean(done);
	});
	
	it('filters correctly', function (done) {
		api.setRequestFunction(function (params, callback) {
			setTimeout(function () {
				callback(null, {});
				
				done();
			}, 10);
		});
	
		var model = api.create({foo: 'bar', 'baz': 'bing'}, null, {
			properties: {
				'foo': {type: 'number'},
				'baz': {
					type: 'string',
					allOf: [{$ref: '/schemas/other' + Math.random()}]
				}
			}
		});
		
		assert.equal(model.errors().length, 1, 'one plain error 1');
		assert.equal(model.errors(false).length, 1, 'one plain error 2');
		assert.equal(model.errors(true).length, 2, 'two errors 3');
		assert.equal(model.errors(false, true).length, 0, 'no errors 4');
		assert.equal(model.errors(true, true).length, 0, 'no errors 5');

		assert.equal(model.errors('foo').length, 1, 'one plain error 6');
		assert.equal(model.errors('foo', false).length, 1, 'one plain error 7');
		assert.equal(model.errors('foo', true).length, 1, 'one plain error 8');
		assert.equal(model.errors('foo', false, true).length, 1, 'one plain error 9');
		assert.equal(model.errors('foo', true, true).length, 1, 'one plain errror 10');

		assert.equal(model.errors('baz').length, 0, 'no plain error 11');
		assert.equal(model.errors('baz', false).length, 0, 'no plain error 12');
		assert.equal(model.errors('baz', true).length, 1, 'one error 13');
		assert.equal(model.errors('baz', false, true).length, 0, 'no error 14');
		assert.equal(model.errors('baz', true, true).length, 1, 'one errror 15');
	});
	
	it('fetch errors', function (done) {
		api.setRequestFunction(function (params, callback) {
			setTimeout(function () {
				callback(new Error('foo'));
			});
		});
		
		var otherSchema = "/schemas/other" + Math.random();
	
		var model = api.create({foo:'bar'}, null, {
			oneOf: [
				{},
				{"$ref": otherSchema}
			]
		}, function (error, m) {
			assert.equal(model, m);

			assert.equal(model.errors().length, 1, 'one plain error 7');
			assert.equal(model.errors()[0].code, 12, 'correct code 8');
			assert.equal(model.errors(true).length, 2, 'two errors 9');
			assert.isTrue(model.errors(true)[0].code == 12 || model.errors(true)[0].code == 701, 'correct code 10');
			assert.isTrue(model.errors(true)[1].code == 12 || model.errors(true)[1].code == 701, 'correct code 11');
			assert.notEqual(model.errors(true)[0].code, model.errors(true)[1].code, 'codes not equal 12');
			
			done();
		});
		
		assert.equal(model.errors().length, 1, 'one plain error 1');
		assert.equal(model.errors()[0].code, 12, 'correct code 2');
		assert.equal(model.errors(true).length, 2, 'two errors 3');
		assert.isTrue(model.errors(true)[0].code == 12 || model.errors(true)[0].code == 700, 'correct code 4');
		assert.isTrue(model.errors(true)[1].code == 12 || model.errors(true)[1].code == 700, 'correct code 5');
		assert.notEqual(model.errors(true)[0].code, model.errors(true)[1].code, 'codes not equal 6');
	});
});
var api = require('../../model');
var assert = require('chai').assert;

describe('Model', function () {
	it('creation, set/get', function () {
		var model = api.create({foo:'bar'});
		
		assert.deepEqual(model.get('foo'), 'bar');
		assert.deepEqual(model.get('/foo'), 'bar');
		model.set('/foo', 'baz');
		assert.deepEqual(model.get('foo'), 'baz');
	});
	
	it('has prop(), keys()', function () {
		var model = api.create({foo:'bar'});
		
		assert.deepEqual(model.keys(), ['foo']);
		assert.deepEqual(model.get('foo'), model.prop('foo').get());
	});

	it('has item(), length()', function () {
		var model = api.create([0, 1, 2]);
		
		assert.deepEqual(model.length(), 3);
		assert.deepEqual(model.get(1), model.item(1).get());
	});

	it('has path()', function () {
		var model = api.create([0, 1, 2]);
		
		assert.equal(model.path('/0'), model.item(0));
	});
	
	it('schemas', function () {
		var schemaUrl = '/schemas/test' + Math.random();
		api.tv4.addSchema(schemaUrl, {
			type: 'object', 
			properties: {
				'foo': {type: 'string'},
				'bar': {type: 'integer'}
			}
		});
		
		var model = api.create({foo: 'hello'}, [schemaUrl]);
		
		assert.deepEqual(model.schemas(), [schemaUrl]);
		assert.deepEqual(model.schemas('foo'), [schemaUrl + '#/properties/foo']);
		assert.deepEqual(model.schemas('foo'), model.prop('foo').schemas());
	});

	it('toJSON()', function () {
		var model = api.create({foo: 'hello'});
		
		assert.deepEqual(JSON.stringify(model), JSON.stringify(model.get()));
	});

	it('api.extend()', function () {
		var model = api.create({foo: 'hello'});
		
		api.extend({
			foo: function () {return 'bar';}
		});
		
		assert.equal(model.foo(), 'bar');
	});
});
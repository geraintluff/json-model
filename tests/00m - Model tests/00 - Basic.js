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
	
	it('has prop()', function () {
		
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
});
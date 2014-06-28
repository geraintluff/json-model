var api = require('../../model');
var assert = require('chai').assert;

describe('Model events', function () {
	it('trigger change', function () {
		var model = api.create({foo:'bar'});
		
		var changeArguments = [];
		model.on('change', function (pointer, value) {
			assert.equal(this, model);
			changeArguments.push([pointer, value]);
		});
		
		model.set('/foo', 'baz');
		assert.deepEqual(changeArguments, [['/foo', 'baz']]);
	});

	it('triggers change in child when child changed', function () {
		var model = api.create({foo:'bar'});
		
		var changeArguments = [];
		model.on('change', function (pointer, value) {
			changeArguments.push([this, pointer, value]);
		});
		model.prop('foo').on('change', function (pointer, value) {
			changeArguments.push([this, pointer, value]);
		});
		
		model.set('/foo', 'baz');
		assert.deepEqual(changeArguments, [[model, '/foo', 'baz'], [model.prop('foo'), '', 'baz']]);
	});

	it('triggers change in child when parent changed', function () {
		var model = api.create({foo:'bar'});
		
		var changeArguments = [];
		model.on('change', function (pointer, value) {
			changeArguments.push([this, pointer, value]);
		});
		model.prop('foo').on('change', function (pointer, value) {
			changeArguments.push([this, pointer, value]);
		});
		
		model.set({foo: 'baz'});
		assert.deepEqual(changeArguments, [[model, '', {foo: 'baz'}], [model.prop('foo'), '', 'baz']]);
	});

	it('triggers schema change', function () {
		var schemaUrl = '/schemas/test' + Math.random();
		api.tv4.addSchema(schemaUrl, {
			oneOf: [
				{
					properties: {
						"foo": {"type": "string"}
					}
				},
				{
					properties: {
						"foo": {"type": "integer"}
					}
				}
			]
		});
	
		var model = api.create({foo:'bar'}, [schemaUrl]);
		
		var changeArguments = [];
		model.on('schemachange', function (added, removed) {
			changeArguments.push([this, added, removed]);
		});
		model.prop('foo').on('schemachange', function (added, removed) {
			changeArguments.push([this, added, removed]);
		});
		
		model.set({foo: 123});
		assert.deepEqual(changeArguments, [
			[model, [schemaUrl + '#/oneOf/1'], [schemaUrl + '#/oneOf/0']],
			[model.prop('foo'), [schemaUrl + '#/oneOf/1/properties/foo'], [schemaUrl + '#/oneOf/0/properties/foo']]
		]);
	});
});
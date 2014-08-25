var api = require('../../');
var assert = require('chai').assert;

describe('Model events', function () {
	it('trigger change', function () {
		var model = api.create({foo:'bar'});
		
		var changeArguments = [];
		model.on('change', function () {
			assert.equal(this, model);
			changeArguments.push([this].concat(Array.prototype.slice.call(arguments, 0)));
		});
		
		model.set('/foo', 'baz');
		assert.deepEqual(changeArguments, [[model, '/foo']]);
	});

	it('triggers change in child when child changed', function () {
		var model = api.create({foo:'bar'});
		
		var changeArguments = [];
		model.on('change', function (pointer, value) {
			changeArguments.push([this].concat(Array.prototype.slice.call(arguments, 0)));
		});
		model.prop('foo').on('change', function (pointer, value) {
			changeArguments.push([this].concat(Array.prototype.slice.call(arguments, 0)));
		});
		
		model.set('/foo', 'baz');
		assert.deepEqual(changeArguments, [[model, '/foo'], [model.prop('foo'), '']]);
	});

	it('triggers change in child when parent changed', function () {
		var model = api.create({foo:'bar'});
		
		var changeArguments = [];
		model.on('change', function () {
			changeArguments.push([this].concat(Array.prototype.slice.call(arguments, 0)));
		});
		model.prop('foo').on('change', function () {
			changeArguments.push([this].concat(Array.prototype.slice.call(arguments, 0)));
		});
		
		model.set({foo: 'baz'});
		assert.deepEqual(changeArguments, [[model, ''], [model.prop('foo'), '']]);
	});

	it('triggers schema change', function () {
		var schemaUrl = '/schemas/test' + Math.random();
		api.generator.addSchema(schemaUrl, {
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
		model.on('schemachange', function () {
			changeArguments.push([this].concat(Array.prototype.slice.call(arguments, 0)));
		});
		model.prop('foo').on('schemachange', function () {
			changeArguments.push([this].concat(Array.prototype.slice.call(arguments, 0)));
		});
		
		model.set({foo: 123});
		assert.deepEqual(changeArguments, [
			[model, [schemaUrl + '#/oneOf/1'], [schemaUrl + '#/oneOf/0']],
			[model.prop('foo'), [schemaUrl + '#/oneOf/1/properties/foo'], [schemaUrl + '#/oneOf/0/properties/foo']]
		]);
	});
});
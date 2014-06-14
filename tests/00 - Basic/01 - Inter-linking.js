var api = require('../../');
var assert = require('chai').assert;

describe('Interlinking', function () {
	it('produces reference', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"type": "object"}
			}
		};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;
		var Bar = classes['/demo#/properties/bar'];

		assert.isFunction(Bar);
		
		var demo = new Demo({
			foo: 1,
			bar: {a: 'A'}
		});
		assert.deepEqual(demo.bar, {a: 'A'});
		assert.instanceOf(demo.bar, Bar);
	});

	it('handles recursion', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {
					"type": "object",
					"properties": {
						"baz": {"$ref": "#"}
					}
				}
			}
		};
		
		var code = api.Generator().addSchema('/demo', schema, 'Demo').code();
		console.log(code);
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var demo = new Demo({
			foo: 1,
			bar: {
				baz: {foo: 2}
			}
		});
		assert.instanceOf(demo, Demo);
		assert.instanceOf(demo.bar.baz, Demo);
	});
});
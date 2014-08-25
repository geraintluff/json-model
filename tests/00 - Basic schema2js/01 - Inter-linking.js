var api = require('../../').schema2js;
var assert = require('chai').assert;

describe('Interlinking', function () {
	it('produces class for property', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"type": "object", "additionalProperties": true}
			}
		};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;
		var DemoPropertiesBar = classes.DemoPropertiesBar;

		assert.isFunction(DemoPropertiesBar);
		
		var demo = new Demo({
			foo: 1,
			bar: {a: 'A'}
		});
		assert.deepEqual(demo.bar, {a: 'A'});
		assert.instanceOf(demo.bar, DemoPropertiesBar);
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
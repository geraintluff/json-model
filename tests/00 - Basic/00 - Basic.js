var api = require('../../');
var assert = require('chai').assert;

describe('Basic shape', function () {
	it('produces class', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"type": "string"}
			}
		};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;

		assert.isFunction(Demo);
		assert.deepEqual(Demo.schemaUrl, '/demo');
	});

	it('assigns properties', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"type": "string"}
			}
		};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		var demo = Demo({foo:1, bar:'baz'});

		assert.deepEqual(demo, {foo:1, bar:'baz'});
	});

	it('uses defaults', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"type": "string"}
			},
			"default": {"foo": 1}
		};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		var demo = Demo();

		assert.deepEqual(demo, {foo:1});
	});
	
	it('uses property defaults', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"type": "string", 'default': "hello"}
			}
		};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		var demo = Demo({foo:1});

		assert.deepEqual(demo, {foo:1, bar:'hello'});
	});
});
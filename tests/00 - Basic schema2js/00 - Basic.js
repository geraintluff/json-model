var api = require('../../').schema2js;
var assert = require('chai').assert;

describe('Basic shape', function () {
	it('produces class', function () {
		var schema = {
			"title": "Demo schema",
			"description": "A simple schema to test the library",
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"type": "string"}
			}
		};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;

		assert.isFunction(Demo);
		assert.deepEqual(Demo.schema, '/demo');
		assert.deepEqual(Demo.title, 'Demo schema');
		assert.deepEqual(Demo.description, 'A simple schema to test the library');
	});

	it('produces "Anonymous" without URL', function () {
		var schema = {
			"title": "Demo schema",
			"description": "A simple schema to test the library",
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"type": "string"}
			}
		};
		
		var classes = api.Generator().addSchema(schema).classes();
		assert.isFunction(classes.Anonymous);
	});
	
	it('follows inheritance', function () {
		var schema = {
			"type": "object"
		};
		
		function SuperClass() {};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes(SuperClass);
		var Demo = classes.Demo;
		assert.instanceOf(Demo.prototype, SuperClass);
	});

	it('lists missing references', function () {
		var schema = {
			"title": "Demo schema",
			"description": "A simple schema to test the library",
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"$ref": "/schemas/bar"}
			}
		};
		
		var generator = api.Generator().addSchema('/demo', schema, 'Demo');

		var missing = generator.missing();
		assert.deepEqual(missing, ['/schemas/bar'])
		assert.isTrue(generator.missing('/schemas/bar'), 'missing /schemas/bar');
		assert.isTrue(generator.missing('/demo'), 'missing /demo');
		assert.isTrue(generator.missing('/somewhere/else'), 'missing /somewhere/else');
	});
	
	it('lists missing references from fetched schema', function () {
		var schema = {
			"title": "Demo schema",
			"description": "A simple schema to test the library",
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"$ref": "/schemas/bar"}
			}
		};
		
		var generator = api.Generator().addSchema('/demo');

		var missing = generator.missing();
		assert.deepEqual(missing, ['/demo'], '/demo missing');

		generator.addSchema('/demo', schema);
		assert.deepEqual(missing, ['/demo'], '/demo still missing');

		var code = generator.code();
		assert.isTrue(generator.missing('/schemas/bar'), 'missing /schemas/bar');
		assert.isFalse(generator.missing('/demo'), 'missing /demo');
		assert.isTrue(generator.missing('/somewhere/else'), 'missing /somewhere/else');
	});

	it('assigns additionalProperties', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "integer"},
				"bar": {"type": "string"}
			},
			"additionalProperties": true
		};

		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		var demo = Demo({foo:1, bar:'baz', extraProperty:true});

		assert.deepEqual(demo, {foo:1, bar:'baz', extraProperty:true});
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
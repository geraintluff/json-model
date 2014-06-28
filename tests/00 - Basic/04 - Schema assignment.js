var api = require('../../');
var assert = require('chai').assert;

describe('Schema assignment', function () {
	it('assigns properties (when valid)', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "string"},
				"bar": {"type": "integer"}
			},
			"additionalProperties": {"type": "boolean"}
		};

		var classes = api.Generator({assignment: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate({foo: "hello", bar: 123, extra: true});
		
		assert.isObject(validation.schemas);
		assert.include(validation.schemas[''], '');
		assert.include(validation.schemas['/foo'], '#/properties/foo');
		assert.include(validation.schemas['/bar'], '#/properties/bar');
		assert.include(validation.schemas['/extra'], '#/additionalProperties');
	});

	it('assigns properties (when invalid)', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "string"},
				"bar": {"type": "integer"}
			},
			"additionalProperties": {"type": "boolean"}
		};

		var classes = api.Generator({assignment: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate({foo: "hello", bar: "should be an integer", extra: true});
		
		assert.isObject(validation.schemas);
		assert.include(validation.schemas[''], '');
		assert.include(validation.schemas['/foo'], '#/properties/foo');
		assert.include(validation.schemas['/bar'], '#/properties/bar');
		assert.include(validation.schemas['/extra'], '#/additionalProperties');
	});
	
	it('assigns items (when valid)', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "array", "items": {"$ref": "#/definitions/items"}}
			},
			"definitions": {
				"items": {"type": "boolean"}
			}
		};

		var classes = api.Generator({assignment: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate({foo: [true, false, true]});
		
		assert.isObject(validation.schemas);
		assert.include(validation.schemas[''], '');
		assert.include(validation.schemas['/foo/0'], '#/definitions/items');
		assert.include(validation.schemas['/foo/1'], '#/definitions/items');
		assert.include(validation.schemas['/foo/2'], '#/definitions/items');
	});

	it('assigns items (when invalid)', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "array", "items": {"$ref": "#/definitions/items"}}
			},
			"definitions": {
				"items": {"type": "boolean"}
			}
		};

		var classes = api.Generator({assignment: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate({foo: [true, 5, "string"]});
		
		assert.isObject(validation.schemas);
		assert.include(validation.schemas[''], '');
		assert.include(validation.schemas['/foo/0'], '#/definitions/items');
		assert.include(validation.schemas['/foo/1'], '#/definitions/items');
		assert.include(validation.schemas['/foo/2'], '#/definitions/items');
	});

	it('assigns anyOf', function () {
		var schema = {
			anyOf: [
				{"type": "string"},
				{"type": "number"},
				{"type": "integer"}
			]
		};

		var classes = api.Generator({assignment: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate(123);
		
		assert.isObject(validation.schemas);
		assert.include(validation.schemas[''], '');
		assert.include(validation.schemas[''], '#/anyOf/1');
		assert.include(validation.schemas[''], '#/anyOf/2');
	});
	
	it('assigns oneOf', function () {
		var schema = {
			oneOf: [
				{"type": "string"},
				{"type": "number"},
				{"type": "integer"}
			]
		};

		var classes = api.Generator({assignment: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate("test");
		
		assert.isObject(validation.schemas);
		assert.include(validation.schemas[''], '');
		assert.include(validation.schemas[''], '#/oneOf/0');
	});

	it('assigns oneOf to first when multiple', function () {
		var schema = {
			oneOf: [
				{"type": "string"},
				{"type": "number"},
				{"type": "integer"}
			]
		};

		var classes = api.Generator({assignment: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate(123);
		
		assert.isObject(validation.schemas);
		assert.include(validation.schemas[''], '');
		assert.include(validation.schemas[''], '#/oneOf/1');
		assert.notInclude(validation.schemas[''], '#/oneOf/2');
	});
});
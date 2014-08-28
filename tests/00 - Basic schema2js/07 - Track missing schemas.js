var api = require('../../').schema2js;
var assert = require('chai').assert;

describe('Track missing Schemas', function () {
	it('works with assignment', function () {
		var otherSchemaUrl = "/schema/other" + Math.random();
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "string"},
				"bar": {"$ref": otherSchemaUrl}
			},
			"additionalProperties": {"type": "boolean"}
		};

		var classes = api.Generator({assignment: true, trackMissing: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate({foo: "hello", bar: 123, extra: true});
		
		assert.isObject(validation.schemas);
		assert.deepEqual(validation.missing, {'/bar': [otherSchemaUrl]});
	});

	it('works without assignment', function () {
		var otherSchemaUrl = "/schema/other" + Math.random();
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "string"},
				"bar": {"$ref": otherSchemaUrl}
			},
			"additionalProperties": {"type": "boolean"}
		};

		var classes = api.Generator({assignment: false, trackMissing: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate({foo: "hello", bar: 123, extra: true});
		
		assert.isUndefined(validation.schemas);
		assert.deepEqual(validation.missing, {'/bar': [otherSchemaUrl]});
	});

	it('disabled with assignment', function () {
		var otherSchemaUrl = "/schema/other" + Math.random();
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "string"},
				"bar": {"$ref": otherSchemaUrl}
			},
			"additionalProperties": {"type": "boolean"}
		};

		var classes = api.Generator({assignment: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate({foo: "hello", bar: 123, extra: true});
		
		assert.isObject(validation.schemas);
		assert.isUndefined(validation.missing);
	});

	it('disabled without assignment', function () {
		var otherSchemaUrl = "/schema/other" + Math.random();
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "string"},
				"bar": {"$ref": otherSchemaUrl}
			},
			"additionalProperties": {"type": "boolean"}
		};

		var classes = api.Generator({assignment: false}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate({foo: "hello", bar: 123, extra: true});
		
		assert.isUndefined(validation.schemas);
		assert.isUndefined(validation.missing);
	});

});
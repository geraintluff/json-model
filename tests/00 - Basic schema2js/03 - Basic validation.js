var api = require('../../').schema2js;
var assert = require('chai').assert;

describe('Basic validation', function () {
	it('checks object type', function () {
		var schema = {
			"type": "object"
		};

		var classes = api.Generator().addSchema(schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		assert.isTrue(Demo.validate({}).valid, 'passes object');
		assert.isFalse(Demo.validate("string").valid, 'fails string');
		assert.isFalse(Demo.validate([]).valid, 'fails array');
	});
	
	it('checks string property type', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"type": "string"}
			}
		};

		var classes = api.Generator().addSchema(schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		assert.isTrue(Demo.validate({foo: "string"}).valid, 'passes string');
		assert.isFalse(Demo.validate({foo: 5}).valid, 'fails number');
		assert.isFalse(Demo.validate({foo: {}}).valid, 'fails object');
		assert.isFalse(Demo.validate({foo: null}).valid, 'fails null');
		assert.isTrue(Demo.validate({}).valid, 'passes empty');
	});
	
	it('validates nested oneOfs correctly', function () {
		var schema = {
			oneOf: [
				{type: 'object'},
				{
					oneOf: [
						{type: "number"}
					]
				},
				{
					oneOf: [
						{type: "string"},
						{type: "number"}
					]
				}
			]
		};

		var generator = api.Generator().addSchema(schema, 'Demo');
		var classes = generator.classes();
		var Demo = classes.Demo;
		
		assert.isTrue(Demo.validate({}).valid, 'object valid');
		assert.isTrue(Demo.validate('foo').valid, 'string valid');
		assert.isFalse(Demo.validate(5).valid, 'number invalid');
		assert.isFalse(Demo.validate(true).valid, 'boolean invalid');
	});
});
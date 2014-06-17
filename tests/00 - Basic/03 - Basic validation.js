var api = require('../../');
var assert = require('chai').assert;

describe('Basic validation', function () {
	it('checks object type', function () {
		var schema = {
			"type": "object"
		};

		console.log(api.Generator().addSchema(schema, 'Demo').code());
		
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
});
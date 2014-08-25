var api = require('../../').schema2js;
var assert = require('chai').assert;

describe('Two-stage generation', function () {
	it('Missing schemas validate anything', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"$ref": "/schemas/foo"}
			}
		};

		var generator = api.Generator({assignment: true}).addSchema('', schema, 'Demo');
		var classes1 = generator.classes();
		var Demo = classes1.Demo;

		var validation1 = Demo.validate({foo: "hello"});
		assert.isTrue(validation1.valid, 'If schema is missing, assume valid');
	});
	
	it('Generating schemas again preserves existing classes', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"$ref": "/schemas/foo"}
			}
		};

		var generator = api.Generator({assignment: true}).addSchema('/schemas/demo', schema, 'Demo');
		var classes1 = generator.classes();
		var Demo = classes1.Demo;
		
		var classes2 = generator.classes();
		assert.equal(Demo, classes2.Demo);
	});

	it('Missing schema works when added', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {"$ref": "/schemas/foo"}
			}
		};

		var generator = api.Generator({assignment: true}).addSchema('/schemas/demo', schema, 'Demo');
		var classes1 = generator.classes();
		var Demo = classes1.Demo;
		
		generator.addSchema('/schemas/foo', {type: 'integer'}, 'Foo');
		
		var classes2 = generator.classes();
		assert.equal(Demo, classes2.Demo);
		
		var validation1 = Demo.validate({foo: "hello"});
		assert.isFalse(validation1.valid, 'must invalidate (string not int)');
	});
});
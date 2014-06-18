var api = require('../');
var assert = require('chai').assert;
var fs = require('fs'), path = require('path');

var testDir = path.join(__dirname, 'json-schema-test-suite/tests/draft4');

describe('JSON Schema validation:', function () {
	function createTests(filename) {
		filename = path.join(testDir, filename);
		var tests = JSON.parse(fs.readFileSync(filename, {encoding: 'utf-8'}));
		
		tests.forEach(function (test) {
			it(test.description, function () {
				var schema = test.schema;
				
				var generator = api.Generator().addSchema(schema, 'TestClass');
				var classes = generator.classes();
				var TestClass = classes.TestClass;
				
				test.tests.forEach(function (dataTest) {
					var validation = TestClass.validate(dataTest.data);
					if (dataTest.valid) {
						assert.isTrue(validation.valid, dataTest.description);
					} else {
						assert.isFalse(validation.valid, dataTest.description);
					}
				});
			});
		});
	}
	
	createTests('type.json');
	createTests('properties.json');
	createTests('additionalProperties.json');
	createTests('required.json');
	createTests('maxItems.json');
	createTests('minItems.json');
	createTests('maxLength.json');
	createTests('minLength.json');
	createTests('minimum.json');
	createTests('maximum.json');
});
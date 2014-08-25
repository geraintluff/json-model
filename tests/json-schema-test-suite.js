var api = require('../');
var assert = require('chai').assert;
var fs = require('fs'), path = require('path');

var testDir = path.join(__dirname, 'json-schema-test-suite/tests/draft4');

api.schemaStore.add(require('./draft-04-schema.json'));

describe('JSON Schema validation:', function () {
	function createTests(filename) {
		filename = path.join(testDir, filename);
		var tests = JSON.parse(fs.readFileSync(filename, {encoding: 'utf-8'}));
		
		tests.forEach(function (test) {
			it(test.description, function () {
				var schema = test.schema;
				
				var validator = api.validator(schema);
				test.tests.forEach(function (dataTest) {
					var validation = validator(dataTest.data);
					if (dataTest.valid !== validation.valid) {
						console.log(validator.generator.justNowCode);
					}
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
	createTests('maxProperties.json');
	createTests('minProperties.json');
	createTests('items.json');
	createTests('additionalItems.json');
	createTests('maxItems.json');
	createTests('minItems.json');
	createTests('pattern.json');
	createTests('maxLength.json');
	createTests('minLength.json');
	createTests('minimum.json');
	createTests('maximum.json');
	createTests('dependencies.json');
	createTests('allOf.json');
	createTests('anyOf.json');
	createTests('oneOf.json');

	createTests('ref.json');
});
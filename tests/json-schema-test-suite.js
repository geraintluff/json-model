var api = require('../');
var assert = require('chai').assert;
var fs = require('fs'), path = require('path');

var testDir = path.join(__dirname, 'json-schema-test-suite/tests/draft4');

describe('JSON Schema validation:', function () {
	// Add the meta-schema before each test
	beforeEach(function () {
		api.schemaStore.add(require('./draft-04-schema.json'));
	});
	
	function createTests(filename) {
		filename = path.join(testDir, filename);
		var tests = JSON.parse(fs.readFileSync(filename, {encoding: 'utf-8'}));
		
		tests.forEach(function (test) {
			it(test.description, function () {
				var schema = test.schema;
				
				var validator = api.validator(schema);
				test.tests.forEach(function (dataTest) {
					var validation = validator(dataTest.data);
					if (dataTest.valid !== validation.valid && validator.generator) {
						console.log(validator.generator.justNowCode);
					}
					if (!validation.valid) {
						validation.errors.forEach(function (error) {
							assert.isNumber(error.code, 'error code is present');
							assert.isString(error.path, 'data path is present');
							assert.isString(error.path, 'schema path is present');
						});
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
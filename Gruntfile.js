module.exports = function (grunt) {

	grunt.loadNpmTasks('grunt-mocha-test');

	grunt.initConfig({
		mochaTest: {
			any: {
				src: ['tests/**/*.js'],
				options: {
					reporter: 'mocha-unfunk-reporter',
					bail: false
				}
			}
		}
	});
	
	grunt.registerTask('compare', function () {
		var fs = require('fs'), path = require('path');
	
		function Validator(name, validatorGenerator) {
			this.name = name;
			this.validatorGenerator = validatorGenerator;
		}
		Validator.prototype = {
			runTests: function (tests, repeats) {
				var thisValidator = this;
				var testSetups = tests.map(function (test) {
					return {
						validator: thisValidator.validatorGenerator(test.schema),
						test: test
					};
				});
				var start = Date.now();
				var correct = 0, total = 0;
				testSetups.forEach(function (testSetup) {
					var validator = testSetup.validator;
					var data = testSetup.test.data;
					var shouldBeValid = testSetup.test.valid;
					for (var i = 0; i < repeats; i++) {
						var valid = validator(data);
						if (valid === shouldBeValid) {
							correct++;
						} else {
							//console.log(test);
						}
					}
					total += repeats;
				});
				return {
					name: this.name,
					ms: (Date.now() - start)/repeats,
					score: correct/total*100
				};
			}
		};

		var tests = [];
		var testFiles = ['type.json', 'properties.json', 'additionalProperties.json', 'required.json', 'maxProperties.json', 'minProperties.json', 'items.json', 'additionalItems.json', 'maxItems.json', 'minItems.json', 'pattern.json', 'maxLength.json', 'minLength.json', 'minimum.json', 'maximum.json', 'dependencies.json', 'allOf.json', 'anyOf.json', 'oneOf.json', 'ref.json'];
		testFiles.forEach(function (testFile) {
			var filename = path.join(__dirname, 'tests/json-schema-test-suite/tests/draft4', testFile);
			var testJson = fs.readFileSync(filename, {encoding: 'utf-8'});
			var testSet = JSON.parse(testJson);
			for (var i = 0; i < testSet.length; i++) {
				var testGroup = testSet[i];
				tests = tests.concat(testGroup.tests.map(function (test) {
					return {schema: testGroup.schema, data: test.data, valid: test.valid};
				}));
			}
		});
		console.log(tests.length + ' tests');

		/*******/

		var repeats = 1;
		
		var thisApi = require('./');
		thisApi.schemaStore.add(require('./tests/draft-04-schema.json'));
		thisApi.setRequestFunction(function (params, callback) {
			callback(null, {});
		});
		var reference = new Validator('json-model (precompile)', function (schema) {
			var validator = thisApi.validator(schema);
			return function (data) {
				return validator(data).valid
			};
		});
		
		var alternatives = [];
		alternatives.push(new Validator('json-model (individual)', function (schema) {
			return function (data) {
				var validator = thisApi.validator(schema);
				return validator(data).valid;
			};
		}));
		alternatives.push(new Validator('tv4 (validateResult)', function (schema) {
			var tv4 = require('tv4');
			return function (data) {
				return tv4.validateResult(data, schema).valid;
			};
		}));
		alternatives.push(new Validator('tv4 (validateMultiple)', function (schema) {
			var tv4 = require('tv4');
			return function (data) {
				return tv4.validateMultiple(data, schema).valid;
			};
		}));
		
		var referenceResult = reference.runTests(tests, repeats);
		referenceResult.speed = 1;
		console.log(referenceResult);
		console.log('--------------------');
		var results = alternatives.map(function (validator) {
			var result = validator.runTests(tests, repeats);
			result.relativeSpeed = result.ms/referenceResult.ms;
			console.log(result);
			return result;
		});
		
		var readme = fs.readFileSync(__dirname + '/README.md', {encoding: 'utf-8'});
		readme = readme.replace(/(<!--SPEEDSTART-->)([^]*)(<!--SPEEDEND-->)/g, function (match, start, middle, end) {
			var model = thisApi.create([referenceResult].concat(results), null, {
				type: 'array',
				items: {
					type: 'objects',
					properties: {
						name: {title: 'Setup', type: 'string'},
						time: {title: 'Time (ms)', type: 'number'},
						relativeSpeed: {title: 'Relative speed', type: 'number'},
						score: {title: 'Test pass rate', type: 'number', format: 'percent'}
					}
				}
			});
			var html = model.html('table', {width: '100%'});
			return start + '\n' + html  + '\n' + end;
		});
		fs.writeFileSync(__dirname + '/README.md', readme);
		fs.writeFileSync(__dirname + '/index.html', require('mdpages').convertString(readme));
	});

	// main cli commands
	grunt.registerTask('default', ['test']);
	grunt.registerTask('test', ['mochaTest']);

};
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
		var packageInfo = require('./package.json');
	
		var fs = require('fs'), path = require('path');
	
		function Validator(name, validatorGenerator) {
			this.name = name;
			this.validatorGenerator = validatorGenerator;
		}
		Validator.prototype = {
			runTests: function (tests, targetMs, maxRepeats) {
				var thisValidator = this;
				var testSetups = tests.map(function (test) {
					return {
						validator: thisValidator.validatorGenerator(test.schema),
						test: test
					};
				});
				var start = Date.now();
				var end = start + targetMs;
				var correct = 0, total = 0;
				var repeats = 0;
				while (Date.now() < end && !(repeats >= maxRepeats)) {
					repeats++;
					testSetups.forEach(function (testSetup) {
						var validator = testSetup.validator;
						var data = testSetup.test.data;
						var shouldBeValid = testSetup.test.valid;

						var valid = validator(data);
						if (valid === shouldBeValid) {
							correct++;
						}
						total++;
					});
				}
				return {
					repeats: repeats,
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

		var targetMs = 1000*20;
		var maxRepeats = 10000;
		
		var jsonModel = require('./');
		jsonModel.schemaStore.add(require('./tests/draft-04-schema.json'));
		var reference = new Validator('json-model@' + packageInfo.version + ' (precompiled)', function (schema) {
			var validator = jsonModel.validator(schema);
			return function (data) {
				return validator(data).valid
			};
		});
		
		var alternatives = [];
		// Include compilation (to measure compilation time)
		alternatives.push(new Validator('json-model@' + packageInfo.version + ' (compile and validate)', function (schema) {
			return function (data) {
				var validator = jsonModel.validator(schema);
				return validator(data).valid;
			};
		}));
		// tv4
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
		// Old version (for reference)
		var oldApi = require('json-model');
		oldApi.schemaStore.add(require('./tests/draft-04-schema.json'));
		var oldApiPackageInfo = require('json-model/package.json');
		alternatives.push(new Validator('json-model@' + oldApiPackageInfo.version + ' (sanity check)', function (schema) {
			var validator = oldApi.validator(schema);
			return function (data) {
				return validator(data).valid
			};
		}));
		
		var referenceResult = reference.runTests(tests, targetMs, maxRepeats);
		var targetMs = Math.round(referenceResult.ms*referenceResult.repeats);
		console.log(referenceResult);
		console.log('-------- target ms: ' + targetMs + ' --------');
		var results = alternatives.map(function (validator) {
			var result = validator.runTests(tests, targetMs, maxRepeats);
			console.log(result);
			return result;
		});
		
		// Order might matter - try again at the end, and take the worse of the two
		var secondReferenceResult = reference.runTests(tests, targetMs, maxRepeats);
		if (secondReferenceResult.ms > referenceResult.ms) {
			referenceResult = secondReferenceResult;
		}
		referenceResult.relativeTime = 1;
		results.forEach(function (result) {
			result.relativeTime = result.ms/referenceResult.ms;
		});

		jsonModel.schemaStore.add('tmp://comparison', {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					name: {title: 'Setup', type: 'string'},
					ms: {title: 'Time (ms)', type: 'number'},
					relativeTime: {title: 'Relative speed', type: 'number'},
					score: {title: 'Test pass rate', type: 'number', format: 'percent'}
				},
				propertyOrder: ['name', 'time', 'relativeTime', 'score', 'repeats']
			}
		});
		jsonModel.bindings.add({
			canBind: {
				tag: 'table',
				schema: 'tmp://comparison'
			},
			html: function (model) {
				var html = '<tr>' + ['Setup', 'Time (ms)', 'Relative time', 'Test score', 'Repeats'].map(function (title) {
					return '<th style="background-color: #DDD;">' + title.escapeHtml() + '</th>';
				}).join('') + '</tr>';
				return html + model.map(function (item) {
					return item.html('tr');
				}).join('');
			}
		});
		jsonModel.bindings.add({
			canBind: {
				tag: 'tr',
				schema: 'tmp://comparison#/items'
			},
			html: function (model) {
				return model.mapProps(['name', 'ms', 'relativeTime', 'score', 'repeats'], function (prop) {
					return prop.html('td');
				}).join('');
			}
		});
		jsonModel.bindings.add({
			canBind: {type: 'number'},
			html: function (model) {
				var value = Math.round(model.get()*10)/10;
				if (model.hasSchema('tmp://comparison#/items/properties/score')) {
					value += '%';
				}
				return value;
			}
		});
		
		var readme = fs.readFileSync(__dirname + '/README.md', {encoding: 'utf-8'});
		readme = readme.replace(/(<!--SPEEDSTART-->)([^]*)(<!--SPEEDEND-->)/g, function (match, start, middle, end) {
			var model = jsonModel.create([referenceResult].concat(results), null, 'tmp://comparison');
			var html = model.html('table', {width: '100%'});
			return start + '\n' + html  + '\n' + end;
		});
		fs.writeFileSync(__dirname + '/README.md', readme);
	});

	// main cli commands
	grunt.registerTask('default', ['test', 'compare']);
	grunt.registerTask('test', ['mochaTest']);

};
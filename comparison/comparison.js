"use strict";
(function (global, factory) {
	if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory(require('../'), require('json-model'), require('tv4'), require('z-schema'));
	} else {
		// Browser globals
		global.comparison = factory(global.JsonModel, null, global.tv4, global.ZSchema);
	}
})(this, function (JsonModel, oldApi, tv4, ZSchema) {
	var api = {};

	var Validator = api.Validator = function Validator(name, validatorGenerator) {
		this.name = name;
		this.validatorGenerator = validatorGenerator;
	}
	Validator.prototype = {
		runTests: function (tests, targetMs, maxRepeats) {
			var thisValidator = this;
			var testSetups = tests.map(function (test) {
				var schema = JSON.parse(JSON.stringify(test.schema)); // Some of the validators modify the schema object
				return {
					validator: thisValidator.validatorGenerator(schema),
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
	
	JsonModel.schemaStore.add('tmp://comparison', {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				name: {title: 'Setup', type: 'string'},
				ms: {title: 'Time (ms)', type: 'number'},
				relativeTime: {title: 'Relative time', type: 'number'},
				score: {title: 'Test score', type: 'number', format: 'percent'},
				repeats: {title: 'Repeats', type: 'integer'}
			},
			propertyOrder: ['name', 'ms', 'relativeTime', 'score', 'repeats']
		}
	});
	JsonModel.bindings.addHtml({schema: 'tmp://comparison', tag: 'div'}, function (model) {
		return model.html('table', {width: '100%'});
	})
	JsonModel.bindings.add({
		canBind: {type: 'number'},
		html: function (model) {
			var value = Math.round(model.get()*10)/10;
			if (model.hasSchema('tmp://comparison#/items/properties/score')) {
				value += '%';
			}
			return value;
		}
	});
	
	api.runTests = function (tests, knownSchemas, targetMs, maxRepeats, callback) {
		var resultsModel = JsonModel.create([], null, 'tmp://comparison');
		
		for (var key in knownSchemas) {
			JsonModel.schemaStore.add(key, knownSchemas[key]);
			if (oldApi) oldApi.schemaStore.add(key, knownSchemas[key]);
		}
		
		var reference = new Validator('json-model@' + JsonModel.version + ' (precompiled)', function (schema) {
			var validator = JsonModel.validator(schema);
			return function (data) {
				return validator(data).valid
			};
		});
		
		var alternatives = [];
		// Include compilation (to measure compilation time)
		alternatives.push(new Validator('json-model@' + JsonModel.version + ' (compile and validate)', function (schema) {
			return function (data) {
				var validator = JsonModel.validator(schema);
				return validator(data).valid;
			};
		}));

		// tv4
		alternatives.push(new Validator('tv4 (validateResult)', function (schema) {
			return function (data) {
				return tv4.validateResult(data, schema).valid;
			};
		}));
		alternatives.push(new Validator('tv4 (validateMultiple)', function (schema) {
			return function (data) {
				return tv4.validateMultiple(data, schema).valid;
			};
		}));
		
		// z-schema
		if (ZSchema) {
			alternatives.push(new Validator('z-schema', function (schema) {
				var validator = new ZSchema();
				return function (data) {
					return validator.validate(data, schema);
				};
			}));
		}

		if (oldApi) {
			// Old version (for reference)
			alternatives.push(new Validator('json-model@' + (oldApi._version || 'old') + ' (sanity check)', function (schema) {
				var validator = oldApi.validator(schema);
				return function (data) {
					return validator(data);
				};
			}));
		}
		
		var referenceResult = null, results = [];
		function startTests() {
			referenceResult = reference.runTests(tests, targetMs, maxRepeats);
			targetMs = Math.round(referenceResult.ms*referenceResult.repeats);
			
			resultsModel.set([referenceResult]);

			console.log(referenceResult);
			console.log('-------- target ms: ' + targetMs + ' --------');
			
			setTimeout(nextTest, 500);
		}
		
		function nextTest() {
			if (!alternatives.length) {
				return endTests();
			}
			var validator = alternatives.shift();
			var result = validator.runTests(tests, targetMs, maxRepeats);
			results.push(result);

			resultsModel.set([referenceResult].concat(results));
			setTimeout(nextTest, 500);
		}

		function endTests() {
			// Order might matter - try again at the end, and take the worse of the two
			var secondReferenceResult = reference.runTests(tests, targetMs, maxRepeats);
			if (secondReferenceResult.ms > referenceResult.ms) {
				referenceResult = secondReferenceResult;
			}
			referenceResult.relativeTime = 1;
			results.forEach(function (result) {
				result.relativeTime = result.ms/referenceResult.ms;
			});
		
			resultsModel.set([referenceResult].concat(results));

			setTimeout(function () {
				callback(null, [referenceResult].concat(results));
			});
		}
		
		setTimeout(startTests, 10);
		return resultsModel;
	};
	
	return api;
});
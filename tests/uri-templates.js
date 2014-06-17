var api = require('../');
var assert = require('chai').assert;

describe('URI Templates:', function () {
	function createTests(spec, name) {
		it(name, function () {
			spec.testcases.forEach(function (testcase) {
				var template = testcase[0];
				var options = testcase[1];
				if (!Array.isArray(options)) options = [options];
				
				function typeSensitiveVar(prop) {
					var expr = 'obj[' + JSON.stringify(prop) + ']';

					if (Array.isArray(spec.variables[prop])) {
						return {code: expr, type: 'array'};
					} else if (spec.variables[prop] && (typeof spec.variables[prop] == 'object')) {
						return {code: expr, type: 'object'};
					}
					return {code: expr, type: typeof spec.variables[prop]};
				}
				
				var templateFunction1 = new Function('obj', 'return ' + api.uriTemplate(typeSensitiveVar, template));
				var result1 = templateFunction1(spec.variables);
				assert.include(options, result1);

				var templateFunction2 = new Function('obj', 'return ' + api.uriTemplate('obj', template));
				var result2 = templateFunction2(spec.variables);
				assert.include(options, result2);

			});
		});
	}
	
	var examples = require('./uri-templates/spec-examples.json');
	for (var key in examples) {
		createTests(examples[key], key);
	}
});
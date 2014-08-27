var schema2js = require('../../').schema2js;
var assert = require('chai').assert;

describe('Sub-errors', function () {
	it('supplies all failed oneOf options', function () {
		var schema = {
			"items": {
				oneOf: [
					{type: 'string'},
					{type: 'number'}
				]
			}
		};
		
		var classes = schema2js.Generator().addSchema(schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		var result = Demo.validate([null]);
		assert.isFalse(result.valid, 'fails');
		assert.equal(result.errors.length, 1);
		var error = result.errors[0];
		assert.equal(error.code, schema2js.ErrorCodes.ONE_OF_MISSING, 'code is correct');
		assert.isArray(error.params.errors, 'params.errors is array');
		assert.equal(error.params.errors.length, 2, 'params.errors length');
		assert.isArray(error.params.errors[0], 'params.errors is array of arrays');
		assert.equal(error.params.errors[0].length, 1, 'params.errors[0] correct length');
		var subError = error.params.errors[0][0];
		assert.equal(subError.code, schema2js.ErrorCodes.INVALID_TYPE, 'sub-error code is correct'); 
		
		assert.equal(error.path, '/0', 'error.path');
		assert.equal(subError.path, '/0', 'subError.path');
	});

	it('Handles nested oneOfs correctly', function () {
		var schema = {
			oneOf: [
				{type: 'string'},
				{oneOf: [
					{type: 'number'},
					{type: 'boolean'}
				]}
			]
		};
		
		var classes = schema2js.Generator().addSchema(schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		var result = Demo.validate({});
		console.log(JSON.stringify(result, null, 4));
		assert.isFalse(result.valid, 'fails');
		assert.equal(result.errors.length, 1);
		var error = result.errors[0];
		var subErrors = error.params.errors;
		assert.equal(subErrors.length, 2, 'subErrors.length');
		assert.equal(subErrors[0].length, 1, 'subErrors[0].length');
		assert.equal(subErrors[1].length, 1, 'subErrors[1].length');
		var subSubErrors = subErrors[1][0].params.errors;
		assert.equal(subSubErrors.length, 2, 'subSubErrors.length');
		assert.equal(subSubErrors[0].length, 1, 'subSubErrors[0].length');
		assert.equal(subSubErrors[1].length, 1, 'subSubErrors[1].length');
	});
	
	it('supplies all failed anyOf options', function () {
		var schema = {
			anyOf: [
				{type: 'string'},
				{type: 'number'}
			]
		};
		
		var classes = schema2js.Generator().addSchema(schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		var result = Demo.validate(null);
		assert.isFalse(result.valid, 'fails');
		assert.equal(result.errors.length, 1);
		var error = result.errors[0];
		assert.equal(error.code, schema2js.ErrorCodes.ANY_OF_MISSING, 'code is correct');
		assert.isArray(error.params.errors, 'params.errors is array');
		assert.equal(error.params.errors.length, 2, 'params.errors length');
		assert.isArray(error.params.errors[0], 'params.errors is array of arrays');
		assert.equal(error.params.errors[0].length, 1, 'params.errors[0] correct length');
		var subError = error.params.errors[0][0];
		assert.equal(subError.code, schema2js.ErrorCodes.INVALID_TYPE, 'sub-error code is correct'); 
	});

	it('can be disabled', function () {
		var schema = {
			oneOf: [
				{type: 'string'},
				{type: 'number'}
			]
		};
		
		var classes = schema2js.Generator({subErrors: false}).addSchema(schema, 'Demo').classes();
		var Demo = classes.Demo;
		
		var result = Demo.validate(null);
		assert.isFalse(result.valid, 'fails');
		assert.equal(result.errors.length, 1);
		var error = result.errors[0];
		assert.equal(error.code, schema2js.ErrorCodes.ONE_OF_MISSING, 'code is correct');
		assert.isUndefined(error.params.errors, 'params.errors is missing');
	});

});
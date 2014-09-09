var api = require('../../');
var assert = require('chai').assert;

describe('Basic model.schemaSet()', function () {
	afterEach(function(done){
		api.clean(done);
	});
	
	it('exists, is cached', function () {
		api.schemaStore.add('tmp://schema', {
			title: "Test Schema",
			properties: {
				"foo": {type: "string"}
			},
			items: {"type": "boolean"}
		})
		var model = api.create({foo:'bar'}, null, 'tmp://schema');
		
		var schemaSet = model.schemaSet();
		var schemaSet2 = model.schemaSet();
		assert.isObject(schemaSet);
		assert.equal(schemaSet, schemaSet2);
		assert.deepEqual(schemaSet.titles(), ['Test Schema']);
		
		var propSet = schemaSet.prop('foo');
		var propSet2 = schemaSet.prop('foo');
		assert.isObject(propSet);
		assert.equal(propSet, propSet2);

		var itemSet = schemaSet.item(0);
		var itemSet2 = schemaSet.item(1);
		assert.isObject(itemSet);
		assert.equal(itemSet, itemSet2);
		
		assert.deepEqual(schemaSet.knownKeys(), ['foo']);
	});
});
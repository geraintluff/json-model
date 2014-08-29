var api = require('../../').schema2js;
var assert = require('chai').assert;

describe('Link assignment', function () {
	it('assigns links (when valid)', function () {
		var schema = {
			"type": "object",
			"properties": {
				"foo": {
					"type": "string",
					"links": [
						{
							"href": "/{$}?bar",
							"rel": "test",
							"schema": {"type": "boolean"}
						}
					]
				}
			},
			"links": [
				{
					"href": "abc{?%7B,()}",
					"rel": "foo"
				}
			]
		};

		var classes = api.Generator({linkAssignment: true}).addSchema('', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var validation = Demo.validate({foo: "hello", '{': 'bracket', '': 'empty'});
		
		assert.isObject(validation.links);
		assert.isArray(validation.links['/foo']);
		assert.equal(validation.links['/foo'].length, 1);
		var link = validation.links['/foo'][0];
		assert.deepEqual(link, {
			href: '/hello?bar',
			rel: "test",
			schema: "#/properties/foo/links/0/schema"
		});
		assert.isArray(validation.links['']);
		assert.equal(validation.links[''].length, 1);
		var link = validation.links[''][0];
		assert.deepEqual(link, {
			href: 'abc?%7B=bracket&%65mpty=empty',
			rel: "foo"
		});
	});
});
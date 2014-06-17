var api = require('../../');
var assert = require('chai').assert;

describe('Basic hypermedia', function () {
	it('is detected', function () {
		var schema = {
			"type": "object",
			"properties": {
				"author": {"type": "string", "format": "uri"}
			},
			"links": [{
				"rel": "author",
				"href": "{+author}"
			}]
		};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes();
		var Demo = classes.Demo;

		var demo = new Demo({
			author: "/users/0"
		});
		assert.isFunction(Demo.links.getAuthor);
	});
	
	it('handles no-parameter GET requests', function () {
		var schema = {
			"type": "object",
			"properties": {
				"author": {"type": "string", "format": "uri"}
			},
			"links": [{
				"rel": "author",
				"href": "{+author}"
			}]
		};
		
		var requestParams = [];
		var request = function (params, callback) {
			requestParams.push(params);
		};
		
		var classes = api.Generator().addSchema('/demo', schema, 'Demo').classes(null, request);
	
		var demo = new classes.Demo({
			author: "/users/0"
		});
		demo.getAuthor();
		
		assert.deepEqual(requestParams, [{
			href: "/users/0",
			method: "GET",
			data: null,
			encType: 'application/x-www-form-urlencoded'
		}]);
	});
});
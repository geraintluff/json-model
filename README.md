# JSON Models

This package handles JSON data and associated JSON Schemas.  This includes compiled (code-generated) schema validation/assignment, and a wrapper class that adds events, and HTML bindings for UI/display (HTML on server-side, DOM in browser with shared code).

## API

On Node/CommonJS, use the `'json-model'` package:

```javascript
var jsonModel = require('json-model');
```

In the browser, it registers itself as the `JsonModel` global object.

### Getting a validator

To get a validator for a given schema:

```javascript
var validator = JsonModel.validator(schema);

var result = validator(data);
console.log(result.valid);
console.log(result.errors);
console.log(result.schemas);
```

## Fast validation/assignment (when re-using schemas)

Schemas are compiled into validators (generating custom JS code), which has an up-front overhead but leads to much faster validation upon re-use.

### Speed table

Here's a table of measured times for various validation setups (using the [JSON Schema Test Suite](https://github.com/json-schema/JSON-Schema-Test-Suite)) on Node:

<!--SPEEDSTART-->
<table width="100%"><tr><th style="background-color: #DDD;">Setup</th><th style="background-color: #DDD;">Time (ms)</th><th style="background-color: #DDD;">Relative time</th><th style="background-color: #DDD;">Test score</th></tr><tr><tr><td>json-model@0.2.2 (precompile)</td><td>12.5</td><td>1</td><td>97.34</td></tr></tr><tr><tr><td>json-model@0.2.2 (individual)</td><td>1546.1</td><td>123.69</td><td>96.81</td></tr></tr><tr><tr><td>tv4 (validateResult)</td><td>154.7</td><td>12.38</td><td>94.68</td></tr></tr><tr><tr><td>tv4 (validateMultiple)</td><td>182.9</td><td>14.63</td><td>94.68</td></tr></tr></table>
<!--SPEEDEND-->

As you can see, the first time you compile a validator it is much slower than [tv4](https://www.npmjs.org/package/tv4).  However, if you re-use that compiled validator then it is faster than tv4 by an order of magnitude.  If you're going to be validating against the same schema ten or more times, then this should end up faster.

## Schema assignment

The result object you get back from a validator includes a `schema` property, which is a map from JSON Pointer paths to schema URIs:

```json
{
	"valid": true,
	"errors": [],
	"schemas": {
		"": ["http://example.com/schema"],
		"/foo": ["http://example.com/schema#/properties/foo"],
		"/foo/0": ["http://example.com/schema#/definitions/fooItems"]
	}
}
```
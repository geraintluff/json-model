# JSON Models

This project defines a wrapper for JSON data, adding events, JSON Schema (validation/assignment), and bindings to HTML (server-side) and DOM (browser).

## API

## Fast validation (when re-using schemas)

Schemas are compiled into validators (generating custom JS code), which has an up-front overhead but leads to much faster validation upon re-use.

Here's a table of measured times for various validation setups (using the [JSON Schema Test Suite](https://github.com/json-schema/JSON-Schema-Test-Suite)) on Node:

<!--SPEEDSTART-->
<table width="100%"><tr><th style="background-color: #DDD;">Setup</th><th style="background-color: #DDD;">Time (ms)</th><th style="background-color: #DDD;">Relative time</th><th style="background-color: #DDD;">Test score</th></tr><tr><tr><td>json-model@0.2.2 (precompile)</td><td>12.5</td><td>1</td><td>97.34</td></tr></tr><tr><tr><td>json-model@0.2.2 (individual)</td><td>1546.1</td><td>123.69</td><td>96.81</td></tr></tr><tr><tr><td>tv4 (validateResult)</td><td>154.7</td><td>12.38</td><td>94.68</td></tr></tr><tr><tr><td>tv4 (validateMultiple)</td><td>182.9</td><td>14.63</td><td>94.68</td></tr></tr></table>
<!--SPEEDEND-->

As you can see, the first time you compile a validator it is slower than [tv4](https://www.npmjs.org/package/tv4).  However, if you re-use that compiled validator then it is faster than tv4 by a order of magnitude.  If you're going to be validating against the same schema ten or more times, then this should end up faster.

## Schema assignment

The result object you get back from a validator includes a `schema` property, which is a map from JSON Pointer paths to schema URIs:

```json
{
	"valid": true,
	"errors": [],
	"schemas": {
		"": ["http://example.com/schema"],
		"/foo": ["http://example.com/schema#/properties/foo"],
		"/foo/0": ["http://example.com/schema#/definitions/fooItems"
	}
}
```
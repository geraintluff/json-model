# JSON Models

This package handles JSON data and associated JSON Schemas.  This includes [fast schema validation/assignment](#speed-table), and a wrapper class that adds events plus HTML bindings for UI/display (HTML on server-side, DOM in browser with shared code).

## API

On Node/CommonJS, use the `'json-model'` package:

```javascript
var JsonModel = require('json-model');
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

If some schemas need to be fetched, then the validator will not be completely functional at first.  You can supply a callback function to be notified when the validator is ready (which also supplies the same validator as a result):

```javascript
JsonModel.validator(schema, function (error, validator) {
});
```

### Setting the request function

This module has the ability to fetch schemas/data, but it needs you to supply an appropriate request function:

```javascript
JsonModel.setRequestFunction(function (params, callback) {
	/* do whatever */
	callback(error, jsonData, headers);
});
```

The arguments to the callback are `error`, `jsonData` (the fetched data, JSON-decoded), and `headers` (an *object* representing the headers).  `headers` may be omitted (e.g. when loading from a file).  Non-JSON responses do not need to be supported.

### Creating/opening data

You can create a JsonModel wrapper directly - everything except the initial value (`jsonData`) is optional:

```javascript
var model = JsonModel.create(jsonData, url, schemas, callback);
```

If `callback` is provided, it will be called (with two arguments `error` and `model`) after all relevant schemas have loaded.  The `model` argument will be the same as the return value of `create()`.

You can also open remote data: (`hintSchemas` is an optional set of schemas to use if the remote resource doesn't supply its own)

```javascript
JsonModel.open('http://example.com/json', hintSchemas, function (error, model) {...});
```

In both cases, the callback is only called when all the schemas have been loaded.

The `schemas`/`hintSchemas` arguments can be strings (URIs), objects (anonymous schemas), or arrays of strings/objects.  However, bear in mind that if `schemas` is supplied as a string in `create()`, then `url` must be supplied (or `null`) otherwise it will interpret the schema URL as the data URL.

### UI bindings

The UI bindings are mostly HTML-based.

#### In the browser

```javascript
model.bindTo(element);
```

Most bindings will output their interaces as HTML.  The supplied HTML is not dumped directly into the page, but is instead parsed into a DOM, and the existing document is coerced into that shape.

#### On the server

```javascript
var html = model.html(tag, attrs);
model.html(tag, attrs, function (error, html) {...});
```

`tag` and `attrs` are optional in both forms.  The HTML returned does not include the opening/closing tags itself, instead the HTML meant to sit between them.

### Model methods

The following methods are also available on wrapper objects:

#### Events and inspection

* `model.on(event, callback)`, `model.off([event, [listener]]`, `model.once(event, callback)`, `model.emit(event, ...)` - event methods. `addListener()`/etc. variants are also present
* `model.errors([pathSpec], [includeFetchErrors])` - returns current validation errors.  If the `includeFetchErrors` flag is set, then missing schemas (that encountered an error during fetching) are included as errors
* `model.path([pathSpec])` - a child model
* `model.pointer()` - the JSON Pointer of this model relative to the document root

#### Generic value methods
* `model.jsonType()` - the current basic type of the data (null/boolean/string/number/object/array)
* `model.get([pathSpec])` - gets the value from the model.
* `model.set([pathSpec], value)` - gets the value from the model.
* `model.getHtml([pathSpec])` - gets the value, HTML-encoded
* `model.schemas([pathSpec])` - gets the schemas (URLs if known, or the schema itself for anonymous schemas)
* `model.hasSchema(url)` - whether

#### Array methods
* `model.length()` - array length
* `model.item(index)` - a child item
* `model.items(callback)` - iterate over the child items (`function callback(itemModel, index) {...}`)
* `model.map(callback)` - maps the array value to a new array

#### Object methods
* `model.keys()` - array length
* `model.prop(key)` - a child property
* `model.props(callback)` - iterate over the child properties (`function callback(propModel, key) {...}`)
* `model.props(keys, callback)` - iterate over a particular set of child properties, in order
* `model.mapProps(callback)` - maps the object value to a new object
* `model.mapProps(keys, callback)` - maps the object value to an array (corresponding to a particular set of keys)

For any method that takes an (optional) first `pathSpec` argument, this may either be a JSON Pointer (e.g. `"/foo/bar"`), or a property/index (e.g. `"foo"` or `5`).  If it is missing then the immediate value is returned.

### Other utilities

* `JsonModel.is(model)` - whether the supplied object is a JsonModel wrapper or not
* `JsonModel.schemasFetched()` - whether all schemas have been fetched for the moment
* `JsonModel.whenSchemasFetched(callback)` - callback is executed when all schemas have been fetched
* `JsonModel.extend(newMethods)` - adds methods to the model prototype

## Fast validation/assignment (when re-using schemas)

Schemas are compiled into validators (generating custom JS code), which has an up-front overhead but leads to much faster validation upon re-use.

### Speed table

Here's a table of measured times for various validation setups (using the [JSON Schema Test Suite](https://github.com/json-schema/JSON-Schema-Test-Suite)) on Node:

<!--SPEEDSTART-->
<table width="100%"><tr><th style="background-color: #DDD;">Setup</th><th style="background-color: #DDD;">Time (ms)</th><th style="background-color: #DDD;">Relative time</th><th style="background-color: #DDD;">Test score</th><th style="background-color: #DDD;">Repeats</th></tr><tr><tr><td>json-model@0.2.4 (precompiled)</td><td>2.5</td><td>1</td><td>100%</td><td>7963</td></tr></tr><tr><tr><td>json-model@0.2.4 (compile and validate)</td><td>299.6</td><td>119.3</td><td>100%</td><td>67</td></tr></tr><tr><tr><td>tv4 (validateResult)</td><td>169.9</td><td>67.6</td><td>94.7%</td><td>118</td></tr></tr><tr><tr><td>tv4 (validateMultiple)</td><td>172.5</td><td>68.7</td><td>94.7%</td><td>117</td></tr></tr><tr><tr><td>json-model@0.2.1 (sanity check)</td><td>2.6</td><td>1.1</td><td>100%</td><td>7560</td></tr></tr><tr><tr><td>json-model@0.2.4 (precompiled)</td><td>2.5</td><td>1</td><td>100%</td><td>8003</td></tr></tr></table>
<!--SPEEDEND-->

As you can see, the first time you compile a validator it is definitely slower than [tv4](https://www.npmjs.org/package/tv4).  However, if you re-use that compiled validator then it is faster than tv4 by an order of magnitude.  If you're going to be validating against the same schema ten or more times, then this should end up faster.

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
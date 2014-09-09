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
console.log(result.errors); // List of errors
console.log(result.schemas); // Map from JSON Pointer paths --> schema URLs
console.log(result.links); // Map: path --> links
console.log(result.missing); // Map: path --> missing schemas
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

You can create a JsonModel wrapper directly:

```javascript
var model = JsonModel.create(jsonData, url, schemas, callback);
```

Everything except the initial value (`jsonData`) is optional, but if you supply `schemas` you must supply `url` as well (although it may be `null`).  If `callback` is provided, it will be called (with two arguments `error` and `model`) after all relevant schemas have loaded.  The `model` argument will be the same as the return value of `create()`.

You can also open remote data: (`hintSchemas` is an optional set of schemas to use if the remote resource doesn't supply its own)

```javascript
JsonModel.open('http://example.com/json', hintSchemas, function (error, model) {...});
```

In both cases, the callback is only called when all the schemas have been loaded.

The `schemas`/`hintSchemas` arguments can be strings (URIs), objects (anonymous schemas), or arrays of strings/objects.

<!--

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

-->

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
<table width="100%"><tr class="json-array-header"><th>Setup</th><th>Time (ms)</th><th>Relative time</th><th>Test score</th><th>Repeats</th></tr><tr class="json-array-item"><td class="json-array-item-key"><span>json-model@0.2.24 (precompiled)</span></td><td class="json-array-item-key">0.4</td><td class="json-array-item-key">1</td><td class="json-array-item-key">100%</td><td class="json-array-item-key">9926</td></tr><tr class="json-array-item"><td class="json-array-item-key"><span>json-model@0.2.24 (compile and validate)</span></td><td class="json-array-item-key">52.7</td><td class="json-array-item-key">128.2</td><td class="json-array-item-key">100%</td><td class="json-array-item-key">78</td></tr><tr class="json-array-item"><td class="json-array-item-key"><span>tv4 (validateResult)</span></td><td class="json-array-item-key">24.7</td><td class="json-array-item-key">60.1</td><td class="json-array-item-key">98.4%</td><td class="json-array-item-key">166</td></tr><tr class="json-array-item"><td class="json-array-item-key"><span>tv4 (validateMultiple)</span></td><td class="json-array-item-key">25.7</td><td class="json-array-item-key">62.7</td><td class="json-array-item-key">98.4%</td><td class="json-array-item-key">159</td></tr><tr class="json-array-item"><td class="json-array-item-key"><span>z-schema</span></td><td class="json-array-item-key">0.7</td><td class="json-array-item-key">1.8</td><td class="json-array-item-key">98.4%</td><td class="json-array-item-key">5665</td></tr><tr class="json-array-item"><td class="json-array-item-key"><span>jjv</span></td><td class="json-array-item-key">1.3</td><td class="json-array-item-key">3.2</td><td class="json-array-item-key">98.4%</td><td class="json-array-item-key">3091</td></tr><tr class="json-array-item"><td class="json-array-item-key"><span>json-model@old (sanity check)</span></td><td class="json-array-item-key">0.4</td><td class="json-array-item-key">1</td><td class="json-array-item-key">0%</td><td class="json-array-item-key">9722</td></tr></table>
<!--SPEEDEND-->

As you can see, the first time you compile a validator it is definitely slower than [tv4](https://www.npmjs.org/package/tv4).  However, if you re-use that compiled validator then it is faster than tv4 by an order of magnitude.  If you're going to be validating against the same schema multiple times, then this will probably end up faster.

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
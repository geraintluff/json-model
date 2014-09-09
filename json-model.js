"use strict";
(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define([], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory();
	} else {
		// Browser globals
		global.JsonModel = factory();
	}
})(this, function () {
	var api = {
		version: /*VERSION*/"0.2.24"/*/VERSION*/
	};

var schema2js = {};

// parseURI() and resolveUrl() are from https://gist.github.com/1088850
//   -  released as public domain by author ("Yaffle") - see comments on gist
function parseURI(url) {
	var m = String(url).replace(/^\s+|\s+$/g, '').match(/^([^:\/?#]+:)?(\/\/(?:[^:@]*(?::[^:@]*)?@)?(([^:\/?#]*)(?::(\d*))?))?([^?#]*)(\?[^#]*)?(#[\s\S]*)?/);
	// authority = '//' + user + ':' + pass '@' + hostname + ':' port
	return (m ? {
		href     : m[0] || '',
		protocol : m[1] || '',
		authority: m[2] || '',
		host     : m[3] || '',
		hostname : m[4] || '',
		port     : m[5] || '',
		pathname : m[6] || '',
		search   : m[7] || '',
		hash     : m[8] || ''
	} : null);
}
function resolveUrl(base, href) {// RFC 3986
	function removeDotSegments(input) {
		var output = [];
		input.replace(/^(\.\.?(\/|$))+/, '')
			.replace(/\/(\.(\/|$))+/g, '/')
			.replace(/\/\.\.$/, '/../')
			.replace(/\/?[^\/]*/g, function (p) {
				if (p === '/..') {
					output.pop();
				} else {
					output.push(p);
				}
		});
		return output.join('').replace(/^\//, input.charAt(0) === '/' ? '/' : '');
	}

	href = parseURI(href || '');
	base = parseURI(base || '');

	return !href || !base ? null : (href.protocol || base.protocol) +
		(href.protocol || href.authority ? href.authority : base.authority) +
		removeDotSegments(href.protocol || href.authority || href.pathname.charAt(0) === '/' ? href.pathname : (href.pathname ? ((base.authority && !base.pathname ? '/' : '') + base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1) + href.pathname) : base.pathname)) +
		(href.protocol || href.authority || href.pathname ? href.search : (href.search || base.search)) +
		href.hash;
}
function isTrustedUrl(baseUrl, testUrl) {
	if(testUrl.substring(0, baseUrl.length) === baseUrl){
		var remainder = testUrl.substring(baseUrl.length);
		if ((testUrl.length > 0 && testUrl.charAt(baseUrl.length - 1) === "/")
			|| remainder.charAt(0) === "#"
			|| remainder.charAt(0) === "?") {
			return true;
		}
	}
	return false;
}
schema2js.util = {
	parseUrl: parseURI,
	resolveUrl: resolveUrl,
	isSubUrl: isTrustedUrl
};

var SchemaStore = schema2js.SchemaStore = function SchemaStore(parent) {
	this.schemas = parent ? Object.create(parent.schemas) : {};
	this.missingUrls = parent ? Object.create(parent.missingUrls) : {};
	this.missing = function (url, noAdd) {
		if (url === undefined) {
			if (!parent) {
				return Object.keys(this.missingUrls);
			} else {
				var result = [];
				for (var key in this.missingUrls) {
					if (parent.missing(key)) {
						result.push(key);
					} else {
						delete this.missingUrls[key];
					}
				}
				return result;
			}
		} else {
			if (this.schemas[url]) return false;
			var baseUrl = url.replace(/#.*/, '');
			var result = (this.missingUrls[baseUrl] || !(baseUrl in this.schemas)) && (!parent || parent.missing(url));
			if (result && !noAdd) {
				this.missingUrls[baseUrl] = true;
			}
			return result;
		}
	};
};
SchemaStore.prototype = {
	child: function () {
		return new SchemaStore(this);
	},
	add: function (url, schema) {
		if (typeof url === 'object') {
			schema = url;
			url = schema.id || arguments[1];
		}
		var baseUrl = url.replace(/#.*/, '');
		if (url === baseUrl + '#') {
			url = baseUrl;
		}
		if (schema) schema.id = schema.id || url;
		delete this.missingUrls[baseUrl];
		this.schemas[url] = schema;
		this._searchSchema(schema, url);
	},
	_searchSchema: function (schema, baseUri) {
		if (schema && typeof schema === "object") {
			if (baseUri === undefined) {
				baseUri = schema.id;
			} else if (typeof schema.id === "string") {
				schema.id = baseUri = resolveUrl(baseUri, schema.id);
			}
			
			if (Array.isArray(schema)) {
				for (var i = 0; i < schema.length; i++) {
					this._searchSchema(schema[i], baseUri);
				}
			} else {
				if (typeof schema.id === 'string' && isTrustedUrl(baseUri, schema.id)) {
					if (this.schemas[schema.id] === undefined) {
						this.schemas[schema.id] = schema;
					}
				}
				if (typeof schema['$ref'] === "string") {
					schema['$ref'] = resolveUrl(baseUri, schema['$ref']);
				}
				for (var key in schema) {
					if (key === "enum") {
						continue;						
					} else if (typeof schema[key] === 'object') {
						this._searchSchema(schema[key], baseUri);
					} else if (key === '$ref') {
						var refUri = schema[key];
						var baseRefUri = refUri.replace(/#.*/, '');
						if (baseRefUri && !(refUri in this.schemas) && !(baseRefUri in this.schemas)) {
							this.missingUrls[baseRefUri] = true;
						}
					}
				}
			}
		}
	},
	resolveRefs: function (schema, urlHistory) {
		if (schema && schema['$ref'] !== undefined) {
			urlHistory = urlHistory || {};
			if (urlHistory[schema['$ref']]) {
				return this.createError(ErrorCodes.CIRCULAR_REFERENCE, {urls: Object.keys(urlHistory).join(', ')}, '', '');
			}
			urlHistory[schema['$ref']] = true;
			schema = this.get(schema['$ref'], urlHistory);
		}
		return schema;
	},
	get: function (url, urlHistory, ignoreRefs) {
		var schema;
		if (this.schemas[url] !== undefined) {
			schema = this.schemas[url];
			return ignoreRefs ? schema : this.resolveRefs(schema, urlHistory);
		}
		var baseUrl = url.replace(/#.*/, '');
		var fragment = url.substring(baseUrl.length + 1);
		if (typeof this.schemas[baseUrl] === 'object') {
			schema = this.schemas[baseUrl];
			var pointerPath = decodeURIComponent(fragment);
			if (pointerPath === "") {
				return ignoreRefs ? schema : this.resolveRefs(schema, urlHistory);
			} else if (pointerPath.charAt(0) !== "/") {
				return undefined;
			}
			var parts = pointerPath.split("/").slice(1);
			for (var i = 0; i < parts.length; i++) {
				var component = parts[i].replace(/~1/g, "/").replace(/~0/g, "~");
				if (!schema || schema[component] === undefined) {
					return undefined;
				}
				schema = schema[component];
			}
			if (schema !== undefined) {
				return ignoreRefs ? schema : this.resolveRefs(schema, urlHistory);
			}
		}
		this.missingUrls[baseUrl] = true;
	}
};
schema2js.SchemaStore = SchemaStore;

// taken from tv4
var ErrorCodes = schema2js.ErrorCodes = {
	INVALID_TYPE: 0,
	ENUM_MISMATCH: 1,
	ANY_OF_MISSING: 10,
	ONE_OF_MISSING: 11,
	ONE_OF_MULTIPLE: 12,
	NOT_PASSED: 13,
	// Numeric errors
	NUMBER_MULTIPLE_OF: 100,
	NUMBER_MINIMUM: 101,
	NUMBER_MINIMUM_EXCLUSIVE: 102,
	NUMBER_MAXIMUM: 103,
	NUMBER_MAXIMUM_EXCLUSIVE: 104,
	// String errors
	STRING_LENGTH_SHORT: 200,
	STRING_LENGTH_LONG: 201,
	STRING_PATTERN: 202,
	// Object errors
	OBJECT_PROPERTIES_MINIMUM: 300,
	OBJECT_PROPERTIES_MAXIMUM: 301,
	OBJECT_REQUIRED: 302,
	OBJECT_ADDITIONAL_PROPERTIES: 303,
	OBJECT_DEPENDENCY_KEY: 304,
	// Array errors
	ARRAY_LENGTH_SHORT: 400,
	ARRAY_LENGTH_LONG: 401,
	ARRAY_UNIQUE: 402,
	ARRAY_ADDITIONAL_ITEMS: 403,
	// Custom/user-defined errors
	FORMAT_CUSTOM: 500,
	KEYWORD_CUSTOM: 501,
	// Schema structure
	CIRCULAR_REFERENCE: 600, // $ref loop
	// Schema/document availability
	SCHEMA_MISSING: 700,
	SCHEMA_FETCH_ERROR: 701,
	DOCUMENT_FETCH_ERROR: 702,
	// Non-standard validation options
	UNKNOWN_PROPERTY: 1000
};

function indent(string) {
	return ('\t' + string.replace(/\n/g, '\n\t')).replace(/\t+$/, '');
}
function normUrl(url) {
	if (url.split('#')[1] === '') return url.split('#')[0];
	return url;
}
function propertyExpression (valueExpr, key) {
	if (/^[a-zA-Z][a-zA-Z0-9_]*/.test(key)) return valueExpr + '.' + key;
	return valueExpr + '[' + JSON.stringify(key) + ']';
}

function uriTemplatePart(subject, spec) {
	var prefix = spec.match(/^[+#./;?&]*/)[0];
	var hasPrefix = function (x) {return prefix.indexOf(x) !== -1};
	var suffix = spec.match(/[*]*$/)[0];
	var vars = spec.substring(prefix.length).split(',');

	var codeParts = [];
	if (hasPrefix('#')) codeParts.push('"#"');
	if (hasPrefix('.')) codeParts.push('"."');
	if (hasPrefix('/')) codeParts.push('"/"');
	vars.forEach(function (varSpec, index) {
		var varName = varSpec;
		var suffixMatch = varSpec.match(/(\:[0-9]+)?([*]*)$/);
		var truncation = suffixMatch[1];
		var varSuffix = suffixMatch[2];
		varName = varName.substring(0, varName.length - suffixMatch[0].length);
		
		var itemJoin = ',', arrayPrefix = '', pairJoin = ',';
		if (varSuffix.indexOf('*') + 1) {
			pairJoin = '=';
			if (hasPrefix('.')) {
				itemJoin = '.';
			} else if (hasPrefix('/')) {
				itemJoin = '/';
			} else if (hasPrefix(';')) {
				itemJoin = ';';
				arrayPrefix = encodeURIComponent(varName) + '=';
			} else if (hasPrefix('?') || hasPrefix('&')) {
				itemJoin = '&';
				arrayPrefix = encodeURIComponent(varName) + '=';
			}
		}
		var conditional = '';
		if (hasPrefix(';')) {
			if (varSuffix.indexOf('*') === -1) {
				codeParts.push(JSON.stringify(';' + varName));
				conditional = '=';
			} else {
				codeParts.push(JSON.stringify(';'));
			}
		} else if (hasPrefix('?') && index == 0) {
			if (varSuffix.indexOf('*') === -1) {
				codeParts.push(JSON.stringify('?' + varName + '='));
			} else {
				codeParts.push(JSON.stringify('?'));
			}
		} else if (hasPrefix('?') || hasPrefix('&')) {
			if (varSuffix.indexOf('*') === -1) {
				codeParts.push(JSON.stringify('&' + varName + '='));
			} else {
				codeParts.push(JSON.stringify('&'));
			}
		} else if (hasPrefix('&')) {
			codeParts.push(JSON.stringify('&' + varName + '='));
		} else if (index > 0) {
			if (hasPrefix('.')) {
				codeParts.push('"."');
			} else if (hasPrefix('/')) {
				codeParts.push('"/"');
			} else if (hasPrefix('?')) {
				codeParts.push('"&"');
			} else {
				codeParts.push('","');
			}
		}
		var modFunctions = [];
		if (truncation) {
			var truncationChars = parseInt(truncation.substring(1));
			modFunctions.push(function (code) {
				return '(' + code + ' || "").substring(0, ' + truncationChars + ')';
			});
		}
		if (!hasPrefix('+') && !hasPrefix('#')) {
			modFunctions.push(function (code) {
				return 'encodeURIComponent(' + code + ').replace(/!/g, "%21")';
			});
		} else {
			modFunctions.push(function (code) {
				return 'encodeURI(' + code + ')';
			});
		}
		
		// Construct actual code
		var result = subject(varName);
		if (typeof result === 'string') result = {code: result};
		var expr = result.code, type = result.type;
		var modFunction = !modFunctions.length ? null : function (x) {
			modFunctions.forEach(function (func) {
				x = func(x);
			});
			return x;
		};
		
		function couldBeType(t) {
			if (Array.isArray(type)) return type.indexOf(t) === -1;
			if (typeof type === 'string') return type === t;
			return true;
		}
		
		var typeCode = {};
		if (couldBeType('array')) {
			if (!modFunction) return JSON.stringify(arrayPrefix) + ' + ' + expr + '.join(' + JSON.stringify(itemJoin + arrayPrefix) + ')';
			typeCode['array'] = expr + '.map(function (x) {\n'
				+ '	return ' + (arrayPrefix ? JSON.stringify(arrayPrefix) + ' + ' : '') + modFunction('x') + ';\n'
				+ '}).join(' + JSON.stringify(itemJoin) + ')';
		}
		if (couldBeType('object')) {
			if (!modFunction) modFunction = function (x) {return x};
			typeCode['object'] ='Object.keys(' + expr + ').map(function (key) {\n'
				+ '	return ' + modFunction('key') + ' + ' + JSON.stringify(pairJoin) + ' + ' + modFunction(expr + '[key]') + ';\n'
				+ '}).join(' + JSON.stringify(itemJoin) + ')';
		}
		if (couldBeType('string') || couldBeType('number') || couldBeType('integer') || couldBeType('boolean')) {
			typeCode['plain'] = modFunction(expr);
		}
		
		var code;
		if (Object.keys(typeCode).length === 1) {
			code = typeCode[Object.keys(typeCode)[0]];
		} else {
			code = '';
			if (typeCode.object && typeCode.plain) {
				code = '(typeof ' + expr + ' === "object" ? ' + typeCode.object + ' : ' + typeCode.plain + ')';
			} else if (typeCode.object) {
				code = typeCode.object;
			} else {
				code = typeCode.plain;
			}
			if (typeCode.array) {
				code = '(Array.isArray(' + expr + ') ? ' + typeCode.array + ' : ' + code + ')';
			}
		}
		if (conditional) {
			code = '(' + expr + '?' + JSON.stringify(conditional) + '+' + code + ':"")';
		}
		codeParts.push(code);
	});
	
	return codeParts.join(' + ');
}

var uriTemplate = schema2js.uriTemplate = function uriTemplate(subject, template) {
	if (typeof subject !== 'function') {
		var subjectVar = subject;
		subject = function (property) {
			return propertyExpression(subjectVar, property);
		};
	}
	
	var codeParts = [];
	
	var parts = template.split('{');
	var firstConstant = parts.shift();
	if (firstConstant) codeParts.push(JSON.stringify(firstConstant));
	while (parts.length) {
		var part = parts.shift();
		var spec = part.split('}')[0];
		codeParts.push(uriTemplatePart(subject, spec));
		var remainder = part.substring(spec.length + 1);
		if (remainder) codeParts.push(JSON.stringify(remainder));
	}
	
	if (!codeParts.length) codeParts.push('""');
	return codeParts.join(' + ');
};

var Generator = schema2js.Generator = function Generator(config) {
	if (!(this instanceof Generator)) return new Generator(config);
	
	config = config || {};
	this.schemaStore = config.schemaStore || new SchemaStore();
	this.config = {
		directMethods: config.directMethods !== false,
		validation: config.validation !== false,
		subErrors: (config.subErrors !== false) && true,
		unicodeLength: config.unicodeLength !== false,
		assignment: config.assignment || false,
		linkAssignment: config.linkAssignment || false,
		trackMissing: config.trackMissing || false,
		classes: (config.classes !== false) && true
	};
	this.classNames = {};
	this.classVars = {GeneratedClass: true}; // it's our default superclass, so make sure it won't be used later
	this.aliases = {};
	this.missingMap = {};
	this.previouslyHandled = {};
};
Generator.prototype = {
	addSchema: function (url, schema, name) {
		this._codeInvalid = true;
		delete this._code;
		if (typeof url === 'object') {
			name = schema;
			schema = url;
			url = schema && schema.id;
		}
		url = (typeof url === 'string') ? url : (Math.random().toString().substring(2) + 'anonymous');
		url = normUrl(url || '');
		var baseUrl = url.replace(/#.*/, '');
		if (this.previouslyHandled[url]) {
			// Force a re-compute
			throw new Error('Forcing a re-compute of ' + url);
			delete this.previouslyHandled[url];
		}
		if (typeof schema === 'object') {
			this.schemaStore.add(url, schema);
		} else {
			name = name || schema;
			this.missingMap[url] = true;
			if (!this.previouslyHandled[baseUrl]) {
				this.missingMap[baseUrl] = true;
			}
		}
		this.classNames[url] = name || this.classNames[url] || "";
		this.classVarForUrl(url); // reserves an appropriate variable name
		return this;
	},
	missing: function (url) {
		if (typeof url !== 'string') {
			var result = Object.keys(this.missingMap);
			this.schemaStore.missing().forEach(function (url) {
				if (result.indexOf(url) === -1) result.push(url);
			});
			return result;
		} else {
			var baseUrl = url.replace(/#.*/, '');
			return this.missingMap[url] || (!this.previouslyHandled[normUrl(url)] && !this.previouslyHandled[baseUrl]);
		}
	},
	code: function () {
		if (!this._codeInvalid && this._code) return this._code;
		this._codeInvalid = false;
		var code = '';
		code += 'function pointerEscape(key) {\n';
		code += indent('return key.replace(/~/g, "~0").replace(/\\//g, "~1");\n');
		code += '}\n';
		if (this.config.unicodeLength) {
			code += 'function unicodeLength(string) {\n';
			code += indent('return string.replace(/[\\uD800-\\uDBFF][\\uDC00-\\uDFFF]/g, "_").length;\n');
			code += '}\n';
		}
		code += 'if (superclass && typeof superclass === "object") {\n';
		code += indent('request = classes;\n');
		code += indent('classes = superclass;\n');
		code += indent('superclass = null;\n');
		code += '}\n';
		code += 'superclass = superclass || function GeneratedClass() {};\n';
		code += 'if (typeof classes === "function") {\n';
		code += indent('request = classes;\n');
		code += indent('classes = null;\n');
		code += '}\n';
		code += 'request = request || function ErrorFunc() {throw new Error("No web-request function provided");};\n';
		code += 'classes = classes || {};\n';
		var handledUrls = {};
		var urls = Object.keys(this.aliases).concat(Object.keys(this.classNames));
		var addCodeForUrl = function (url, immediate) {
			if (handledUrls[url]) return;
			if (url in this.aliases) {
				return addCodeForUrl(this.aliases[url]);
			}
			if (immediate) {
				handledUrls[url] = true;
				code += '\n' + this.codeForUrl(url, addCodeForUrl);
			} else {
				urls.push(url);
			}
		}.bind(this);
		for (var i = 0; i < urls.length; i++) {
			var url = normUrl(urls[i]);
			if (!this.previouslyHandled[url]) {
				addCodeForUrl(url, true);
			}
		}
		for (var url in this.aliases) {
			if (this.previouslyHandled[url]) continue;
			this.previouslyHandled[url] = true;

			var alias = this.aliases[url];
			var urlName = this.classNameForUrl(url);
			var aliasName = this.classNameForUrl(alias);
			code += '\n/* $ref: ' + url.replace(/\*/g, '%2A') + ' -> ' + alias.replace(/\*/g, '%2A') + ' */\n';

			if (this.config.classes === false) {
				// Validation and links only
				code += propertyExpression('classes', urlName) + ' = {};\n';
			} else {
				code += propertyExpression('classes', urlName) + ' = function () {\n';
				code += indent('return ' + propertyExpression('classes', aliasName) + '.apply(this, arguments);\n');
				code += '};\n';
				code += propertyExpression('classes', urlName) + '.prototype = Object.create(' + propertyExpression('classes', aliasName) + '.prototype);\n';
			}
			if (this.config.validation) {
				code += propertyExpression('classes', urlName) + '.validate = function (data) {\n';
				code += indent('return ' + propertyExpression('classes', aliasName) + '.validate(data);\n');
				code += '};\n';
				code += '/*' + JSON.stringify(this.config) + '*/\n';
				code += propertyExpression('classes', urlName) + '.validationErrors = function (data, path' + (this.config.assignment ? ', schemaMap' : '') + (this.config.linkAssignment ? ', linkMap' : '') + (this.config.trackMissing ? ', missing' : '') + ') {\n';
				code += indent('return ' + propertyExpression('classes', aliasName) + '.validationErrors(data, path' + (this.config.assignment ? ', schemaMap' : '') + (this.config.linkAssignment ? ', linkMap' : '') + (this.config.trackMissing ? ', missing' : '') + ');\n');
				code += '};\n';
			}
		}
		code += '\nreturn classes;\n';
		code = 'function (superclass, classes, request) {\n' + indent(code) + '}';
		return this._code = code;
	},
	classExprForUrl: function (url) {
		return propertyExpression('classes', this.classNameForUrl(url))
	},
	classVarForUrl: function (url, suffix) {
		this._codeInvalid = true;
		if (typeof suffix !== 'string') suffix = 'Class';
		var varName = this.classNames[url] || url;
		varName = varName.replace(/^[^#?]*[/]/g, '').replace(/[^a-zA-Z0-9]+([a-zA-Z0-9]?)/g, function (match, nextChar) {
			return nextChar.toUpperCase();
		});
		varName = varName.replace(/^[^a-zA-Z]*/, '') || 'anonymous'; // strip leading zeros
		varName = varName.charAt(0).toUpperCase() + varName.substring(1);
		
		if (!this.classVars[varName + suffix] || this.classVars[varName + suffix] === url) {
			this.classVars[varName + suffix] = url;
			return varName + suffix;
		}
		var counter = 2;
		while (this.classVars[varName + counter + suffix] && this.classVars[varName + counter + suffix] !== url) {
			counter++;
		}
		this.classVars[varName + counter + suffix] = url;
		return varName + counter + suffix;
	},
	classNameForUrl: function (url) {
		url = normUrl(url);
		return this.classNames[url] = this.classNames[url] || this.classVarForUrl(url, '');
	},
	extendUrl: function (url, components) {
		if (url.indexOf('#') === -1) url += '#';
		components.forEach(function (key) {
			url += '/' + encodeURIComponent(key.toString().replace(/~/g, '~0').replace(/\//g, '~1'));
		});
		return url;
	},
	schemaAcceptsType: function (schema, type) {
		return !schema.type || schema.type === type || (Array.isArray(schema.type) && schema.type.indexOf(type) !== -1);
	},
	schemaOnlyAcceptsType: function (schema, type) {
		return schema.type === type || (schema.type && schema.type.length === 1 && schema.type[0] === type);
	},
	schemaRequiresProperty: function(schema, property) {
		if (!schema.required) return false;
		return schema.required.indexOf(property) !== -1;
	},
	getFullSchema: function (schema, haltUrls) {
		if (!schema || typeof schema['$ref'] !== 'string') return schema;
		haltUrls = haltUrls || {};
		var refUrl = schema['$ref'];
		if (haltUrls[refUrl]) return {"description": "ERROR! Recursion"};
		haltUrls[refUrl] = true;
		var schema = this.schemaStore.get(refUrl, null, true);
		if (!schema) {
			if (this.schemaStore.missing(refUrl)) {
				this.missingMap[refUrl] = true;
			}
			return {"description": "Missing schema: " + refUrl, placeholder: true};
		}
		if (!schema.id) schema.id = normUrl(refUrl);
		return this.getFullSchema(schema, haltUrls);
	},
	codeForUrl: function (url, requireUrl) {
		var schema = this.schemaStore.get(url, null, true);
		if (!schema) {
			if (this.schemaStore.missing(url)) {
				this.missingMap[url] = true;
			} else {
				// It's resolved properly, it's just empty
				delete this.missingMap[url];
				this.previouslyHandled[url] = true;
			}
			schema = {"description": "Missing schema: " + url};
		} else if (typeof schema.$ref === 'string') {
			this.aliases[url] = schema.$ref;
			requireUrl(schema.$ref);
			return '// skipping ' + url + ' - will add as reference later\n';
		} else {
			this.previouslyHandled[url] = true;
			delete this.missingMap[url];
			url = schema.id || url;
			this.previouslyHandled[url] = true;
			delete this.missingMap[url];
		}

		var code = '/* Schema: ' + url.replace(/\*/g, '%2A') + ' */\n';
		
		var classKey = this.classNameForUrl(url);
		var classExpression = this.classVarForUrl(url || 'anonymous');
		if (!this.schemaAcceptsType(schema, 'object') || this.config.classes === false) {
			// Validation and links only
			code += 'var ' + classExpression + ' = ' + propertyExpression('classes', classKey) + ' = {};\n';
		} else {
			code += 'var ' + classExpression + ' = ' + propertyExpression('classes', classKey) + ' = function ' + classExpression + '(value) {\n';
			var body = '';
			body += 'if (!(this instanceof ' + classExpression + ')) return new ' + classExpression + '(value);\n';
			if ('default' in schema) {
				body += 'value = value || ' + JSON.stringify(schema['default']) + ';\n';
			}
			
			var castProperty = function(subSchema, subUrl, thisKeyExpr) {
				if (this.schemaAcceptsType(subSchema, 'object')) {
					var subClassVar = this.classExprForUrl(subUrl);
					requireUrl(subUrl);
					var conditions = [];
					if (this.schemaAcceptsType('null')) {
						conditions.push(thisKeyExpr);
					}
					if (this.schemaAcceptsType('array')) {
						conditions.push('!Array.isArray(' + thisKeyExpr + ')');
					}
					if (this.schemaOnlyAcceptsType(subSchema, 'object')) {
						if (!this.schemaRequiresProperty(schema, key)) {
							conditions.push(thisKeyExpr);
						}
					} else {
						conditions.push('typeof ' + thisKeyExpr + ' === "object"');
					}
					body += 'if (' + conditions.join(' && ') + ') {\n';
					body += indent('' + thisKeyExpr + ' = new ' + subClassVar + '(' + thisKeyExpr + ');\n');
					body += '}\n';
				}
			}.bind(this);
			
			// Defaults and property conversion
			for (var key in schema.properties || {}) {
				var subSchema = this.getFullSchema(schema.properties[key]);
				body += 'if (typeof ' + propertyExpression('value', key) + ' !== "undefined") {\n';
				body += indent(propertyExpression('this', key) + ' = ' + propertyExpression('value', key) + ';\n');
				if ('default' in subSchema) {
					body += '} else {\n';
					body += indent(propertyExpression('this', key) + ' = ' + JSON.stringify(subSchema['default']) + ';\n');
				}
				body += '}\n';
				var subUrl = (subSchema && subSchema.id) || this.extendUrl(url, ['properties', key]);
				castProperty(subSchema, subUrl, propertyExpression('this', key));
			}
			if (schema.additionalProperties) {
				body += 'var keys = Object.keys(value);\n';
				body += 'for (var i = 0; i < keys.length; i++) {\n';
				body += indent('var key = keys[i];\n');
				body += indent('if (!(key in this)) {\n');
				body += indent(indent('this[key] = value[key];\n'));
				if (typeof schema.additionalProperties === 'object') {
					var subSchema = this.getFullSchema(schema.additionalProperties);
					var subUrl = (subSchema && subSchema.id) || this.extendUrl(url, ['additionalProperties']);
					castProperty(subSchema, subUrl, propertyExpression('this[key]'));
				}
				body += indent('}\n');
				body += '}\n';
			}
			
			var superclassExpr = 'superclass';
			
			body += '\n' + superclassExpr + '.apply(this, arguments);\n';
			code += indent(body);
			code += '};\n';
			code += classExpression + '.prototype = Object.create(' + superclassExpr + '.prototype);\n';
			if (schema.title) {
				code += classExpression + '.title = ' + JSON.stringify(schema.title) + ';\n';
			}
			if (schema.description) {
				code += classExpression + '.description = ' + JSON.stringify(schema.description) + ';\n';
			}
		}
		code += classExpression + '.schema = ' + JSON.stringify(url) + ';\n';
			
		// Hyper-schema links
		code += classExpression + '.links = {};\n';
		(schema.links || []).forEach(function (ldo) {
			var rel = ldo.rel;
			var prettyRel = rel.replace(/.*[/#?]/g, '').replace(/[^a-zA-Z0-9]+([a-zA-Z0-9]?)/, function (match, nextChar) {
				return nextChar.toUpperCase();
			});
			var method = (ldo.method || 'GET').toUpperCase();
			var encType = ldo.encType || ldo.enctype || ((method === 'GET' || method === 'DELETE') ? 'application/x-www-form-urlencoded' : 'application/json');
			
			var body = '';
			body += 'if (typeof params === "function") {\n';
			body += indent('callback = params;\n');
			body += indent('params = null;\n');
			body += '}\n';
			body += 'var href = ' + uriTemplate(function (property) {
				var code = propertyExpression('obj', property);
				return {
					code: code,
					type: ((schema.properties || {})[property] || {}).type
				};
			}, ldo.href) + ';\n';
			body += 'request({\n';
			body += indent('href: href,\n');
			body += indent('method: ' + JSON.stringify(method) + ',\n');
			body += indent('encType: ' + JSON.stringify(encType) + ',\n');
			body += indent('data: params || null\n');
			body += '}, callback || function () {});';
			
			var methodName = method.toLowerCase() + prettyRel.charAt(0).toUpperCase() + prettyRel.substring(1);
			code += classExpression + '.links[' + JSON.stringify(methodName) + ']' + ' = function (obj, params, callback) {\n';
			code += indent(body);
			code += '};\n';
			if (this.config.directMethods && this.schemaAcceptsType(schema, 'object')) {
				code += classExpression + '.prototype[' + JSON.stringify(methodName) + ']' + ' = function (params, callback) {\n';
				code += indent('return ' + classExpression + '.links[' + JSON.stringify(methodName) + '](this, params, callback);\n');
				code += '};\n';
			}
		}.bind(this));
		if (this.config.validation) {
			code += classExpression + '.validationErrors = function (value, dataPath' + (this.config.assignment ? ', schemaMap' : '') + (this.config.linkAssignment ? ', linkMap' : '') + (this.config.trackMissing ? ', missing' : '') + ') {\n';
			if (this.config.assignment) {
				code += indent('schemaMap = schemaMap || {};\n');
			}
			if (this.config.linkAssignment) {
				code += indent('linkMap = linkMap || {};\n');
			}
			code += indent('dataPath = dataPath || "";\n');
			code += indent('var errors = [];\n');
			code += indent(this.validationCode('value', [], url, schema, requireUrl, function (errorExpr, single) {
				if (single) return 'errors.push(' + errorExpr + ');\n';
				return 'errors = errors.concat(' + errorExpr + ');\n'
			}, false));
			code += indent('return errors;\n');
			code += '}\n';
			code += classExpression + '.validate = function (value) {\n';
			if (this.config.assignment) {
				code += indent('var schemaMap = {};\n');
			}
			if (this.config.linkAssignment) {
				code += indent('var linkMap = {};\n');
			}
			if (this.config.trackMissing) {
				code += indent('var missing = {};\n');
			}
			code += indent('var errors = ' + classExpression + '.validationErrors(value, ""' + (this.config.assignment ? ', schemaMap' : '') + (this.config.linkAssignment ? ', linkMap' : '') + (this.config.trackMissing ? ', missing' : '') + ');\n');
			code += indent('return {valid: !errors.length, errors: errors' + (this.config.assignment ? ', schemas: schemaMap' : '') + (this.config.linkAssignment ? ', links: linkMap' : '') + (this.config.trackMissing ? ', missing: missing' : '') + '};\n');
			code += '}\n';
		}
		return code;
	},
	validationCode: function (valueExpr, dataPathExprs, schemaUrl, schema, requireUrl, errorFunc, useReference) {
		var allowedTypes = schema.type || ['null', 'boolean', 'number', 'string', 'object', 'array'];
		if (!Array.isArray(allowedTypes)) allowedTypes = [allowedTypes];
		var allowedType = function (type) {return allowedTypes.indexOf(type) !== -1;};

		var dataPathExpr = 'dataPath';
		for (var i = 0; i < dataPathExprs.length; i++) {
			var part = dataPathExprs[i];
			if (part[0] === '"' && dataPathExpr[dataPathExpr.length - 1] == '"') {
				dataPathExpr = dataPathExpr.substring(0, dataPathExpr.length - 1) + part.substring(1);
			} else {
				dataPathExpr += ' + ' + part;
			}
		}

		// TODO: figure out better criteria - not sure object-support is worth checking unless we're generating classes
		if (useReference === true || (useReference !== false && (this.missing(schemaUrl) || this.schemaAcceptsType(schema, 'object')))) {
			var classVar = this.classExprForUrl(schemaUrl);
			requireUrl(schemaUrl);
			return errorFunc(classVar + '.validationErrors(' + valueExpr + ', ' + dataPathExpr + (this.config.assignment ? ', schemaMap' : '') + (this.config.linkAssignment ? ', linkMap' : '') + (this.config.trackMissing ? ', missing' : '') + ')');
		}

		var validation = '';
		
		var schemaUrlExpr = JSON.stringify(schemaUrl);

		if (this.config.trackMissing && !this.schemaStore.get(schemaUrl)) {
			validation += 'if (missing) {\n';
			validation += indent('(missing[' + dataPathExpr + '] = missing[' + dataPathExpr + '] || []).push(' + schemaUrlExpr + ');\n');
			validation += '}\n';
		}
		if (this.config.assignment) {
			validation += 'if (!schemaMap[' + dataPathExpr + ']) {\n';
			validation += indent('schemaMap[' + dataPathExpr + '] = [' + schemaUrlExpr + '];\n');
			validation += '} else {\n';
			validation += indent('schemaMap[' + dataPathExpr + '].push(' + schemaUrlExpr + ');\n');
			validation += '}\n';
		}
		if (this.config.linkAssignment && Array.isArray(schema.links) && schema.links.length) {
			validation += 'linkMap[' + dataPathExpr + '] = (linkMap[' + dataPathExpr + '] || []).concat([\n';
			validation += schema.links.map(function (ldo, index) {
				var lines = [];
				var template = ldo.href;
				template = template.replace(/(\{[^\(\}]*)\$([^\}]*\})/g, function (match, firstPart, lastPart) {
					return firstPart + '%73elf' + lastPart;
				});
				template = template.replace(/(\{[^\(\}]*)\((([^\)\}]|\)\))*)\)([^\)\}]*\})/g, function (match, firstPart, innerPart, innerPartLastChar, lastPart) {
					if (!innerPart) return firstPart + '%65mpty' + lastPart;
					return firstPart + encodeURIComponent(innerPart) + lastPart;
				});
				lines.push('href: ' + uriTemplate(function (property) {
					if (property === '%73elf') {
						return {
							code: valueExpr,
							type: schema.type
						};
					} else if (property === '%65mpty') {
						return {
							code: propertyExpression(valueExpr, ''),
							type: ((schema.properties || {})[''] || {}).type
						}
					}
					property = decodeURIComponent(property);
					return {
						code: propertyExpression(valueExpr, property),
						type: ((schema.properties || {})[property] || {}).type
					};
				}, template));
				lines.push('rel: ' + JSON.stringify(ldo.rel));
				if (ldo.method) {
					lines.push('method: ' + JSON.stringify(ldo.method));
				}
				if (ldo.schema) {
					var subUrl = (ldo.schema.id) || this.extendUrl(schemaUrl, ['links', index, 'schema']);
					lines.push('schema: ' + JSON.stringify(subUrl));
				}
				if (ldo.targetSchema) {
					var subUrl = (ldo.schema.id) || this.extendUrl(schemaUrl, ['links', index, 'targetSchema']);
					lines.push('targetSchema: ' + JSON.stringify(subUrl));
				}
				return indent('{\n' + lines.map(indent).join(',\n') + '\n}');
			}.bind(this)).join(',\n');
			validation += '\n]);\n';
		}

		if (schema.allOf) {
			schema.allOf.forEach(function (subSchema, index) {
				var subSchema = this.getFullSchema(subSchema);
				var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['allOf', index]);
				var checkCode = this.validationCode(valueExpr, dataPathExprs, subUrl, subSchema, requireUrl, errorFunc);
				validation += checkCode;
			}.bind(this));
		}

		if (schema.anyOf || schema.oneOf) {
			if (this.config.assignment) {
				validation += 'var actualSchemaMap = schemaMap;\n';
			}
			if (this.config.linkAssignment) {
				validation += 'var actualLinkMap = linkMap;\n';
			}
			validation += 'var actualErrors = errors;\n';
			if (schema.anyOf) {
				validation += 'var anyOfPassCount = 0;\n';
				if (this.config.subErrors) {
					validation += 'var anyOfSubErrors = [];\n';
				}
				schema.anyOf.forEach(function (subSchema, index) {
					validation += 'errors = [];\n'
					if (this.config.assignment) {
						validation += 'schemaMap = {};\n';
					}
					if (this.config.linkAssignment) {
						validation += 'linkMap = {};\n';
					}
					var subSchema = this.getFullSchema(subSchema);
					var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['anyOf', index]);
					var checkCode = this.validationCode(valueExpr, dataPathExprs, subUrl, subSchema, requireUrl, errorFunc, true);
					validation += checkCode;
					validation += 'if (!errors.length) {\n';
					if (this.config.assignment) {
						validation += indent('for (var key in schemaMap) {\n');
						validation += indent(indent('actualSchemaMap[key] = (actualSchemaMap[key] || []).concat(schemaMap[key])\n'));
						validation += indent('}\n');
					}
					if (this.config.linkAssignment) {
						validation += indent('for (var key in linkMap) {\n');
						validation += indent(indent('actualLinkMap[key] = (actualLinkMap[key] || []).concat(linkMap[key])\n'));
						validation += indent('}\n');
					}
					validation += indent('anyOfPassCount++;\n');
					validation += '}\n';
					if (this.config.subErrors) {
						validation += 'anyOfSubErrors[' + index + '] = errors;\n'
					}
				}.bind(this));
			}
			if (schema.oneOf) {
				validation += 'var oneOfPassCount = 0;\n';
				if (this.config.subErrors) {
					validation += 'var oneOfSubErrors = [];\n';
				}
				schema.oneOf.forEach(function (subSchema, index) {
					validation += 'errors = [];\n'
					if (this.config.assignment) {
						validation += 'schemaMap = {};\n';
					}
					if (this.config.linkAssignment) {
						validation += 'linkMap = {};\n';
					}
					var subSchema = this.getFullSchema(subSchema);
					var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['oneOf', index]);
					var checkCode = this.validationCode(valueExpr, dataPathExprs, subUrl, subSchema, requireUrl, errorFunc, true);
					validation += checkCode;
					validation += 'if (!errors.length) {\n';
					if (this.config.assignment) {
						validation += indent('if (!oneOfPassCount) {\n');
						validation += indent(indent('for (var key in schemaMap) {\n'));
						validation += indent(indent(indent('actualSchemaMap[key] = (actualSchemaMap[key] || []).concat(schemaMap[key])\n')));
						validation += indent(indent('}\n'));
						validation += indent('}\n');
					}
					if (this.config.linkAssignment) {
						validation += indent('if (!oneOfPassCount) {\n');
						validation += indent(indent('for (var key in linkMap) {\n'));
						validation += indent(indent(indent('actualLinkMap[key] = (actualLinkMap[key] || []).concat(linkMap[key])\n')));
						validation += indent(indent('}\n'));
						validation += indent('}\n');
					}
					
					validation += indent('oneOfPassCount++;\n');
					validation += '}\n';
					if (this.config.subErrors) {
						validation += 'oneOfSubErrors[' + index + '] = errors;\n'
					}
				}.bind(this));
			}
			if (this.config.assignment) {
				validation += 'schemaMap = actualSchemaMap;\n';
			}
			if (this.config.linkAssignment) {
				validation += 'linkMap = actualLinkMap;\n';
			}
			validation += 'errors = actualErrors;\n';
			if (schema.anyOf) {
				var paramsExpr = this.config.subErrors ? '{errors: anyOfSubErrors}' : '{}';
				validation += 'if (!anyOfPassCount) {\n';
				validation += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.ANY_OF_MISSING) + ', params: ' + paramsExpr + ', path: ' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				validation += '}\n';
			}
			if (schema.oneOf) {
				var paramsExpr = this.config.subErrors ? '{errors: oneOfSubErrors}' : '{}';
				validation += 'if (!oneOfPassCount) {\n';
				validation += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.ONE_OF_MISSING) + ', params: ' + paramsExpr + ', path: ' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				validation += '} else if (oneOfPassCount > 1) {\n';
				validation += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.ONE_OF_MULTIPLE) + ', params: ' + paramsExpr + ', path: ' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				validation += '}\n';
			}
		}
		
		var typeCode = {
			'array': '',
			'object': '',
			'string': '',
			'number': '',
			'boolean': '',
			'null': ''
		};

		// Array constraints
		if (!this.schemaAcceptsType(schema, 'array')) {
			typeCode['array'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: "array", expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path: ' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true);
		} else {
			var arrayCode = '';
			if ('maxItems' in schema) {
				arrayCode += 'if (' + valueExpr + '.length > ' + JSON.stringify(schema.maxItems) + ') {\n';
				arrayCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.ARRAY_LENGTH_LONG) + ', params: {length: ' + valueExpr + '.length, maximum: ' + JSON.stringify(schema.maxItems) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				arrayCode += '}\n';
			}
			if (schema.minItems) {
				arrayCode += 'if (' + valueExpr + '.length < ' + JSON.stringify(schema.minItems) + ') {\n';
				arrayCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.ARRAY_LENGTH_SHORT) + ', params: {length: ' + valueExpr + '.length, minimum: ' + JSON.stringify(schema.minItems) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				arrayCode += '}\n';
			}
			if (Array.isArray(schema.items)) {
				schema.items.forEach(function (subSchema, index) {
					var subSchema = this.getFullSchema(subSchema);
					var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['items', index]);
					var checkCode = this.validationCode(valueExpr + '[' + index + ']', dataPathExprs.concat(['"/0"']), subUrl, subSchema, requireUrl, errorFunc);
					arrayCode += 'if (' + valueExpr + '.length >= ' + JSON.stringify(index) + ') {\n';
					arrayCode += indent(checkCode);
					arrayCode += '}\n';
				}.bind(this));
				if ('additionalItems' in schema) {
					if (!schema.additionalItems) {
						arrayCode += 'if (' + valueExpr + '.length > ' + JSON.stringify(schema.items.length) + ') {\n';
						arrayCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.ARRAY_LENGTH_LONG) + ', params: {length: ' + valueExpr + '.length, maximum: ' + JSON.stringify(schema.items.length) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
						arrayCode += '}\n';
					} else {
						var subSchema = this.getFullSchema(schema.additionalItems);
						var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['additionalItems']);
						var checkCode = this.validationCode(valueExpr + '[i]', dataPathExprs.concat(['"/"', 'i']), subUrl, subSchema, requireUrl, errorFunc);
						arrayCode += 'for (var i = ' + JSON.stringify(schema.items.length) + '; i < ' + valueExpr + '.length; i++) {\n';
						arrayCode += indent(checkCode);
						arrayCode += '}\n';
					}
				}
			} else if (typeof schema.items === 'object') {
				var subSchema = this.getFullSchema(schema.items);
				var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['items']);
				arrayCode += 'for (var i = 0; i < ' + valueExpr + '.length; i++) {\n';
				arrayCode += indent(this.validationCode(valueExpr + '[i]', dataPathExprs.concat(['"/"', 'i']), subUrl, subSchema, requireUrl, errorFunc));
				arrayCode += '}\n';
			}
			typeCode['array'] += arrayCode;
		}

		if (!allowedType('object')) {
			typeCode['object'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: typeof ' + valueExpr + ', expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true);
		} else {
			var objectCode = '';
			var doneKeys = {};
			var specificKeys = Object.keys(schema.properties || {}).concat(Object.keys(schema.dependencies || {})).concat(schema.required || []);
			specificKeys.forEach(function (key) {
				if (doneKeys[key]) return;
				doneKeys[key] = true;
				var propertyExpr = propertyExpression(valueExpr, key);
				var checkCode = '';
				if (schema.properties && schema.properties[key]) {
					var subSchema = this.getFullSchema(schema.properties[key]);
					var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['properties', key]);
					checkCode += this.validationCode(propertyExpr, dataPathExprs.concat([JSON.stringify('/' + key.replace(/~/g, '~0').replace(/\//g, '~1'))]), subUrl, subSchema, requireUrl, errorFunc);
				}
				if (schema.dependencies && key in schema.dependencies) {
					if (Array.isArray(schema.dependencies[key]) || typeof schema.dependencies[key] === 'string') {
						var depKeys = Array.isArray(schema.dependencies[key]) ? schema.dependencies[key] : [schema.dependencies[key]];
						depKeys.forEach(function (dependency) {
							checkCode += 'if (!(' + JSON.stringify(dependency) + ' in ' + valueExpr + ')) {\n';
							checkCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.OBJECT_DEPENDENCY_KEY) + ', params: {key: ' + JSON.stringify(key) + ', missing: ' + JSON.stringify(dependency) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
							checkCode += '}\n';
						});
					} else {
						var subSchema = this.getFullSchema(schema.dependencies[key]);
						var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['dependencies', key]);
						checkCode += this.validationCode(valueExpr, dataPathExprs, subUrl, subSchema, requireUrl, errorFunc);
					}
				}
				objectCode += 'if (' + JSON.stringify(key) + ' in ' + valueExpr + ') {\n';
				objectCode += indent(checkCode);
				if (this.schemaRequiresProperty(schema, key)) {
					objectCode += '} else {\n';
					objectCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.OBJECT_REQUIRED) + ', params: {key: ' + JSON.stringify(key) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				}
				objectCode += '}\n';
			}.bind(this));
			if (schema.patternProperties || 'additionalProperties' in schema || 'maxProperties' in schema || 'minProperties' in schema) {
				objectCode += 'var keys = Object.keys(' + valueExpr + ');\n';
				if ('maxProperties' in schema) {
					objectCode += 'if (keys.length > ' + JSON.stringify(schema.maxProperties) + ') {\n';
					objectCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.OBJECT_PROPERTIES_MAXIMUM) + ', params: {propertyCount: keys.length, maximum: ' + JSON.stringify(schema.maxProperties) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
					objectCode += '}\n';
				}
				if ('minProperties' in schema) {
					objectCode += 'if (keys.length < ' + JSON.stringify(schema.minProperties) + ') {\n';
					objectCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.OBJECT_PROPERTIES_MINIMUM) + ', params: {propertyCount: keys.length, minimum: ' + JSON.stringify(schema.minProperties) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
					objectCode += '}\n';
			 	}
			}
			if (schema.patternProperties || 'additionalProperties' in schema) {
				objectCode += 'var knownKeys = {' + Object.keys(schema.properties || {}).map(function (key) {
					return JSON.stringify(key) + ': true';
				}).join(', ') + '};\n';
				objectCode += 'for (var i = 0; i < keys.length; i++) {\n';
				objectCode += indent('var key = keys[i];\n');
				if (schema.patternProperties && 'additionalProperties' in schema) {
					objectCode += indent('var matched = false;\n');
				}
				var propertyExpr = valueExpr + '[key]';
				for (var key in schema.patternProperties) {
					var regExpCode = '/' + key.replace(/\//g, '\\/') + '/';
					var subSchema = this.getFullSchema(schema.patternProperties[key]);
					var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['patternProperties', key]);
					objectCode += indent('if (' + regExpCode + '.test(key)) {\n');
					objectCode += indent(indent(this.validationCode(propertyExpr, dataPathExprs.concat(['"/"', 'pointerEscape(key)']), subUrl, subSchema, requireUrl, errorFunc)));
					if ('additionalProperties' in schema) {
						objectCode += indent(indent('matched = true;\n'));
					}
					objectCode += indent('}');
				}
				if ('additionalProperties' in schema) {
					if (schema.patternProperties) {
						objectCode += indent('if (!matched && !knownKeys[key]) {\n');
					} else {
						objectCode += indent('if (!knownKeys[key]) {\n');
					}
					if (!schema.additionalProperties) {
						objectCode += indent(indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.OBJECT_ADDITIONAL_PROPERTIES) + ', params: {key: key}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true)));
					} else if (typeof schema.additionalProperties === 'object') {
						var subSchema = this.getFullSchema(schema.additionalProperties);
						var subUrl = (subSchema && subSchema.id) || this.extendUrl(schemaUrl, ['additionalProperties']);
						objectCode += indent(indent(this.validationCode(propertyExpr, dataPathExprs.concat(['"/"', 'pointerEscape(key)']), subUrl, subSchema, requireUrl, errorFunc)));
					}
					objectCode += indent('}\n');
				}
				objectCode += '}\n';
			}
			typeCode['object'] += objectCode;
		}

		if (!allowedType('string')) {
			// Although we'll know it's a string at this point in the code, we use "typeof" instead so it can be grouped
			typeCode['string'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: typeof ' + valueExpr + ', expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true);
		} else {
			var stringCode = '';
			var lengthExpr = valueExpr + '.length';
			if (this.config.unicodeLength && (schema.minLength || 'maxLength' in schema)) {
				stringCode += 'var stringLength = unicodeLength(' + valueExpr + ');\n';
				lengthExpr = 'stringLength';
			}
			if (schema.minLength) {
				stringCode += 'if (' + lengthExpr + ' < ' + JSON.stringify(schema.minLength) + ') {\n';
				stringCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.STRING_LENGTH_SHORT) + ', params: {length: ' + lengthExpr + ', minimum: ' + JSON.stringify(schema.minLength) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				stringCode += '}\n';
			}
			if ('maxLength' in schema) {
				stringCode += 'if (' + lengthExpr + ' > ' + JSON.stringify(schema.maxLength) + ') {\n';
				stringCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.STRING_LENGTH_LONG) + ', params: {length: ' + lengthExpr + ', maximum: ' + JSON.stringify(schema.maxLength) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				stringCode += '}\n';
			}
			if (schema.pattern) {
				var regExpCode = '/' + (schema.pattern + "").replace(/\//g, '\\/') + '/';
				stringCode += 'if (!' + regExpCode + '.test(' + valueExpr + ')) {\n';
				stringCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.STRING_PATTERN) + ', params: {pattern: ' + JSON.stringify(schema.pattern) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				stringCode += '}\n';
			}
			typeCode['string'] += stringCode;
		}

		if (!allowedType('number') && !allowedType('integer')) {
			typeCode['number'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: typeof ' + valueExpr + ', expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true);
		} else {
			var numberCode = '';
			var divisor = schema.multipleOf || schema.divisibleBy;
			if (!this.schemaAcceptsType(schema, 'number') && (isNaN(divisor) || divisor%1 !== 0)) {
				numberCode += 'if (' + valueExpr + '%1 !== 0) {\n';
				numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: "number", expected: "integer"}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				numberCode += '}\n';
			}
			if (schema.multipleOf || schema.divisibleBy) {
				numberCode += 'if ((' + valueExpr + '/' + JSON.stringify(divisor) + ')%1 !== 0) {\n';
				numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MULTIPLE_OF) + ', params: {multipleOf: ' + JSON.stringify(divisor) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
				numberCode += '}\n';
			}
			if ('minimum' in schema) {
				if (schema.exclusiveMinimum) {
					numberCode += 'if (' + valueExpr + ' <= ' + JSON.stringify(schema.minimum) + ') {\n';
					numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MINIMUM_EXCLUSIVE) + ', params: {value: ' + valueExpr + ', minimum: ' + JSON.stringify(schema.minimum) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
					numberCode += '}\n';
				} else {
					numberCode += 'if (' + valueExpr + ' < ' + JSON.stringify(schema.minimum) + ') {\n';
					numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MINIMUM) + ', params: {value: ' + valueExpr + ', minimum: ' + JSON.stringify(schema.minimum) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
					numberCode += '}\n';
				}
			}
			if ('maximum' in schema) {
				if (schema.exclusiveMaximum) {
					numberCode += 'if (' + valueExpr + ' >= ' + JSON.stringify(schema.maximum) + ') {\n';
					numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MAXIMUM_EXCLUSIVE) + ', params: {value: ' + valueExpr + ', maximum: ' + JSON.stringify(schema.maximum) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
					numberCode += '}\n';
				} else {
					numberCode += 'if (' + valueExpr + ' > ' + JSON.stringify(schema.maximum) + ') {\n';
					numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MAXIMUM) + ', params: {value: ' + valueExpr + ', maximum: ' + JSON.stringify(schema.maximum) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true));
					numberCode += '}\n';
				}
			}
			typeCode['number'] += numberCode;
		}

		if (!allowedType('boolean')) {
			typeCode['boolean'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: typeof ' + valueExpr + ', expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true);
		}
		
		if (!allowedType('null')) {
			typeCode['null'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: "null", expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:' + dataPathExpr + ', schema: ' + schemaUrlExpr + '}', true);
		}
		
		validation += 'if (Array.isArray(' + valueExpr + ')) {\n';
		validation += indent(typeCode['array']);
		validation += '} else if (' + valueExpr + ' == null) {\n';
		validation += indent(typeCode['null']);
		
		// For neatness: figure out which types of object are distinct, and group them into the same else-if-block
		var distinctCode = {};
		distinctCode[typeCode['object']] = (distinctCode[typeCode['object']] || []).concat(['object']);
		distinctCode[typeCode['string']] = (distinctCode[typeCode['string']] || []).concat(['string']);
		distinctCode[typeCode['number']] = (distinctCode[typeCode['number']] || []).concat(['number']);
		distinctCode[typeCode['boolean']] = (distinctCode[typeCode['boolean']] || []).concat(['boolean']);

		var codeBlocks = Object.keys(distinctCode);
		codeBlocks.sort(function (a, b) {
			// Sort fewest-options first, so the final "else" saves as much as possible
			if (!a) return 1;
			if (!b) return -1;
			return distinctCode[a].length - distinctCode[b].length;
		});
		codeBlocks.forEach(function (code, index) {
			if (index === codeBlocks.length - 1) {
				if (code) { // if the last one's empty, just leave it
					validation += '} else {\n';
				}
			} else {
				var condition = distinctCode[code].map(function (type) {
					return 'typeof ' + valueExpr + ' === ' + JSON.stringify(type);
				}).join(' || ');
				validation += '} else if (' + condition + ') {\n';
			}
			validation += indent(code);
		});
		
		validation += '}\n';
		return validation;
	},
	classes: function (superclass, request) {
		if (!this._codeInvalid && this._classes) {
			return this._classes;
		}
		var code = this.code();
		delete this._code;
		try {
			var func = new Function('superclass', 'classes', 'request', 'return ' + code + '(superclass, classes, request)');
		} catch (e) {
			e.code = code;
			throw e;
		}
		return this._classes = func(superclass, this._classes, request);
	}
};

api.schema2js = schema2js;
var ErrorCodes = api.ErrorCodes = schema2js.ErrorCodes;

function pointerEscape(key) {
	return key.replace(/~/g, "~0").replace(/\//g, "~1");
}
function pointerUnescape(key) {
	return key.replace(/~1/g, "/").replace(/~0/g, "~");
}
function splitHeader(value) {
	if (value == null) return [];
	return value.match(/(^|,)(([^,\\"]|"([^"\\]|\\.)*"?)*)/g).map(function (value) {
		return value.replace(/^,?\s*/, '');
	});
}
function parseLink(linkFormat) {
	var href = linkFormat.match(/^\s*<([^>]*)>/) || null;
	var result = {href: href[1] || null};
	var remainder = linkFormat.replace(/^[^>]+>\s*;?/, '');
	remainder.match(/(^|;)(([^;\\"]|"([^"\\]|\\.)*"?)*)/g).map(function (part) {
		part = part.replace(/^\s*(;\s*)?/, '');
		var key = part.replace(/\=.*/, '');
		var remainder = part.substring(key.length).replace(/(^\s*=\s*|\s+$)/g, '');
		if (remainder.charAt(0) === '"') {
			try {
				remainder = JSON.parse(remainder);
			} catch (e) {
				// do nothing
			}
		}
		result[key] = result[key] || remainder;
	});
	return result;
}
function parseQuery(queryString) {
	var result = {};
	(queryString.match(/(^\??|&)([^&]+)/g) || []).forEach(function (part) {
		part = part.substring(1);
		var key = part.split('=', 1)[0];
		var value = part.substring(key.length + 1);
		result[decodeURIComponent(key)] = decodeURIComponent(value);
	});
	return result;
}
function encodeQuery(query) {
	var parts = [];
	for (var key in query) {
		parts.push(encodeURIComponent(key) + '=' + encodeQueryComponent(query[key]));
	}
	return parts.length ? ('?' + parts.join('&')) : '';
}
function encodeQueryComponent(str) {
	return encodeURIComponent(str).replace(/%2F/gi, '/');
}
var asap = (typeof process === 'object' && typeof process.nextTick === 'function') ? process.nextTick.bind(process) : function (func) {
	setTimeout(func, 0);
};
var timerWait = function (minGapMs, maxWaitMs, listener) {
	if (typeof maxWaitMs === 'function') {
		listener = maxWaitMs;
		maxWaitMs = minGapMs;
		minGapMs = null;
	}
	var longTimer = null, shortTimer = null;
	return function () {
		var thiz = this, args = arguments;
		var execute = function () {
			clearTimeout(longTimer);
			clearTimeout(shortTimer);
			longTimer = shortTimer = null;
			listener.apply(thiz, args);
		};
		if (minGapMs) {
			if (shortTimer) clearTimeout(shortTimer);
			shortTimer = setTimeout(execute, minGapMs);
		}
		longTimer = longTimer || setTimeout(execute, maxWaitMs);
	};
};

var parseUrl = schema2js.util.parseUrl;
var resolveUrl = schema2js.util.resolveUrl;
var relativeUrl = function (base, href, keepAbsolutePath) {
	href = resolveUrl(base, href);
	var loc = base;
	if (!keepAbsolutePath && href === loc) return;
	var locParsed = parseUrl(loc);
	var domain = locParsed.protocol + locParsed.authority;
	var path = base.replace(/[#?].*/g, '').replace(/\/$/, '');
	if (!keepAbsolutePath && href.substring(0, path.length) === path) {
		href = href.substring(path.length);
	} else if (href.substring(0, domain.length) === domain) {
		href = href.substring(domain.length);
	}
	return href;
};

api.util = {
	pointerEscape: pointerEscape,
	pointerUnescape: pointerUnescape,
	splitHeader: splitHeader,
	parseLink: parseLink,
	url: {
		parse: parseUrl,
		resolve: resolveUrl,
		relative: relativeUrl,
		parseQuery: parseQuery,
		encodeQuery: encodeQuery,
		encodeQueryComponent: encodeQueryComponent
	},
	timer: {
		asap: asap,
		wait: timerWait
	}
};

// Quick+dirty EventEmitter class
function EventEmitter() {
}
EventEmitter.prototype = {
	on: function (event, listener) {
		this._events = this._events || {};
		this._events[event] = this._events[event] || [];
		this._events[event].push(listener);
		this.emit('newListener', event, listener);
		return this;
	},
	once: function (event, listener) {
		var selfRemovingListener = function () {
			this.off(event, selfRemovingListener);
			listener.apply(this, arguments);
		};
		return this.on(event, selfRemovingListener);
	},
	off: function (event, listener) {
		if (!listener) {
			if (!event) {
				for (event in this._events || {}) {
					this.off(event);
				}
			} else {
				var listeners = (this._events && this._events[event]) || [];
				while (listeners.length) {
					this.emit('removeListener', event, listeners.shift());
				}
				this._events[event] = [];
			}
		} else if (event) {
			this._events = this._events || {};
			this._events[event] = this._events[event] || [];
			var index = this._events[event].indexOf(listener);
			if (index !== -1) {
				this._events[event].splice(index, 1);
			}
			this.emit('removeListener', event, listener);
		}
		return this;
	},
	removeListener: function (event, listener) {
		if (typeof listener !== 'function') throw new Error('Listener must be function');
		return this.off(event, listener);
	},
	emit: function (event) {
		var args = Array.prototype.slice.call(arguments, 1);
		if (this._events && this._events[event]) {
			var listeners = this._events[event].slice();
			while (listeners.length) {
				var listener = listeners.shift();
				listener.apply(this, args);
			}
			return true;
		}
		return false;
	}
};
EventEmitter.prototype.addListener = EventEmitter.prototype.on;
EventEmitter.prototype.removeAllListeners = EventEmitter.prototype.off;
EventEmitter.addMethods = function (obj) {
	for (var key in EventEmitter.prototype) {
		obj[key] = EventEmitter.prototype[key];
	}
	return obj;
};
api.EventEmitter = EventEmitter;

var errorRequestFunction = function (params) {throw new Error('Requests not enabled - try JsonModel.setRequestFunction(func):\n' + JSON.stringify(params));};
var suppliedRequestFunction = errorRequestFunction;
function requestFunction(params, callback) {
	return suppliedRequestFunction(params, callback);
}
api.setRequestFunction = function (func) {
	suppliedRequestFunction = func || errorRequestFunction;
};

var schemaStore, generator, generatedClasses;
var generatorConfig = {classes: false, assignment: true, linkAssignment: true, trackMissing: true, schemaStore: schemaStore, directMethods: false};
var clean = api.clean = function setupClean(callback) {
	if (callback) {
		// If possible, delay cleaning until schemas fetched
		return whenSchemasFetched(function () {
			clean();
			callback();
		});
	}
	requestErrors = {};
	pendingRequests = {};
	var config = Object.create(generatorConfig);
	config.schemaStore = schemaStore = api.schemaStore = new schema2js.SchemaStore();
	generator = new schema2js.Generator(config);
	generatedClasses = generator.classes(null, requestFunction);
	api.setRequestFunction(null);
};
clean();

api.validator = function (schema, callback) {
	callback = callback || function () {};
	var transform = function (validatorErrors) {
		return function (data) {
			var schemaMap = {};
			var linkMap = {};
			var missingMap = {};
			var errors = validatorErrors(data, "", schemaMap, linkMap, missingMap);
			return {valid: !errors.length, errors: errors, schemas: schemaMap, links: linkMap, missing: missingMap};
		};
	};
	
	var result = transform(api.validationErrors(schema, function (error) {
		callback(error, result);
	}));
	return result;
};
api.validationErrors = function (schema, callback) {
	callback = callback || function () {};
	if (typeof schema === 'string') {
		if (generator.missing(schema)) {
			generator.addSchema(schema);
		}
		var name = generator.classNameForUrl(schema);
		var validator = function (data, dataPath, schemaMap, linkMap, missingMap) {
			if (generatedClasses[name]) {
				return generatedClasses[name].validationErrors(data, dataPath, schemaMap, linkMap, missingMap);
			} else {
				if (schemaMap) {
					schemaMap[''] = schemaMap[''] || [];
					schemaMap[''].push(schema);
				}
				if (missingMap) {
					missingMap[''] = missingMap[''] || [];
					missingMap[''].push(schema);
				}
				return [];
			}
		};
		whenSchemasFetched(function () {
			callback(null, validator);
		});
		return validator;
	} else {
		var anonymousGen = new schema2js.Generator(generatorConfig);
		var className = 'AnonymousSchema';
		anonymousGen.addSchema(schema, className);
		var classes = anonymousGen.classes();
		var validator = classes[className].validationErrors;

		var missing = anonymousGen.missing();
		// Make sure the main generator will have/fetch all the appropriate schemas
		missing.forEach(function (url) {
			if (generator.missing(url)) {
				generator.addSchema(url);
			}
		});
		
		// This block goes first, because if we actually have all the schemas already, it might trigger a sychronous regeneration
		whenSchemasFetched(function () {
			missing.forEach(function (url) {
				var className = generator.classNameForUrl(url);
				classes[anonymousGen.classNameForUrl(url)] = generatedClasses[className];
			});
			callback(null, validator);
		});
		missing.forEach(function (url) {
			var className = generator.classNameForUrl(url);
			if (generatedClasses[className]) {
				classes[anonymousGen.classNameForUrl(url)] = generatedClasses[className];
			}
		});
		return validator;
	}
};

function SchemaSet(schemas) {
	// TODO: expandAllOf flag
	this._schemas = schemas;
	this._props = {};
	this._patterns = {};
}
SchemaSet.prototype = {
	_cache: function (method, result) {
		this[method] = function () {
			return result;
		};
		return result;
	},
	_cacheArray: function (method, result) {
		this[method] = function () {
			return result.slice(0);
		};
		return result.slice(0);
	},
	titles: function () {
		return this._cacheArray('titles', this._schemas.map(function (schema) {
			return schema.title;
		}));
	},
	knownKeys: function (key) {
		var keys = [], props = {};
		function addKey(key) {
			if (!props[key]) {
				props[key] = true;
				keys.push(key);
			}
		}
		this._schemas.forEach(function (schema) {
			(schema.propertyOrder || []).forEach(addKey);
			(schema.required || []).forEach(addKey);
			for (var key in schema.properties || {}) {
				addKey(key);
			}
		});
		return keys;
	},
	prop: function (key) {
		if (this._props[key]) return this._props[key];
		
		var newSchemas = [];
		for (var i = 0; i < this._schemas.length; i++) {
			var schema = this._schemas[i];
			var found = false;
			if (schema.properties && schema.properties[key]) {
				newSchemas.push(schema.properties[key]);
				found = true;
			}
			if (schema.patternProperties) {
				for (var pattern in patternProperties) {
					var regexp = this._patterns[pattern] = this._patterns[pattern] || new RegExp(pattern);
					if (regexp.test(key)) {
						newSchemas.push(schema.patternProperties[pattern]);
						found = true;
					}
				}
			}
			if (!found && 'additionalProperties' in schema) {
				if (!schema.additionalProperties) {
					newSchemas = [false];
					break;
				}
			}
		}
		return this._props[key] = new SchemaSet(newSchemas);
	},
	item: function (index) {
		var newSchemas = [], individual = false;
		
		for (var i = 0; i < this._schemas.length; i++) {
			var schema = this._schemas[i];
			if (schema.items) {
				if (Array.isArray(schema.items)) {
					individual = true;
					throw new Error('array tuples not supported yet');
				} else {
					newSchemas.push(schema.items);
				}
			}
		}
		
		if (!individual) {
			return this._cache('item', new SchemaSet(newSchemas));
		} else {
			throw new Error('Array tuples not supported yet');
		}
	}
};

function resolvePointer(path, valueTarget) {
	var pathParts = path.split('/').slice(1).map(pointerUnescape);
	var finalKey = pathParts.pop();
	for (var i = 0; i < pathParts.length; i++) {
		var key = pathParts[i];
		if (valueTarget && typeof valueTarget === 'object') {
			valueTarget = valueTarget[key];
		} else {
			finalKey = null;
			break;
		}
	}
	return {target: valueTarget, key: finalKey};
}

function RootModel(dataStore, storeKey) {
	var thisRootModel = this;
	this.dataStore = dataStore;
	this.storeKey = storeKey;
	this.state = Date.now(); // Just an arbitrary number

	var pendingPoke = null;
	function pokeNow() {
		dataStore._pokeRootModel(storeKey, thisRootModel);
	}
	function clearPoke() {
		pendingPoke = null;
	}
	var pokeStore = this.pokeStore = function () {
		pendingPoke = pendingPoke || pokeNow() || asap(clearPoke) || true;
	};
	
	// Hypertext metadata
	this.url = null;
	this.http = {
		status: null,
		headers: {}
	};

	// ready state
	this.ready = true;
	var whenReadyCallbacks = [];
	this.whenReady = function (callback) {
		if (this.ready) return asap(callback);
		whenReadyCallbacks.push(callback);
	};
	var pendingOperations = 0;
	this.pendingOperation = function () {
		this.ready = false;
		pendingOperations++;
		return decrementPendingOperations;
	};
	function decrementPendingOperations() {
		if (!--pendingOperations) {
			thisRootModel.ready = true;
			while (whenReadyCallbacks.length) {
				whenReadyCallbacks.shift()();
			}
		}
	};
	
	var value = null;
	var validatorFunctions = [];
	var schemaMap = {};
	var schemaSetCache = {};
	var linkMap = {};
	var missingSchemas = {};
	var errors = [];
	var pendingSchemaRecalculate = false;

	function recalculateSchemas() {
		schemaMap = {};
		linkMap = {};
		missingSchemas = {};
		errors = [];
		// Recalculate schemas (from scratch for now - TODO: we'll improve this later!)
		for (var i = 0; i < validatorFunctions.length; i++) {
			errors = errors.concat(validatorFunctions[i](value, "", schemaMap, linkMap, missingSchemas));
		}
	}
	// Trigger schema-change events for a tree (with optional ignored child)
	function checkSchemaChanges(path, modelSet, ignoreKey, oldSchemaMap) {
		var oldSchemas = oldSchemaMap[path] || [];
		var newSchemas = schemaMap[path] || [];
		var added = [], removed = [];
		for (var i = 0; i < oldSchemas.length; i++) {
			if (newSchemas.indexOf(oldSchemas[i]) === -1) {
				removed.push(oldSchemas[i]);
			}
		}
		for (var i = 0; i < newSchemas.length; i++) {
			var schemaUrl = newSchemas[i];
			if (oldSchemas.indexOf(schemaUrl) === -1) {
				added.push(schemaUrl);
			}
		}
		if (added.length || removed.length) {
			if (modelSet.m) {
				modelSet.m.emit('schemachange', added, removed);
			}
			for (var key in modelSet.c) {
				if (ignoreKey === null || key !== ignoreKey) {
					checkSchemaChanges(path + "/" + pointerEscape(key), modelSet.c[key], null, oldSchemaMap);
				}
			}
		}
	}
	
	// TODO: emit relative JSON Pointer for parent changes?
	function childValueChanges(modelSet) {
		for (var key in modelSet.c) {
			var childModelSet = modelSet.c[key];
			if (childModelSet.m) {
				childModelSet.m.emit('change', '');
			}
			childValueChanges(childModelSet)
		}
	}
	
	this.reset = function (value, schemas) {
		pendingOperations++;
		validatorFunctions = (schemas || []).map(function (schema) {
			pendingOperations++;
			if (typeof schema === 'string') {
				schema = resolveUrl(thisRootModel.url || this.dataStore.baseUrl, schema);
			}
			return api.validationErrors(schema, decrementPendingOperations);
		});
		this.ready = (pendingOperations <= 1) && !validatorFunctions.length || api.schemasFetched();
		this.setPathValue('', value);
		asap(decrementPendingOperations);
	};
	
	var models = {c: {}};
	this.modelForPath = function (path) {
		var pathParts = path.split('/').slice(1).map(pointerUnescape);
		var target = models;
		for (var i = 0; i < pathParts.length; i++) {
			var key = pathParts[i];
			target = target.c[key] = target.c[key] || {c: {}};
		}
		return target.m = target.m || new Model(this, path);
	}
	
	this.setPathValue = function (path, newValue) {
		this.state--;
		pokeStore();
		if (!path) {
			value = newValue;
		} else {
			var resolved = resolvePointer(path, value);
			if (resolved.target && typeof resolved.target === 'object') {
				if (resolved.target[resolved.key] === newValue) {
					return true;
				} else if (typeof newValue === 'undefined') {
					delete resolved.target[resolved.key];
				} else {
					resolved.target[resolved.key] = newValue;
				}
			} else {
				return false;
			}
		}
		
		// Parent+child value+schema changes
		var oldSchemaMap = schemaMap;
		recalculateSchemas();
		var pathParts = path.split('/');
		var modelSet = models;
		for (var i = 1; i <= pathParts.length; i++) {
			var partialPath = pathParts.slice(0, i).join('/');
			var nextKey = null;
			if (partialPath !== path) {
				nextKey = pointerUnescape(pathParts[i]);
			}
			checkSchemaChanges(partialPath, modelSet, nextKey, oldSchemaMap);
			if (modelSet.m) {
				modelSet.m.emit('change', path.substring(partialPath.length));
			}
			if (nextKey !== null) {
				modelSet = modelSet.c[nextKey];
				if (!modelSet) break;
			} else {
				// End of the queue, so iterate into children
				childValueChanges(modelSet);
			}
		}
		
		if (!this.ready && !pendingSchemaRecalculate) {
			pendingSchemaRecalculate = true;
			// We un-shift (instead of using whenReady) to make sure it executes first, before any other callbacks
			whenReadyCallbacks.unshift(function () {
				schemaSetCache = {};
				pendingSchemaRecalculate = false;
				var oldSchemaMap = schemaMap;
				recalculateSchemas();
				checkSchemaChanges('', models, null, oldSchemaMap);
			});
		}
		return true;
	};
	this.getPathValue = function (path) {
		pokeStore();
		if (!path) {
			return value;
		}
		var resolved = resolvePointer(path, value);
		if (resolved.target && typeof resolved.target === 'object') {
			return resolved.target[resolved.key];
		} else {
			return undefined;
		}
	};
	this.getPathSchemas = function (path) {
		return (schemaMap[path] || []).slice(0);
	};
	this.getPathSchemaSet = function (path) {
		var schemas = schemaMap[path] || [];
		var key = schemas.join('\n');
		var allStrings = schemas.every(function (schema) {
			return typeof schema === 'string';
		});
		if (allStrings) {
			return schemaSetCache[key] = schemaSetCache[key] || new SchemaSet(schemas.map(function (schema) {
				return schemaStore.get(schema);
			}));
		}
		throw new Error('Non-string schemas not supported yet');
	};
	this.getPathLinks = function (path, filter) {
		var thisRootModel = this;
		var result = linkMap[path] || [];
		if (!path && this.http.headers.link) {
			result = result.concat(splitHeader(this.http.headers.link).map(parseLink));
		}
		return result.filter(function (link) {
			if (typeof filter === 'string' && filter !== link.rel) return false;
			return true;
		}).map(function (link) {
			return new Link(thisRootModel, link);
		});
	};
	this.getPathErrors = function (path, includeSchemaErrors, immediateOnly) {
		path = path || "";
		var result = errors.filter(function (error) {
			return error.path == path
				|| (!immediateOnly && error.path.substring(0, path.length) == path
					&& error.path.charAt(path.length) == '/');
		});
		if (includeSchemaErrors) {
			for (var dataPath in missingSchemas) {
				if (dataPath == path
					|| (!immediateOnly && dataPath.substring(0, path.length) == path
						&& dataPath.charAt(path.length) == '/')) {
					missingSchemas[dataPath].forEach(function (schemaUrl) {
						var baseUrl = schemaUrl.replace(/#.*/, '');
						if (requestErrors[baseUrl]) {
							result.push({
								code: ErrorCodes.SCHEMA_FETCH_ERROR,
								path: dataPath,
								params: {message: requestErrors[baseUrl].message, status: (requestErrors[baseUrl].httpStatus || null)},
								schema: schemaUrl
							});
						} else {
							result.push({
								code: ErrorCodes.SCHEMA_MISSING,
								path: dataPath,
								params: {},
								schema: schemaUrl
							});
						}
					});
				}
			}
		}
		return result;
	};
}
RootModel.prototype = {
};

function normPathSpec(pathSpec) {
	if (pathSpec == null) pathSpec = "";
	pathSpec = pathSpec + "";
	if (pathSpec && pathSpec.charAt(0) !== "/") {
		pathSpec = "/" + pointerEscape(pathSpec);
	}
	return pathSpec;
}

function Model(rootModel, path) {
	this._root = rootModel;
	this._path = path;
}
Model.prototype = {
	url: function () {
		return this._root.url + (this._path && ('#' + encodeURI(this._path)));
	},
	resolveUrl: function (url) {
		return resolveUrl(this._root.url, url);
	},
	relativeUrl: function (url, keepAbsolutePath) {
		return relativeUrl(this._root.url, url, keepAbsolutePath);
	},
	httpStatus: function (status) {
		return this._root.http.status;
	},
	httpHeaders: function (callback, split) {
		if (typeof callback === 'boolean') {
			split = callback;
			callback = null;
		}
		var headers = this._root.http.headers;
		var result = {};
		for (var key in headers) {
			result[key] = split ? splitHeader(headers[key]) : headers[key];
			if (callback) {
				callback(key, result[key]);
			}
		}
		return result;
	},
	httpHeader: function (key, split) {
		var result = this._root.http.headers[key.toLowerCase()] || null;
		return split ? splitHeader(result) : result;
	},
	ready: function () {
		return this._root.ready;
	},
	whenReady: function (callback) {
		this._root.whenReady(callback.bind(null, null, this));
	},
	get: function (pathSpec) {
		return this._root.getPathValue(this._path + normPathSpec(pathSpec));
	},
	set: function (pathSpec, value) {
		if (arguments.length < 2) {
			value = pathSpec;
			pathSpec = "";
		}
		return this._root.setPathValue(this._path + normPathSpec(pathSpec), value);
	},
	up: function (levels) {
		if (typeof levels !== 'number') {
			levels = 1;
		}
		var parts = this._path.split('/');
		parts = parts.slice(0, parts.length - levels);
		return this._root.modelForPath(parts.join('/'));
	},
	path: function (pathSpec) {
		return this._root.modelForPath(this._path + normPathSpec(pathSpec));
	},
	pointer: function () {
		return this._path;
	},
	length: function (pathSpec) {
		var value = this.get(pathSpec);
		if (Array.isArray(value)) return value.length;
		return 0;
	},
	item: function (index) {
		return this._root.modelForPath(this._path + '/' + pointerEscape(index + ''));
	},
	items: function (callback) {
		var length = this.length();
		for (var i = 0; i < length; i++) {
			callback(this.item(i), i);
		}
		return this;
	},
	map: function (callback) {
		var result = [];
		this.items(function (item, i) {
			var entry = callback(item, i);
			if (typeof entry !== 'undefined') {
				result.push(entry);
			}
		});
		return result;
	},
	keys: function (pathSpec) {
		var value = this.get(pathSpec);
		if (!value || Array.isArray(value) || typeof value !== 'object') return [];
		return Object.keys(value);
	},
	has: function (pathSpec) {
		return this.jsonType(pathSpec) !== 'undefined';
	},
	prop: function (key) {
		return this._root.modelForPath(this._path + '/' + pointerEscape(key + ''));
	},
	props: function (keys, callback) {
		if (typeof keys === 'function') {
			callback = keys;
			keys = null;
		}
		keys = keys || this.keys();
		for (var i = 0; i < keys.length; i++) {
			callback(this.prop(keys[i]), keys[i], i);
		}
		return this;
	},
	mapProps: function (keys, callback) {
		if (typeof keys === 'function') {
			var result = {};
			this.props(function (prop, key, index) {
				var entry = keys(prop, key, index);
				if (typeof entry !== 'undefined') {
					result[key] = entry;
				}
			});
			return result;
		} else {
			var result = [];
			for (var i = 0; i < keys.length; i++) {
				var entry = callback(this.prop(keys[i]), keys[i], i);
				if (typeof entry !== 'undefined') {
					result.push(entry);
				}
			}
			return result;
		}
	},
	schemas: function (pathSpec) {
		return this._root.getPathSchemas(this._path + normPathSpec(pathSpec));
	},
	schemaSet: function (pathSpec) {
		return this._root.getPathSchemaSet(this._path + normPathSpec(pathSpec));
	},
	links: function (filter) {
		return this._root.getPathLinks(this._path, filter);
	},
	link: function (filter, index) {
		return this.links(filter)[index || 0] || null;
	},
	hasSchema: function (pathSpec, url) {
		if (typeof url !== 'string') {
			url = pathSpec;
			pathSpec = null;
		}
		return this.schemas(pathSpec).indexOf(url) !== -1;
	},
	errors: function (pathSpec, includeSchemaErrors, exactOnly) {
		if (pathSpec === true || pathSpec === false) {
			exactOnly = includeSchemaErrors;
			includeSchemaErrors = pathSpec;
			pathSpec = "";
		} else if (pathSpec == null) {
			pathSpec = "";
		}
		pathSpec = pathSpec + "";
		if (pathSpec && pathSpec.charAt(0) !== "/") {
			pathSpec = "/" + pointerEscape(pathSpec);
		}
		return this._root.getPathErrors(this._path + pathSpec, includeSchemaErrors, exactOnly);
	},
	jsonType: function (pathSpec) {
		var value = this.get(pathSpec);
		if (value === undefined) return 'undefined';
		if (value === null) return 'null';
		if (Array.isArray(value)) return 'array';
		return typeof value;
	},
	toJSON: function () {
		return this.get();
	}
};
EventEmitter.addMethods(Model.prototype);

function Link(rootModel, obj) {
	this._root = rootModel;
	this.href = resolveUrl(rootModel.url, obj.href);
	this.rel = obj.rel;
	this.method = obj.method || 'GET';
}
Link.prototype = {
	open: function (data, callback) {
		if (typeof data === 'function') {
			callback = data;
			data = null;
		}
		return this._root.dataStore.open(this, callback);
	}
};

var pendingRequests = {};
var requestErrors = {};
var whenAllSchemasFetchedCallbacks = [];
function checkSchemasFetched(skipCallbacks) {
	var pendingUrls = Object.keys(pendingRequests);
	if (pendingUrls.length === 0) {
		generatedClasses = generator.classes(null, requestFunction);
		if (generator.missing().length) {
			// induce another round of requests
			return whenSchemasFetched();
		}
		while (!skipCallbacks && whenAllSchemasFetchedCallbacks.length) {
			var callback = whenAllSchemasFetchedCallbacks.shift();
			callback();
		}
	}
}
api.schemasFetched = function () {
	return !generator.missing().length;
};
var whenSchemasFetched = api.whenSchemasFetched = function whenSchemasFetched(callback) {
	if (callback) {
		whenAllSchemasFetchedCallbacks.push(callback);
	}
	generator.missing().forEach(function (missingUrl) {
		var baseUrl = missingUrl.replace(/#.*/, '');
		if (!schemaStore.missing(missingUrl) || !schemaStore.missing(baseUrl)) {
			return checkSchemasFetched(true);
		}
		missingUrl = baseUrl;
		
		if (pendingRequests[missingUrl]) return;
		pendingRequests[missingUrl] = true;
		requestFunction({method: 'GET', url: missingUrl}, function (error, data, status) {
			delete pendingRequests[missingUrl];
			if (error) {
				if (typeof console !== 'undefined' && console.error) {
					console.error('Error fetching ' + missingUrl + ':', error);
				}
				error.httpStatus = error.httpStatus || status;
				requestErrors[missingUrl] = error;
				generator.addSchema(missingUrl, null);
			} else {
				generator.addSchema(missingUrl, data || null);
			}
			checkSchemasFetched();
		});
	});
	// We might have all the schemas anyway, but need a refresh, so regenerate the schemas only
	checkSchemasFetched(true);
	asap(checkSchemasFetched);
}

function DataStore(parent, baseUrl) {
	if (typeof parent === 'string') {
		baseUrl = parent;
		parent = null;
	}
	this.baseUrl = baseUrl || (parent ? parent.baseUrl : '');
	this.parent = parent;
	this.config = parent ? Object.create(parent.config) : {
		keepMs: 1000
	}
	this._store = parent ? Object.create(parent._store) : {};
	this._removeTimeouts = {};
}
DataStore.prototype = {
	normParams: function (params) {
		if (typeof params === 'string') return this.normParams({url: params});
		return {
			url: resolveUrl(this.baseUrl, (params.url || params.href)).replace(/#.*/, ''),
			fragment: (params.url || params.href).replace(/[^#]*#?/, ''),
			method: (params.method || 'GET').toUpperCase(),
			headers: params.headers || {},
			targetSchema: ((params.targetSchema || params.hint) ? [params.targetSchema || params.hint] : [])
		};
	},
	_pokeRootModel: function (storeKey, model) {
		var thisStore = this;
		this._store[storeKey] = this._store[storeKey] || model;
		clearTimeout(this._removeTimeouts[storeKey]);
		this._removeTimeouts[storeKey] = setTimeout(function () {
			delete thisStore._store[storeKey];
			delete thisStore._removeTimeouts[storeKey];
		}, this.config.keepMs);
		return model;
	},
	_getRootModel: function (storeKey, create, keepMs) {
		if (this._store[storeKey]) return this._store[storeKey];
		if (create) {
			return this._store[storeKey] = this._pokeRootModel(storeKey, new RootModel(this, storeKey));
		}
		return null;
	},
	_keyForParams: function (params) {
		return params.method + ' ' + params.url;
	},
	open: function (params, callback) {
		var thisStore = this;
		
		params = this.normParams(params);
	
		if (params.fragment && params.fragment.charAt(0) !== '/') {
			throw new Error('Non-pointer fragments not currently supported: #' + params.fragment);
		}
		
		var storeKey = this._keyForParams(params);
		var cached = this._getRootModel(storeKey);
		var rootModel = this._getRootModel(storeKey, true);
		rootModel.url = params.url;
		var model = rootModel.modelForPath(params.fragment || '');
		if (cached) {
			console.log('Cached:', storeKey);
			if (callback) model.whenReady(callback);
			return model;
		}

		var pendingDone = rootModel.pendingOperation();
		requestFunction(params, function (error, data, status, headers) {
			var schemas = [];
			var newHeaders = {};
			for (var key in headers || {}) {
				newHeaders[key.toLowerCase()] = headers[key] + "";
			}
			splitHeader(newHeaders.link).forEach(function (link) {
				var link = parseLink(link);
				if (link.rel.toLowerCase() === 'describedby') {
					schemas.push(link.href);
				}
			});
			if (!schemas.length && !error) {
				schemas = [];
				if (params.targetSchema) schemas.push(params.targetSchema);
			}
		
			rootModel.reset((typeof data !== 'undefined') ? data : null, schemas);
			rootModel.http = {status: status || null, headers: newHeaders};
			pendingDone();

			if (callback) {
				model.whenReady(function () {
					callback(error, model);
				});
			}
		});
		
		return model;
	},
	create: function (initialValue, url, schemas, callback) {
		// Argument juggling
		if (Array.isArray(url)) {
			callback = schemas;
			schemas = url;
			url = null;
		}
		if (typeof url === 'function') {
			callback = url;
			url = schemas = null;
		} else if (typeof schemas === 'function') {
			callback = schemas;
			schemas = null;
		}
		if (typeof url !== 'string') {
			url = 'tmp://' + Math.random().toString().substring(2);
		}
		if (typeof schemas === 'string' || (schemas && typeof schemas === 'object' && !Array.isArray(schemas))) schemas = [schemas];
		schemas = schemas || [];

		// Actual logic
		var params = this.normParams(url);
		if (params.fragment) throw new Error('URL fragments not allowed in create()');

		var key = this._keyForParams(params);
		var rootModel = this._getRootModel(key, true);
		var model = rootModel.modelForPath('');

		rootModel.url = params.url;
		rootModel.reset(initialValue, schemas);
		rootModel.http = {status: null, headers: {}};
		
		if (callback) {
			model.whenReady(callback);
		}
		return model;
	}
};

api.dataStore = new DataStore();
if (typeof window !== 'undefined' && window && window.location && typeof window.location.href === 'string') {
	api.dataStore.baseUrl = window.location.href;
}

api.open = function (params, hintSchemas, callback) {
	return api.dataStore.open(params, hintSchemas, callback);
};
api.create = function (initialValue, url, schemas, callback) {
	return api.dataStore.create(initialValue, url, schemas, callback);
};
api.extend = function (obj) {
	Object.keys(obj).forEach(function (key) {
		Model.prototype[key] = obj[key];
	});
};
api.is = function (potentialModel) {
	return potentialModel instanceof Model;
};

// Default request function in browser
if (typeof XMLHttpRequest === 'function') {
	api.setRequestFunction(function (params, callback) {
		if (params.method !== 'GET') throw new Error('Only GET supported for now');
		
		var request = new XMLHttpRequest();
		try {
			request.open(params.method, params.url, true, params.user, params.password);
		} catch (e) {
			return asap(function () {
				callback(e);
			});
		}
		request.responseType = 'text';
		request.onreadystatechange = function () {
			if (request.readyState !== 4) return;
			var error = null;
			if (request.status < 200 || request.status > 299) {
				error = new Error(request.status + ' ' + request.statusText);
			}
			var headers = {};
			request.getAllResponseHeaders().split(/\r?\n/g).forEach(function (line) {
				if (!line) return;
				var match = /^([^\:\s]+)\s*\:\s*(.*)$/.exec(line);
				if (!match) throw new Error('Failed header parse:', JSON.stringify(line));
				var key = match[1].toLowerCase();
				var value = match[2];
				headers[key] = (value.length > 1) ? value : value[0];
			});
			
			var data = request.responseText;
			try {
				data = JSON.parse(data);
			} catch (e) {
				error = error || e;
			}
			callback(error, data, request.status, headers);
		};
		for (var key in params.headers) {
			request.setRequestHeader(key, params.headers[key]);
		}
		request.send();
	});
}
var asap = api.util.timer.asap;
var resolveUrl = api.util.url.resolve;
var parseUrl = api.util.url.parse;

function isAttached(element) {
	var e = element;
	while (e.parentNode) {
		e = e.parentNode;
	}
	return e === element.ownerDocument;
}

function expandTag(tagName, attrs) {
	var parts = tagName.match(/[#\.][^#\.]+/g) || [];
	tagName = tagName.replace(/[#\.].*/, '') || 'span';
	parts.forEach(function (part) {
		if (part.charAt(0) === '#') {
			attrs.id = args.substring(1);
		} else {
			if (attrs['class']) {
				attrs['class'] += ' ' + part.substring(1);
			} else {
				attrs['class'] = part.substring(1);
			}
		}
	});
	return tagName || 'span';
}

function htmlTag(tagName, attrs) {
	var content = Array.prototype.slice.call(arguments, 2);
	if (typeof attrs !== 'object') {
		content.unshift(attrs);
		attrs = null;
	}
	attrs = attrs || {};
	tagName = expandTag(tagName, attrs);
	
	var html = '<' + tagName;
	for (var key in attrs) {
		var value = attrs[key];
		if (typeof value === 'function') value = value();
		if (api.is(value)) value = value.get();
		if (value === '' || value === true) {
			html += " " + key.escapeHtml();
		} else if (value) {
			html += " " + key.escapeHtml() + '="' + value.toString().escapeHtml() + '"';
		}
	}
	return html += '>' + content.join('') + '</' + tagName + '>';
}
api.util.tag = htmlTag;
	
var specialAttributes = {
	'class': function (element, value) {
		if (value === null) {
			element.className = '';
			element.removeAttribute('class');
		} else {
			element.setAttribute('class', element.className = value || '');
		}
	}
};
function setAttribute(element, key, value) {
	if (specialAttributes[key]) return specialAttributes[key](element, value);
	if (value == null) return element.removeAttribute(key);
	element.setAttribute(key, value);
};

function scanForChildBindings(element, context, callback) {
	var pending = 1;
	var error = null;
	function donePending(e) {
		error = error || e;
		if (!--pending) callback(e);
	}

	// TODO: better walk, not recursive
	if (element.nodeType === 1) {
		if (element.tagName.toLowerCase() === 'a') {
			if (element.hasAttribute('ajax') || element.hasAttribute('data-ajax')) {
				context.ajaxLink(element);
			}
		}
		
		for (var i = 0; i < element.childNodes.length; i++) {
			var child = element.childNodes[i];
			if (child.nodeType === 1) {
				if (child.hasAttribute(dataPropertyStoreKey)) {
					pending++;
					context._bindKeyPath(child, child.getAttribute(dataPropertyStoreKey), child.getAttribute(dataPropertyPath), child.getAttribute(dataPropertyUiPath), donePending);
				} else {
					pending++;
					context.unbind(child);
					scanForChildBindings(child, context, donePending);
				}
			}
		}
	}
	donePending();
}
function executeDiffDom(subject, target, diff, context, callback) {
	if (target.nodeType === 1) {
		// Assign all attributes
		for (var i = 0; i < target.attributes.length; i++) {
			var key = target.attributes[i].name, value = target.attributes[i].value;
			if (subject.getAttribute(key) !== value) {
				setAttribute(subject, key, value);
			}
		}
		var subjectAttributes = [];
		for (var i = 0; i < subject.attributes.length; i++) {
			var key = subject.attributes[i].name;
			subjectAttributes.push(key);
		}
		subjectAttributes.forEach(function (key) {
			if (!target.hasAttribute(key)) {
				setAttribute(subject, key, null);
			}
		});
	}

	var pending = 1;
	var error = null;
	function donePending(e) {
		error = error || e;
		if (!--pending) callback(e);
	}

	var path = diff.path;
	if (!path) {
		subject.nodeValue = target.nodeValue;
		return donePending(null);
	}
	
	var subjectOffset = -1;
	var targetOffset = -1;
	for (var diagonal = 1; diagonal < path.length; diagonal++) {
		var subjectIndex = path[diagonal];
		if (subjectIndex === null) continue;
		var lastSubjectIndex = path[diagonal - 1];
		if (lastSubjectIndex === null) {
			var subjectChild = subject.childNodes[subjectIndex + subjectOffset];
			var targetChild = target.childNodes[diagonal - subjectIndex + targetOffset];
			pending++;
			executeDiffDom(subjectChild, targetChild, diff.actions[diagonal - 1], context, donePending);
		} else if (lastSubjectIndex === subjectIndex) {
			subjectOffset++;
			var subjectChild = subject.childNodes[subjectIndex + subjectOffset];
			var targetChild = target.childNodes[diagonal - subjectIndex + targetOffset];
			target.removeChild(targetChild);
			subject.insertBefore(targetChild, subjectChild);
			targetOffset--;
		} else {
			var subjectChild = subject.childNodes[subjectIndex + subjectOffset];
			subject.removeChild(subjectChild);
			subjectOffset--;
		}
	}
	donePending();
}
function diffDom(subject, target, cullSize, ignoreFirstBinding) {
	if (subject.nodeType !== target.nodeType) return;
	if (subject.nodeType !== 1) return {score: 0.5};
	if (subject.tagName !== target.tagName) return;
	if (subject.tagName === 'input' && subject.type !== target.type) return;
	
	if (!ignoreFirstBinding && target.hasAttribute(dataPropertyStoreKey)) {
		if (subject.getAttribute(dataPropertyStoreKey) === target.getAttribute(dataPropertyStoreKey) && subject.getAttribute(dataPropertyPath) === target.getAttribute(dataPropertyPath) && subject.getAttribute(dataPropertyUiPath) === target.getAttribute(dataPropertyUiPath)) {
			return {score: 1};
		} else if (subject.hasAttribute(dataPropertyStoreKey)) {
			return {score: 0.1};
		} else {
			return {score: 0.5};
		}
	}

	// Score based on proportion of correct attributes
	var attributesTotal = 1, attributesCorrect = 1;
	for (var i = 0; i < subject.attributes.length; i++) {
		attributesTotal++;
		var key = subject.attributes[i].name, value = subject.attributes[i].value;
		if (target.getAttribute(i) === value) {
			attributesCorrect++;
		}
	}
	for (var i = 0; i < target.attributes.length; i++) {
		if (!subject.hasAttribute(target.attributes[i].name)) {
			attributesTotal++;
		}
	}
	var score = attributesCorrect/attributesTotal;
	
	var options = [{score: score, path: [0], actions: []}];
	var prevOptions = [];
	
	var subjectCount = subject.childNodes.length;
	var targetCount = target.childNodes.length;
	var diagonal = 1, endDiagonal = subjectCount + targetCount + 1;
	while (diagonal < endDiagonal) {
		var newOptions = [];
		for (var subjectIndex = Math.max(0, diagonal - targetCount); subjectIndex <= subjectCount && subjectIndex <= diagonal; subjectIndex++) {
			var subjectNode = subject.childNodes[subjectIndex - 1];
			var targetNode = target.childNodes[diagonal - subjectIndex - 1];
			var best = {score: -1}, bestScore = -1;
			var addFrom = options[subjectIndex];
			if (addFrom) {
				var score = 0;
				if (score > bestScore) {
					best = {score: addFrom.score + score, path: addFrom.path.concat([subjectIndex]), actions: addFrom.actions.concat(['add ' + targetNode])};
				}
			}
			var removeFrom = options[subjectIndex - 1];
			if (removeFrom) {
				var score = 0;
				if (score > bestScore) {
					best = {score: removeFrom.score + score, path: removeFrom.path.concat([subjectIndex]), actions: removeFrom.actions.concat(['remove' + subjectNode])};
				}
			}
			var mergeFrom = prevOptions[subjectIndex - 1];
			if (mergeFrom) {
				var diff = diffDom(subjectNode, targetNode, cullSize) || {score: -Infinity};
				if (diff.score > bestScore) {
					best = {score: mergeFrom.score + diff.score, path: mergeFrom.path.concat([null, subjectIndex]), actions: mergeFrom.actions.concat(['merge ' + subjectNode + ' -> ' + targetNode, diff])};
				}
			}
			newOptions[subjectIndex] = best;
		}
		prevOptions = options;
		options = newOptions.slice(0);
		newOptions.sort(function (a, b) {
			return b.score - a.score;
		});
		options = options.map(function (option) {
			if (newOptions.indexOf(option) < cullSize) return option;
			return null;
		});
		diagonal++;
	}
	var result = options[subjectCount];
	return result;
}

function Binding(bindObj, registerIndex) {
	if (!(this instanceof Binding)) return new Binding(bindObj, registerIndex);
	var thisBinding = this;
	this.registerIndex = registerIndex;
	
	this.preferDom = !!bindObj.preferDom;

	if (typeof bindObj.canBind === 'string' || Array.isArray(bindObj.canBind)) {
		bindObj.canBind = {schema: bindObj.canBind};
	}
	if (typeof bindObj.canBind === 'object') {
		var bindConditions = bindObj.canBind;
		if (bindConditions.schema && !Array.isArray(bindConditions.schema)) {
			bindConditions.schema = [bindConditions.schema];
		}
		if (bindConditions.type && !Array.isArray(bindConditions.type)) {
			bindConditions.type = [bindConditions.type];
		}
		if (bindConditions.tag && !Array.isArray(bindConditions.tag)) {
			bindConditions.tag = [bindConditions.tag];
		}
		this.canBind = function (model, tag, attrs) {
			if (bindConditions.tag && bindConditions.tag.indexOf(tag) === -1) {
				return false;
			}
			if (bindConditions.type) {
				var modelType = model.jsonType();
				if (bindConditions.type.indexOf(modelType) === -1) {
					return false;
				}
			}
			if (bindConditions.schema) {
				var modelSchemas = model.schemas();
				var baseUrl = model._root.dataStore.baseUrl;
				if (!bindConditions.schema.some(function (schema) {
					schema = resolveUrl(baseUrl, schema);
					return modelSchemas.indexOf(schema) !== -1;
				})) {
					return false;
				}
			}
			if (bindConditions.filter) {
				if (!bindConditions.filter(model, tag, attrs)) return false;
			}
			return true;
		};
		this.priority = bindObj.priority || 0;
		this.priority += (!!bindConditions.tag)*10 + (!!bindConditions.schema)*5 + (!!bindConditions.type)*2;
	} else {
		this.canBind = bindObj.canBind;
		this.priority = bindObj.priority || 0;
	}

	if (typeof bindObj.html === 'function') {
		this.html = bindObj.html.bind(bindObj);
	} else if (typeof bindObj.html === 'string') {
		this.html = function () {return bindObj.html;};
	}
	
	var modelEvents = bindObj.modelEvents || {};
	modelEvents.change = modelEvents.change || function (model, element, ui, pointerPath) {
		return !pointerPath;
	};
	var uiEvents = bindObj.uiEvents || {};
	/*
	uiEvents.change = uiEvents.change || function (model, element, ui, pointerPath) {
		return pointerPath.split('/').length <= 2 && ui.jsonType(pointerPath) !== 'object';
	};
	*/
	
	this.bindDom = function (context, model, element) {
		// TODO: polling is *nasty*
		var checkUnattached = function () {
			if (!isAttached(element)) {
				console.log('Detached from document: ', element);
				context.unbind(element);
				clearInterval(checkInterval);
				return true;
			}
		};
		var checkInterval = setInterval(checkUnattached, 1000);

		var modelHandlers = context.boundJsonModelEvents = {};
		Object.keys(modelEvents).forEach(function (key) {
			var original = modelEvents[key];
			var handler = modelHandlers[key] = function () {
				if (element.boundContext !== context) {
					return thisBinding.unbindDom(context, model, element);
				}
				
				var args = Array.prototype.slice.call(arguments, 0);
				args = [model, element, context].concat(args);
				var shouldRender = original.apply(this, args);
				if (shouldRender) {
					context.bind(model, element);
				}
			};
			model.on(key, handler);
		});
		var uiHandlers = context.boundUiEvents = {};
		Object.keys(uiEvents).forEach(function (key) {
			var original = uiEvents[key];
			var handler = uiHandlers[key] = function () {
				if (element.boundContext !== context) {
					return thisBinding.unbindDom(context, model, element);
				}
				
				var args = Array.prototype.slice.call(arguments, 0);
				args = [model, element, context].concat(args);
				var shouldRender = original.apply(this, args);
				if (shouldRender) {
					context.bind(model, element);
				}
			};
			context.ui.on(key, handler);
		});
		
		model.emit('bind', element);
		if (uiHandlers.bind) uiHandlers.bind.call(null);
	};
	this.unbindDom = function (context, model, element) {
		model.emit('unbind', element);
		if (context.boundUiEvents.unbind) context.boundUiEvents.unbind.call(null);

		for (var key in context.boundJsonModelEvents) {
			var handler = context.boundJsonModelEvents[key];
			model.off(key, handler);
		}
		for (var key in context.boundUiEvents) {
			var handler = context.boundUiEvents[key];
			context.ui.off(key, handler);
		}
	};
}
Binding.prototype = {
};

function Bindings(parent) {
	this._state = 0; // Increment every time something happens, so children know to re-concatenate
	this._immediateOptions = [];
	this._concatOptions = [];
	this._needSort = false;
	
	this.parent = parent || {
		_state: 0,
		_options: function () {return this;}.bind([])
	};
	this._parentState = parent ? parent.options().length : 0;
}
Bindings.prototype = {
	_options: function () {
		if (this.parent._state !== this._parentState) {
			this._concatOptions = this._immediateOptions.concat(this.parent._options());
			this._needSort = true;
			this._parentState = this.parent._state;
		}
		if (this._needSort) {
			this._needSort = false;
			this._concatOptions.sort(function (a, b) {
				return (b.priority - a.priority) || (b.registerIndex - a.registerIndex);
			});
		}
		return this._concatOptions;
	},
	addHtml: function (canBind, htmlFunc, extra) {
		var bindObj = Object.create(extra || {});
		bindObj.canBind = canBind;
		bindObj.html = htmlFunc;
		return this.add(bindObj);
	},
	add: function (bindObj) {
		this._state++;
		this._immediateOptions.push(new Binding(bindObj, this._state));
		this._parentState = null; // Trigger re-concatenate on next options() call
		return this;
	},
	select: function (model, tagName, attrs, bannedBindings) {
		var options = this._options();
		var schemas = model.schemas();
		for (var i = 0; i < options.length ; i++) {
			var binding = options[i];
			if (binding.canBind(model, tagName, attrs) && bannedBindings.indexOf(binding) === -1) {
				return binding;
			}
		}
	}
};
if (typeof require === 'function' && typeof module !== 'undefined') {
	Bindings.prototype.include = function (json) {
		var path = require('path');
		if (typeof json === 'string') {
			try {
				json = require(path.resolve(json));
			} catch (e) {
				json = require(json);
			}
		}
		var thisBindings = this;
		(json.js || []).forEach(function (jsPath) {
			this.includeJs(jsPath);
		});
		(json.css || []).forEach(function (cssPath) {
			this.includeCss(cssPath);
		});
	};
	Bindings.prototype.includeDir = function (dirname) {
		var path = require('path'), fs = require('fs');
		var thisBindings = this;
		var items = require('fs').readdirSync(dirname);
		items.sort();
		items.forEach(function (filename) {
			if (/\.js$/i.test(filename)) {
				thisBindings.includeJs(dirname + '/' + filename);
			} else if (/\.css$/i.test(filename)) {
				thisBindings.includeCss(dirname + '/' + filename);
			}
		});
	};
	Bindings.prototype.includeCss = function (filename) {
		var code = require('fs').readFileSync(filename, {encoding: 'utf-8'});
		code = '/*** ' + require('path').basename(filename) + ' ***/\n\n' + code;
		this._includeCss = ((this._includeCss || '') + '\n\n' + code).replace(/^(\r?\n)*/g, '').replace(/(\r?\n)*$/g, '');
	};
	Bindings.prototype.includeJs = function (filename) {
		var path = require('path');
		if (filename.charAt(0) === '.') {
			filename = path.join(process.cwd(), filename);
		}
		var after = [];
		['bindings', 'JsonModel'].forEach(function (key) {
			if (key in global) {
				var oldValue = global[key];
				after.push(function () {global[key] = oldValue;});
			} else {
				after.push(function () {delete global[key];});
			}
		});
		global.bindings = this;
		global.JsonModel = api;
		
		require(path.resolve(filename));
		var code = require('fs').readFileSync(filename, {encoding: 'utf-8'});
		code = '/*** ' + path.basename(filename) + ' ***/\n\n' + code;
		this._includeJs = ((this._includeJs || '') + '\n\n' + code).replace(/^(\r?\n)*/g, '').replace(/(\r?\n)*$/g, '');
		
		while (after.length) after.pop()();
	};
	Bindings.prototype.bundleJs = function (skip) {
		var header = skip ? '' : '(function (JsonModel, bindings) {\n\n';
		var footer = skip ? '' : '\n\n})(JsonModel, JsonModel.bindings);';
		var includeCode = this._includeJs || '';
		if (typeof this.parent.bundleJs === 'function') {
			includeCode = this.parent.bundleJs(true) + (includeCode ? '\n\n' : '') + includeCode;
		}
		return header + includeCode + footer;
	};
	api.bundleJs = function (bindings, includeCss) {
		if (typeof bindings === 'boolean') {
			includeCss = bindings;
			bindings = null;
		}
		bindings = bindings || api.bindings;
		var code = ['/json-model.js'].map(function (filename) {
			var result = '/*** ' + filename + ' ***/\n\n';
			result += require('fs').readFileSync(__dirname + filename, {encoding: 'utf-8'});
			return result;
		});
		code.push(bindings.bundleJs());
		if (includeCss) {
			var cssFunc = '/*** CSS ***/\n\n(function (css) {\n\tvar style = document.createElement("style");\n\tstyle.appendChild(document.createTextNode(css));\n\tdocument.head.appendChild(style);\n})';
			code.push(cssFunc + '(' + JSON.stringify(this.bundleCss()) + ')');
		}
		return code.join('\n\n');
	};
	Bindings.prototype.bundleCss = function (skip) {
		var includeCode = this._includeCss || '';
		if (typeof this.parent.bundleCss === 'function') {
			includeCode = this.parent.bundleCss(true) + (includeCode ? '\n\n' : '') + includeCode;
		}
		return includeCode;
	};
	api.bundleCss = function (bindings) {
		bindings = bindings || api.bindings;
		return bindings.bundleCss();
	};
}
api.bindings = new Bindings();

api.navigateTo = function (href) {
	href = api.util.url.resolve(window.location.href, href); // Make absolute
	var relative = api.util.url.relative(window.location.href, href);
	if (relative === href) {
		window.location.href = href;
		return;
	} else if (typeof history === 'object' && typeof history.pushState === 'function') {
		history.pushState(null, null, relative);
	} else {
		window.location.href = '#' + encodeURI(relative).replace(/#/g, '%23');
	}
};

// Something nobody would actually output, and would be HTML-escaped if it were in content anyway
//    TODO: XSS?  E.g. code not removed by HTML sanitiser, causes rendering of external resource when only safe local content expected, renderer dumps raw HTML to page
//    Could introduce secret/random component to fight this
var magicPlaceholders = ['\u003cJM--', '-->']; // \u003c == '<', but it means we don't match ourselves accidentally
var magicRegex = /\u003cJM--(.*?)-->/g;
var dataPropertyStoreKey = 'data-JMstoreKey';
var dataPropertyPath = 'data-JMpath';
var dataPropertyUiPath = 'data-JMuipath';
var dataPropertyState = 'data-JMrevision';
function BindingContext(bindings, dataStore, initialUi) {
	this._bindings = bindings;
	this._dataStore = dataStore;
	// Sub-binding stuff
	this._root = this;
	this._model = null;
	this._usedBindings = [];
	this.ui = this._dataStore.create(initialUi || {});
	this.includeDataProperties = false;
	
	this.urlForState = function (resourceUrl, newUiState) {
		if (typeof window === 'object' && window.location && typeof window.location.href === 'string') {
			resourceUrl = api.util.url.relative(window.location.href, resourceUrl);
		}
		return api.util.url.encodeQuery({json: resourceUrl}) || '?';
	};
	this.stateForUrl = function (url) {
		var parsed = api.util.url.parse(url);
		var query = api.util.url.parseQuery(parsed.search);
		return [query.json, {}];
	};
}
BindingContext.prototype = {
	_subContext: function (model, binding, uiPath, includeDataProperties) {
		var result = Object.create(this._root);
		result._model = model;
		result._usedBindings = [binding];
		if (this._model === model) {
			result._usedBindings = this._usedBindings.concat(result._usedBindings);
		}
		uiPath = (uiPath || '') + '';
		result.ui = this.ui.path(uiPath);
		if (result.ui.jsonType() !== 'object') {
			result.ui.set('', {});
		}
		result.includeDataProperties = includeDataProperties || this.includeDataProperties;
		return result;
	},
	monitorLocation: function (element) {
		var thisContext = this;
		
		var emitter = new api.EventEmitter();
		
		var getHref = function () {
			return window.location.href;
		};
		
		var oldHref = null;
		var pending = false;
		var isFirst = true;
		var updateFromLocation = function () {
			if (pending) return;
			var href = getHref();
			if (href === oldHref) return;
			oldHref = href;
			var fragment = href.replace(/^[^#]*/, '').substring(1);
			fragment = decodeURIComponent(fragment);
			var newHref = resolveUrl(href.replace(/#.*/, ''), fragment)
			console.log('New URL:', newHref);
			
			var state = thisContext.stateForUrl(newHref);
			var resourceUrl = state[0], uiState = state[1] || {};
			console.log('New state:', resourceUrl, uiState);
			if (resourceUrl) {
				pending = true;
				emitter.emit('change', resourceUrl, uiState, isFirst);
				// Reset the UI state, don't bother trying to change it
				thisContext.ui = thisContext._dataStore.create(uiState);
				thisContext.bind(resourceUrl, element, function () {
					emitter.emit('change-done', resourceUrl, uiState);
					pending = false;
				});
			} else {
				emitter.emit('ui', uiState);
				// Update the UI state, leaving the URL the same
				thisContext.ui.set('', uiState);
			}
			isFirst = false;
		}

		if (typeof history === 'object' && typeof history.pushState === 'function') {
			window.onpopstate = updateFromLocation;
		}
		
		var interval = setInterval(updateFromLocation, 100);
		return emitter;
	},
	navigateTo: function (href) {
		api.navigateTo(href);
	},
	ajaxLink: function (a) {
		var thisContext = this;
		a.onclick = a.onclick || function (event) {
			var href = a.getAttribute('href');
			if (typeof href === 'string') {
				thisContext.navigateTo(href);
				event.preventDefault();
				return false;
			}
		}
	},
	selectBinding: function (model, tag, attrs) {
		if (model === this._model) {
			return this._bindings.select(model, tag, attrs, this._usedBindings);
		} else {
			return this._bindings.select(model, tag, attrs, []);
		}
	},
	errorHtml: function (error, tag, attrs) {
		return '<span class="error">Error: ' + error.message.escapeHtml() + '</span>';
	},
	_renderInnerHtml: function (model, binding, tag, attrs, callback) {
		var context = this;
		var immediateHtml = binding.html(model, tag, attrs, this, function (error, html) {
			if (error) return callback(error, html);
			if (typeof immediateHtml !== 'undefined') {
				throw new Error('Renderer must either return HTML string or call the callback, but not both');
			}
			context.expandHtml(html, callback);
		});
		if (typeof immediateHtml !== 'undefined') {
			context.expandHtml(immediateHtml, callback);
		}
	},
	_renderHtml: function (model, tag, attrs, uiPath, callback) {
		var thisContext = this;
		tag = tag || 'span';
		attrs = attrs || {};

		var result = function () {
			var binding = thisContext.selectBinding(model, tag, attrs);
			var context = thisContext._subContext(model, binding, uiPath);
			context._renderInnerHtml(model, binding, tag, attrs, function (error, html) {
				if (typeof html !== 'undefined') {
					html = htmlTag(tag, attrs, html)
				}
				callback(error, html);
			});
		};
		if (model.ready()) {
			result();
		} else {
			model.whenReady(result);
		}
	},
	expandHtml: function (html, callback) {
		var thisContext = this;
		if (typeof html !== 'string') html += "";
		html.asyncReplace(magicRegex, function (match, data, callback) {
			try {
				data = JSON.parse(data);
			} catch (e) {
				console.error(data, html);
				return callback(e);
			}
			data.tag = data.tag || 'span';
			data.attrs = data.attrs || {};
			data.ui = data.ui || '';
			var rootModel = thisContext._dataStore._getRootModel(data.key);
			if (!rootModel) {
				var error = new Error('Missing from data store: ' + data.key);
				var errorHtml = thisContext.errorHtml(error, data.tag, data.attrs)
				return callback(error, htmlTag(data.tag, data.attrs, errorHtml));
			}
			var model = rootModel.modelForPath(data.path);
			if (thisContext.includeDataProperties) {
				data.attrs[dataPropertyStoreKey] = data.key;
				data.attrs[dataPropertyPath] = data.path;
				data.attrs[dataPropertyUiPath] = data.ui;
				data.attrs[dataPropertyState] = rootModel.state;
			}
			thisContext._renderHtml(model, data.tag, data.attrs, data.ui, callback);
		}, callback);
	},
	_updateDom: function (element, tag, attrs, callback) {
		if (element.pendingDomUpdate) return callback(null);
		var thisContext = this;
		var model = element.boundJsonModel;
		var binding = element.boundBinding;
		var context = element.boundContext;

		element.pendingDomUpdate = true;
		var oldRootState = model._root.state;
		var innerHtml = binding.html(model, tag, attrs, this, processHtml);
		if (typeof innerHtml !== 'undefined') {
			processHtml(null, innerHtml);
		}

		function processHtml(error, innerHtml) {
			var replacedHtml = (innerHtml + "").replace(magicRegex, function (match, data) {
				try {
					data = JSON.parse(data);
				} catch (e) {
					error = error || e;
					return context.errorHtml(e);
				}
				data.tag = data.tag || 'span';
				data.attrs = data.attrs || {};
				data.attrs[dataPropertyStoreKey] = data.key;
				data.attrs[dataPropertyPath] = data.path;
				data.attrs[dataPropertyUiPath] = data.ui;
				return htmlTag(data.tag, data.attrs);
			});
			// DEBUG
			if (tag !== 'html' && tag !== 'body') {
				replacedHtml = '<span class="debug">' + context._usedBindings.length + ' bindings used ' + context.ui._path + '</span>' + replacedHtml;
			}
			
			var hostElement = element.cloneNode(false);
			hostElement.innerHTML = replacedHtml;
			/* Failed attempt at IE9 compatibility (the doc.open() call is failing with "Unspecified Error")
			try {
				hostElement.innerHTML = replacedHtml;
			} catch (e) {
				if (tag === 'html' && document.implementation && document.implementation.createHTMLDocument) {
					var doc = document.implementation.createHTMLDocument('');
					doc.open();
					doc.write(replacedHtml);
					doc.close();
					hostElement = doc.documentElement;
				} else {
					throw e;
				}
			}
			*/
			context._coerceDom(element, hostElement, null, function (err) {
				element.pendingDomUpdate = false;
				if (oldRootState !== model._root.state) {
					console.log('Model changed during rendering: ' + model.url());
					var newHtml = binding.html(model, tag, attrs, thisContext, function (err2, newHtml) {
						if (newHtml === innerHtml) {
							return callback(error || err);
						}
						console.log('Re-rendering');
						return thisContext._updateDom(element, tag, attrs, callback);
					});
					if (typeof newHtml !== 'undefined') {
						if (newHtml === innerHtml) {
							return callback(error || err);
						}
						console.log('Re-rendering');
						return thisContext._updateDom(element, tag, attrs, callback);
					}
					return;
				}
				callback(error || err);
			});
		}
	},
	_renderDom: function (model, element, uiPath, callback) {
		var thisContext = this;
		
		if (!isAttached(element)) {
			console.log('Not attached to document:', element);
			asap(function () {
				callback(new Error('Not attached to document'));
			})
		}
		
		var tag = element.tagName.toLowerCase();
		var attrs = {};
		for (var i = 0; i < element.attributes.length; i++) {
			var attribute = element.attributes[i];
			attrs[attribute.name] = attribute.value;
		}
		
		model.whenReady(function () {
			var oldState = model._root.state;

			var binding = thisContext.selectBinding(model, tag, attrs);
			var context = thisContext._subContext(model, binding, uiPath, true);

			if (element.boundJsonModel) {
				if (model === element.boundJsonModel) {
					return thisContext._updateDom(element, tag, attrs, callback);
				} else {
					thisContext.unbind(element);
				}
			}
			element.boundJsonModel = model;
			element.boundBinding = binding;
			element.boundContext = context;
			
			if (binding.preferDom) {
				model.whenReady(function () {
					thisContext._updateDom(element, tag, attrs, function (error) {
						binding.bindDom(context, model, element);
						if (oldState !== model._root.state) {
							console.log('Model changed during initial render:', model.url());
							return thisContext._updateDom(element, tag, attrs, callback);
						}
						callback(error);
					});
				});
				return;
			}
			
			function htmlReady(error) {
				scanForChildBindings(element, context, function (err) {
					binding.bindDom(context, model, element);
					if (oldState !== model._root.state) {
						console.log('Model changed during initial render:', model.url());
						return thisContext._updateDom(element, tag, attrs, callback);
					}
					callback(error || err);
				});
			}

			if (element.hasAttribute(dataPropertyStoreKey)) {
				var rootModel = thisContext._dataStore._getRootModel(element.getAttribute(dataPropertyStoreKey));
				if (rootModel) {
					var existingModel = rootModel.modelForPath(element.getAttribute(dataPropertyPath));
					if (model === existingModel) {
						var stateString = rootModel.state + "";
						if (stateString === element.getAttribute(dataPropertyState)) {
							// Rendering is up-to-date, so we don't need to do DOM coercion
							return htmlReady(null);
						}
					}
				}
			}
			
			context._renderInnerHtml(model, binding, tag, attrs, function (error, innerHtml) {
				// DEBUG
				innerHtml = '<span class="debug">DOM/HTML render</span>' + innerHtml;
				element.innerHTML = innerHtml;
				htmlReady(error);
			});
		});
	},
	_coerceDom: function coerceDom(subject, target, cullSize, callback) {
		var thisContext = this;
		cullSize = cullSize || 3;
		var diff = diffDom(subject, target, cullSize, true);
		executeDiffDom(subject, target, diff, this, function (error) {
			scanForChildBindings(subject, thisContext, function (err) {
				callback(error || err);
			});
		});
	},
	_bindKeyPath: function (element, storeKey, path, uiPath, callback) {
		var rootModel = this._dataStore._getRootModel(storeKey);
		if (!rootModel) {
			return callback(new Error('Model missing during bind sweep: ' + storeKey));
		}
		var model = rootModel.modelForPath(path);
		this.bind(model, element, uiPath, callback);
	},
	bind: function (model, element, uiPath, callback) {
		if (typeof uiPath === 'function') {
			callback = uiPath;
			uiPath = null;
		}
		uiPath = uiPath || null;
		var thisContext = this;
		if (!api.is(model)) {
			model = this._dataStore.open(model);
		}
		if (typeof element === 'string') {
			element = document.getElementById(element);
		}
		
		callback = callback || function () {};
		this._renderDom(model, element, uiPath, callback);
	},
	unbind: function (element) {
		if (element.boundJsonModel) {
			element.boundBinding.unbindDom(element.boundContext, element.boundJsonModel, element);

			delete element.boundJsonModel;
			delete element.boundBinding;
			delete element.boundContext;
		}
	}
};
BindingContext.placeholder = function (model, tag, attrs, uiPath) {
	model._root.pokeStore();
	return magicPlaceholders.join(JSON.stringify({
		key: model._root.storeKey,
		path: model._path,
		tag: tag,
		attrs: attrs,
		ui: uiPath
	}));
};
api.context = new BindingContext(api.bindings, api.dataStore);

String.prototype.escapeHtml = function () {
	return this.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
String.prototype.asyncReplace = function (subStr, replacer, callback) {
	var str = this;
	var error = null;
	var replacements = {};
	var pending = 1;
	var checkDone = function () {
		if (!--pending) {
			var result = str.replace(subStr, function (match) {
				var pos = arguments[arguments.length - 2];
				var key = pos + '-' + match.length;
				return replacements[key];
			});
			callback(error, result);
		}
	};
	str.replace(subStr, function (match) {
		pending++;
		var pos = arguments[arguments.length - 2];
		var key = pos + '-' + match.length;
		var args = Array.prototype.slice.call(arguments, 0, replacer.length - 1);
		args.push(function (err, result) {
			if (err) {
				error = error || err;
				replacements[key] = result || '';
				replacer = function (callback) {
					callback(null, '');
				};
				return checkDone();
			}
			replacements[key] = result;
			checkDone();
		});
		replacer.apply(null, args);
	});
	asap(checkDone);
	return this;
};

api.extend({
	getHtml: function (pathSpec) {
		var value = this.get(pathSpec);
		if (value == null) value = '';
		if (typeof value.toJSON === 'function') {
			value = value.toJSON();
		}
		if (typeof value === 'object') {
			value = JSON.stringify(value);
		}
		return (value + "").escapeHtml();
	},
	getHtmlCss: function (pathSpec) {
		var value = this.get(pathSpec);
		if (value == null) value = '';
		return (value + "").escapeHtml().replace(/;/g, ',');
	},
	html: function (tag, attrs, uiPath) {
		if (typeof attrs !== 'object') {
			uiPath = attrs;
			attrs = undefined;
		}
		attrs = attrs || {};
		tag = expandTag(tag || '', attrs);
		return BindingContext.placeholder(this, tag, attrs, uiPath);
	}
});

// Default bindings
api.bindings.add({
	priority: -Infinity,
	canBind: function (model, tagName, attrs) {
		if (!('value' in attrs)) return true;
	},
	html: function (model) {
		return model.getHtml();
	}
});

api.bindings.add({
	canBind: function (model, tagName, attrs) {
		if (tagName === 'textarea' || (tagName === 'input' && attrs.type === 'text')) {
			return true;
		}
	},
	/*
	bind: function (model, input) {
		function updateModel() {
			model.set(input.value);
		}
		function updateInput() {
			var value = model.get();
			if (value == null) value = "";
			if (value !== input.value) {
				input.value = value;
			}
		}
		
		model.on('change', updateInput);
		input.addEventListener('change', updateModel);
		var pollTimer = null;
		input.addEventListener('focus', function () {
			pollTimer = setInterval(updateModel, 15);
		});
		input.addEventListener('blur', function () {
			clearInterval(pollTimer);
		});

		updateInput();
	}
	*/
});
return api;
});
//# sourceMappingURL=json-model.js.map
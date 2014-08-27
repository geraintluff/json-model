(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define([], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory();
	} else {
		// Browser globals
		global.schema2js = factory();
	}
}(this, function () {
	var api = {};
	
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
	
	var SchemaStore = api.SchemaStore = function SchemaStore(parent) {
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
	api.SchemaStore = SchemaStore;
	
	// taken from tv4
	var ErrorCodes = api.ErrorCodes = {
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
		// Schema availability
		SCHEMA_MISSING: 700,
		SCHEMA_FETCH_ERROR: 701,
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
					codeParts.push(JSON.stringify(';' + encodeURIComponent(varName)));
					conditional = '=';
				} else {
					codeParts.push(JSON.stringify(';'));
				}
			} else if (hasPrefix('?') && index == 0) {
				if (varSuffix.indexOf('*') === -1) {
					codeParts.push(JSON.stringify('?' + encodeURIComponent(varName) + '='));
				} else {
					codeParts.push(JSON.stringify('?'));
				}
			} else if (hasPrefix('?') || hasPrefix('&')) {
				if (varSuffix.indexOf('*') === -1) {
					codeParts.push(JSON.stringify('&' + encodeURIComponent(varName) + '='));
				} else {
					codeParts.push(JSON.stringify('&'));
				}
			} else if (hasPrefix('&')) {
				codeParts.push(JSON.stringify('&' + encodeURIComponent(varName) + '='));
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
	
	var uriTemplate = api.uriTemplate = function uriTemplate(subject, template) {
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
	
	var Generator = api.Generator = function Generator(config) {
		if (!(this instanceof Generator)) return new Generator(config);
		
		config = config || {};
		this.schemaStore = config.schemaStore || new SchemaStore();
		this.config = {
			directMethods: config.directMethods !== false,
			validation: config.validation !== false,
			subErrors: (config.subErrors !== false) && true,
			unicodeLength: config.unicodeLength !== false,
			assignment: config.assignment || false,
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
					if (this.config.assignment) {
						code += propertyExpression('classes', urlName) + '.validationErrors = function (data, path, schemaMap' + (this.config.trackMissing ? ', missing' : '') + ') {\n';
						code += indent('return ' + propertyExpression('classes', aliasName) + '.validationErrors(data, path, schemaMap' + (this.config.trackMissing ? ', missing' : '') + ');\n');
						code += '};\n';
					} else {
						code += propertyExpression('classes', urlName) + '.validationErrors = function (data, path' + (this.config.trackMissing ? ', missing' : '') + ') {\n';
						code += indent('return ' + propertyExpression('classes', aliasName) + '.validationErrors(data, path' + (this.config.trackMissing ? ', missing' : '') + ');\n');
						code += '};\n';
					}
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
				body += 'var href = ' + api.uriTemplate(function (property) {
					var code = 'obj[' + JSON.stringify(property) + ']';
					if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(property)) {
						code = 'obj.' + property;
					}
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
				if (this.config.assignment) {
					code += classExpression + '.validationErrors = function (value, dataPath, schemaMap' + (this.config.trackMissing ? ', missing' : '') + ') {\n';
					code += indent('schemaMap = schemaMap || {};\n');
				} else {
					code += classExpression + '.validationErrors = function (value, dataPath' + (this.config.trackMissing ? ', missing' : '') + ') {\n';
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
				if (this.config.trackMissing) {
					code += indent('var missing = {};\n');
				}
				if (this.config.assignment) {
					code += indent('var schemaMap = {};\n');
					code += indent('var errors = ' + classExpression + '.validationErrors(value, "", schemaMap' + (this.config.trackMissing ? ', missing' : '') + ');\n');
					code += indent('return {valid: !errors.length, errors: errors, schemas: schemaMap' + (this.config.trackMissing ? ', missing: missing' : '') + '};\n');
				} else {
					code += indent('var errors = ' + classExpression + '.validationErrors(value, ""' + (this.config.trackMissing ? ', missing' : '') + ');\n');
					code += indent('return {valid: !errors.length, errors: errors' + (this.config.trackMissing ? ', missing: missing' : '') + '};\n');
				}
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
				if (this.config.assignment) {
					return errorFunc(classVar + '.validationErrors(' + valueExpr + ', ' + dataPathExpr + ', schemaMap' + (this.config.trackMissing ? ', missing' : '') + ')');
				} else {
					return errorFunc(classVar + '.validationErrors(' + valueExpr + ', ' + dataPathExpr + (this.config.trackMissing ? ', missing' : '') + ')');
				}
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
					validation += 'var actualSchemaMap = schemaMap, actualErrors = errors;\n'
				} else {
					validation += 'var actualErrors = errors;\n';
				}
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
						var regExpCode = (new RegExp(key)).toString();
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
					var regExpCode = (new RegExp(schema.pattern)).toString();
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
			var func = new Function('superclass', 'classes', 'request', 'return ' + code + '(superclass, classes, request)');
			return this._classes = func(superclass, this._classes, request);
		}
	};
	
	return api;
}));
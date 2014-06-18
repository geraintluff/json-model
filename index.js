(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['tv4'], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory(require('tv4'));
	} else {
		// Browser globals
		global.schema2js = factory(global.tv4);
	}
}(this, function (tv4) {
	var api = {};
	
	// taken from tv4
	var ErrorCodes = {
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
		CIRCULAR_REFERENCE: 600,
		// Non-standard validation options
		UNKNOWN_PROPERTY: 1000
	};
	
	function indent(string) {
		return ('\t' + string.replace(/\n/g, '\n\t')).replace(/\t*$/, '');
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
		this.tv4 = config.tv4 || tv4.freshApi();
		this.config = {
			directMethods: config.directMethods !== false,
			validation: config.validation !== false
		};
		this.classNames = {};
		this.classVars = {GeneratedClass: true}; // make sure it won't be used as a variable name later
	};
	Generator.prototype = {
		addSchema: function (url, schema, name) {
			if (typeof url === 'object') {
				name = schema;
				schema = url;
				url = schema && schema.id;
			}
			url = url || (Math.random().toString().substring(2) + 'anonymous');
			if (typeof schema === 'object') {
				this.tv4.addSchema(url, schema);
			} else if (!name) {
				name = schema;
				schema = {};
			}
			url = normUrl(url || '');
			this.classNames[url] = name;
			this.classVarForUrl(url); // reserves an appropriate variable name
			return this;
		},
		missingSchemas: function () {
			return this.tv4.getMissingUris();
		},
		code: function () {
			var code = '';
			code += 'superclass = superclass || function GeneratedClass() {};\n';
			code += 'request = request || function () {throw new Error("No web-request function provided");};\n';
			code += 'var classes = {};\n';
			var urls = Object.keys(this.classNames);
			var appendUrl = function (url) {
				if (urls.indexOf(url) === -1) {
					urls.push(url);
				}
			};
			for (var i = 0; i < urls.length; i++) {
				var url = urls[i];
				code += '\n' + this.codeForUrl(url, appendUrl);
			}
			code += '\nreturn classes;\n';
			code = 'function (superclass) {\n' + indent(code) + '}';
			return code;
		},
		classVarForUrl: function (url, suffix) {
			if (typeof suffix !== 'string') suffix = 'Class';
			var varName = this.classNames[url] || url;
			varName = varName.replace(/[^#?]*[/]/g, '').replace(/[^a-zA-Z0-9]+([a-zA-Z0-9]?)/g, function (match, nextChar) {
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
			return this.classNames[url] = this.classNames[url] || this.classVarForUrl(url, '');
		},
		extendUrl: function (url, components) {
			if (url.indexOf('#') === -1) url += '#';
			components.forEach(function (key) {
				url += '/' + encodeURIComponent(key.replace(/~/g, '~0').replace(/\//g, '~1'));
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
			var schema = this.tv4.getSchema(refUrl);
			if (!schema.id) schema.id = normUrl(refUrl);
			return this.getFullSchema(schema, haltUrls);
		},
		codeForUrl: function (url, requireUrl) {
			var schema = this.getFullSchema(this.tv4.getSchema(url));

			var code = '/* Schema: ' + url.replace(/\*/g, '%2A') + ' */\n';
			
			var classKey = this.classNameForUrl(url);
			var classExpression = this.classVarForUrl(url || 'anonymous');
			if (!this.schemaAcceptsType(schema, 'object')) {
				// Validation and links only
				code += 'var ' + classExpression + ' = ' + propertyExpression('classes', classKey) + ' = {};\n';
			} else {
				code += 'var ' + classExpression + ' = ' + propertyExpression('classes', classKey) + ' = function ' + classExpression + '(value) {\n';
				var body = '';
				body += 'if (!(this instanceof ' + classExpression + ')) return new ' + classExpression + '(value);\n';
				if ('default' in schema) {
					body += 'value = value || ' + JSON.stringify(schema['default']) + ';\n';
				}
				body += '\nvar keys = Object.keys(value);\n';
				body += 'keys.forEach(function (key) {\n';
				body += indent('this[key] = value[key];\n');
				body += '}.bind(this));\n';
				
				// Defaults and property conversion
				for (var key in schema.properties || {}) {
					var subSchema = this.getFullSchema(schema.properties[key]);
					if ('default' in subSchema) {
						body += 'if (typeof ' + propertyExpression('this', key) + ' === "undefined") {\n';
						body += indent(propertyExpression('this', key) + ' = ' + JSON.stringify(subSchema['default']) + ';\n');
						body += '}\n';
					}
					if (this.schemaAcceptsType(subSchema, 'object')) {
						var subUrl = subSchema.id || this.extendUrl(url, ['properties', key]);
						var subClassVar = this.classVarForUrl(subUrl);
						requireUrl(subUrl);
						var conditions = [];
						if (this.schemaAcceptsType('null')) {
							conditions.push(propertyExpression('this', key));
						}
						if (this.schemaAcceptsType('array')) {
							conditions.push('!Array.isArray(' + propertyExpression('this', key) + ')');
						}
						if (this.schemaOnlyAcceptsType(subSchema, 'object')) {
							if (!this.schemaRequiresProperty(schema, key)) {
								conditions.push(propertyExpression('this', key));
							}
						} else {
							conditions.push('typeof ' + propertyExpression('this', key) + ' === "object"');
						}
						body += 'if (' + conditions.join(' && ') + ') {\n';
						body += indent('' + propertyExpression('this', key) + ' = new ' + subClassVar + '(' + propertyExpression('this', key) + ');\n');
						body += '}\n';
					}
				}
				
				body += '\nsuperclass.apply(this, arguments);\n';
				code += indent(body);
				code += '};\n';
				code += classExpression + '.prototype = Object.create(superclass.prototype);\n';
				code += classExpression + '.schemaUrl = ' + JSON.stringify(url) + ';\n';
				if (schema.title) {
					code += classExpression + '.title = ' + JSON.stringify(schema.title) + ';\n';
				}
				if (schema.description) {
					code += classExpression + '.description = ' + JSON.stringify(schema.description) + ';\n';
				}
			}
				
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
				code += classExpression + '.validationErrors = function (value) {\n';
				code += indent('var errors = [];\n');
				code += indent(this.validationCode('value', url, schema, requireUrl, function (errorExpr, single) {
					if (single) return 'errors.push(' + errorExpr + ');\n';
					return 'errors = errors.concat(' + errorExpr + ');\n'
				}, true));
				code += indent('return errors;\n');
				code += '}\n';
				code += classExpression + '.validate = function (value) {\n';
				code += indent('var errors = ' + classExpression + '.validationErrors(value);\n');
				code += indent('return errors.length ? {valid: false, errors: errors} : {valid: true};\n');
				code += '}\n';
			}
			return code;
		},
		validationCode: function (valueExpr, schemaUrl, schema, requireUrl, errorFunc, noReference) {
			var allowedTypes = schema.type || ['null', 'boolean', 'number', 'string', 'object', 'array'];
			if (!Array.isArray(allowedTypes)) allowedTypes = [allowedTypes];
			var allowedType = function (type) {return allowedTypes.indexOf(type) !== -1;};

			if (!noReference && this.schemaAcceptsType(schema, 'object')) {
				var classVar = this.classVarForUrl(schemaUrl);
				requireUrl(schemaUrl);
				return errorFunc(classVar + '.validationErrors(' + valueExpr + ')');
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
				typeCode['array'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: "array", expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:""}', true);
			} else {
				var arrayCode = '';
				if ('maxItems' in schema) {
					arrayCode += 'if (' + valueExpr + '.length > ' + JSON.stringify(schema.maxItems) + ') {\n';
					arrayCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.ARRAY_LENGTH_LONG) + ', params: {length: ' + valueExpr + '.length, maximum: ' + JSON.stringify(schema.maxItems) + '}, path:""}', true));
					arrayCode += '}\n';
				}
				if (schema.minItems) {
					arrayCode += 'if (' + valueExpr + '.length < ' + JSON.stringify(schema.minItems) + ') {\n';
					arrayCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.ARRAY_LENGTH_SHORT) + ', params: {length: ' + valueExpr + '.length, minimum: ' + JSON.stringify(schema.minItems) + '}, path:""}', true));
					arrayCode += '}\n';
				}
				typeCode['array'] += arrayCode;
			}

			if (!allowedType('object')) {
				typeCode['object'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: typeof ' + valueExpr + ', expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:""}', true);
			} else {
				var objectCode = '';
				Object.keys(schema.properties || {}).forEach(function (key) {
					var propertyExpr = propertyExpression(valueExpr, key)
					var subSchema = this.getFullSchema(schema.properties[key]);
					var subUrl = subSchema.id || this.extendUrl(schemaUrl, ['properties', key]);
					var checkCode = this.validationCode(propertyExpr, subUrl, subSchema, requireUrl, errorFunc);
					objectCode += 'if (' + JSON.stringify(key) + ' in ' + valueExpr + ') {\n';
					objectCode += indent(checkCode);
					if (this.schemaRequiresProperty(schema, key)) {
						objectCode += '} else {\n';
						objectCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.OBJECT_REQUIRED) + ', params: {key: ' + JSON.stringify(key) + '}, path:""}', true));
					}
					objectCode += '}\n';
				}.bind(this));
				(schema.required || []).forEach(function (key) {
					if (!schema.properties || !schema.properties[key]) {
						objectCode += 'if (!(' + JSON.stringify(key) + ' in ' + valueExpr + ')) {\n';
						objectCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.OBJECT_REQUIRED) + ', params: {key: ' + JSON.stringify(key) + '}, path:""}', true));
						objectCode += '}\n';
					}
				});
				if (schema.patternProperties || 'additionalProperties' in schema) {
					objectCode += 'var keys = Object.keys(' + valueExpr + ');\n';
					objectCode += 'var knownKeys = {' + Object.keys(schema.properties).map(function (key) {
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
						var subUrl = subSchema.id || this.extendUrl(schemaUrl, ['patternProperties', key]);
						objectCode += indent('if (' + regExpCode + '.test(key)) {\n');
						objectCode += indent(indent(this.validationCode(propertyExpr, subUrl, subSchema, requireUrl, errorFunc)));
						if ('additionalProperties' in schema) {
							objectCode += indent(indent('matched = true;\n'));
						}
						objectCode += indent('}');
					}
					if (schema.patternProperties && 'additionalProperties' in schema) {
						objectCode += indent('if (!matched && !knownKeys[key]) {\n');
						if (!schema.additionalProperties) {
							objectCode += indent(indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.OBJECT_ADDITIONAL_PROPERTIES) + ', params: {}, path:""}', true)));
						} else if (typeof schema.additionalProperties === 'object') {
							var subSchema = this.getFullSchema(schema.additionalProperties);
							var subUrl = subSchema.id || this.extendUrl(schemaUrl, ['additionalPRoperties']);
							objectCode += indent(indent(this.validationCode(propertyExpr, subUrl, subSchema, requireUrl, errorFunc)));
						}
						objectCode += indent('}\n');
					}
					objectCode += '}\n';
				}
				typeCode['object'] += objectCode;
			}

			if (!allowedType('string')) {
				// Although we'll know it's a string at this point in the code, we use "typeof" instead so it can be grouped
				typeCode['string'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: typeof ' + valueExpr + ', expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:""}', true);
			}

			if (!allowedType('number') && !allowedType('integer')) {
				typeCode['number'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: typeof ' + valueExpr + ', expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:""}', true);
			} else {
				var numberCode = '';
				var divisor = NaN;
				if (!allowedType('number')) {
					divisor = 1;
				}
				if (!isNaN(divisor)) {
					numberCode += 'if (' + valueExpr + '%' + JSON.stringify(divisor) + ' !== 0) {\n';
					if (divisor === 1) {
						numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: "number", expected: "integer"}, path:""}', true));
					} else {
						numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MULTIPLE_OF) + ', params: {multipleOf: ' + JSON.stringify(divisor) + '}, path:""}', true));
					}
					numberCode += '}\n';
				}
				if ('minimum' in schema) {
					if (schema.exclusiveMinimum) {
						numberCode += 'if (' + valueExpr + ' <= ' + JSON.stringify(schema.minimum) + ') {\n';
						numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MINIMUM_EXCLUSIVE) + ', params: {value: ' + valueExpr + ', minimum: ' + JSON.stringify(schema.minimum) + '}, path:""}', true));
						numberCode += '}\n';
					} else {
						numberCode += 'if (' + valueExpr + ' < ' + JSON.stringify(schema.minimum) + ') {\n';
						numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MINIMUM) + ', params: {value: ' + valueExpr + ', minimum: ' + JSON.stringify(schema.minimum) + '}, path:""}', true));
						numberCode += '}\n';
					}
				}
				if ('maximum' in schema) {
					if (schema.exclusiveMaximum) {
						numberCode += 'if (' + valueExpr + ' >= ' + JSON.stringify(schema.maximum) + ') {\n';
						numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MAXIMUM_EXCLUSIVE) + ', params: {value: ' + valueExpr + ', maximum: ' + JSON.stringify(schema.maximum) + '}, path:""}', true));
						numberCode += '}\n';
					} else {
						numberCode += 'if (' + valueExpr + ' > ' + JSON.stringify(schema.maximum) + ') {\n';
						numberCode += indent(errorFunc('{code: ' + JSON.stringify(ErrorCodes.NUMBER_MAXIMUM) + ', params: {value: ' + valueExpr + ', maximum: ' + JSON.stringify(schema.maximum) + '}, path:""}', true));
						numberCode += '}\n';
					}
				}
				typeCode['number'] += numberCode;
			}

			if (!allowedType('boolean')) {
				typeCode['boolean'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: typeof ' + valueExpr + ', expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:""}', true);
			}
			
			if (!allowedType('null')) {
				typeCode['null'] += errorFunc('{code: ' + JSON.stringify(ErrorCodes.INVALID_TYPE) + ', params: {type: "null", expected: ' + JSON.stringify(allowedTypes.join(', ')) + '}, path:""}', true);
			}
			
			var validation = '';
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
			var code = this.code();
			var func = new Function('superclass', 'request', 'return ' + code + '(superclass, request)');
			return func(superclass, request);
		}
	};
	
	return api;
}));
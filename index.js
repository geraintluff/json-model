(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['tv4'], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory(require('tv4'));
	} else {
		// Browser globals
		global.schema2js = factory(tv4);
	}
}(this, function (tv4) {
	var api = {};

	function indent(string) {
		return ('\t' + string.replace(/\n/g, '\n\t')).replace(/\t*$/, '');
	}
	function normUrl(url) {
		if (url.split('#')[1] === '') return url.split('#')[0];
		return url;
	}
	
	function uriTemplatePart(subject, spec) {
		var prefix = spec.match(/^[+]*/)[0];
		var suffix = spec.match(/[*]*$/)[0];
		var vars = spec.substring(prefix.length).split(',');

		var codeParts = [];
		vars.forEach(function (varSpec) {
			var code = subject(varSpec);
			if (prefix.indexOf('+') === -1) code = 'encodeURIComponent(' + code + ')';
			codeParts.push(code);
		});
		return codeParts.join(' + ');
	}
	
	var uriTemplate = api.uriTemplate = function uriTemplate(subject, template) {
		if (typeof subject !== 'function') {
			var subjectVar = subject;
			subject = function (property) {
				return subjectVar + '[' + JSON.stringify(property) + ']';
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
	
	var schemaCounter = 0;
	var Generator = api.Generator = function Generator(tv4Instance) {
		if (!(this instanceof Generator)) return new Generator(tv4Instance);
		
		this.tv4 = tv4Instance || tv4.freshApi();
		this.classNames = {};
	};
	Generator.prototype = {
		addSchema: function (url, schema, name) {
			if (typeof url === 'object') {
				name = schema;
				schema = url;
				url = schema && schema.id;
			}
			if (typeof schema === 'object') {
				this.tv4.addSchema(url, schema);
			} else if (!name) {
				name = schema;
				schema = {};
			}
			url = normUrl(url || '');
			this.classNames[url] = name || url;
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
		nameForUrl: function (url) {
			return this.classNames[url] = this.classNames[url] || url;
		},
		extendUrl: function (url, components) {
			if (url.indexOf('#') === -1) url += '#';
			components.forEach(function (key) {
				url += '/' + encodeURIComponent(key.replace(/~/g, '~0').replace(/\//g, '~1'));
			});
			return url;
		},
		canCodeForSchema: function (schema) {
			if (!schema.type || !(schema.type === 'object' || (schema.type.length == 1 && schema.type[0] === 'object'))) {
				return false;
			}
			return true;
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
			if (!this.canCodeForSchema(schema)) {
				throw new Error('Cannot generate class for non-object schema');
			}
			
			var name = this.nameForUrl(url);
			var classExpression = 'classes[' + JSON.stringify(name) + ']';
			
			var code = '/* Schema: ' + url.replace(/\*/g, '%2A') + ' */\n';
			code += classExpression + ' = function (value) {\n';
			var body = '';
			body += 'if (!(this instanceof ' + classExpression + ')) return new ' + classExpression + '(value);\n';
			if ('default' in schema) {
				body += 'value = value || ' + JSON.stringify(schema['default']) + ';\n';
			}
			body += 'var keys = Object.keys(value);\n';
			body += 'keys.forEach(function (key) {\n';
			body += indent('this[key] = value[key];\n');
			body += '}.bind(this));\n';
			
			for (var key in schema.properties || {}) {
				var subSchema = this.getFullSchema(schema.properties[key]);
				if ('default' in subSchema) {
					body += 'if (typeof this[' + JSON.stringify(key) + '] === "undefined") {\n';
					body += indent('this[' + JSON.stringify(key) + '] = ' + JSON.stringify(subSchema['default']) + ';\n');
					body += '}\n';
				}
				if (this.canCodeForSchema(subSchema)) {
					var subUrl = subSchema.id || this.extendUrl(url, ['properties', key]);
					var subName = this.nameForUrl(subUrl);
					requireUrl(subUrl);
					body += 'if (this[' + JSON.stringify(key) + ']) {\n';
					body += indent('this[' + JSON.stringify(key) + '] = new classes[' + JSON.stringify(subName) + '](this[' + JSON.stringify(key) + ']);\n');
					body += '}\n';
				}
			}
			
			body += 'superclass.apply(this, arguments);\n';
			code += indent(body);
			code += '}\n';
			code += classExpression + '.schemaUrl = ' + JSON.stringify(url) + ';\n';
			if (schema.title) {
				code += classExpression + '.title = ' + JSON.stringify(schema.title) + ';\n';
			}
			if (schema.description) {
				code += classExpression + '.description = ' + JSON.stringify(schema.description) + ';\n';
			}
			code += classExpression + '.prototype = Object.create(superclass.prototype);\n';
			(schema.links || []).forEach(function (ldo) {
				var rel = ldo.rel;
				var prettyRel = rel.replace(/.*[/#?]/g, '').replace(/[^a-zA-Z0-9]+([a-zA-Z0-9]?)/, function (match, nextChar) {
					return nextChar.toUpperCase();
				});
				var method = ldo.method || 'GET';
				var encType = ldo.encType || ldo.enctype || 'application/json';
				
				var body = '';
				body += 'if (typeof params === "function") {\n';
				body += indent('callback = params;\n');
				body += indent('params = null;\n');
				body += '}\n';
				body += 'var href = ' + api.uriTemplate('this', ldo.href) + ';\n';
				body += 'request({\n';
				body += indent('href: href,\n');
				body += indent('method: ' + JSON.stringify(method) + ',\n');
				body += indent('encType: ' + JSON.stringify(encType) + ',\n');
				body += indent('data: null\n');
				body += '}, callback || function () {});';
				
				var methodName = method.toLowerCase() + prettyRel.charAt(0).toUpperCase() + prettyRel.substring(1);
				code += classExpression + '.prototype[' + JSON.stringify(methodName) + '] = function (params, callback) {\n';
				code += indent(body);
				code += '}\n';
			});
			return code;
		},
		classes: function (superclass, request) {
			var code = this.code();
			var func = new Function('superclass', 'request', 'return ' + code + '(superclass, request)');
			return func(superclass, request);
		}
	};
	
	return api;
}));
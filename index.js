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
				url = schema.id;
			}
			url = normUrl(url || '');
			this.tv4.addSchema(url, schema);
			this.classNames[url] = name || url;
			return this;
		},
		code: function () {
			var code = '';
			code += 'superclass = superclass || function GeneratedClass() {};\n';
			code += 'var classes = {};\n\n';
			for (var url in this.classNames) {
				code += this.codeForSchema(url);
			}
			code += '\nreturn classes;\n';
			code = 'function (superclass) {\n' + indent(code) + '}';
			return code;
		},
		nameForSchema: function (url) {
			return this.classNames[url] = this.classNames[url] || url;
		},
		codeForSchema: function (url) {
			var schema = this.tv4.getSchema(url);
			if (!schema.type || !(schema.type === 'object' || (schema.type.length == 1 && schema.type[0] === 'object'))) {
				throw new Error('Cannot generate class for non-object schema');
			}
			
			var name = this.nameForSchema(url);
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
				var subSchema = schema.properties[key];
				if ('default' in subSchema) {
					body += 'if (typeof this[' + JSON.stringify(key) + '] === "undefined") this[' + JSON.stringify(key) + '] = ' + JSON.stringify(subSchema['default']) + ';\n';
				}
			}
			
			body += 'superclass.apply(this, arguments);\n';
			code += indent(body);
			code += '}\n';
			code += classExpression + '.prototype = Object.create(superclass.prototype);\n';
			code += classExpression + '.schemaUrl = ' + JSON.stringify(url);
			return code;
		},
		classes: function (superclass) {
			var code = this.code();
			var func = new Function('superclass', 'return ' + code + '(superclass)');
			return func(superclass);
		}
	};
	
	return api;
}));
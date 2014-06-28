(function (global, factory) {
	if (typeof define === 'function' && define.amd) {
		// AMD. Register as an anonymous module.
		define(['schema2js'], factory);
	} else if (typeof module !== 'undefined' && module.exports){
		// CommonJS. Define export.
		module.exports = factory(require('./index'));
	} else {
		// Browser globals
		global.DataModel = factory(global.schema2js);
	}
})(this, function (schema2js) {

	function pointerEscape(key) {
		return key.replace(/~/g, "~0").replace(/\//g, "~1");
	}
	function pointerUnescape(key) {
		return key.replace(/~1/g, "/").replace(/~0/g, "~");
	}
	
	var api = {};
	
	function requestFunction(params, callback) {
		throw new Error('Requests not supported');
	}
	
	var generator = api.generator = new schema2js.Generator({assignment: true});
	var generatedClasses = generator.classes(null, requestFunction);
	api.tv4 = generator.tv4;
	
	api.requestFunction = null;
	
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

	function RootModel(initialValue, validatorFunctions) {
		var value;
		var schemaMap;
		
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
			
			schemaMap = {};
			for (var i = 0; i < validatorFunctions.length; i++) {
				validatorFunctions[i](value, "", schemaMap);
			}
			return true;
		};
		this.getPathValue = function (path) {
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

		this.setPathValue("", initialValue);
	}
	RootModel.prototype = {
	};
	
	function Model(rootModel, path) {
		this._root = rootModel;
		this._path = path;
	}
	Model.prototype = {
		get: function (pathSpec) {
			if (pathSpec == null) pathSpec = "";
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.getPathValue(this._path + pathSpec);
		},
		set: function (pathSpec, value) {
			if (arguments.length < 2) {
				value = pathSpec;
				pathSpec = "";
			}
			if (pathSpec == null) pathSpec = "";
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.setPathValue(this._path + pathSpec, value);
		},
		length: function (pathSpec) {
			var value = this.get(pathSpec);
			if (Array.isArray(value)) return value.length;
			return 0;
		},
		item: function (index) {
			return this._root.modelForPath(this._path + '/' + pointerEscape(index + ''));
		},
		keys: function (pathSpec) {
			var value = this.get(pathSpec);
			if (!value || Array.isArray(value) || typeof value !== 'object') return [];
			return Object.keys(value);
		},
		prop: function (key) {
			return this._root.modelForPath(this._path + '/' + pointerEscape(key + ''));
		},
		schemas: function (pathSpec) {
			if (pathSpec == null) pathSpec = "";
			pathSpec = pathSpec + "";
			if (pathSpec && pathSpec.charAt(0) !== "/") {
				pathSpec = "/" + pointerEscape(pathSpec);
			}
			return this._root.getPathSchemas(this._path + pathSpec);
		}
	};
	
	api.create = function (initialValue, url, schemas, callback) {
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
		var validatorFunctions = [];
		var shouldRegenerate = false;
		(schemas || []).forEach(function (schemaUrl) {
			generator.addSchema(schemaUrl);
			var name = generator.classNameForUrl(schemaUrl);
			validatorFunctions.push(function (data, dataPath, schemaMap) {
				return generatedClasses[name].validationErrors(data, dataPath, schemaMap);
			});
			if (!generatedClasses[name]) {
				shouldRegenerate = true;
			}
		});
		if (shouldRegenerate) {
			generatedClasses = generator.classes(null, requestFunction);
		}
		
		var rootModel = new RootModel(initialValue, validatorFunctions);
		var result = new Model(rootModel, "");
		if (callback) {
			callback(null, result);
		}
		return result;
	};
	
	return api;
});